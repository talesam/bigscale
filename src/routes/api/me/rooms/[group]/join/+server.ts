import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { join, mayJoin, publicView } from '$lib/server/rooms.js';
import { getNodeByTailnetIp } from '$lib/server/tailnet-auth.js';
import type { RequestHandler } from './$types';

// POST /api/me/rooms/<group>/join { muted? } → { participants: [...] }
// Enter (or stay in: repeated every few seconds) the group's voice room.
// Only members of the group; the address listed is the device's own.
export const POST: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ muted?: unknown }>(me.body) ?? {};
	try {
		if (!(await mayJoin(me.user, params.group))) return json({ error: 'not_in_group' }, { status: 403 });
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
	let ip: string;
	try {
		ip = getClientAddress();
	} catch {
		return json({ error: 'unknown_peer' }, { status: 401 });
	}
	// The IPv4 tailnet address of the node (what peers dial), not whatever
	// family this request arrived on.
	const node = await getNodeByTailnetIp(ip);
	const v4 = node?.ipAddresses?.find((a) => !a.includes(':')) ?? ip;
	const result = join(params.group, {
		user: me.user,
		device: me.device,
		ip: v4,
		nodeId: me.nodeId,
		muted: body.muted === true
	});
	if (typeof result === 'string') return json({ error: result }, { status: 409 });
	return json({ participants: result.map(publicView) }, { headers: { 'Cache-Control': 'no-store' } });
};
