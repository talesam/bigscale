import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ADMIN_DATA_DIR } from './config.js';

// Panel-local metadata for devices that the engine doesn't track.
// Today: os_user (the OS-level $USER on the device, advertised by biglace
// at connect-time). Used by other peers to populate the SSH user when
// targeting `<this-device>.bigscale.net`.
//
// Storage: a single JSON file under /data, written atomically (write to
// `*.tmp` then rename) so a crash mid-write can never leave a half-file.

const STORE_PATH = resolve(ADMIN_DATA_DIR, 'device-meta.json');

export interface DeviceMeta {
	os_user?: string;
	updated_at?: string;
}

type Store = Record<string, DeviceMeta>;

let cache: Store | null = null;

function load(): Store {
	if (cache) return cache;
	try {
		const raw = readFileSync(STORE_PATH, 'utf-8');
		cache = JSON.parse(raw) as Store;
	} catch {
		cache = {};
	}
	return cache;
}

function persist(store: Store): void {
	const dir = dirname(STORE_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const tmp = `${STORE_PATH}.tmp`;
	writeFileSync(tmp, JSON.stringify(store, null, '\t'), 'utf-8');
	renameSync(tmp, STORE_PATH);
}

export function getDeviceMeta(nodeId: string): DeviceMeta | undefined {
	return load()[nodeId];
}

export function getAllDeviceMeta(): Store {
	// Caller treats the result as read-only; we still return a shallow copy so a
	// mutation can't poison the cache without going through setDeviceMeta.
	return { ...load() };
}

// Returns true when the value was changed and persisted, false when it was
// already equal (caller can answer 304 in that case).
export function setOsUser(nodeId: string, osUser: string): boolean {
	const store = load();
	const cur = store[nodeId];
	if (cur?.os_user === osUser) return false;
	store[nodeId] = { ...cur, os_user: osUser, updated_at: new Date().toISOString() };
	persist(store);
	return true;
}

export function deleteDeviceMeta(nodeId: string): void {
	const store = load();
	if (!(nodeId in store)) return;
	delete store[nodeId];
	persist(store);
}
