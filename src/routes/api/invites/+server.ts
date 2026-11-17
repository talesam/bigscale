import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin-guard.js';
import { createInvite, listInvites, MAX_USES_LIMIT, MAX_VALID_DAYS } from '$lib/server/invite-store.js';
import { GROUP_NAME_RE, listGroups } from '$lib/server/policy-groups.js';
import type { RequestHandler } from './$types';

// GET  /api/invites → { invites, groups }   (admin)
// POST /api/invites → { invite, token }     (admin; token is shown only now)

export const GET: RequestHandler = async ({ cookies }) => {
	requireAdmin(cookies);
	let groups: string[] = [];
	let groupsError: string | undefined;
	try {
		groups = await listGroups();
	} catch (e) {
		groupsError = (e as Error).message;
	}
	return json({ invites: listInvites(), groups, groupsError });
};

interface CreateBody {
	group?: unknown;
	mutual?: unknown;
	note?: unknown;
	maxUses?: unknown;
	validDays?: unknown;
}

function intIn(v: unknown, min: number, max: number, fallback: number): number | null {
	if (v === undefined || v === null || v === '') return fallback;
	const n = typeof v === 'number' ? v : Number(v);
	if (!Number.isInteger(n) || n < min || n > max) return null;
	return n;
}

export const POST: RequestHandler = async ({ cookies, request }) => {
	requireAdmin(cookies);
	let body: CreateBody;
	try {
		body = (await request.json()) as CreateBody;
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 });
	}

	let group: string | null = null;
	if (typeof body.group === 'string' && body.group.trim()) {
		group = body.group.trim().toLowerCase().replace(/^group:/, '');
		if (!GROUP_NAME_RE.test(group)) return json({ error: 'invalid_group' }, { status: 400 });
	}
	const maxUses = intIn(body.maxUses, 1, MAX_USES_LIMIT, 1);
	// 0 (the default) = valid until used up or revoked.
	const validDays = intIn(body.validDays, 0, MAX_VALID_DAYS, 0);
	if (maxUses === null || validDays === null) return json({ error: 'invalid_limits' }, { status: 400 });
	const note = typeof body.note === 'string' ? body.note.trim().slice(0, 80) : '';

	const created = createInvite({ group, mutual: body.mutual !== false, note, maxUses, validDays: validDays || null });
	return json(created, { status: 201 });
};
