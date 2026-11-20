import { randomBytes } from 'node:crypto';
import { BIGSCALE_PUBLIC_URL } from './config.js';
import { mintKey, userIdOf } from './enroll.js';
import { deleteNode, nodesOf } from './accounts.js';
import { devicePub, pinForEnrollment } from './device-auth.js';

// Pairing a phone (or another computer) with your own account: BigLace on a
// computer that's already in shows a QR code; the phone scans it and joins
// as one more device of the same person — no new account, no key to copy.
//
// The token is the credential, so it's short-lived (10 minutes), single
// use, and only an account's own signed-in device can create one. Kept in
// memory: a restart of the panel just means scanning a new code.

const TTL_MS = 10 * 60 * 1000;
const PER_USER = 5;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;
const HOST_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

interface Pending {
	user: string;
	expires: number;
}

const pending = new Map<string, Pending>();

function sweep(now: number): void {
	for (const [t, p] of pending) if (p.expires <= now) pending.delete(t);
}

/** A pairing token for `user` (their signed-in device asked). */
export function createPairing(user: string): { token: string; expires: number } | null {
	const now = Date.now();
	sweep(now);
	if ([...pending.values()].filter((p) => p.user === user).length >= PER_USER) return null;
	const token = randomBytes(32).toString('base64url');
	const expires = now + TTL_MS;
	pending.set(token, { user, expires });
	return { token, expires };
}

export type PairFailure = { status: number; error: 'invalid_request' | 'expired' | 'too_many_attempts' | 'server_error' };
export interface PairSuccess {
	authkey: string;
	server_url: string;
	user: string;
}

// Brake on wrong tokens, per client (guessing 256 bits is hopeless; this
// keeps a scanner from turning the endpoint into load).
const failures = new Map<string, number[]>();
function throttled(client: string, now: number): boolean {
	const recent = (failures.get(client) ?? []).filter((t) => now - t < 60_000);
	if (recent.length) failures.set(client, recent);
	else failures.delete(client);
	return recent.length >= 30;
}
function noteFailure(client: string, now: number): void {
	if (failures.size > 10_000) failures.clear();
	failures.set(client, [...(failures.get(client) ?? []), now]);
}

/**
 * The scanned code, used once: a pre-auth key of the pairing account for
 * the new device (pinned to its device key). A device of that account with
 * the same name is replaced (the same phone, paired again).
 */
export async function redeemPairing(
	client: string,
	token: unknown,
	rawHost: unknown,
	deviceKey: unknown
): Promise<PairFailure | PairSuccess> {
	const now = Date.now();
	if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { status: 400, error: 'invalid_request' };
	if (throttled(client, now)) return { status: 429, error: 'too_many_attempts' };
	sweep(now);
	const p = pending.get(token);
	if (!p) {
		noteFailure(client, now);
		return { status: 410, error: 'expired' };
	}
	pending.delete(token);
	return keyFor(p.user, rawHost, deviceKey);
}

/**
 * A pre-auth key of `user` for a new device (pinned to its device key). A
 * device of that account with the same name is replaced: the same phone or
 * computer, joining again.
 */
async function keyFor(user: string, rawHost: unknown, deviceKey: unknown): Promise<PairFailure | PairSuccess> {
	const hostname = typeof rawHost === 'string' && HOST_RE.test(rawHost) ? rawHost : null;
	try {
		const id = await userIdOf(user);
		if (id === null) return { status: 410, error: 'expired' };
		if (hostname) {
			for (const n of await nodesOf(user)) {
				if (n.givenName === hostname || n.name === hostname) await deleteNode(n.id);
			}
		}
		const minted = await mintKey(id);
		pinForEnrollment(minted.id, devicePub(deviceKey));
		return { authkey: minted.key, server_url: BIGSCALE_PUBLIC_URL, user };
	} catch (e) {
		console.error('[pair] failed:', (e as Error).message);
		return { status: 502, error: 'server_error' };
	}
}

// ─── The other way round, as Telegram does ─────────────────────────────────
//
// A computer that isn't in any account yet shows a QR code (`code`); a device
// already in an account scans it, sees the computer's name and approves. The
// computer, asking all along with a secret of its own (`poll`) that never
// leaves it, then gets a key of that account. The code alone gets nothing.

const MAX_LINKS = 2000;
const STARTS_PER_MINUTE = 10;

interface LinkRequest {
	poll: string;
	hostname: string | null;
	deviceKey: unknown;
	expires: number;
	/** Set once approved, handed to the computer at its next poll. */
	result?: PairSuccess;
}

/** By code. */
const links = new Map<string, LinkRequest>();
const starts = new Map<string, number[]>();

function sweepLinks(now: number): void {
	for (const [c, l] of links) if (l.expires <= now) links.delete(c);
}

/** A computer asks to join some account: its code to show and its secret to poll with. */
export function startLink(
	client: string,
	rawHost: unknown,
	deviceKey: unknown
): { code: string; poll: string; expires: number } | PairFailure {
	const now = Date.now();
	sweepLinks(now);
	const recent = (starts.get(client) ?? []).filter((t) => now - t < 60_000);
	if (recent.length >= STARTS_PER_MINUTE || links.size >= MAX_LINKS) return { status: 429, error: 'too_many_attempts' };
	if (starts.size > 10_000) starts.clear();
	starts.set(client, [...recent, now]);
	const hostname = typeof rawHost === 'string' && HOST_RE.test(rawHost) ? rawHost : null;
	const code = randomBytes(32).toString('base64url');
	const poll = randomBytes(32).toString('base64url');
	const expires = now + TTL_MS;
	links.set(code, { poll, hostname, deviceKey, expires });
	return { code, poll, expires };
}

function waiting(code: unknown, now: number): LinkRequest | null {
	if (typeof code !== 'string' || !TOKEN_RE.test(code)) return null;
	sweepLinks(now);
	const l = links.get(code);
	return l && !l.result ? l : null;
}

/** What a scanned code asks for: the computer's name (null: not offered). */
export function peekLink(code: unknown): { hostname: string | null } | null {
	const l = waiting(code, Date.now());
	return l ? { hostname: l.hostname } : null;
}

/** A device of `user` approved the scanned code: the computer joins that account. */
export async function approveLink(user: string, code: unknown): Promise<{ hostname: string | null } | PairFailure> {
	const l = waiting(code, Date.now());
	if (!l) return { status: 410, error: 'expired' };
	const r = await keyFor(user, l.hostname, l.deviceKey);
	if ('error' in r) return r;
	l.result = r;
	return { hostname: l.hostname };
}

/** The computer asks whether it was approved: its key once, then the request is gone. */
export function pollLink(client: string, poll: unknown): PairSuccess | 'pending' | PairFailure {
	const now = Date.now();
	if (typeof poll !== 'string' || !TOKEN_RE.test(poll)) return { status: 400, error: 'invalid_request' };
	if (throttled(client, now)) return { status: 429, error: 'too_many_attempts' };
	sweepLinks(now);
	for (const [code, l] of links) {
		if (l.poll !== poll) continue;
		if (!l.result) return 'pending';
		links.delete(code);
		return l.result;
	}
	noteFailure(client, now);
	return { status: 410, error: 'expired' };
}
