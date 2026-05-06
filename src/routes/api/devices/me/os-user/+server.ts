import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractClientIp, getNodeByTailnetIp } from '$lib/server/tailnet-auth.js';
import { getDeviceMeta, setOsUser } from '$lib/server/device-meta.js';

// POST /api/devices/me/os-user
//
// Called by the biglace client right after `tailscale up` so the panel can
// learn which OS-level $USER lives on each device. Identity is the tunnel
// itself — we look up the source IP in the engine and trust that the node
// behind 100.64.x.y is the one making the request.
//
// Idempotent: if the stored value matches the request, we answer 304 and
// skip the disk write. biglace POSTs on every connect/retry, so this is the
// hot path most of the time.
//
// Rate-limited to 1 successful write per minute per node so a buggy client
// can't loop. Idempotent 304s don't count against the limit.

const OS_USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/i;
const WRITE_COOLDOWN_MS = 60_000;
const lastWriteAt = new Map<string, number>();

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = extractClientIp(request, getClientAddress);
	if (!ip) return json({ error: 'unidentifiable peer' }, { status: 401 });

	const node = await getNodeByTailnetIp(ip);
	if (!node) return json({ error: 'peer is not a known tailnet node' }, { status: 401 });

	let body: { os_user?: unknown };
	try {
		body = (await request.json()) as { os_user?: unknown };
	} catch {
		return json({ error: 'invalid JSON body' }, { status: 400 });
	}

	const osUser = typeof body.os_user === 'string' ? body.os_user.trim() : '';
	if (!osUser || !OS_USER_RE.test(osUser)) {
		return json({ error: 'os_user must match /^[a-z_][a-z0-9_-]{0,31}$/i' }, { status: 400 });
	}

	if (getDeviceMeta(node.id)?.os_user === osUser) {
		return new Response(null, { status: 304 });
	}

	const now = Date.now();
	const last = lastWriteAt.get(node.id) ?? 0;
	if (now - last < WRITE_COOLDOWN_MS) {
		return json(
			{ error: 'too many writes', retry_after: new Date(last + WRITE_COOLDOWN_MS).toISOString() },
			{ status: 429, headers: { 'Retry-After': String(Math.ceil((last + WRITE_COOLDOWN_MS - now) / 1000)) } }
		);
	}

	setOsUser(node.id, osUser);
	lastWriteAt.set(node.id, now);
	return json({ ok: true });
};
