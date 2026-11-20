import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { allNodes, SYSTEM_USERS } from './accounts.js';
import { ADMIN_DATA_DIR } from './config.js';
import { groupsFor } from './member-groups.js';
import { ADMIN_GROUP, addMember, readPolicy } from './policy-groups.js';
import { getSettings } from './network-settings.js';

// "Join my group?" — a member asks people already on the network to come
// into a group they're in; nothing changes until the person accepts.
//
// Unlike an invite link (which brings someone new into the network), this
// only adds an existing account to a group, and only with its consent. Who
// may ask: any member of the group (the same people who may hand out invite
// links into it). What accepting grants: exactly what membership grants.

const STORE_PATH = resolve(ADMIN_DATA_DIR, 'group-requests.json');
const EXPIRE_MS = 14 * 24 * 60 * 60 * 1000;
/** Pending requests one person may have out at once. */
const MAX_PENDING_FROM = 50;
/** Pending requests one person may receive at once (from everybody). */
const MAX_PENDING_TO = 30;

export interface GroupRequest {
	id: string;
	group: string;
	from: string;
	to: string;
	createdAt: string;
}

let cache: GroupRequest[] | null = null;

function load(): GroupRequest[] {
	if (cache) return cache;
	try {
		const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as unknown;
		cache = Array.isArray(parsed) ? (parsed as GroupRequest[]) : [];
	} catch {
		cache = [];
	}
	return cache;
}

