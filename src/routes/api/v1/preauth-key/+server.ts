import { json } from '@sveltejs/kit';
import { verifyAdmin } from '$lib/server/admin-store.js';
import { bs } from '$lib/server/bigscale-server.js';
import { BIGSCALE_PUBLIC_URL } from '$lib/server/config.js';
import { devicePub, pinForEnrollment } from '$lib/server/device-auth.js';
import type { RequestHandler } from './$types';

interface PreAuthBody {
	username?:  string;
	password?:  string;
	node_user?: string;
	hostname?:  string;
	/** BigLace's device public key (see device-auth.ts). */
	device_key?: string;
}

interface UserResp {
	user?: { id?: string | number; name?: string };
}

interface PreAuthKeyResp {
	preAuthKey?: { key?: string; id?: string | number };
}

interface PreAuthKey {
	id?:         string | number;
	key?:        string;
	user?:       { id?: string | number };
	used?:       boolean;
	expiration?: string;
}

interface PreAuthKeysResp {
	preAuthKeys?: PreAuthKey[];
}

// Headscale preauth keys are 48-byte hex strings (96 chars). Anything much
// shorter coming back from `GET preauthkey` means the list endpoint returned
// only a truncated identifier rather than the full secret — happens on some
// headscale versions for security. Don't try to reuse those.
const MIN_REUSABLE_KEY_LEN = 48;

async function findReusableKey(userId: string): Promise<{ key: string; id: string } | null> {
	// Each click on "Entrar" used to mint a brand new key, polluting the
	// server with dozens of unused keys per user. Reuse one that's still
	// good (belongs to this user, hasn't been redeemed, hasn't expired).
	const listRes = await bs('GET', 'preauthkey', undefined, { user: userId });
	if (!listRes.ok) return null;
	const list = (await listRes.json()) as PreAuthKeysResp;
	const now = Date.now();
	const candidate = list.preAuthKeys?.find(
		(k) =>
			String(k.user?.id) === userId &&
			k.used !== true &&
			!!k.expiration &&
			Date.parse(k.expiration) > now &&
			typeof k.key === 'string' &&
			k.key.length >= MIN_REUSABLE_KEY_LEN
	);
	return candidate?.key && candidate.id !== undefined ? { key: candidate.key, id: String(candidate.id) } : null;
}

// Trim leading/trailing '-' with index scans: an anchored `/-+$/` regex
// backtracks quadratically on long runs of dashes in the middle of the input.
function trimDashes(s: string): string {
	let start = 0;
	let end = s.length;
	while (start < end && s[start] === '-') start++;
	while (end > start && s[end - 1] === '-') end--;
	return s.slice(start, end);
}

function sanitizeName(raw: string): string {
	const trimmed = raw.trim().toLowerCase();
	const cleaned = trimDashes(trimmed.replace(/[^a-z0-9-]/g, '-'));
	return cleaned || 'user';
}

async function ensureUser(name: string): Promise<string> {
	// Try to create the user; if it already exists, fall through to the list lookup.
	// Either way, return the user ID.
	const createRes = await bs('POST', 'user', { name });
	if (createRes.ok) {
		const created = (await createRes.json()) as UserResp;
		const id = created.user?.id;
		if (id !== undefined) return String(id);
	} else {
		const text = await createRes.text();
		// The backend returns 500 with "UNIQUE constraint failed" when the user already exists.
		const alreadyExists =
			createRes.status === 409 ||
			createRes.status === 400 ||
			/already exists|UNIQUE constraint/i.test(text);
		if (!alreadyExists) {
			throw new Error(`Failed to ensure user on server (HTTP ${createRes.status}): ${text}`);
		}
	}

	// Look up the ID via list (filtered by name).
	const listRes = await bs('GET', 'user', undefined, { name });
	if (!listRes.ok) {
		throw new Error(`Failed to look up user (HTTP ${listRes.status})`);
	}
	const list = (await listRes.json()) as { users?: { id?: string | number; name?: string }[] };
	const found = list.users?.find((u) => u.name === name);
	if (found?.id === undefined) {
		throw new Error(`User ${name} not found after creation`);
	}
	return String(found.id);
}

export const POST: RequestHandler = async ({ request }) => {
	let body: PreAuthBody;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const username = (body.username ?? '').trim();
	const password = body.password ?? '';
	if (!username || !password) {
		return json({ error: 'Username and password are required' }, { status: 400 });
	}

	const auth = verifyAdmin(username, password);
	if (!auth.ok) {
		return json({ error: 'Invalid credentials' }, { status: 401 });
	}

	const nodeUser = sanitizeName(body.node_user || username);

	let userId: string;
	try {
		userId = await ensureUser(nodeUser);
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}

	// Reuse an existing valid key for this user before minting a new one.
	const reusable = await findReusableKey(userId);
	if (reusable) {
		pinForEnrollment(reusable.id, devicePub(body.device_key));
		return json({ authkey: reusable.key, server_url: BIGSCALE_PUBLIC_URL });
	}

	// 24h gives the user enough headroom to actually click Connect after the
	// dialog closes (the old 1h was easy to miss).
	const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
	const res = await bs('POST', 'preauthkey', {
		user:       userId,
		reusable:   false,
		ephemeral:  false,
		expiration
	});

	if (!res.ok) {
		const text = await res.text();
		return json(
			{ error: `Failed to mint key (HTTP ${res.status}): ${text}` },
			{ status: 502 }
		);
	}

	const data = (await res.json()) as PreAuthKeyResp;
	const key = data.preAuthKey?.key;
	if (!key) {
		return json({ error: 'Unexpected response from BigScale server' }, { status: 502 });
	}
	if (data.preAuthKey?.id !== undefined) pinForEnrollment(String(data.preAuthKey.id), devicePub(body.device_key));

	return json({
		authkey:    key,
		server_url: BIGSCALE_PUBLIC_URL
	});
};
