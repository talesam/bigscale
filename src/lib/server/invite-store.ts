import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ADMIN_DATA_DIR } from './config.js';

// Invites: one-time (or few-times) links an admin hands out so a new person
// can join the network without the admin creating users or keys by hand.
//
// The secret token is shown to the admin exactly once, at creation. Only its
// SHA-256 is stored, so a leaked /data/invites.json can't be replayed.
//
// Storage: a single JSON file under /data, written atomically (tmp + rename),
// same approach as device-meta.json.

const STORE_PATH = resolve(ADMIN_DATA_DIR, 'invites.json');

export const MAX_USES_LIMIT = 50;
export const MAX_VALID_DAYS = 30;
// Redeemed/expired invites are kept for a while so the admin can see who
// joined through them, then dropped so the file doesn't grow forever.
const KEEP_FINISHED_MS = 30 * 24 * 60 * 60 * 1000;

export interface InviteUse {
	user: string;
	at: string;
}

export interface Invite {
	id: string;
	hash: string;
	/** Policy group (without the `group:` prefix) new members are added to; null = none. */
	group: string | null;
	/** When the group doesn't exist yet: create it so its members reach each other. */
	mutual: boolean;
	note: string;
	createdAt: string;
	expiresAt: string;
	maxUses: number;
	uses: InviteUse[];
	revokedAt?: string;
}

/** What the admin UI gets — never the hash. */
export type InviteView = Omit<Invite, 'hash'> & { status: InviteStatus };

export type InviteStatus = 'active' | 'used' | 'expired' | 'revoked';

let cache: Invite[] | null = null;
// Uses being redeemed right now, so two people racing on the last slot can't
// both get in. In memory only: a crash mid-redeem simply frees the slot.
const pending = new Map<string, number>();

function load(): Invite[] {
	if (cache) return cache;
	try {
		const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as unknown;
		cache = Array.isArray(parsed) ? (parsed as Invite[]) : [];
	} catch {
		cache = [];
	}
	return cache;
}

function persist(list: Invite[]): void {
	const dir = dirname(STORE_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const tmp = `${STORE_PATH}.tmp`;
	writeFileSync(tmp, JSON.stringify(list, null, '\t'), { encoding: 'utf-8', mode: 0o600 });
	renameSync(tmp, STORE_PATH);
}

export function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token, 'utf-8').digest('hex');
}

export function statusOf(inv: Invite, now = Date.now()): InviteStatus {
	if (inv.revokedAt) return 'revoked';
	if (inv.uses.length >= inv.maxUses) return 'used';
	if (Date.parse(inv.expiresAt) <= now) return 'expired';
	return 'active';
}

function view(inv: Invite): InviteView {
	const { hash: _hash, ...rest } = inv;
	return { ...rest, status: statusOf(inv) };
}

function prune(list: Invite[], now: number): Invite[] {
	return list.filter((inv) => {
		if (statusOf(inv, now) === 'active') return true;
		const finishedAt = Math.max(
			Date.parse(inv.expiresAt) || 0,
			Date.parse(inv.revokedAt ?? '') || 0,
			...inv.uses.map((u) => Date.parse(u.at) || 0)
		);
		return now - finishedAt < KEEP_FINISHED_MS;
	});
}

export function listInvites(): InviteView[] {
	const now = Date.now();
	const list = load();
	const kept = prune(list, now);
	if (kept.length !== list.length) {
		cache = kept;
		persist(kept);
	}
	return [...kept].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(view);
}

export interface NewInvite {
	group: string | null;
	mutual: boolean;
	note: string;
	maxUses: number;
	validDays: number;
}

/** Create an invite. Returns the public view plus the secret token (shown once). */
export function createInvite(opts: NewInvite): { invite: InviteView; token: string } {
	const token = crypto.randomBytes(32).toString('base64url');
	const now = Date.now();
	const inv: Invite = {
		id: crypto.randomBytes(8).toString('hex'),
		hash: hashToken(token),
		group: opts.group,
		mutual: opts.mutual,
		note: opts.note,
		createdAt: new Date(now).toISOString(),
		expiresAt: new Date(now + opts.validDays * 24 * 60 * 60 * 1000).toISOString(),
		maxUses: opts.maxUses,
		uses: []
	};
	const list = load();
	list.push(inv);
	persist(list);
	return { invite: view(inv), token };
}

export function revokeInvite(id: string): boolean {
	const inv = load().find((i) => i.id === id);
	if (!inv || inv.revokedAt) return false;
	inv.revokedAt = new Date().toISOString();
	persist(load());
	return true;
}

export type LookupFailure = 'unknown' | 'expired' | 'used' | 'revoked';

/** Find the invite a token belongs to, or why it can't be used. Doesn't count in-flight redeems. */
export function lookup(token: string): { invite: Invite } | { reason: LookupFailure } {
	const hash = hashToken(token);
	const inv = load().find((i) => i.hash === hash);
	if (!inv) return { reason: 'unknown' };
	const status = statusOf(inv);
	if (status !== 'active') return { reason: status };
	return { invite: inv };
}

/**
 * Hold one use of the invite while the account is being created. Returns a
 * release function on success, or why the invite can't be used.
 */
export function reserve(token: string): { invite: Invite; release: () => void } | { reason: LookupFailure } {
	const found = lookup(token);
	if ('reason' in found) return found;
	const inv = found.invite;
	const held = pending.get(inv.id) ?? 0;
	if (inv.uses.length + held >= inv.maxUses) return { reason: 'used' };
	pending.set(inv.id, held + 1);
	let released = false;
	return {
		invite: inv,
		release: () => {
			if (released) return;
			released = true;
			const n = (pending.get(inv.id) ?? 1) - 1;
			if (n <= 0) pending.delete(inv.id);
			else pending.set(inv.id, n);
		}
	};
}

/** Record that `user` joined through the invite. Call before releasing the reservation. */
export function recordUse(id: string, user: string): void {
	const inv = load().find((i) => i.id === id);
	if (!inv) return;
	inv.uses.push({ user, at: new Date().toISOString() });
	persist(load());
}

