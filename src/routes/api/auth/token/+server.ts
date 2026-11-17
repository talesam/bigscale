import { json } from '@sveltejs/kit';
import { redeemLoginToken } from '$lib/server/admins.js';
import { COOKIE_SECURE } from '$lib/server/config.js';
import { createSession } from '$lib/server/session.js';
import type { RequestHandler } from './$types';

// POST /api/auth/token { token } → session cookie, for a one-time link made
// by /api/me/admin-login. Public: the token is the credential.
const TOKEN_RE = /^[A-Za-z0-9_-]{40,64}$/;

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { token?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	if (typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const user = await redeemLoginToken(body.token).catch(() => null);
	if (!user) return json({ error: 'invalid_link' }, { status: 401 });
	const token = createSession({ user });
	cookies.set('bs_session', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: COOKIE_SECURE,
		maxAge: 86400
	});
	return json({ ok: true, user });
};
