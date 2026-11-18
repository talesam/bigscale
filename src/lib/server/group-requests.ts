import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { allNodes, SYSTEM_USERS } from './accounts.js';
import { ADMIN_DATA_DIR } from './config.js';
import { groupsFor } from './member-groups.js';
import { addMember } from './policy-groups.js';

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
 * People on the network `caller` could ask into `group`: every account with
 * a device (system users and the caller left out), marked when already in
 * the group or already asked. Online first, then by name.
 */
export async function candidates(caller: string, group: string): Promise<Person[]> {
	const mine = (await groupsFor(caller)).find((g) => g.name === group);
	if (!mine) throw new RequestFailure('not_in_group');
	const members = new Set(mine.members);
	const pending = new Set(live().filter((r) => r.group === group).map((r) => r.to));
	const people = new Map<string, boolean>();
	for (const n of await allNodes()) {
		const user = n.user?.name;
		if (!user || SYSTEM_USERS.has(user) || user === caller) continue;
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
 * already asked are skipped. Returns how many requests were created.
 */
export async function ask(caller: string, group: string, users: string[]): Promise<number> {
	const mine = (await groupsFor(caller)).find((g) => g.name === group);
	if (!mine) throw new RequestFailure('not_in_group');
	const known = new Set(
		(await allNodes()).map((n) => n.user?.name).filter((u): u is string => !!u && !SYSTEM_USERS.has(u))
	);
	const wanted = [...new Set(users)].filter((u) => u !== caller && !mine.members.includes(u));
	if (wanted.some((u) => !known.has(u))) throw new RequestFailure('no_such_user');

	const list = live();
	const fresh = wanted.filter((u) => !list.some((r) => r.group === group && r.to === u));
	if (list.filter((r) => r.from === caller).length + fresh.length > MAX_PENDING_FROM) {
		throw new RequestFailure('too_many');
	}
	const now = new Date().toISOString();
	let made = 0;
	for (const to of fresh) {
		// A full inbox just doesn't get more; the others still go.
		if (list.filter((r) => r.to === to).length >= MAX_PENDING_TO) continue;
		list.push({ id: randomBytes(12).toString('hex'), group, from: caller, to, createdAt: now });
		made++;
	}
	persist(list);
	return made;
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
