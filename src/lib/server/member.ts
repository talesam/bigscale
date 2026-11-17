import { getNodeByTailnetIp, isDirectTailnetRequest } from './tailnet-auth.js';
import type { Inviter } from './invite-store.js';

// Who is calling, for the peer-facing API under /api/me: identified by the
// tunnel (the source address is a tailnet IP only the owning node can use),
// never by anything in the request. Tagged devices (servers enrolled by
// tag) and the panel itself belong to no person, so they get nothing here.

const NOT_PEOPLE = new Set(['_panel', 'tagged-devices']);

export async function callerMember(request: Request, getClientAddress: () => string): Promise<Inviter | null> {
	if (!isDirectTailnetRequest(request)) return null;
	// Never the env-enabled X-Forwarded-For fallback: only the socket counts.
	let ip: string;
	try {
		ip = getClientAddress();
	} catch {
		return null;
	}
	const node = await getNodeByTailnetIp(ip);
	const user = node?.user?.name ?? '';
	if (!node || !user || NOT_PEOPLE.has(user)) return null;
	return { user, userId: String(node.user.id), device: node.givenName || node.name };
}
