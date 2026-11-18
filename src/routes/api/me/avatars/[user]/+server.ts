import { json } from '@sveltejs/kit';
import { requireMember } from '$lib/server/member.js';
import { photo } from '$lib/server/avatars.js';
import type { RequestHandler } from './$types';

// GET /api/me/avatars/<user> → the photo (JPEG/PNG), if I may see it.
export const GET: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	let r: Awaited<ReturnType<typeof photo>>;
	try {
		r = await photo(me.user, params.user);
	} catch {
		return json({ error: 'server_error' }, { status: 502 });
	}
	if (typeof r === 'string') return json({ error: r }, { status: r === 'forbidden' ? 403 : 404 });
	return new Response(new Uint8Array(r.bytes), {
		headers: {
			'Content-Type': r.type,
			'Content-Length': String(r.bytes.length),
			'Cache-Control': 'no-store',
			'X-Avatar-Hash': r.hash,
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'"
		}
	});
};
