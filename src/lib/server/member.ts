import { json } from '@sveltejs/kit';
import { authenticateDevice, jsonBody } from './device-auth.js';
import type { Inviter } from './invite-store.js';

// Who is calling the peer-facing API under /api/me: a person's device, proven
// by its BigLace device key (see device-auth.ts), never by anything else in
// the request. Tagged devices (servers enrolled by tag) and the panel itself
// belong to no person, so they get nothing here.

const NOT_PEOPLE = new Set(['_panel', 'tagged-devices']);

export interface Caller extends Inviter {
	nodeId: string;
	/** Raw request body, already read and covered by the signature. */
	body: string;
}

/**
 * The calling member, or the 401 response to send. Handlers parse the body
 * from `caller.body` (the request stream is consumed).
 */
export async function requireMember(request: Request, getClientAddress: () => string): Promise<Caller | Response> {
	const auth = await authenticateDevice(request, getClientAddress);
	if ('error' in auth) return json({ error: auth.error }, { status: auth.status });
	const user = auth.node.user?.name ?? '';
	if (!user || NOT_PEOPLE.has(user)) return json({ error: 'not_a_member' }, { status: 401 });
	return {
		user,
		userId: String(auth.node.user.id),
		device: auth.node.givenName || auth.node.name,
		nodeId: String(auth.node.id),
		body: auth.body
	};
}

export function inviterOf(c: Caller): Inviter {
	return { user: c.user, userId: c.userId, device: c.device };
}

export { jsonBody };
