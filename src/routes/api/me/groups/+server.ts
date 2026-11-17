import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admins.js';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { createGroup, groupError, groupsFor } from '$lib/server/member-groups.js';
import type { RequestHandler } from './$types';

// Groups, from BigLace over the tailnet (see $lib/server/member-groups.ts).
//
// GET  /api/me/groups → { user, is_admin, groups: GroupView[] }
// POST /api/me/groups { name } → GroupView   (creates a group I own)

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	try {
		const [groups, admin] = await Promise.all([groupsFor(me.user), isAdmin(me.user)]);
		return json({ user: me.user, is_admin: admin, groups });
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ name?: unknown }>(me.body);
	if (!body) return json({ error: 'invalid_request' }, { status: 400 });
	try {
		return json(await createGroup(me.user, body.name), { status: 201 });
	} catch (e) {
		return groupError(e);
	}
};
