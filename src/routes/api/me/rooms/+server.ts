import { json } from '@sveltejs/kit';
import { groupsFor } from '$lib/server/member-groups.js';
import { requireMember } from '$lib/server/member.js';
import { publicView, snapshot } from '$lib/server/rooms.js';
import type { RequestHandler } from './$types';

// GET /api/me/rooms → { rooms: [{ group, participants: [...] }] }
// One room per group the caller is in; who is in each right now.
export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	let groups: string[];
	try {
		groups = (await groupsFor(me.user)).map((g) => g.name);
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
	const live = snapshot(groups);
	return json({
		rooms: groups.map((group) => ({ group, participants: (live[group] ?? []).map(publicView) }))
	});
};
