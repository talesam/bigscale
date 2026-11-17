import { json } from '@sveltejs/kit';
import { isAdmin, issueLoginToken } from '$lib/server/admins.js';
import { PANEL_PUBLIC_URL } from '$lib/server/config-panel.js';
import { callerMember } from '$lib/server/member.js';
import type { RequestHandler } from './$types';

// POST /api/me/admin-login → { url }
//
// For members of `admins`: a one-time link that signs the browser in to the
// admin panel as them (see $lib/server/admins.ts). The token rides in the
// URL fragment, which browsers don't send to servers or put in logs.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await callerMember(request, getClientAddress);
	if (!me) return json({ error: 'not_a_member' }, { status: 401 });
	try {
		if (!(await isAdmin(me.user))) return json({ error: 'not_admin' }, { status: 403 });
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
	const token = issueLoginToken(me.user);
	return json({ url: `${PANEL_PUBLIC_URL}/login#signin=${token}` }, { headers: { 'Cache-Control': 'no-store' } });
};
