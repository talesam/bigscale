import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_DATA_DIR } from './config.js';
import { contactsOf } from './group-requests.js';
import { getSettings } from './network-settings.js';

// Profile photos: each person sets theirs from BigLace (a small square JPEG
// or PNG the app prepares); the others see it next to their name in chats,
// rooms and groups. One file per account under /data/avatars.
//
// Who can see a photo follows the network's "who members see" setting:
// everyone, or only the people one is connected to.

const DIR = resolve(ADMIN_DATA_DIR, 'avatars');
/** Decoded size accepted (the app sends ~20–40 KB). */
export const MAX_BYTES = 46 * 1024;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type AvatarError = 'invalid_image' | 'too_large' | 'not_found' | 'forbidden';

function file(user: string): string | null {
	return NAME_RE.test(user) ? resolve(DIR, `${user}.img`) : null;
}

/** JPEG or PNG, by their signatures — nothing else is stored or served. */
export function imageType(b: Buffer): 'image/jpeg' | 'image/png' | null {
	if (b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
	if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	return null;
}

export function setAvatar(user: string, base64: unknown): AvatarError | { hash: string } {
	const path = file(user);
	if (!path || typeof base64 !== 'string' || base64.length > MAX_BYTES * 2) return 'invalid_image';
	const bytes = Buffer.from(base64, 'base64');
	if (bytes.length > MAX_BYTES) return 'too_large';
	if (!imageType(bytes)) return 'invalid_image';
	if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, bytes, { mode: 0o600 });
	renameSync(tmp, path);
	return { hash: hashOf(bytes) };
}

export function removeAvatar(user: string): void {
	const path = file(user);
	if (path && existsSync(path)) rmSync(path);
}

function hashOf(b: Buffer): string {
	return createHash('sha256').update(b).digest('hex').slice(0, 16);
}

function read(user: string): Buffer | null {
	const path = file(user);
	if (!path || !existsSync(path)) return null;
	try {
		return readFileSync(path);
	} catch {
		return null;
	}
}

/** Whom `caller` may see photos of (null: everyone on the network). */
async function visibleTo(caller: string): Promise<Set<string> | null> {
	if (getSettings().directory === 'network') return null;
	const set = await contactsOf(caller);
	set.add(caller);
	return set;
}

/** Hash of each listed person's photo `caller` may see (missing: none). */
export async function hashes(caller: string, users: string[]): Promise<Record<string, string>> {
	const visible = await visibleTo(caller);
	const out: Record<string, string> = {};
	for (const u of new Set(users)) {
		if (visible && !visible.has(u)) continue;
		const b = read(u);
		if (b) out[u] = hashOf(b);
	}
	return out;
}

export async function photo(caller: string, user: string): Promise<AvatarError | { bytes: Buffer; type: string; hash: string }> {
	const visible = await visibleTo(caller);
	if (visible && !visible.has(user)) return 'forbidden';
	const b = read(user);
	if (!b) return 'not_found';
	const type = imageType(b);
	if (!type) return 'not_found';
	return { bytes: b, type, hash: hashOf(b) };
}

/** The account is gone: so is its photo. */
export function forgetAvatar(user: string): void {
	removeAvatar(user);
}

/** Accounts with a photo (for cleanup tooling). */
export function withAvatar(): string[] {
	try {
		return readdirSync(DIR)
			.filter((f) => f.endsWith('.img'))
			.map((f) => f.slice(0, -4));
	} catch {
		return [];
	}
}
