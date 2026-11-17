import { json } from '@sveltejs/kit';
import { PANEL_PUBLIC_URL } from '$lib/server/config-panel.js';
import { createInvite, listInvitesBy } from '$lib/server/invite-store.js';
import { callerMember } from '$lib/server/member.js';
import { groupsOf, policyIsOpen } from '$lib/server/policy-groups.js';
import type { RequestHandler } from './$types';

// Invites created by a member from BigLace, over the tailnet.
//
// GET  /api/me/invites → { invites, groups }  (own invites; groups I'm in)
// POST /api/me/invites { group?, note? } → { invite, token, link }
//
// Anyone on the network may invite. What an invite grants is bounded by the
// inviter: the newcomer reaches the inviter's devices (and vice versa), plus
// optionally one group the inviter is in — never more than they have.

const MAX_ACTIVE = 20;
const DAILY_LIMIT = 30;
// Every newcomer can invite too, so per-member limits alone would let
// accounts multiply; this caps member invites network-wide.
const GLOBAL_DAILY_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const created = new Map<string, number[]>();
let createdAll: number[] = [];

function underDailyLimit(user: string): boolean {
	const now = Date.now();
	const recent = (created.get(user) ?? []).filter((t) => now - t < DAY_MS);
	if (recent.length) created.set(user, recent);
	else created.delete(user);
	createdAll = createdAll.filter((t) => now - t < DAY_MS);
	return recent.length < DAILY_LIMIT && createdAll.length < GLOBAL_DAILY_LIMIT;
}

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await callerMember(request, getClientAddress);
	if (!me) return json({ error: 'not_a_member' }, { status: 401 });
	let groups: string[] = [];
	try {
		groups = await groupsOf(me.user);
	} catch {
		groups = [];
	}
	return json({ user: me.user, invites: listInvitesBy(me.user), groups });
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await callerMember(request, getClientAddress);
	if (!me) return json({ error: 'not_a_member' }, { status: 401 });

	let body: { group?: unknown; note?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}

	// Without any access rules everyone already reaches everyone, so a
	// member invite would hand a stranger the whole network: admins only.
	try {
		if (await policyIsOpen()) return json({ error: 'open_network' }, { status: 403 });
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}

	let group: string | null = null;
	if (typeof body.group === 'string' && body.group.trim()) {
		// Exact match against the policy's own spelling (no case folding).
		group = body.group.trim().replace(/^group:/, '');
		let mine: string[];
		try {
			mine = await groupsOf(me.user);
		} catch {
			return json({ error: 'server_error' }, { status: 502 });
		}
		if (!mine.includes(group)) return json({ error: 'not_in_group' }, { status: 403 });
	}

	if (listInvitesBy(me.user).filter((i) => i.status === 'active').length >= MAX_ACTIVE) {
		return json({ error: 'too_many_pending' }, { status: 429 });
	}
	if (!underDailyLimit(me.user)) return json({ error: 'too_many_today' }, { status: 429 });

	const note = typeof body.note === 'string' ? body.note.trim().slice(0, 80) : '';
	const { invite, token } = createInvite({
		group,
		mutual: false,
		note,
		maxUses: 1,
		validDays: null,
		inviter: me
	});
	const now = Date.now();
	created.set(me.user, [...(created.get(me.user) ?? []), now]);
	createdAll.push(now);
	return json({ invite, token, link: `${PANEL_PUBLIC_URL}/join#${token}` }, { status: 201 });
};
