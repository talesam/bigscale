import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin-guard.js';
import { emptyUsers, purgeIfEmpty } from '$lib/server/accounts.js';
import type { RequestHandler } from './$types';

// GET  /api/accounts/empty → { users }          users with no device (admin)
// POST /api/accounts/empty { users } → { removed, failed }
//
// The admin's "remove accounts without devices": frees the names people left
// behind. Each user is re-checked right before removal — one that got a
// device in the meantime is skipped.

export const GET: RequestHandler = async ({ cookies }) => {
	requireAdmin(cookies);
	try {
		return json({ users: await emptyUsers() });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}
};

export const POST: RequestHandler = async ({ cookies, request }) => {
	requireAdmin(cookies);
	let body: { users?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	if (!Array.isArray(body.users) || body.users.some((u) => typeof u !== 'string')) {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	const removed: string[] = [];
	const failed: string[] = [];
	for (const user of body.users as string[]) {
		try {
			if (await purgeIfEmpty(user)) removed.push(user);
			else failed.push(user);
		} catch {
			failed.push(user);
		}
	}
	return json({ removed, failed });
};
