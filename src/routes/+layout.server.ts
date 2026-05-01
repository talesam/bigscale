import { redirect } from '@sveltejs/kit';
import { getSession } from '$lib/server/session.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
	const p = url.pathname;

	if (p === '/login' || p.startsWith('/api/')) return {};

	const token = cookies.get('bs_session');
	const session = token ? getSession(token) : null;

	if (!session) {
		throw redirect(302, '/login');
	}

	if (session.mustChangePassword && p !== '/change-password') {
		throw redirect(302, '/change-password');
	}

	return { mustChangePassword: session.mustChangePassword };
};
