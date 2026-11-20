import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { deleteGroup, groupError, renameGroup } from '$lib/server/member-groups.js';
import type { RequestHandler } from './$types';

// DELETE /api/me/groups/<name> → delete a group I own.
// PATCH  /api/me/groups/<name> { name } → GroupView   (rename a group I own)
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

export const PATCH: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ name?: unknown }>(me.body);
	if (!body) return json({ error: 'invalid_request' }, { status: 400 });
	try {
		return json(await renameGroup(me.user, params.name, body.name));
	} catch (e) {
		return groupError(e);
	}
};
