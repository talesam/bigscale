import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin-guard.js';
import { revokeInvite } from '$lib/server/invite-store.js';
import type { RequestHandler } from './$types';

// DELETE /api/invites/<id> → revoke (admin). People who already joined stay.
export const DELETE: RequestHandler = async ({ cookies, params }) => {
	requireAdmin(cookies);
	if (!revokeInvite(params.id)) return json({ error: 'not_found' }, { status: 404 });
	return json({ ok: true });
};
