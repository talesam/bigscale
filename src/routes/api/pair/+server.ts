import { json } from '@sveltejs/kit';
import { clientKey } from '$lib/server/join.js';
import { redeemPairing } from '$lib/server/pair.js';
import type { RequestHandler } from './$types';

// POST /api/pair { token, hostname?, device_key? } → { authkey, server_url, user }
//
// Public: the phone that scanned a pairing code joins as a device of the
// account that showed it. The single-use, 10-minute token is the credential
// (see $lib/server/pair.ts).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { token?: unknown; hostname?: unknown; device_key?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const r = await redeemPairing(clientKey(request, getClientAddress), body.token, body.hostname, body.device_key);
	if ('error' in r) {
		const { status, ...rest } = r;
		return json(rest, { status });
	}
	return json(r, { headers: { 'Cache-Control': 'no-store' } });
};
