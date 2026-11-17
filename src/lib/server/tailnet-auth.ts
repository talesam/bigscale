import type { Device } from '$lib/types.js';
import { bsJson } from './bigscale-server.js';

// Identify a request by its tailnet source IP: ask the engine for the node
// that owns that 100.64/10 (or fd7a::/8) address. The TCP session itself is
// the identity — only the real node behind that IP can complete it.
//
// Engine lookups are not free, so we keep a per-IP cache for 30 s. Devices
// rarely change IP between reconnects, and biglace re-POSTs more often than
// that during retry/backoff, so the hit rate is high.

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { device: Device | null; expiresAt: number }>();

interface NodeListResponse {
	nodes?: Device[];
}

export function isTailnetAddr(ip: string): boolean {
	if (ip.startsWith('100.')) {
		// CGNAT range used by tailscale: 100.64.0.0/10
		const second = Number.parseInt(ip.split('.')[1] ?? '', 10);
		return second >= 64 && second <= 127;
	}
	// IPv6 ULA range used by tailscale: fd7a:115c:a1e0::/48
	return ip.toLowerCase().startsWith('fd7a:115c:a1e0');
}

/**
 * True when the request came straight from a tailnet device to the panel's
 * tailnet address — the only shape BigLace sends. Refuses:
 * - browser requests (Origin / Sec-Fetch-Site): with DNS rebinding, a page
 *   the member opens could otherwise make their browser call this API from
 *   their tailnet IP and act as them;
 * - a Host that isn't a tailnet IP literal (rebinding needs a hostname);
 * - anything relayed by a proxy (forwarding headers), whose socket address
 *   would be the proxy's, not the caller's.
 */
export function isDirectTailnetRequest(request: Request): boolean {
	const h = request.headers;
	if (h.get('origin') !== null) return false;
	const site = h.get('sec-fetch-site');
	if (site !== null && site !== 'none') return false;
	if (h.get('x-forwarded-for') !== null || h.get('x-real-ip') !== null || h.get('forwarded') !== null) return false;
	const host = (h.get('host') ?? '').trim().toLowerCase();
	const bare = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '');
	return isTailnetAddr(bare);
}

export function extractClientIp(request: Request, getClientAddress: () => string): string | null {
	// We deliberately do NOT trust X-Forwarded-For here — auth is by tunnel
	// identity, so the panel must see the real peer IP. If the panel sits
	// behind a reverse proxy, expose it on the tailnet IP directly (or use a
	// proxy that preserves the source on a private listener).
	try {
		return getClientAddress();
	} catch {
		// Fall back to a header only if explicitly opted in via env. Off by
		// default to keep auth tamper-proof.
		if (process.env.BIGSCALE_TRUST_FORWARDED_FOR === 'true') {
			const xff = request.headers.get('x-forwarded-for');
			if (xff) return xff.split(',')[0].trim();
		}
		return null;
	}
}

export async function getNodeByTailnetIp(ip: string, opts: { fresh?: boolean } = {}): Promise<Device | null> {
	if (!isTailnetAddr(ip)) return null;

	const now = Date.now();
	const cached = cache.get(ip);
	if (!opts.fresh && cached && cached.expiresAt > now) return cached.device;

	let device: Device | null = null;
	try {
		const data = await bsJson<NodeListResponse>('GET', 'node');
		const match = (data.nodes ?? []).find((n) => (n.ipAddresses ?? []).includes(ip));
		device = match ?? null;
	} catch {
		device = null;
	}

	cache.set(ip, { device, expiresAt: now + CACHE_TTL_MS });
	return device;
}
