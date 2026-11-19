import { parsePolicy, serializePolicy, type AclPolicy, type AclRule } from '$lib/acl.js';
import { bs } from './bigscale-server.js';

// Group membership edits on the engine's ACL policy, for invites: a person
// who joins through an invite is added to the invite's group, so the rules
// the admin already wrote for that group apply to them right away — no
// per-person rule editing.
//
// Edits are read-modify-write on the whole policy, so every writer goes
// through one in-process queue: invite redeems here, and the admin's policy
// editor (the proxy routes `PUT policy` through `withPolicyLock` and refuses
// a save based on an older version — see `api/bs/v1/[...path]`). The engine
// itself has no compare-and-swap, so this queue is what prevents lost
// updates; it only works because the panel is the policy's single writer.

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
	const run = queue.then(fn, fn);
	queue = run.catch(() => undefined);
	return run;
}

/** Run `fn` with exclusive access to the policy (read-modify-write). */
export const withPolicyLock = serialized;

/** The stored policy text and its version; empty text when none exists yet. */
export async function readPolicyRaw(): Promise<{ text: string; updatedAt: string | null }> {
	const res = await bs('GET', 'policy');
	if (!res.ok) {
		const text = await res.text();
		// No policy stored yet: every device reaches every other one.
		if (/not found/i.test(text)) return { text: '', updatedAt: null };
		throw new Error(`read policy (HTTP ${res.status}): ${text}`);
	}
	const body = (await res.json()) as { policy?: string; updatedAt?: string };
	return { text: body.policy ?? '', updatedAt: body.updatedAt ?? null };
}

/** Parsed policy (for modules that edit it under `withPolicyLock`). */
export async function readPolicy(): Promise<{ policy: AclPolicy; empty: boolean }> {
	const { text } = await readPolicyRaw();
	return { policy: parsePolicy(text), empty: !text.trim() };
}

/**
 * User names the policy mentions anywhere (`"bob@"`, `"bob@:22"`, in groups,
 * rules, tag owners, ssh…). A name listed here grants whatever those entries
 * allow, so a newcomer must never be given it — even if no such user exists
 * right now (deleted, or written in advance by the admin).
 */
