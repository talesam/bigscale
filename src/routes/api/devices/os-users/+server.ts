import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticateDevice } from '$lib/server/device-auth.js';
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
// Auth: a signed request from the device's BigLace (see device-auth.ts).
// Same gate as the POST endpoint: this endpoint is meant for peers, not the
// admin UI.
//
// Hostname source: prefers `givenName` (the headscale-assigned name, which
// matches biglace's display name) and falls back to `name`. Devices missing
// an os_user entry are simply absent from the response.

interface NodesResponse {
	nodes?: Device[];
}

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const auth = await authenticateDevice(request, getClientAddress);
	if ('error' in auth) return json({ error: auth.error }, { status: auth.status });

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
