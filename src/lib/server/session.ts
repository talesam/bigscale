import crypto from 'crypto';
import { SESSION_TTL_MS } from './config.js';

interface Session {
	expiresAt: number;
	mustChangePassword: boolean;
	/** Network user who signed in from BigLace (see $lib/server/admins.ts);
	 * absent for the panel's own admin account. */
	user?: string;
}

const store = new Map<string, Session>();

setInterval(() => {
	const now = Date.now();
	for (const [k, v] of store) {
		if (v.expiresAt < now) store.delete(k);
	}
}, 3_600_000);

export function createSession(opts: { mustChangePassword?: boolean; user?: string } = {}): string {
	const token = crypto.randomBytes(32).toString('hex');
	store.set(token, {
		expiresAt: Date.now() + SESSION_TTL_MS,
		mustChangePassword: !!opts.mustChangePassword,
		...(opts.user ? { user: opts.user } : {})
	});
	return token;
}

/** End the sessions of network users no longer allowed (`keep` returns false). */
export function dropSessionsWhere(drop: (user: string) => boolean): void {
	for (const [k, v] of store) if (v.user && drop(v.user)) store.delete(k);
}

export function dropSessionsOf(user: string): void {
	dropSessionsWhere((u) => u === user);
}

export function getSession(token: string): Session | null {
	const s = store.get(token);
	if (!s) return null;
	if (s.expiresAt < Date.now()) { store.delete(token); return null; }
	return s;
}

export function validateSession(token: string): boolean {
	return getSession(token) !== null;
}

export function clearMustChange(token: string): void {
	const s = store.get(token);
	if (s) s.mustChangePassword = false;
}

export function deleteSession(token: string): void {
	store.delete(token);
}
