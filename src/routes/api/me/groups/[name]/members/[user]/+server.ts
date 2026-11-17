import { json } from '@sveltejs/kit';
import { requireMember } from '$lib/server/member.js';
import { removeFromGroup, groupError } from '$lib/server/member-groups.js';
import type { RequestHandler } from './$types';

// DELETE /api/me/groups/<name>/members/<user>
//   the owner removes someone, or a member removes themselves (leaves).
export const DELETE: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	try {
		await removeFromGroup(me.user, params.name, params.user);
		return json({ ok: true });
	} catch (e) {
		return groupError(e);
	}
};