function persist(list: GroupRequest[]): void {
	cache = list;
	const dir = dirname(STORE_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const tmp = `${STORE_PATH}.tmp`;
	writeFileSync(tmp, JSON.stringify(list, null, '\t'), { encoding: 'utf-8', mode: 0o600 });
	renameSync(tmp, STORE_PATH);
}

/** Pending requests, the expired ones dropped. */
function live(): GroupRequest[] {
	const now = Date.now();
	const list = load();
	const kept = list.filter((r) => now - Date.parse(r.createdAt) < EXPIRE_MS);
	if (kept.length !== list.length) persist(kept);
	return kept;
}

export type RequestError = 'not_in_group' | 'not_found' | 'too_many' | 'no_such_user' | 'group_gone';

export class RequestFailure extends Error {
	constructor(public code: RequestError) {
		super(code);
	}
}

export interface Person {
	user: string;
	/** Has at least one device online right now. */
	online: boolean;
	/** In the group already, or already asked: nothing to send. */
	state: 'member' | 'pending' | 'available';
}

/**
 * People `user` is already connected to: everyone in a group with them (the
 * administrators' group aside) and everyone a rule pairs them with (each
 * member invite creates one between inviter and newcomer).
 */
export async function contactsOf(user: string): Promise<Set<string>> {
	const { policy } = await readPolicy();
	const me = `${user}@`;
	const out = new Set<string>();
	for (const [k, members] of Object.entries(policy.groups)) {
		if (k === `group:${ADMIN_GROUP}` || !members.includes(me)) continue;
		for (const m of members) if (m.endsWith('@')) out.add(m.slice(0, -1));
	}
	const userOf = (ref: string) => (ref.endsWith('@:*') ? ref.slice(0, -3) : ref.endsWith('@') ? ref.slice(0, -1) : null);
	for (const r of policy.acls) {
		const refs = [...r.src, ...r.dst];
		if (!refs.some((x) => userOf(x) === user)) continue;
		for (const x of refs) {
			const u = userOf(x);
			if (u) out.add(u);
		}
	}
	out.delete(user);
	return out;
}

/**
 * People `caller` could ask into `group`, marked when already in the group
 * or already asked; online first, then by name. Depending on the network's
 * settings, everyone with a device or only the caller's contacts (anyone
 * else can still be asked by exact name, see ask()).
 */
export async function candidates(caller: string, group: string): Promise<Person[]> {
	const mine = (await groupsFor(caller)).find((g) => g.name === group);
	if (!mine) throw new RequestFailure('not_in_group');
	const members = new Set(mine.members);
	const pending = new Set(live().filter((r) => r.group === group).map((r) => r.to));
	const visible = getSettings().directory === 'contacts' ? await contactsOf(caller) : null;
	const people = new Map<string, boolean>();
	for (const n of await allNodes()) {
		const user = n.user?.name;
		if (!user || SYSTEM_USERS.has(user) || user === caller) continue;
		if (visible && !visible.has(user)) continue;
		people.set(user, (people.get(user) ?? false) || n.online === true);
	}
	return [...people]
		.map(([user, online]) => ({
			user,
			online,
			state: members.has(user) ? ('member' as const) : pending.has(user) ? ('pending' as const) : ('available' as const)
		}))
		.sort((a, b) => Number(b.online) - Number(a.online) || a.user.localeCompare(b.user));
}

/**
 * `caller` asks each of `users` into `group`. People already in it or
 * already asked are skipped, and so are names nobody has: the answer must
 * not tell whether an account exists (that would undo `contacts`). Returns
 * how many requests were created.
 */
export async function ask(caller: string, group: string, users: string[]): Promise<number> {
	const mine = (await groupsFor(caller)).find((g) => g.name === group);
	if (!mine) throw new RequestFailure('not_in_group');
	const known = new Set(
		(await allNodes()).map((n) => n.user?.name).filter((u): u is string => !!u && !SYSTEM_USERS.has(u))
	);
	const asked = [...new Set(users)].filter((u) => u !== caller && !mine.members.includes(u));
	const wanted = asked.filter((u) => known.has(u));

	const list = live();
	const fresh = wanted.filter((u) => !list.some((r) => r.group === group && r.to === u));
	if (list.filter((r) => r.from === caller).length + fresh.length > MAX_PENDING_FROM) {
		throw new RequestFailure('too_many');
	}
	const now = new Date().toISOString();
	for (const to of fresh) {
		// A full inbox just doesn't get more; the others still go.
		if (list.filter((r) => r.to === to).length >= MAX_PENDING_TO) continue;
		list.push({ id: randomBytes(12).toString('hex'), group, from: caller, to, createdAt: now });
	}
	persist(list);
	// Counted as asked whether or not the name exists (see above).
	return asked.length;
}

/** Requests waiting for `user` to answer. */
export function incoming(user: string): GroupRequest[] {
	return live().filter((r) => r.to === user);
}

/** Requests `user` sent that nobody answered yet. */
export function outgoing(user: string): GroupRequest[] {
	return live().filter((r) => r.from === user);
}

/**
 * `user` answers request `id`. Accepting adds them to the group — only if
 * whoever asked is still in it (they may have left, or the group may be
 * gone). Either way the request is done.
 */
export async function answer(user: string, id: string, accept: boolean): Promise<GroupRequest> {
	const list = live();
	const req = list.find((r) => r.id === id && r.to === user);
	if (!req) throw new RequestFailure('not_found');
	persist(list.filter((r) => r !== req));
	if (accept) {
		const theirs = await groupsFor(req.from);
		if (!theirs.some((g) => g.name === req.group)) throw new RequestFailure('group_gone');
		await addMember(req.group, user, false);
	}
	return req;
}

/** The sender takes back a request not answered yet. */
export function cancel(user: string, id: string): void {
	const list = live();
	const req = list.find((r) => r.id === id && r.from === user);
	if (!req) throw new RequestFailure('not_found');
	persist(list.filter((r) => r !== req));
}

/** An account is gone: its requests (sent or received) go too. */
export function forgetUser(user: string): void {
	const list = load();
	const kept = list.filter((r) => r.from !== user && r.to !== user);
	if (kept.length !== list.length) persist(kept);
}

const STATUS: Record<RequestError, number> = {
	not_in_group: 403,
	not_found: 404,
	too_many: 429,
	no_such_user: 404,
	group_gone: 410
};

export function requestStatus(e: unknown): { code: string; status: number } {
	if (e instanceof RequestFailure) return { code: e.code, status: STATUS[e.code] };
	console.error('[bigscale] group requests:', (e as Error).message);
	return { code: 'server_error', status: 502 };
}

/** Group `from` is called `to` now: requests into it keep working. */
export function renameGroupInRequests(from: string, to: string): void {
	const list = load();
	if (!list.some((r) => r.group === from)) return;
	persist(list.map((r) => (r.group === from ? { ...r, group: to } : r)));
}
