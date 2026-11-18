import { json } from '@sveltejs/kit';
import { requireMember } from '$lib/server/member.js';
import { candidates, requestStatus } from '$lib/server/group-requests.js';
import { getSettings } from '$lib/server/network-settings.js';
import type { RequestHandler } from './$types';

// GET /api/me/groups/<name>/people → { people: Person[], directory }
// Who on the network I could ask into a group I'm in.
export const GET: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	try {
		return json({ people: await candidates(me.user, params.name), directory: getSettings().directory }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e) {
		const { code, status } = requestStatus(e);
		return json({ error: code }, { status });
	}
};
