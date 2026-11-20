import { redirect } from '@sveltejs/kit';
import { getSession } from '$lib/server/session.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
	const p = url.pathname;

	// /join, /pair and /link are public landing pages: whoever opens them has
	// no panel session (an invitee, a phone that read a code with its camera).
	if (p === '/login' || p === '/join' || p === '/pair' || p === '/link' || p.startsWith('/api/')) return {};

	const token = cookies.get('bs_session');
	const session = token ? getSession(token) : null;

	if (!session) {
		throw redirect(302, '/login');
	}

	if (session.mustChangePassword && p !== '/change-password') {
		throw redirect(302, '/change-password');
	}

	return { mustChangePassword: session.mustChangePassword, signedInAs: session.user ?? null };
};
