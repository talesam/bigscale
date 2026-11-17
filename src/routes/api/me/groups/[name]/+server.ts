import { json } from '@sveltejs/kit';
import { requireMember } from '$lib/server/member.js';
import { deleteGroup, groupError } from '$lib/server/member-groups.js';
import type { RequestHandler } from './$types';

// DELETE /api/me/groups/<name> → delete a group I own.
export const DELETE: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	try {
		await deleteGroup(me.user, params.name);
		return json({ ok: true });
	} catch (e) {
		return groupError(e);
	}
};
