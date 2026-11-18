import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { ask, requestStatus } from '$lib/server/group-requests.js';
import type { RequestHandler } from './$types';

// POST /api/me/groups/<name>/requests { users: string[] } → { sent }
// Ask people on the network into a group I'm in; they accept or decline.
export const POST: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ users?: unknown }>(me.body);
	const users = body?.users;
	if (!Array.isArray(users) || !users.length || users.length > 50 || !users.every((u) => typeof u === 'string' && u.length <= 64)) {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	try {
		return json({ sent: await ask(me.user, params.name, users as string[]) }, { status: 201 });
	} catch (e) {
		const { code, status } = requestStatus(e);
		return json({ error: code }, { status });
	}
};
