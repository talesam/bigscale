import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ADMIN_DATA_DIR } from './config.js';
import { hashToken, listInvites } from './invite-store.js';

// Accounts created through invites, and the secret that lets their owner
// come back under the same name.
//
// An invite creates a user; when that person signs out, reinstalls or loses
// the device, the user stays behind and the name with it ("bigrato" → only
// "bigrato-2" left). Two ways out, both kept here:
//   - the reclaim secret: BigLace keeps it in the OS keyring, and with it the
//     same installation can sign in again as the same user, no invite needed;
//   - the "created by invite" mark: only those accounts are removed
//     automatically once they have no device left (admin-made users never).
//
// Like invites, only the SHA-256 of the secret is stored.

const STORE_PATH = resolve(ADMIN_DATA_DIR, 'accounts.json');

export interface Account {
	/** Engine user id: a user deleted and re-created under the same name is a
	 * different account, and the old secret must not open it. */
	userId: string | null;
	createdAt: string;
	reclaimHash: string | null;
	/** Set when the owner signed out on purpose (account kept for coming
	 * back): the automatic cleanup leaves it alone until then. */
	keepUntil?: string;
}

type Store = Record<string, Account>;

let cache: Store | null = null;

function load(): Store {
	if (cache) return cache;
	try {
		const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as unknown;
		cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
	} catch {
		// First run with this feature: accounts made by invites so far are
		// the users the invite log names (no secret: they predate it).
		cache = {};
		for (const inv of listInvites()) {
			for (const use of inv.uses) {
				cache[use.user] ??= { userId: null, createdAt: use.at, reclaimHash: null };
			}
		}
		if (Object.keys(cache).length) persist(cache);
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

function newSecret(): string {
	return crypto.randomBytes(32).toString('base64url');
}

/** Note a user created by an invite. Returns its reclaim secret (shown once). */
export function recordAccount(user: string, userId: string): string {
	const secret = newSecret();
	const store = load();
	store[user] = { userId, createdAt: new Date().toISOString(), reclaimHash: hashToken(secret) };
	persist(store);
	return secret;
}

export function getAccount(user: string): Account | null {
	const store = load();
	// Own keys only: a caller-supplied "__proto__" must not find anything.
	return Object.hasOwn(store, user) ? store[user] : null;
}

export function listAccounts(): [string, Account][] {
	return Object.entries(load());
}

/** Whether `secret` opens `user`'s account (constant-time compare). */
export function reclaimMatches(user: string, secret: string): boolean {
	const acc = getAccount(user);
	if (!acc?.reclaimHash) return false;
	const a = Buffer.from(acc.reclaimHash, 'hex');
	const b = Buffer.from(hashToken(secret), 'hex');
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Replace the secret (each use hands out a new one). Returns it. */
export function rotateReclaim(user: string, userId: string): string {
	const store = load();
	const acc = store[user];
	if (!acc) throw new Error(`no account ${user}`);
	const secret = newSecret();
	acc.reclaimHash = hashToken(secret);
	acc.userId = userId;
	delete acc.keepUntil;
	persist(store);
	return secret;
}

/** The owner signed out on purpose: keep the account for `days`. */
export function keepAccount(user: string, days: number): void {
	const store = load();
	const acc = store[user];
	if (!acc) return;
	acc.keepUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
	persist(store);
}

export function forgetAccount(user: string): void {
	const store = load();
	if (!(user in store)) return;
	delete store[user];
	persist(store);
}
