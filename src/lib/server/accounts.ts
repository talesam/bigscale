import type { Device } from '$lib/types.js';
import { bs, bsJson } from './bigscale-server.js';
import { forgetAccount, getAccount, listAccounts } from './account-store.js';
import { deleteDeviceMeta } from './device-meta.js';
import { userIdOf } from './enroll.js';
import { revokeInvitesBy } from './invite-store.js';
import { removeUserFromPolicy } from './policy-groups.js';
import { onOwnerGone } from './member-groups.js';
import { dropSessionsOf } from './session.js';

// Removing people and freeing their names: what happens to a user once it
// has no device left, whoever asked (the admin, the person, or the sweep).

// Users that are not people and must never be removed from here.
export const SYSTEM_USERS = new Set(['_panel', 'tagged-devices']);

// A fresh account has no device until its owner's BigLace connects with the
// one-time key (valid 24 h) — never sweep it before that key is spent.
const NEW_ACCOUNT_GRACE_MS = 25 * 60 * 60 * 1000;
export const SWEEP_EVERY_MS = 60 * 60 * 1000;

export async function allNodes(): Promise<Device[]> {
	return (await bsJson<{ nodes?: Device[] }>('GET', 'node')).nodes ?? [];
}

export async function nodesOf(user: string): Promise<Device[]> {
	return (await allNodes()).filter((n) => n.user?.name === user);
}

export async function deleteNode(id: string): Promise<void> {
	const res = await bs('DELETE', `node/${id}`);
	if (!res.ok) throw new Error(`delete node ${id} (HTTP ${res.status}): ${await res.text()}`);
	deleteDeviceMeta(id);
}

/**
 * Side effects of a user being gone: their invites die, the policy forgets
 * them (pair rules, groups) and so does the account store. Call after the
 * engine deleted the user.
 */
export async function afterUserDeleted(user: string): Promise<void> {
	revokeInvitesBy(user);
	forgetAccount(user);
	dropSessionsOf(user);
	await removeUserFromPolicy(user).catch((e) =>
		console.error('[bigscale] policy: could not forget', user, (e as Error).message)
	);
	await onOwnerGone(user).catch((e) =>
		console.error('[bigscale] groups: could not hand over the groups of', user, (e as Error).message)
	);
}

/**
 * Delete `user` if it has no device (engine refuses users that still own
 * nodes, and we never take devices away here). Returns true if deleted.
 */
export async function purgeIfEmpty(user: string): Promise<boolean> {
	if (SYSTEM_USERS.has(user)) return false;
	if ((await nodesOf(user)).length) return false;
	const id = await userIdOf(user);
	if (id === null) {
		await afterUserDeleted(user);
		return false;
	}
	const res = await bs('DELETE', `user/${id}`);
	if (!res.ok) throw new Error(`delete user ${user} (HTTP ${res.status}): ${await res.text()}`);
	await afterUserDeleted(user);
	console.log(`[bigscale] accounts: removed ${user} (no devices left)`);
	return true;
}

/** An account made by an invite lost its last device: free the name. */
export async function onNodeGone(user: string | null | undefined): Promise<void> {
	if (!user || !getAccount(user)) return;
	const acc = getAccount(user);
	if (acc?.keepUntil && Date.parse(acc.keepUntil) > Date.now()) return;
	await purgeIfEmpty(user).catch((e) => console.error('[bigscale] accounts:', (e as Error).message));
}

/** Users with no device at all (candidates for the admin's cleanup). */
export async function emptyUsers(): Promise<string[]> {
	const res = await bs('GET', 'user');
	if (!res.ok) throw new Error(`list users (HTTP ${res.status})`);
	const users = ((await res.json()) as { users?: { name?: string }[] }).users ?? [];
	const owners = new Set((await allNodes()).map((n) => n.user?.name));
	return users
		.map((u) => u.name ?? '')
		.filter((n) => n && !SYSTEM_USERS.has(n) && !owners.has(n))
		.sort((a, b) => a.localeCompare(b));
}

/**
 * Periodic cleanup: invite-made accounts with no device, past the grace
 * period for a new account and not kept by a deliberate sign-out.
 */
export async function sweepOrphans(): Promise<number> {
	const now = Date.now();
	const owners = new Set((await allNodes()).map((n) => n.user?.name));
	let removed = 0;
	for (const [user, acc] of listAccounts()) {
		if (owners.has(user)) continue;
		if (now - (Date.parse(acc.createdAt) || 0) < NEW_ACCOUNT_GRACE_MS) continue;
		if (acc.keepUntil && Date.parse(acc.keepUntil) > now) continue;
		try {
			if (await purgeIfEmpty(user)) removed++;
		} catch (e) {
			console.error('[bigscale] accounts sweep:', (e as Error).message);
		}
	}
	return removed;
}
