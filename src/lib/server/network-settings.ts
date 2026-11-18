import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ADMIN_DATA_DIR } from './config.js';

// How this network lets people in and what members see of each other —
// chosen by whoever runs the server (Settings → Network), since a family
// network and an open community need different things.

const STORE_PATH = resolve(ADMIN_DATA_DIR, 'network-settings.json');

/**
 * Who may bring new people into the network with an invite:
 * - `members`: anyone on it (each invite only connects the newcomer to the
 *   member who invited them, plus at most one of that member's groups);
 * - `approval`: anyone, but each member's invite link only works after an
 *   administrator approves it;
 * - `admins`: only administrators.
 */
export type InvitePolicy = 'members' | 'approval' | 'admins';

/**
 * Whom a member sees when inviting people into a group:
 * - `contacts`: only people they're already connected to (a shared group,
 *   or one invited the other); anyone else by typing the exact name;
 * - `network`: every account on the network.
 */
export type Directory = 'contacts' | 'network';

export interface NetworkSettings {
	invites: InvitePolicy;
	directory: Directory;
	/** Unused invites one member may have at once. */
	maxActive: number;
	/** Invites one member may create per day. */
	dailyPerMember: number;
	/** Member invites the whole network may create per day. */
	dailyNetwork: number;
}

export const DEFAULTS: NetworkSettings = {
	invites: 'members',
	directory: 'contacts',
	maxActive: 20,
	dailyPerMember: 30,
	dailyNetwork: 100
};

const LIMITS: Record<'maxActive' | 'dailyPerMember' | 'dailyNetwork', [number, number]> = {
	maxActive: [1, 200],
	dailyPerMember: [1, 500],
	dailyNetwork: [1, 5000]
};

let cache: NetworkSettings | null = null;

/** Keep only known, valid values; fill the rest from the defaults. */
export function sanitize(raw: unknown, base: NetworkSettings = DEFAULTS): NetworkSettings {
	const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const out: NetworkSettings = { ...base };
	if (r.invites === 'members' || r.invites === 'approval' || r.invites === 'admins') out.invites = r.invites;
	if (r.directory === 'contacts' || r.directory === 'network') out.directory = r.directory;
	for (const [k, [min, max]] of Object.entries(LIMITS) as [keyof typeof LIMITS, [number, number]][]) {
		const v = r[k];
		if (typeof v === 'number' && Number.isInteger(v)) out[k] = Math.min(max, Math.max(min, v));
	}
	return out;
}

export function getSettings(): NetworkSettings {
	if (cache) return cache;
	try {
		cache = sanitize(JSON.parse(readFileSync(STORE_PATH, 'utf-8')));
	} catch {
		cache = { ...DEFAULTS };
	}
	return cache;
}

/** Apply the valid fields of `patch` and save. Returns the settings now in force. */
export function updateSettings(patch: unknown): NetworkSettings {
	const next = sanitize(patch, getSettings());
	const dir = dirname(STORE_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const tmp = `${STORE_PATH}.tmp`;
	writeFileSync(tmp, JSON.stringify(next, null, '\t'), { encoding: 'utf-8', mode: 0o600 });
	renameSync(tmp, STORE_PATH);
	cache = next;
	return next;
}

export { LIMITS };
