import { json } from '@sveltejs/kit';
import { checkInvite, clientKey } from '$lib/server/join.js';
import type { RequestHandler } from './$types';

// POST /api/join/check { invite } → { group, expiresAt } or { error }
//
// Public: lets the landing page and BigLace say "this invite is valid / has
// expired" before the person types anything. POST so the token never lands
// in a proxy access log as part of a URL.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { invite?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const result = checkInvite(clientKey(request, getClientAddress), body.invite);
	if ('error' in result) {
		const { status, ...rest } = result;
		return json(rest, { status });
	}
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
