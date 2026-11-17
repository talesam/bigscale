import { json } from '@sveltejs/kit';
import { revokeInvite } from '$lib/server/invite-store.js';
import { requireMember } from '$lib/server/member.js';
import type { RequestHandler } from './$types';

// DELETE /api/me/invites/<id> → cancel one of my own invites.
export const DELETE: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	if (!revokeInvite(params.id, me.user)) return json({ error: 'not_found' }, { status: 404 });
	return json({ ok: true });
};
