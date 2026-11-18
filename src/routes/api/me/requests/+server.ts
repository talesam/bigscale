import { json } from '@sveltejs/kit';
import { requireMember } from '$lib/server/member.js';
import { incoming, outgoing } from '$lib/server/group-requests.js';
import type { RequestHandler } from './$types';

// GET /api/me/requests → { incoming, outgoing }
// Group requests waiting for me, and the ones I sent still unanswered.
export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	return json(
		{ incoming: incoming(me.user), outgoing: outgoing(me.user) },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
