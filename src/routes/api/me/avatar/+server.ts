import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { removeAvatar, setAvatar } from '$lib/server/avatars.js';
import type { RequestHandler } from './$types';

// PUT    /api/me/avatar { image: base64 JPEG/PNG } → { hash }   (my photo)
// DELETE /api/me/avatar                                       (no photo)
export const PUT: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ image?: unknown }>(me.body);
	if (!body) return json({ error: 'invalid_request' }, { status: 400 });
	const r = setAvatar(me.user, body.image);
	if (typeof r === 'string') return json({ error: r }, { status: r === 'too_large' ? 413 : 400 });
	return json(r);
};

export const DELETE: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	removeAvatar(me.user);
	return json({ ok: true });
};
