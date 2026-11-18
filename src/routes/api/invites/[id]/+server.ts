import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin-guard.js';
import { approveInvite, revokeInvite } from '$lib/server/invite-store.js';
import type { RequestHandler } from './$types';

// DELETE /api/invites/<id> → revoke (admin). People who already joined stay.
export const DELETE: RequestHandler = async ({ cookies, params }) => {
	requireAdmin(cookies);
	if (!revokeInvite(params.id)) return json({ error: 'not_found' }, { status: 404 });
	return json({ ok: true });
};

// POST /api/invites/<id> { approve: true } → a member's invite starts working
// (network set to approve member invites). Rejecting is revoking.
export const POST: RequestHandler = async ({ cookies, params, request }) => {
	requireAdmin(cookies);
	const body = (await request.json().catch(() => null)) as { approve?: unknown } | null;
	if (body?.approve !== true) return json({ error: 'invalid_request' }, { status: 400 });
	if (!approveInvite(params.id)) return json({ error: 'not_found' }, { status: 404 });
	return json({ ok: true });
};
