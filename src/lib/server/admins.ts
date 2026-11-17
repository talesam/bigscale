import crypto from 'node:crypto';
import { ADMIN_GROUP, readPolicy, withPolicyLock, writePolicy } from './policy-groups.js';
import { dropSessionsWhere } from './session.js';

// More than one administrator, without sharing the panel password: whoever
// is in the policy group `admins` may open the admin panel from BigLace.
//
// BigLace asks over the tunnel (so the panel knows exactly who is asking) for
// a one-time sign-in link; the browser opens it and gets a normal session,
// tagged with that person's name. The link works once, for one minute, and
// membership is checked again when it's used. Removing someone from `admins`
// ends their open sessions.

const KEY = `group:${ADMIN_GROUP}`;
const TOKEN_TTL_MS = 60_000;
const MAX_PENDING = 100;

export async function listAdmins(): Promise<string[]> {
	const { policy } = await readPolicy();
	return (policy.groups[KEY] ?? []).filter((m) => m.endsWith('@')).map((m) => m.slice(0, -1));
}

export async function isAdmin(user: string): Promise<boolean> {
	return (await listAdmins()).includes(user);
}

/** End sessions of people no longer in `admins` (after any policy change). */
export async function revalidateAdminSessions(): Promise<void> {
	const admins = new Set(await listAdmins());
	dropSessionsWhere((u) => !admins.has(u));
}

export type AdminsError = 'open_network' | 'unknown_user';

/** Replace the admin list. `known` = existing user names (to refuse typos). */
export function setAdmins(users: string[], known: Set<string>): Promise<string[] | AdminsError> {
	return withPolicyLock(async () => {
		const { policy, empty } = await readPolicy();
		// Writing a first policy would cut everyone off from everyone.
		if (empty) return 'open_network' as const;
		const unique = [...new Set(users)];
		if (unique.some((u) => !known.has(u))) return 'unknown_user' as const;
		if (unique.length) policy.groups[KEY] = unique.map((u) => `${u}@`);
		else delete policy.groups[KEY];
		await writePolicy(policy);
		const admins = new Set(unique);
		dropSessionsWhere((u) => !admins.has(u));
		return unique;
	});
}

const pending = new Map<string, { user: string; expiresAt: number }>();

function hash(token: string): string {
	return crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
}

function prune(now: number): void {
	for (const [k, v] of pending) if (v.expiresAt <= now) pending.delete(k);
}

/** One-time sign-in token for `user` (caller already checked they're an admin). */
export function issueLoginToken(user: string): string {
	const now = Date.now();
	prune(now);
	if (pending.size >= MAX_PENDING) pending.clear();
	const token = crypto.randomBytes(32).toString('base64url');
	pending.set(hash(token), { user, expiresAt: now + TOKEN_TTL_MS });
	return token;
}

/** Consume a sign-in token: the user it was issued to, if still valid and still an admin. */
export async function redeemLoginToken(token: string): Promise<string | null> {
	const h = hash(token);
	const entry = pending.get(h);
	pending.delete(h);
	if (!entry || entry.expiresAt <= Date.now()) return null;
	return (await isAdmin(entry.user)) ? entry.user : null;
}
