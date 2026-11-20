import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { approveLink } from '$lib/server/pair.js';
import type { RequestHandler } from './$types';

// POST /api/me/link/approve { code } → { hostname }
//
// A signed-in device approves the computer that showed `code`: it joins the
// caller's account.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ code?: unknown }>(me.body);
	if (!body) return json({ error: 'invalid_request' }, { status: 400 });
	const r = await approveLink(me.user, body.code);
	if ('error' in r) {
		const { status, ...rest } = r;
		return json(rest, { status });
	}
	return json(r, { headers: { 'Cache-Control': 'no-store' } });
};
