import { json } from '@sveltejs/kit';
import { jsonBody, requireMember } from '$lib/server/member.js';
import { answer, cancel, requestStatus } from '$lib/server/group-requests.js';
import type { RequestHandler } from './$types';

// POST   /api/me/requests/<id> { accept: bool } → { group }  (answer one sent to me)
// DELETE /api/me/requests/<id>                               (take back one I sent)
export const POST: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	const body = jsonBody<{ accept?: unknown }>(me.body);
	if (!body || typeof body.accept !== 'boolean') return json({ error: 'invalid_request' }, { status: 400 });
	try {
		const req = await answer(me.user, params.id, body.accept);
		return json({ group: req.group, accepted: body.accept });
	} catch (e) {
		const { code, status } = requestStatus(e);
		return json({ error: code }, { status });
	}
};

export const DELETE: RequestHandler = async ({ request, getClientAddress, params }) => {
	const me = await requireMember(request, getClientAddress);
	if (me instanceof Response) return me;
	try {
		cancel(me.user, params.id);
		return json({ ok: true });
	} catch (e) {
		const { code, status } = requestStatus(e);
		return json({ error: code }, { status });
	}
};
