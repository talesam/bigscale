import { json } from '@sveltejs/kit';
import { authenticateDevice, pinnedKey } from '$lib/server/device-auth.js';
import { getNodeByTailnetIp, isTailnetAddr } from '$lib/server/tailnet-auth.js';
import type { RequestHandler } from './$types';

// GET /api/devices/key/<tailnet ip> → { node, user, key, via } | 404
//
// For a device that is being asked something by a peer (e.g. to share its
// screen): which BigLace key belongs to the device at that address. The
// caller compares it with the key the peer signed its request with, so a VM
// or container behind that device can't pass as it — without needing to
// reach the peer back (the policy may only allow one direction).
//
// Public keys aren't secret, but only signed requests from tailnet devices
// get an answer (same gate as the rest of the peer API).
export const GET: RequestHandler = async ({ request, getClientAddress, params }) => {
	const auth = await authenticateDevice(request, getClientAddress);
	if ('error' in auth) return json({ error: auth.error }, { status: auth.status });
	const ip = params.ip;
	if (!isTailnetAddr(ip)) return json({ error: 'invalid_ip' }, { status: 400 });
	const node = await getNodeByTailnetIp(ip, { fresh: true });
	if (!node) return json({ error: 'unknown_peer' }, { status: 404 });
	const pinned = pinnedKey(String(node.id));
	if (!pinned) return json({ error: 'no_key' }, { status: 404 });
	return json(
		{ node: node.givenName || node.name, user: node.user?.name ?? '', key: pinned.pub, via: pinned.via },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
