import { json } from '@sveltejs/kit';
import { clientKey, redeemInvite } from '$lib/server/join.js';
import type { RequestHandler } from './$types';

// POST /api/join { invite, name } → { authkey, server_url, user, group }
//
// Public: called by BigLace on a device that isn't on the network yet. The
// invite token is the credential (see $lib/server/join.ts).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { invite?: unknown; name?: unknown; device_key?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const result = await redeemInvite(clientKey(request, getClientAddress), body.invite, body.name, body.device_key);
	if ('error' in result) {
		const { status, ...rest } = result;
		return json(rest, { status });
	}
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
