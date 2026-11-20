import { json } from '@sveltejs/kit';
import { clientKey } from '$lib/server/join.js';
import { pollLink } from '$lib/server/pair.js';
import type { RequestHandler } from './$types';

// POST /api/link/poll { poll } → 202 { status: "pending" } | 200 { authkey, server_url, user } | 410
//
// Public: the computer that asked to join learns whether a device approved it.
// The key is handed out once.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: { poll?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const r = pollLink(clientKey(request, getClientAddress), body.poll);
	if (r === 'pending') return json({ status: 'pending' }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
	if ('error' in r) {
		const { status, ...rest } = r;
		return json(rest, { status });
	}
	return json(r, { headers: { 'Cache-Control': 'no-store' } });
};
