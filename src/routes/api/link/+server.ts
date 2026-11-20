import { json } from '@sveltejs/kit';
import { PANEL_PUBLIC_URL } from '$lib/server/config-panel.js';
import { clientKey } from '$lib/server/join.js';
import { startLink } from '$lib/server/pair.js';
import type { RequestHandler } from './$types';

// POST /api/link { hostname?, device_key? } → { code, poll, link, expires }
//
// Public: a computer that isn't in any account yet asks to join one. It shows
// `link` as a QR code for a device already in an account to approve, and asks
// /api/link/poll with `poll` until then (see $lib/server/pair.ts).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { hostname?: unknown; device_key?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const r = startLink(clientKey(request, getClientAddress), body.hostname, body.device_key);
	if ('error' in r) {
		const { status, ...rest } = r;
		return json(rest, { status });
	}
	const link = `${PANEL_PUBLIC_URL.replace(/\/$/, '')}/link#${r.code}`;
	return json({ ...r, link }, { headers: { 'Cache-Control': 'no-store' } });
};
