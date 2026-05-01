import { json } from '@sveltejs/kit';
import { verifyAdmin } from '$lib/server/admin-store.js';
import { createSession } from '$lib/server/session.js';
import { COOKIE_SECURE } from '$lib/server/config.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { username, password } = await request.json();

	const result = verifyAdmin(username, password);
	if (!result.ok) {
		return json({ error: 'Credenciais inválidas' }, { status: 401 });
	}

	const token = createSession({ mustChangePassword: result.mustChangePassword });

	cookies.set('bs_session', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: COOKIE_SECURE,
		maxAge: 86400
	});

	return json({ ok: true, mustChangePassword: result.mustChangePassword });
};
