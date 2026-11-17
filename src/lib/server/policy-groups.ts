import { parsePolicy, serializePolicy, type AclPolicy } from '$lib/acl.js';
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

async function readPolicy(): Promise<{ policy: AclPolicy; empty: boolean }> {
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

async function writePolicy(policy: AclPolicy): Promise<void> {
	const res = await bs('PUT', 'policy', { policy: serializePolicy(policy) });
	if (!res.ok) {
		throw new Error(`write policy (HTTP ${res.status}): ${await res.text()}`);
	}
}

export const GROUP_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Group names (without the `group:` prefix) defined in the current policy. */
export async function listGroups(): Promise<string[]> {
	const { policy } = await readPolicy();
	return Object.keys(policy.groups)
		.filter((g) => g.startsWith('group:'))
		.map((g) => g.slice('group:'.length))
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
