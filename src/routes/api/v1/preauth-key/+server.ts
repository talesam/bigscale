import { json } from '@sveltejs/kit';
import { verifyAdmin } from '$lib/server/admin-store.js';
import { bs } from '$lib/server/bigscale-server.js';
import { BIGSCALE_PUBLIC_URL } from '$lib/server/config.js';
import type { RequestHandler } from './$types';

interface PreAuthBody {
	username?:  string;
	password?:  string;
	node_user?: string;
	hostname?:  string;
}

interface UserResp {
	user?: { id?: string | number; name?: string };
}

interface PreAuthKeyResp {
	preAuthKey?: { key?: string };
}

function sanitizeName(raw: string): string {
	const trimmed = raw.trim().toLowerCase();
	const cleaned = trimmed.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
	return cleaned || 'user';
}

async function ensureUser(name: string): Promise<void> {
	// Tenta criar; ignora "already exists".
	const res = await bs('POST', 'user', { name });
	if (res.ok) return;
	if (res.status === 409 || res.status === 400) {
		// já existe — segue
		return;
	}
	const text = await res.text();
	throw new Error(`Falha ao garantir usuário no servidor (HTTP ${res.status}): ${text}`);
}

export const POST: RequestHandler = async ({ request }) => {
	let body: PreAuthBody;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'JSON inválido' }, { status: 400 });
	}

	const username = (body.username ?? '').trim();
	const password = body.password ?? '';
	if (!username || !password) {
		return json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 });
	}

	const auth = verifyAdmin(username, password);
	if (!auth.ok) {
		return json({ error: 'Credenciais inválidas' }, { status: 401 });
	}

	const nodeUser = sanitizeName(body.node_user || username);

	try {
		await ensureUser(nodeUser);
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}

	const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
	const res = await bs('POST', 'preauthkey', {
		user:       nodeUser,
		reusable:   false,
		ephemeral:  false,
		expiration
	});

	if (!res.ok) {
		const text = await res.text();
		return json(
			{ error: `Falha ao gerar chave (HTTP ${res.status}): ${text}` },
			{ status: 502 }
		);
	}

	const data = (await res.json()) as PreAuthKeyResp;
	const key = data.preAuthKey?.key;
	if (!key) {
		return json({ error: 'Resposta inesperada do servidor BigScale' }, { status: 502 });
	}

	return json({
		authkey:    key,
		server_url: BIGSCALE_PUBLIC_URL
	});
};
