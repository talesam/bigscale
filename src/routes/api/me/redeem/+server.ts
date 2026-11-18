import { json } from '@sveltejs/kit';
import { redeemForMember } from '$lib/server/join.js';
import { jsonBody, requireMember } from '$lib/server/member.js';
import type { RequestHandler } from './$types';

// POST /api/me/redeem { invite, preview? } → { group, invited_by }
// An invite link opened by someone already on the network: it brings them
// into the invite's group instead of creating a new account.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ invite?: unknown; preview?: unknown }>(me.body);
	if (!body) return json({ error: 'invalid_request' }, { status: 400 });
	const r = await redeemForMember(me.user, body.invite, body.preview === true);
	if ('error' in r) return json({ error: r.error }, { status: r.status });
	return json(r, { headers: { 'Cache-Control': 'no-store' } });
};