export async function referencedUsers(): Promise<Set<string>> {
	const { text } = await readPolicyRaw();
	const out = new Set<string>();
	for (const m of text.matchAll(/"([^"@\\\s]+)@(?:[":])/g)) out.add(m[1].toLowerCase());
	return out;
}

export async function writePolicy(policy: AclPolicy): Promise<void> {
	const res = await bs('PUT', 'policy', { policy: serializePolicy(policy) });
	if (!res.ok) {
		throw new Error(`write policy (HTTP ${res.status}): ${await res.text()}`);
	}
}

export const GROUP_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Policy group whose members administer the network (open the admin panel
 * from BigLace, see $lib/server/admins.ts). Never offered in invites: being
 * made an admin is a deliberate act, not a side effect of a link.
 */
export const ADMIN_GROUP = 'admins';

/** Group names (without the `group:` prefix) defined in the current policy. */
export async function listGroups(): Promise<string[]> {
	const { policy } = await readPolicy();
	return Object.keys(policy.groups)
		.filter((g) => g.startsWith('group:'))
		.map((g) => g.slice('group:'.length))
		.filter((g) => g !== ADMIN_GROUP)
		.sort((a, b) => a.localeCompare(b));
}

/**
 * Add `user` (engine user name) to `group`. When the group doesn't exist it
 * is created; with `mutual` it also gets a rule letting its members reach
 * each other. Returns an undo function for rolling back a failed redeem.
 *
 * With no policy at all every device already reaches every other one, and
 * writing a first policy here would cut everyone else off — so in that case
 * nothing is written.
 */
export function addMember(group: string, user: string, mutual: boolean): Promise<() => Promise<void>> {
	return serialized(async () => {
		const { policy, empty } = await readPolicy();
		if (empty) return async () => {};

		const key = `group:${group}`;
		const member = `${user}@`;
		const existed = key in policy.groups;
		const members = policy.groups[key] ?? [];
		if (members.includes(member)) return async () => {};

		policy.groups[key] = [...members, member];
		let addedRule = false;
		if (!existed && mutual) {
			policy.acls.push({ action: 'accept', src: [key], dst: [`${key}:*`] });
			addedRule = true;
		}
		await writePolicy(policy);

		return () =>
			serialized(async () => {
				const { policy: cur } = await readPolicy();
				const list = (cur.groups[key] ?? []).filter((m) => m !== member);
				if (!existed && list.length === 0) {
					delete cur.groups[key];
					if (addedRule) {
						cur.acls = cur.acls.filter(
							(r) => !(r.src.length === 1 && r.src[0] === key && r.dst.length === 1 && r.dst[0] === `${key}:*`)
						);
					}
				} else {
					cur.groups[key] = list;
				}
				await writePolicy(cur);
			});
	});
}

/**
 * Groups (without the `group:` prefix) that list `user` as a member — the
 * ones they can invite into. The admin group is left out (see ADMIN_GROUP).
 */
export async function groupsOf(user: string): Promise<string[]> {
	const { policy } = await readPolicy();
	const member = `${user}@`;
	return Object.entries(policy.groups)
		.filter(([k, members]) => k.startsWith('group:') && members.includes(member))
		.map(([k]) => k.slice('group:'.length))
		.filter((g) => g !== ADMIN_GROUP)
		.sort((a, b) => a.localeCompare(b));
}

function isPairRule(r: AclRule, a: string, b: string): boolean {
	const src = [...r.src].sort();
	const want = [`${a}@`, `${b}@`].sort();
	const dst = [...r.dst].sort();
	const wantDst = [`${a}@:*`, `${b}@:*`].sort();
	return (
		r.action === 'accept' &&
		!r._extra &&
		src.length === 2 && src[0] === want[0] && src[1] === want[1] &&
		dst.length === 2 && dst[0] === wantDst[0] && dst[1] === wantDst[1]
	);
}

/**
 * Let `a` and `b` reach each other (all their devices, both ways): what a
 * member invite grants between the inviter and the newcomer. Returns an undo
 * function. A no-op without a policy (everyone already reaches everyone).
 */
export function addPair(a: string, b: string): Promise<() => Promise<void>> {
	return serialized(async () => {
		const { policy, empty } = await readPolicy();
		if (empty || policy.acls.some((r) => isPairRule(r, a, b))) return async () => {};
		policy.acls.push({ action: 'accept', src: [`${a}@`, `${b}@`], dst: [`${a}@:*`, `${b}@:*`] });
		await writePolicy(policy);
		return () =>
			serialized(async () => {
				const { policy: cur } = await readPolicy();
				cur.acls = cur.acls.filter((r) => !isPairRule(r, a, b));
				await writePolicy(cur);
			});
	});
}

/**
 * Forget a deleted user in the policy: drop the pair rules invites created
 * for them and take them out of every group. Other admin-written rules that
 * mention the user are left alone (the admin wrote them on purpose) — but
 * group membership goes, or the next person given that name would inherit it.
 */
export function removeUserFromPolicy(user: string): Promise<void> {
	return serialized(async () => {
		const { policy, empty } = await readPolicy();
		if (empty) return;
		const mine = `${user}@`;
		let changed = false;
		const kept = policy.acls.filter((r) => {
			if (r.action !== 'accept' || r._extra || r.src.length !== 2 || !r.src.includes(mine)) return true;
			const other = r.src.find((s) => s !== mine)?.slice(0, -1) ?? '';
			return !isPairRule(r, user, other);
		});
		if (kept.length !== policy.acls.length) {
			policy.acls = kept;
			changed = true;
		}
		for (const [key, members] of Object.entries(policy.groups)) {
			if (key.startsWith('group:') && members.includes(mine)) {
				policy.groups[key] = members.filter((m) => m !== mine);
				changed = true;
			}
		}
		if (changed) await writePolicy(policy);
	});
}

/** True when no policy is stored: every device reaches every other one. */
export async function policyIsOpen(): Promise<boolean> {
	return !(await readPolicyRaw()).text.trim();
}

// The panel joins the tailnet as user `_panel` (scripts/entrypoint.sh) and
// serves the peer-facing API (/api/me/…, /api/devices/…) on port 3000 there.
// Two rules keep that working under any policy:
//   - every device may reach that one port (nothing else on the panel);
//   - the panel may reach each device's BigLace agent port, and only that,
//     to have the device prove its key (see device-auth.ts). The panel still
//     reaches nothing else on any device.
const PANEL_DST = '_panel@:3000';
const AGENT_DST = '*:41980';

function isPanelRule(r: AclRule): boolean {
	return r.action === 'accept' && r.src.length === 1 && r.src[0] === '*' && r.dst.length === 1 && r.dst[0] === PANEL_DST;
}

// Everyone reaches their own devices (laptop ↔ desktop), with or without
// any group or invite: Tailscale's own default, which Headscale (0.27+)
// understands. Without it an account with no rule yet — an admin invite
// without a group — couldn't even reach its own machines.
const SELF_SRC = 'autogroup:member';
const SELF_DST = 'autogroup:self:*';

function isSelfRule(r: AclRule): boolean {
	return r.action === 'accept' && r.src.length === 1 && r.src[0] === SELF_SRC && r.dst.length === 1 && r.dst[0] === SELF_DST;
}

function isAgentRule(r: AclRule): boolean {
	return r.action === 'accept' && r.src.length === 1 && r.src[0] === '_panel@' && r.dst.length === 1 && r.dst[0] === AGENT_DST;
}

/** Add the panel's rules to `policy` when missing. Returns true if it changed. */
function addPanelRules(policy: AclPolicy): boolean {
	let changed = false;
	if (!policy.acls.some(isPanelRule)) {
		policy.acls.push({ action: 'accept', src: ['*'], dst: [PANEL_DST] });
		changed = true;
	}
	if (!policy.acls.some(isAgentRule)) {
		policy.acls.push({ action: 'accept', src: ['_panel@'], dst: [AGENT_DST] });
		changed = true;
	}
	if (!policy.acls.some(isSelfRule)) {
		policy.acls.push({ action: 'accept', src: [SELF_SRC], dst: [SELF_DST] });
		changed = true;
	}
	return changed;
}

/**
 * `text` with the panel rules added when missing — applied to policies the
 * admin saves, so the editor can't silently cut BigLace off from the panel.
 * Unparseable text, or an empty policy (everyone reaches everyone), is
 * returned unchanged for the engine to judge.
 */
export function withPanelRule(text: string): string {
	if (!text.trim()) return text;
	let policy: AclPolicy;
	try {
		policy = parsePolicy(text);
	} catch {
		return text;
	}
	return addPanelRules(policy) ? serializePolicy(policy) : text;
}

/** Make sure devices and the panel can reach each other's API ports. Returns true if it wrote. */
export function ensurePanelReachable(): Promise<boolean> {
	return serialized(async () => {
		const { policy, empty } = await readPolicy();
		if (empty || !addPanelRules(policy)) return false;
		await writePolicy(policy);
		return true;
	});
}
