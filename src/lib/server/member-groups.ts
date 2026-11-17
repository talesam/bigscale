import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { json } from '@sveltejs/kit';
import type { AclPolicy, AclRule } from '$lib/acl.js';
import { ADMIN_DATA_DIR } from './config.js';
import { ADMIN_GROUP, GROUP_NAME_RE, readPolicy, withPolicyLock, writePolicy } from './policy-groups.js';

// Groups people create themselves from BigLace ("família", "trabalho"…).
//
// A member group is an ordinary policy group plus one rule letting its
// members reach each other — so it grants nothing beyond "everyone in here
// sees everyone in here". Whoever creates it owns it: invites people (any
// member may), removes members, deletes it. The owner has no say over
// anything else in the network, and groups the admin wrote in the policy
// stay the admin's (members can't remove people from those or delete them).
//
// Ownership lives in /data/member-groups.json; membership lives in the policy
// itself, like every other group.

const STORE_PATH = resolve(ADMIN_DATA_DIR, 'member-groups.json');
export const MAX_OWNED = 10;

interface Meta {
	owner: string;
	createdAt: string;
}
type Store = Record<string, Meta>;

let cache: Store | null = null;

function load(): Store {
	if (cache) return cache;
	try {
		const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as unknown;
		cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
	} catch {
		cache = {};
	}
	return cache;
}

