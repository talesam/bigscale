import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Device } from '$lib/types.js';
import { ADMIN_DATA_DIR } from './config.js';
import { getNodeByTailnetIp, isDirectTailnetRequest } from './tailnet-auth.js';

// Who is calling the peer-facing API (/api/me/…, /api/devices/…): a device,
// proven by a key only its BigLace holds — not just by the source address.
//
// Why: the tunnel's source address names the *node*, but anything that node
// forwards into the tailnet carries the same address. A VM or container on a
// tailnet machine (NAT through the host) reaches the panel as that machine,
// and once deleted the owner's device that way. So:
//
//   1. Each BigLace installation has an Ed25519 key and signs every request
//      (method, host, path, time, nonce, body hash).
//   2. The key is pinned to the node, once:
//      - at enrollment: BigLace sends its public key with the invite / reclaim
//        / panel-login request, and the panel ties it to the one-time key the
//        device then registers with (the node records which one it used);
//      - for devices enrolled before this existed: the panel asks the node's
//        own BigLace agent, over the tunnel (port 41980), to sign a fresh
//        challenge. A VM behind the host can't make the host's BigLace vouch
//        for a key it doesn't hold.
//   3. A pinned key is never replaced by another one. A device that lost its
//      key (reinstalled) signs out and joins again — a new node, pinned at
//      enrollment — or the admin removes the device.
//
// Signed requests are single-use (nonce) and short-lived (±2 min).

const STORE_PATH = resolve(ADMIN_DATA_DIR, 'device-keys.json');
const ENROLL_PATH = resolve(ADMIN_DATA_DIR, 'enroll-keys.json');
// Unused enrollment pins expire with the one-time key they belong to (24 h).
const ENROLL_TTL_MS = 48 * 60 * 60 * 1000;
const SKEW_MS = 120_000;
const MAX_BODY = 64 * 1024;
const PROOF_TIMEOUT_MS = 5_000;
const PROOF_LIMIT_NODE = 20; // proofs per node per minute
const PROOF_LIMIT_KEY = 3; // per (node, key) per minute
export const AGENT_PORT = 41980;

const B64URL = /^[A-Za-z0-9_-]+$/;

interface Pinned {
	pub: string;
	nodeKey: string;
	at: string;
	/** How the key was accepted: at enrollment, or by the agent's proof. */
	via?: 'enroll' | 'proof';
}
type Store = Record<string, Pinned>;
let cache: Store | null = null;

function load(): Store {
	if (cache) return cache;
	try {
		const parsed = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as unknown;
		cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
	} catch {
		cache = {};
	}
	return cache;
}

function writeJson(path: string, data: unknown): void {
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, JSON.stringify(data, null, '\t'), { encoding: 'utf-8', mode: 0o600 });
	renameSync(tmp, path);
}

function persist(store: Store): void {
	writeJson(STORE_PATH, store);
}

// Pre-auth key id → public key BigLace sent when enrolling with it.
type Enroll = Record<string, { pub: string; at: string }>;
let enrollCache: Enroll | null = null;
function loadEnroll(): Enroll {
	if (enrollCache) return enrollCache;
	try {
		const parsed = JSON.parse(readFileSync(ENROLL_PATH, 'utf-8')) as unknown;
		enrollCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Enroll) : {};
	} catch {
		enrollCache = {};
	}
	return enrollCache;
}

/** Valid device public key (base64url Ed25519), else null. */
export function devicePub(v: unknown): string | null {
	return typeof v === 'string' && publicKey(v) ? v : null;
}

/**
 * Remember that whoever registers with pre-auth key `keyId` holds `pub`.
 * Called by the enrollment endpoints (invite, reclaim, panel login), which
 * are authenticated by their own credential.
 */
export function pinForEnrollment(keyId: string, pub: string | null): void {
	if (!pub || !keyId) return;
	const store = loadEnroll();
	const now = Date.now();
	for (const [k, v] of Object.entries(store)) if (now - Date.parse(v.at) > ENROLL_TTL_MS) delete store[k];
	store[keyId] = { pub, at: new Date(now).toISOString() };
	writeJson(ENROLL_PATH, store);
}

function enrollmentFor(keyId: string): { pub: string } | null {
	const store = loadEnroll();
	if (!keyId || !Object.hasOwn(store, keyId)) return null;
	const entry = store[keyId];
	return Date.now() - Date.parse(entry.at) > ENROLL_TTL_MS ? null : entry;
}

function dropEnrollment(keyId: string): void {
	const store = loadEnroll();
	if (!Object.hasOwn(store, keyId)) return;
	delete store[keyId];
	writeJson(ENROLL_PATH, store);
}

