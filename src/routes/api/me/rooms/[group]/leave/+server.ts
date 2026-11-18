import { json } from '@sveltejs/kit';
import { requireMember } from '$lib/server/member.js';
import { leave } from '$lib/server/rooms.js';
import type { RequestHandler } from './$types';

// POST /api/me/rooms/<group>/leave → { ok }
export const POST: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	leave(params.group, me.nodeId);
	return json({ ok: true });
};
