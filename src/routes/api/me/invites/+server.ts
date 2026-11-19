import { json } from '@sveltejs/kit';
import { PANEL_PUBLIC_URL } from '$lib/server/config-panel.js';
import { createInvite, listInvitesBy } from '$lib/server/invite-store.js';
import { inviterOf, jsonBody, requireMember } from '$lib/server/member.js';
import { isAdmin } from '$lib/server/admins.js';
import { getSettings } from '$lib/server/network-settings.js';
import { groupsOf, policyIsOpen } from '$lib/server/policy-groups.js';
import type { RequestHandler } from './$types';

// Invites created by a member from BigLace, over the tailnet.
//
// GET  /api/me/invites → { invites, groups }  (own invites; groups I'm in)
// POST /api/me/invites { group?, note?, isolated? } → { invite, token, link }
//
// Who may invite is the network's choice (Settings → Network): any member,
// any member with an administrator approving each link, or administrators
// only. What an invite grants is bounded by the inviter: the newcomer
// reaches the inviter's devices (and vice versa), plus optionally one group
// the inviter is in — never more than they have.
//
// Every newcomer can invite too, so per-member limits alone would let
// accounts multiply; `dailyNetwork` caps member invites network-wide.
const DAY_MS = 24 * 60 * 60 * 1000;
const created = new Map<string, number[]>();
let createdAll: number[] = [];

function underDailyLimit(user: string, perMember: number, network: number): boolean {
	const now = Date.now();
	const recent = (created.get(user) ?? []).filter((t) => now - t < DAY_MS);
	if (recent.length) created.set(user, recent);
	else created.delete(user);
	createdAll = createdAll.filter((t) => now - t < DAY_MS);
	return recent.length < perMember && createdAll.length < network;
}

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	let groups: string[] = [];
	try {
		groups = await groupsOf(me.user);
	} catch {
		groups = [];
	}
	const settings = getSettings();
	let canInvite = settings.invites !== 'admins';
	if (!canInvite) canInvite = await isAdmin(me.user).catch(() => false);
	return json({
		user: me.user,
		invites: listInvitesBy(me.user),
		groups,
		policy: settings.invites,
		can_invite: canInvite
	});
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;

	const body = jsonBody<{ group?: unknown; note?: unknown; isolated?: unknown }>(me.body);
	if (!body) return json({ error: 'invalid_request' }, { status: 400 });

	// Without any access rules everyone already reaches everyone, so a
	// member invite would hand a stranger the whole network: admins only.
	try {
		if (await policyIsOpen()) return json({ error: 'open_network' }, { status: 403 });
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}

	const settings = getSettings();
	let admin = false;
	try {
		admin = await isAdmin(me.user);
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
	if (settings.invites === 'admins' && !admin) return json({ error: 'admins_only' }, { status: 403 });

	// Administrators can invite someone to a network of their own: no group,
	// and no link to whoever invited them (they see only their own devices,
	// and whoever they invite in turn).
	const isolated = body.isolated === true;
	if (isolated && !admin) return json({ error: 'not_admin' }, { status: 403 });

	let group: string | null = null;
	if (!isolated && typeof body.group === 'string' && body.group.trim()) {
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

	const open = listInvitesBy(me.user).filter((i) => i.status === 'active' || i.status === 'pending');
	if (open.length >= settings.maxActive) return json({ error: 'too_many_pending' }, { status: 429 });
	if (!underDailyLimit(me.user, settings.dailyPerMember, settings.dailyNetwork)) {
		return json({ error: 'too_many_today' }, { status: 429 });
	}

	const note = typeof body.note === 'string' ? body.note.trim().slice(0, 80) : '';
	const { invite, token } = createInvite({
		group,
		mutual: false,
		note,
		maxUses: 1,
		validDays: null,
		inviter: isolated ? undefined : inviterOf(me),
		createdBy: isolated ? me.user : undefined,
		// Administrators' own invites never wait for approval.
		needsApproval: !isolated && settings.invites === 'approval' && !admin
	});
	const now = Date.now();
	created.set(me.user, [...(created.get(me.user) ?? []), now]);
	createdAll.push(now);
	return json({ invite, token, link: `${PANEL_PUBLIC_URL}/join#${token}` }, { status: 201 });
};
