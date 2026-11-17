import { json } from '@sveltejs/kit';
import { revokeInvite } from '$lib/server/invite-store.js';
import { callerMember } from '$lib/server/member.js';
import type { RequestHandler } from './$types';

// DELETE /api/me/invites/<id> → cancel one of my own invites.
export const DELETE: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await callerMember(request, getClientAddress);
	if (!me) return json({ error: 'not_a_member' }, { status: 401 });
	if (!revokeInvite(params.id, me.user)) return json({ error: 'not_found' }, { status: 404 });
	return json({ ok: true });
};