/** The node is gone: its pinned key goes too. */
export function forgetDeviceKey(nodeId: string): void {
	const store = load();
	if (!Object.hasOwn(store, nodeId)) return;
	delete store[nodeId];
	persist(store);
}

function publicKey(pub: string): crypto.KeyObject | null {
	if (pub.length !== 43 || !B64URL.test(pub)) return null;
	try {
		return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: pub }, format: 'jwk' });
	} catch {
		return null;
	}
}

function verify(pub: string, message: string, sig: string): boolean {
	const key = publicKey(pub);
	if (!key || sig.length !== 86 || !B64URL.test(sig)) return false;
	try {
		return crypto.verify(null, Buffer.from(message, 'utf-8'), key, Buffer.from(sig, 'base64url'));
	} catch {
		return false;
	}
}

/** What BigLace signs for a request. Kept in sync with src/device_key.rs. */
export function requestMessage(method: string, host: string, path: string, time: string, nonce: string, body: string): string {
	const bodyHash = crypto.createHash('sha256').update(body, 'utf-8').digest('hex');
	return ['biglace-req-v1', method.toUpperCase(), host.toLowerCase(), path, time, nonce, bodyHash].join('\n');
}

/** What the agent signs to prove it holds the key. Kept in sync with src/device_key.rs. */
export function proofMessage(challenge: string): string {
	return `biglace-proof-v1\n${challenge}`;
}

// Nonces seen in the last SKEW window (key|nonce → expiry). Only requests
// from an accepted (pinned) key get here, so filling it takes a real device.
const seen = new Map<string, number>();
const MAX_SEEN = 50_000;
function freshNonce(key: string, nonce: string, now: number): boolean | 'busy' {
	if (seen.size >= MAX_SEEN) {
		for (const [k, exp] of seen) if (exp <= now) seen.delete(k);
		if (seen.size >= MAX_SEEN) return 'busy';
	}
	const id = `${key}|${nonce}`;
	const exp = seen.get(id);
	if (exp !== undefined && exp > now) return false;
	seen.set(id, now + 2 * SKEW_MS);
	return true;
}

const proofs = new Map<string, number[]>();
function underLimit(id: string, limit: number, now: number): boolean {
	const list = (proofs.get(id) ?? []).filter((t) => now - t < 60_000);
	proofs.set(id, list);
	return list.length < limit;
}
function proofAllowed(nodeId: string, pub: string, now: number): boolean {
	if (proofs.size > 10_000) proofs.clear();
	const n = `n:${nodeId}`;
	const k = `k:${nodeId}:${pub}`;
	if (!underLimit(n, PROOF_LIMIT_NODE, now) || !underLimit(k, PROOF_LIMIT_KEY, now)) return false;
	proofs.get(n)!.push(now);
	proofs.get(k)!.push(now);
	return true;
}

/** Ask the node's own BigLace agent to prove it holds `pub`. */
async function proveOverTunnel(ip: string, pub: string): Promise<boolean> {
	const challenge = crypto.randomBytes(32).toString('base64url');
	const host = ip.includes(':') ? `[${ip}]` : ip;
	try {
		const res = await fetch(`http://${host}:${AGENT_PORT}/v1/proof/${challenge}`, {
			signal: AbortSignal.timeout(PROOF_TIMEOUT_MS),
			redirect: 'error'
		});
		if (!res.ok) return false;
		const text = await res.text();
		if (text.length > 1024) return false;
		const body = JSON.parse(text) as { key?: unknown; sig?: unknown };
		return body.key === pub && typeof body.sig === 'string' && verify(pub, proofMessage(challenge), body.sig);
	} catch {
		return false;
	}
}

export type DeviceAuthError =
	| 'not_direct'
	| 'unknown_peer'
	| 'signature_required'
	| 'bad_signature'
	| 'stale_request'
	| 'replayed'
	| 'device_unverified'
	| 'device_key_mismatch'
	| 'busy'
	| 'body_too_large';

export type DeviceAuth = { node: Device; ip: string; body: string } | { error: DeviceAuthError; status: number };

/**
 * Authenticate a request from a device's BigLace. On success returns the
 * node and the raw body (already read: handlers must parse `body`, not the
 * request).
 */
