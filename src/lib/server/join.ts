import { BIGSCALE_PUBLIC_URL } from './config.js';
import { createUser, deleteUser, displayNameFrom, mintKey, nameConflict, userIdOf, userNameFrom } from './enroll.js';
import { lookup, recordUse, reserve, type Invite, type LookupFailure } from './invite-store.js';
import { addMember, addPair, groupsOf, referencedUsers } from './policy-groups.js';
import { getAccount, reclaimMatches, recordAccount, rotateReclaim } from './account-store.js';
import { deleteNode, nodesOf } from './accounts.js';
import { devicePub, pinForEnrollment } from './device-auth.js';

// Redeeming an invite: the only unauthenticated write the panel offers. The
// invite token *is* the credential, so everything here is about not letting
// it be guessed, reused past its limit, or leave half-created accounts.

// Tokens are 32 random bytes (base64url, 43 chars). Bound what we accept so a
// junk request can't make us hash megabytes.
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

// Brake on wrong tokens, per client. Guessing 256-bit tokens is hopeless
// anyway; this just keeps a scanner from turning the endpoint into load. Per
// client so one noisy source can't lock everyone else out of joining.
const FAIL_WINDOW_MS = 60_000;
const FAIL_LIMIT = 30;
// Bound memory under a flood of distinct sources.
const MAX_TRACKED = 10_000;
const failures = new Map<string, number[]>();