function persist(store: Store): void {
	const dir = dirname(STORE_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const tmp = `${STORE_PATH}.tmp`;
	writeFileSync(tmp, JSON.stringify(store, null, '\t'), { encoding: 'utf-8', mode: 0o600 });
	renameSync(tmp, STORE_PATH);
}

function meta(name: string): Meta | null {
	const store = load();
	return Object.hasOwn(store, name) ? store[name] : null;
}

const key = (name: string) => `group:${name}`;

function isMutualRule(r: AclRule, name: string): boolean {
	return (
		r.action === 'accept' &&
		!r._extra &&
		r.src.length === 1 &&
		r.src[0] === key(name) &&
		r.dst.length === 1 &&
		r.dst[0] === `${key(name)}:*`
	);
}

/**
 * Ownership record for `name`, only if the group as it is now is still the
 * one the member created (exists, with its mutual rule). If the admin
 * deleted it and later made a group with the same name, the old owner has no
 * say over the new one: the stale record is dropped.
 */
function liveMeta(policy: AclPolicy, name: string): Meta | null {
	const m = meta(name);
	if (!m) return null;
	if (key(name) in policy.groups && policy.acls.some((r) => isMutualRule(r, name))) return m;
	const store = load();
	delete store[name];
	persist(store);
	return null;
}

/** Whether anything besides the group's own mutual rule mentions it. */
function referencedElsewhere(policy: AclPolicy, name: string): boolean {
	const k = key(name);
	const rest = { ...policy, groups: { ...policy.groups }, acls: policy.acls.filter((r) => !isMutualRule(r, name)) };
	delete rest.groups[k];
	const text = JSON.stringify(rest);
	return text.includes(`"${k}"`) || text.includes(`"${k}:`);
}

export type GroupError =
	| 'open_network'
	| 'invalid_name'
	| 'name_taken'
	| 'too_many'
	| 'not_found'
	| 'not_owner'
	| 'not_member_group'
	| 'owner_cannot_leave'
	| 'in_use';

export class GroupFailure extends Error {
	constructor(public code: GroupError) {
		super(code);
	}
}

export interface GroupView {
	name: string;
	/** `member`: made by someone from BigLace; `network`: written by the admin. */
	kind: 'member' | 'network';
	owner: string | null;
	members: string[];
}

/** Groups `user` belongs to (the admin group excluded), with their members. */
export async function groupsFor(user: string): Promise<GroupView[]> {
	const { policy } = await readPolicy();
	const me = `${user}@`;
	return Object.entries(policy.groups)
		.filter(([k, members]) => k.startsWith('group:') && k !== key(ADMIN_GROUP) && members.includes(me))
		.map(([k, members]) => {
			const name = k.slice('group:'.length);
			const m = liveMeta(policy, name);
			return {
				name,
				kind: m ? ('member' as const) : ('network' as const),
				owner: m?.owner ?? null,
				members: members.filter((x) => x.endsWith('@')).map((x) => x.slice(0, -1))
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function createGroup(owner: string, rawName: unknown): Promise<GroupView> {
	return withPolicyLock(async () => {
		const name = typeof rawName === 'string' ? rawName.trim().toLowerCase() : '';
		if (!GROUP_NAME_RE.test(name) || name === ADMIN_GROUP) throw new GroupFailure('invalid_name');
		const { policy, empty } = await readPolicy();
		// No policy: everyone reaches everyone, and writing a first policy
		// here would cut the whole network off.
		if (empty) throw new GroupFailure('open_network');
		if (key(name) in policy.groups || liveMeta(policy, name)) throw new GroupFailure('name_taken');
		if (Object.values(load()).filter((m) => m.owner === owner).length >= MAX_OWNED) {
			throw new GroupFailure('too_many');
		}
		policy.groups[key(name)] = [`${owner}@`];
		policy.acls.push({ action: 'accept', src: [key(name)], dst: [`${key(name)}:*`] });
		await writePolicy(policy);
		const store = load();
		store[name] = { owner, createdAt: new Date().toISOString() };
		persist(store);
		return { name, kind: 'member', owner, members: [owner] };
	});
}

/** Drop the group, its mutual rule and its ownership record. Under the lock. */
async function dropGroup(policy: AclPolicy, name: string): Promise<void> {
	delete policy.groups[key(name)];
	policy.acls = policy.acls.filter((r) => !isMutualRule(r, name));
	await writePolicy(policy);
	const store = load();
	delete store[name];
	persist(store);
}

export function deleteGroup(caller: string, name: string): Promise<void> {
	return withPolicyLock(async () => {
		const { policy } = await readPolicy();
		const m = liveMeta(policy, name);
		if (!m) throw new GroupFailure('not_member_group');
		if (m.owner !== caller) throw new GroupFailure('not_owner');
		// The admin may have written rules using the group (e.g. "família
		// reaches the printer"): deleting it would make the policy invalid.
		if (referencedElsewhere(policy, name)) throw new GroupFailure('in_use');
		await dropGroup(policy, name);
	});
}

/**
 * Take `user` out of a member group: the owner removing someone, or a member
 * leaving. The owner can't leave (they delete the group instead).
 */
export function removeFromGroup(caller: string, name: string, user: string): Promise<void> {
	return withPolicyLock(async () => {
		const { policy } = await readPolicy();
		const m = liveMeta(policy, name);
		if (!m) throw new GroupFailure('not_member_group');
		if (caller !== m.owner && caller !== user) throw new GroupFailure('not_owner');
		if (user === m.owner) throw new GroupFailure('owner_cannot_leave');
		const members = policy.groups[key(name)];
		if (!members?.includes(`${user}@`)) throw new GroupFailure('not_found');
		policy.groups[key(name)] = members.filter((x) => x !== `${user}@`);
		await writePolicy(policy);
	});
}

/**
 * The owner's account is gone (already out of the policy's groups): each
 * group they owned passes to its longest-standing member, or goes away when
 * nobody is left.
 */
export function onOwnerGone(user: string): Promise<void> {
	const owned = Object.entries(load())
		.filter(([, m]) => m.owner === user)
		.map(([n]) => n);
	if (!owned.length) return Promise.resolve();
	return withPolicyLock(async () => {
		const { policy } = await readPolicy();
		for (const name of owned) {
			const members = (policy.groups[key(name)] ?? []).filter((x) => x.endsWith('@') && x !== `${user}@`);
			if (members.length) {
				const store = load();
				store[name] = { ...store[name], owner: members[0].slice(0, -1) };
				persist(store);
			} else if (!referencedElsewhere(policy, name)) {
				await dropGroup(policy, name);
			}
		}
	});
}

const STATUS: Record<string, number> = {
	open_network: 403,
	invalid_name: 400,
	name_taken: 409,
	too_many: 429,
	not_found: 404,
	not_owner: 403,
	not_member_group: 403,
	owner_cannot_leave: 409,
	in_use: 409
};

/** HTTP response for a failed group operation. */
export function groupError(e: unknown): Response {
	if (e instanceof GroupFailure) return json({ error: e.code }, { status: STATUS[e.code] ?? 400 });
	console.error('[bigscale] groups:', (e as Error).message);
	return json({ error: 'server_error' }, { status: 502 });
}
