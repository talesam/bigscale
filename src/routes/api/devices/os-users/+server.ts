import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractClientIp, getNodeByTailnetIp } from '$lib/server/tailnet-auth.js';
import { bsJson } from '$lib/server/bigscale-server.js';
import { getAllDeviceMeta } from '$lib/server/device-meta.js';
import type { Device } from '$lib/types.js';

// GET /api/devices/os-users
//
// Returns a flat `{ hostname: os_user }` map of every tailnet device that has
// advertised an os_user. Used by biglace clients to populate the SSH login
// for peers without requiring an admin session — the equivalent of the POST
// counterpart on /api/devices/me/os-user.
//
// Auth: tunnel identity. The caller must be a known tailnet node (its source
// IP must resolve to a node via the engine). Same gate as the POST endpoint,
// for the same reason: this endpoint is meant for peers, not the admin UI.
//
// Hostname source: prefers `givenName` (the headscale-assigned name, which
// matches biglace's display name) and falls back to `name`. Devices missing
// an os_user entry are simply absent from the response.

interface NodesResponse {
	nodes?: Device[];
}

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = extractClientIp(request, getClientAddress);
	if (!ip) return json({ error: 'unidentifiable peer' }, { status: 401 });

	const node = await getNodeByTailnetIp(ip);
	if (!node) return json({ error: 'peer is not a known tailnet node' }, { status: 401 });

	const meta = getAllDeviceMeta();
	let nodes: Device[] = [];
	try {
		const data = await bsJson<NodesResponse>('GET', 'node');
		nodes = data.nodes ?? [];
	} catch {
		nodes = [];
	}

	const out: Record<string, string> = {};
	for (const n of nodes) {
		const osUser = meta[n.id]?.os_user;
		if (!osUser) continue;
		const host = (n.givenName || n.name || '').trim();
		if (host) out[host] = osUser;
	}

	return json(out);
};
