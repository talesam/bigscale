import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin-guard.js';
import { listAdmins, setAdmins } from '$lib/server/admins.js';
import { bs } from '$lib/server/bigscale-server.js';
import { SYSTEM_USERS } from '$lib/server/accounts.js';
import type { RequestHandler } from './$types';

// GET /api/admins → { admins, users }    PUT /api/admins { admins } → { admins }
// Who may open this panel from BigLace (the policy group `admins`).

async function userNames(): Promise<string[]> {
	const res = await bs('GET', 'user');
	if (!res.ok) throw new Error(`list users (HTTP ${res.status})`);
	return (((await res.json()) as { users?: { name?: string }[] }).users ?? [])
		.map((u) => u.name ?? '')
		.filter((n) => n && !SYSTEM_USERS.has(n))
		.sort((a, b) => a.localeCompare(b));
}

export const GET: RequestHandler = async ({ cookies }) => {
	requireAdmin(cookies);
	try {
		return json({ admins: await listAdmins(), users: await userNames() });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}
};

export const PUT: RequestHandler = async ({ cookies, request }) => {
	requireAdmin(cookies);
	let body: { admins?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	if (!Array.isArray(body.admins) || body.admins.some((u) => typeof u !== 'string')) {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	try {
		const result = await setAdmins(body.admins as string[], new Set(await userNames()));
		if (typeof result === 'string') return json({ error: result }, { status: result === 'open_network' ? 403 : 400 });
		return json({ admins: result });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}
};
