import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { hashes } from '$lib/server/avatars.js';
import type { RequestHandler } from './$types';

// POST /api/me/avatars { users: string[] } → { avatars: { user: hash } }
// Which of these people have a photo I may see (and its version).
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ users?: unknown }>(me.body);
	const users = body?.users;
	if (!Array.isArray(users) || users.length > 500 || !users.every((u) => typeof u === 'string' && u.length <= 64)) {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	try {
		return json({ avatars: await hashes(me.user, users as string[]) }, { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
};
