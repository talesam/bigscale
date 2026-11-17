import { bs } from './bigscale-server.js';

// Engine calls used to enroll a new person: create their user, mint the
// one-time key their device joins with, and undo it if a later step fails.

// Names the panel or the system relies on; an invitee can't take them.
const RESERVED = new Set(['_panel', 'panel', 'admin', 'root', 'bigscale', 'headscale']);

export const USER_NAME_MAX = 32;

/**
 * Engine user name from what the person typed ("Maria José" → "maria-jose").
 * Returns null when nothing usable is left or the name is reserved.
 */
export function userNameFrom(raw: string): string | null {
	const ascii = raw
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
	let out = '';
	for (const ch of ascii) {
		if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) out += ch;
		else if (!out.endsWith('-')) out += '-';
	}
	// Trim dashes by index (no anchored regex: avoids backtracking).
	let start = 0;
	let end = out.length;
	while (start < end && out[start] === '-') start++;
	while (end > start && out[end - 1] === '-') end--;
	out = out.slice(start, Math.min(end, start + USER_NAME_MAX));
	while (out.endsWith('-')) out = out.slice(0, -1);
	if (out.length < 2 || RESERVED.has(out)) return null;
	return out;
}

/** Free-text display name: printable, trimmed, bounded. */
export function displayNameFrom(raw: string): string {
	let out = '';
	for (const ch of raw.trim()) {
		const code = ch.codePointAt(0) ?? 0;
		if (code >= 0x20 && code !== 0x7f) out += ch;
	}
	return out.slice(0, 64);
}

interface UsersResp {
	users?: { id?: string | number; name?: string }[];
}

async function allUserNames(): Promise<Set<string>> {
	const res = await bs('GET', 'user');
	if (!res.ok) throw new Error(`list users (HTTP ${res.status})`);
	const body = (await res.json()) as UsersResp;
	return new Set((body.users ?? []).map((u) => u.name ?? ''));
}

/**
 * Whether `name` is taken — by an existing user or by `alsoTaken` (names the
 * policy grants access to) — and if so a free alternative (`name-2`, …).
 */
export async function nameConflict(
	name: string,
	alsoTaken: Set<string> = new Set()
): Promise<{ taken: boolean; suggestion?: string }> {
	const names = await allUserNames();
	for (const n of alsoTaken) names.add(n);
	if (!names.has(name)) return { taken: false };
	for (let i = 2; i < 100; i++) {
		const suffix = `-${i}`;
		const candidate = name.slice(0, USER_NAME_MAX - suffix.length) + suffix;
		if (!names.has(candidate)) return { taken: true, suggestion: candidate };
	}
	return { taken: true };
}

/** Id of the engine user with this name, or null. */
export async function userIdOf(name: string): Promise<string | null> {
	const res = await bs('GET', 'user');
	if (!res.ok) throw new Error(`list users (HTTP ${res.status})`);
	const body = (await res.json()) as UsersResp;
	const u = (body.users ?? []).find((x) => x.name === name);
	return u?.id === undefined ? null : String(u.id);
}

/** Whether an engine user with this name exists. */
export async function userExists(name: string): Promise<boolean> {
	return (await allUserNames()).has(name);
}

/** Create a brand-new user. Returns its id. */
export async function createUser(name: string, displayName: string): Promise<string> {
	const res = await bs('POST', 'user', { name, displayName: displayName || name });
	if (!res.ok) throw new Error(`create user (HTTP ${res.status}): ${await res.text()}`);
	const body = (await res.json()) as { user?: { id?: string | number } };
	if (body.user?.id === undefined) throw new Error('create user: no id in response');
	return String(body.user.id);
}

export async function deleteUser(id: string): Promise<void> {
	const res = await bs('DELETE', `user/${id}`);
	if (!res.ok) throw new Error(`delete user ${id} (HTTP ${res.status}): ${await res.text()}`);
}

/** One-time key the new device joins with. */
export async function mintKey(userId: string): Promise<string> {
	const res = await bs('POST', 'preauthkey', {
		user: userId,
		reusable: false,
		ephemeral: false,
		// The device normally connects seconds later; a day of slack covers
		// "joined, then the laptop went to sleep before connecting".
		expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
	});
	if (!res.ok) throw new Error(`mint key (HTTP ${res.status}): ${await res.text()}`);
	const key = ((await res.json()) as { preAuthKey?: { key?: string } }).preAuthKey?.key;
	if (!key) throw new Error('mint key: no key in response');
	return key;
}
