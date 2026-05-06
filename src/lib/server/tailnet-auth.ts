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

function isTailnetAddr(ip: string): boolean {
	if (ip.startsWith('100.')) {
		// CGNAT range used by tailscale: 100.64.0.0/10
		const second = parseInt(ip.split('.')[1] ?? '', 10);
		return second >= 64 && second <= 127;
	}
	// IPv6 ULA range used by tailscale: fd7a:115c:a1e0::/48
	return ip.toLowerCase().startsWith('fd7a:115c:a1e0');
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

export async function getNodeByTailnetIp(ip: string): Promise<Device | null> {
	if (!isTailnetAddr(ip)) return null;

	const now = Date.now();
	const cached = cache.get(ip);
	if (cached && cached.expiresAt > now) return cached.device;

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
