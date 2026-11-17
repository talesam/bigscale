import { error, type Cookies } from '@sveltejs/kit';
import { validateSession } from './session.js';

/** Throw 401 unless the request carries a valid admin panel session. */
export function requireAdmin(cookies: Cookies): void {
	const token = cookies.get('bs_session');
	if (!token || !validateSession(token)) throw error(401, 'Not authenticated');
}
