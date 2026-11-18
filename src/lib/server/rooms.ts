import { groupsFor } from './member-groups.js';

// Who is in which group's voice room — presence only. The sound itself goes
// straight between the participants' BigLace (they all reach each other:
// that's what being in the same group means), so the panel never sees it.
//
// In memory on purpose: a room is live state. Each participant repeats its
// "join" every few seconds; an entry not refreshed within EXPIRE_MS (closed
// laptop, crash, lost network) drops out on its own.

const EXPIRE_MS = 30_000;
const MAX_PER_ROOM = 12;

export interface Participant {
	user: string;
	device: string;
	/** Tailnet address: where the others connect for the sound. */
	ip: string;
	nodeId: string;
	muted: boolean;
	joinedAt: number;
	seen: number;
}

const rooms = new Map<string, Map<string, Participant>>();

function prune(now: number): void {
	for (const [group, members] of rooms) {
		for (const [id, p] of members) if (now - p.seen > EXPIRE_MS) members.delete(id);
		if (members.size === 0) rooms.delete(group);
	}
}

export type RoomError = 'not_in_group' | 'room_full';

/** Is `user` in group `group` (rooms exist for the groups one belongs to)? */
export async function mayJoin(user: string, group: string): Promise<boolean> {
	return (await groupsFor(user)).some((g) => g.name === group);
}

/** Add or refresh `p` in `group`'s room. Returns the participants. */
export function join(group: string, p: Omit<Participant, 'joinedAt' | 'seen'>): Participant[] | RoomError {
	const now = Date.now();
	prune(now);
	let members = rooms.get(group);
	if (!members) {
		members = new Map();
		rooms.set(group, members);
	}
	const prev = members.get(p.nodeId);
	if (!prev && members.size >= MAX_PER_ROOM) return 'room_full';
	members.set(p.nodeId, { ...p, joinedAt: prev?.joinedAt ?? now, seen: now });
	return [...members.values()];
}

export function leave(group: string, nodeId: string): void {
	rooms.get(group)?.delete(nodeId);
	if (rooms.get(group)?.size === 0) rooms.delete(group);
}

/** Leave every room (the device left the network, …). */
export function leaveAll(nodeId: string): void {
	for (const group of [...rooms.keys()]) leave(group, nodeId);
}

/** Participants of each of `groups` (empty rooms omitted). */
export function snapshot(groups: string[]): Record<string, Participant[]> {
	prune(Date.now());
	const out: Record<string, Participant[]> = {};
	for (const g of groups) {
		const members = rooms.get(g);
		if (members?.size) out[g] = [...members.values()];
	}
	return out;
}

/** What a participant may see about the others. */
export function publicView(p: Participant) {
	return { user: p.user, device: p.device, ip: p.ip, muted: p.muted, joined_at: new Date(p.joinedAt).toISOString() };
}