export async function authenticateDevice(request: Request, getClientAddress: () => string): Promise<DeviceAuth> {
	if (!isDirectTailnetRequest(request)) return { error: 'not_direct', status: 401 };
	let ip: string;
	try {
		ip = getClientAddress();
	} catch {
		return { error: 'unknown_peer', status: 401 };
	}

	const h = request.headers;
	const pub = h.get('x-biglace-key') ?? '';
	const time = h.get('x-biglace-time') ?? '';
	const nonce = h.get('x-biglace-nonce') ?? '';
	const sig = h.get('x-biglace-sig') ?? '';
	if (!pub || !time || !nonce || !sig) return { error: 'signature_required', status: 401 };
	if (!/^\d{1,13}$/.test(time) || nonce.length < 16 || nonce.length > 64 || !B64URL.test(nonce)) {
		return { error: 'bad_signature', status: 401 };
	}
	const now = Date.now();
	if (Math.abs(now - Number(time) * 1000) > SKEW_MS) return { error: 'stale_request', status: 401 };

	const declared = Number(h.get('content-length') ?? '0');
	if (declared > MAX_BODY) return { error: 'body_too_large', status: 413 };
	const body = await request.text();
	if (body.length > MAX_BODY) return { error: 'body_too_large', status: 413 };

	const url = new URL(request.url);
	const message = requestMessage(request.method, h.get('host') ?? '', url.pathname + url.search, time, nonce, body);
	if (!verify(pub, message, sig)) return { error: 'bad_signature', status: 401 };

	const accepted = await acceptKey(ip, pub, now);
	if ('error' in accepted) return accepted;

	// Replay check last: only accepted keys can fill the nonce cache.
	const fresh = freshNonce(pub, nonce, now);
	if (fresh === 'busy') return { error: 'busy', status: 503 };
	if (!fresh) return { error: 'replayed', status: 401 };
	return { node: accepted.node, ip, body };
}

type NodeWithKeys = Device & { nodeKey?: string; preAuthKey?: { id?: string | number } | null };

/** Is `pub` this node's key? Pins it the first time (see the header). */
async function acceptKey(
	ip: string,
	pub: string,
	now: number
): Promise<{ node: Device } | { error: DeviceAuthError; status: number }> {
	let node = (await getNodeByTailnetIp(ip)) as NodeWithKeys | null;
	if (!node) return { error: 'unknown_peer', status: 401 };
	const store = load();
	const pinned = Object.hasOwn(store, node.id) ? store[node.id] : null;
	if (pinned) {
		// Never swapped for another key — that's the whole point.
		if (pinned.pub !== pub) return { error: 'device_key_mismatch', status: 401 };
		const nodeKey = node.nodeKey ?? '';
		// Same key, node re-keyed by tailscale (re-auth, key expiry): the
		// valid signature already proves it's the same installation.
		if (nodeKey && pinned.nodeKey !== nodeKey) {
			pinned.nodeKey = nodeKey;
			persist(store);
		}
		return { node };
	}

	// First time for this node. Look it up fresh so a stale cache can't
	// pin a key to the wrong node.
	node = (await getNodeByTailnetIp(ip, { fresh: true })) as NodeWithKeys | null;
	if (!node) return { error: 'unknown_peer', status: 401 };
	const pin = (via: 'enroll' | 'proof') => {
		const s2 = load();
		if (Object.hasOwn(s2, node!.id)) return s2[node!.id].pub === pub;
		s2[node!.id] = { pub, nodeKey: node!.nodeKey ?? '', at: new Date().toISOString(), via };
		persist(s2);
		console.log(`[bigscale] device key pinned for node ${node!.id} (${node!.givenName || node!.name}) via ${via}`);
		return true;
	};

	const keyId = node.preAuthKey?.id !== undefined && node.preAuthKey?.id !== null ? String(node.preAuthKey.id) : '';
	const enrolled = enrollmentFor(keyId);
	if (enrolled) {
		// BigLace told us its key when it enrolled this device; anything else
		// (e.g. a VM behind it racing the first request) is refused, and the
		// enrollment stays for the real one.
		if (enrolled.pub !== pub || !pin('enroll')) return { error: 'device_key_mismatch', status: 401 };
		dropEnrollment(keyId);
		return { node };
	}

	// Enrolled before keys existed: the node's own BigLace must vouch.
	if (!proofAllowed(node.id, pub, now) || !(await proveOverTunnel(ip, pub))) {
		return { error: 'device_unverified', status: 401 };
	}
	if (!pin('proof')) return { error: 'device_key_mismatch', status: 401 };
	return { node };
}

/** Parse the authenticated body as JSON (empty body → {}). */
export function jsonBody<T>(body: string): T | null {
	if (!body.trim()) return {} as T;
	try {
		return JSON.parse(body) as T;
	} catch {
		return null;
	}
}
