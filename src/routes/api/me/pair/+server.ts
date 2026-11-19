import { json } from '@sveltejs/kit';
import { PANEL_PUBLIC_URL } from '$lib/server/config-panel.js';
import { createPairing } from '$lib/server/pair.js';
import { requireMember } from '$lib/server/member.js';
import type { RequestHandler } from './$types';

// POST /api/me/pair → { link, expires }
//
// A signed-in device asks for a code that adds one more device (a phone) to
// the same account: BigLace shows `link` as a QR code; scanning it joins.
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const p = createPairing(me.user);
	if (!p) return json({ error: 'too_many_requests' }, { status: 429 });
	const link = `${PANEL_PUBLIC_URL.replace(/\/$/, '')}/pair#${p.token}`;
	return json({ link, expires: p.expires }, { headers: { 'Cache-Control': 'no-store' } });
};
