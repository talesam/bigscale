import { json } from '@sveltejs/kit';
import { clientKey, rejoin } from '$lib/server/join.js';
import type { RequestHandler } from './$types';

// POST /api/rejoin { user, reclaim, hostname? } → { authkey, server_url, user, reclaim }
//
// Public: BigLace signing in again as the account an invite created on this
// installation. The reclaim secret is the credential (see $lib/server/join.ts).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { user?: unknown; reclaim?: unknown; hostname?: unknown; device_key?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const result = await rejoin(clientKey(request, getClientAddress), body.user, body.reclaim, body.hostname, body.device_key);
	if ('error' in result) {
		const { status, ...rest } = result;
		return json(rest, { status });
	}
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
