import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { peekLink } from '$lib/server/pair.js';
import type { RequestHandler } from './$types';

// POST /api/me/link { code } → { hostname }
//
// A signed-in device scanned a computer's code: the name the computer gave,
// to show before approving.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ code?: unknown }>(me.body);
	if (!body) return json({ error: 'invalid_request' }, { status: 400 });
	const r = peekLink(body.code);
	if (!r) return json({ error: 'expired' }, { status: 410 });
	return json(r, { headers: { 'Cache-Control': 'no-store' } });
};
