import { json } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/session.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('bs_session');
	if (token) deleteSession(token);
	cookies.delete('bs_session', { path: '/' });
	return json({ ok: true });
};
