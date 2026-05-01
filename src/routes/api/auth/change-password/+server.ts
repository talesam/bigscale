import { json } from '@sveltejs/kit';
import { changeAdminPassword } from '$lib/server/admin-store.js';
import { getSession, clearMustChange } from '$lib/server/session.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const token = cookies.get('bs_session');
	const session = token ? getSession(token) : null;
	if (!session) return json({ error: 'Não autenticado' }, { status: 401 });

	const { newPassword } = await request.json();
	if (typeof newPassword !== 'string') {
		return json({ error: 'Parâmetros inválidos' }, { status: 400 });
	}

	const result = changeAdminPassword(newPassword);
	if (!result.ok) return json({ error: result.error || 'Falha ao trocar senha' }, { status: 400 });

	if (token) clearMustChange(token);
	return json({ ok: true });
};