function recent(client: string, now: number): number[] {
	const list = (failures.get(client) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
	if (list.length) failures.set(client, list);
	else failures.delete(client);
	return list;
}

function throttled(client: string, now: number): boolean {
	return recent(client, now).length >= FAIL_LIMIT;
}

function noteFailure(client: string, now: number): void {
	if (failures.size >= MAX_TRACKED && !failures.has(client)) {
		for (const [k, v] of failures) if (!v.some((t) => now - t < FAIL_WINDOW_MS)) failures.delete(k);
		if (failures.size >= MAX_TRACKED) failures.clear();
	}
	failures.set(client, [...recent(client, now), now]);
}

export type JoinError =
	| 'invalid_request'
	| 'invalid_name'
	| 'name_taken'
	| 'too_many_attempts'
	| 'server_error'
	| LookupFailure;

export interface JoinFailure {
	status: number;
	error: JoinError;
	suggestion?: string;
}

export interface JoinSuccess {
	authkey: string;
	server_url: string;
	user: string;
	group: string | null;
	/** Member who invited (the newcomer can reach their devices), if any. */
	invited_by: string | null;
	/** Secret for signing in again as this user later (see account-store). */
	reclaim: string;
}

const STATUS: Record<LookupFailure, number> = { unknown: 404, expired: 410, used: 410, revoked: 410, pending: 403 };

function failed(client: string, reason: LookupFailure): JoinFailure {
	noteFailure(client, Date.now());
	return { status: STATUS[reason], error: reason };
}

/** What the landing page and the app show before the person commits. */
export function checkInvite(
	client: string,
	token: unknown
): JoinFailure | { group: string | null; expiresAt: string | null; invitedBy: string | null } {
	if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { status: 400, error: 'invalid_request' };
	if (throttled(client, Date.now())) return { status: 429, error: 'too_many_attempts' };
	const found = lookup(token);
	if ('reason' in found) return failed(client, found.reason);
	return {
		group: found.invite.group,
		expiresAt: found.invite.expiresAt,
		invitedBy: found.invite.inviter?.user ?? null
	};
}

export async function redeemInvite(
	client: string,
	token: unknown,
	rawName: unknown,
	deviceKey: unknown = undefined
): Promise<JoinFailure | JoinSuccess> {
	if (typeof token !== 'string' || !TOKEN_RE.test(token) || typeof rawName !== 'string') {
		return { status: 400, error: 'invalid_request' };
	}
	if (throttled(client, Date.now())) return { status: 429, error: 'too_many_attempts' };

	const user = userNameFrom(rawName);
	if (!user) return { status: 400, error: 'invalid_name' };

	const held = reserve(token);
	if ('reason' in held) return failed(client, held.reason);
	const { invite, release } = held;

	let userId: string | null = null;
	let undoGroup: (() => Promise<void>) | null = null;
	let undoPair: (() => Promise<void>) | null = null;
	try {
		// A name the policy already mentions would inherit that access.
		// A member's invite lives only as long as that member: if the admin
		// removed them, everything they handed out stops working.
		const inviter = invite.inviter ?? null;
		if (inviter) {
			const id = await userIdOf(inviter.user);
			if (id === null || (inviter.userId && id !== inviter.userId)) return failed(client, 'revoked');
		}

		const conflict = await nameConflict(user, await referencedUsers());
		if (conflict.taken) return { status: 409, error: 'name_taken', suggestion: conflict.suggestion };

		// A member's invite can only grant what the member still has: if they
		// left the group since inviting, that part lapses.
		let group = invite.group;
		if (group && inviter && !(await groupsOf(inviter.user)).includes(group)) group = null;

		userId = await createUser(user, displayNameFrom(rawName));
		if (group) undoGroup = await addMember(group, user, invite.mutual);
		if (inviter) undoPair = await addPair(inviter.user, user);
		const minted = await mintKey(userId);
		// The device that registers with this key must sign with this
		// BigLace key (see device-auth.ts).
		pinForEnrollment(minted.id, devicePub(deviceKey));
		const authkey = minted.key;

		recordUse(invite.id, user);
		const reclaim = recordAccount(user, userId);
		userId = null; // committed: nothing to roll back
		return {
			authkey,
			server_url: BIGSCALE_PUBLIC_URL,
			user,
			group,
			invited_by: inviter?.user ?? null,
			reclaim
		};
	} catch (e) {
		console.error('[join] redeem failed:', (e as Error).message);
		return { status: 502, error: 'server_error' };
	} finally {
		if (userId !== null) {
			// Roll back so a retry with the same name works and no orphan
			// user is left behind. Best effort: report, don't throw.
			if (undoPair) await undoPair().catch((e) => console.error('[join] undo pair:', e));
			if (undoGroup) await undoGroup().catch((e) => console.error('[join] undo group:', e));
			await deleteUser(userId).catch((e) => console.error('[join] undo user:', e));
		}
		release();
	}
}

const SECRET_RE = /^[A-Za-z0-9_-]{40,64}$/;
const HOST_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface RejoinSuccess {
	authkey: string;
	server_url: string;
	user: string;
	reclaim: string;
}

/**
 * Sign in again as an account an invite created, with the secret BigLace
 * kept from that join — no invite, no new name. The secret is rotated on
 * every use. With `hostname`, devices of that account using the same name
 * are removed first, so the device gets its own name back instead of
 * `name-xxxxxxxx` (same person, same machine, new install). Whether the old
 * entry still shows "online" doesn't matter: a machine that vanished without
 * closing its connection stays "online" for minutes, and only the account's
 * owner (holder of the secret) can do this to the account's own devices.
 */
// One rejoin per account at a time: the secret is checked, then rotated
// after some awaits — two concurrent uses must not both get through.
const rejoining = new Set<string>();

export async function rejoin(
	client: string,
	rawUser: unknown,
	secret: unknown,
	rawHost: unknown,
	deviceKey: unknown = undefined
): Promise<JoinFailure | RejoinSuccess> {
	if (typeof rawUser !== 'string' || typeof secret !== 'string' || !SECRET_RE.test(secret)) {
		return { status: 400, error: 'invalid_request' };
	}
	const hostname = typeof rawHost === 'string' && HOST_RE.test(rawHost) ? rawHost : null;
	if (throttled(client, Date.now())) return { status: 429, error: 'too_many_attempts' };
	const user = rawUser.trim().toLowerCase();
	if (rejoining.has(user)) return { status: 429, error: 'too_many_attempts' };
	const acc = getAccount(user);
	if (!acc || !reclaimMatches(user, secret)) {
		noteFailure(client, Date.now());
		return { status: 403, error: 'revoked' };
	}
	rejoining.add(user);
	try {
		const id = await userIdOf(user);
		// Gone (removed by the admin or the cleanup), or the name now belongs
		// to a different account.
		if (id === null || (acc.userId !== null && acc.userId !== id)) {
			noteFailure(client, Date.now());
			return { status: 410, error: 'revoked' };
		}
		if (hostname) {
			for (const n of await nodesOf(user)) {
				if (n.givenName === hostname || n.name === hostname) await deleteNode(n.id);
			}
		}
		const minted = await mintKey(id);
		pinForEnrollment(minted.id, devicePub(deviceKey));
		const reclaim = rotateReclaim(user, id);
		return { authkey: minted.key, server_url: BIGSCALE_PUBLIC_URL, user, reclaim };
	} catch (e) {
		console.error('[join] rejoin failed:', (e as Error).message);
		return { status: 502, error: 'server_error' };
	} finally {
		rejoining.delete(user);
	}
}

/**
 * Who is calling, for the per-client brake. Behind nginx-proxy-manager the
 * socket peer is the proxy, which overwrites X-Real-IP with the real client
 * address. Only used for rate limiting — never for authentication (the
 * tailnet endpoints keep using the socket address).
 */
export function clientKey(request: Request, getClientAddress: () => string): string {
	const real = request.headers.get('x-real-ip')?.trim();
	if (real) return real;
	try {
		return getClientAddress();
	} catch {
		return 'unknown';
	}
}

export type GroupLinkError = JoinError | 'nothing_to_join' | 'already_member';

/**
 * Someone already on the network opens an invite link: there's no account
 * to create, so the link only brings them into its group (and, for a
 * member's invite, lets them and the inviter reach each other). Opening it
 * from their signed-in BigLace is their consent. With `preview`, only says
 * what it would do.
 */
export async function redeemForMember(
	user: string,
	token: unknown,
	preview: boolean
): Promise<{ status: number; error: GroupLinkError } | { group: string | null; invited_by: string | null }> {
	if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { status: 400, error: 'invalid_request' };
	const client = `member:${user}`;
	if (throttled(client, Date.now())) return { status: 429, error: 'too_many_attempts' };
	const held: { invite: Invite; release?: () => void } | { reason: LookupFailure } = preview
		? lookup(token)
		: reserve(token);
	if ('reason' in held) return failed(client, held.reason);
	const { invite, release } = held;
	try {
		const inviter = invite.inviter ?? null;
		if (inviter) {
			const id = await userIdOf(inviter.user);
			if (id === null || (inviter.userId && id !== inviter.userId)) return failed(client, 'revoked');
			if (inviter.user === user) return { status: 409, error: 'already_member' };
		}
		let group = invite.group;
		if (group && inviter && !(await groupsOf(inviter.user)).includes(group)) group = null;
		const mine = await groupsOf(user);
		if (group && mine.includes(group)) return { status: 409, error: 'already_member' };
		if (!group && !inviter) return { status: 409, error: 'nothing_to_join' };
		const result = { group, invited_by: inviter?.user ?? null };
		if (preview) return result;
		if (group) await addMember(group, user, invite.mutual);
		if (inviter) await addPair(inviter.user, user);
		recordUse(invite.id, user);
		return result;
	} catch (e) {
		console.error('[join] member redeem failed:', (e as Error).message);
		return { status: 502, error: 'server_error' };
	} finally {
		release?.();
	}
}
