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

async function ensureUser(name: string): Promise<string> {
	// Cria; se já existe, segue. Em qualquer caso, retorna o ID do user.
	const createRes = await bs('POST', 'user', { name });
	if (createRes.ok) {
		const created = (await createRes.json()) as UserResp;
		const id = created.user?.id;
		if (id !== undefined) return String(id);
	} else {
		const text = await createRes.text();
		// O backend retorna 500 com "UNIQUE constraint failed" quando usuário já existe
		const alreadyExists =
			createRes.status === 409 ||
			createRes.status === 400 ||
			/already exists|UNIQUE constraint/i.test(text);
		if (!alreadyExists) {
			throw new Error(`Falha ao garantir usuário no servidor (HTTP ${createRes.status}): ${text}`);
		}
	}

	// Buscar ID via list (filtrando por name)
	const listRes = await bs('GET', 'user', undefined, { name });
	if (!listRes.ok) {
		throw new Error(`Falha ao buscar usuário (HTTP ${listRes.status})`);
	}
	const list = (await listRes.json()) as { users?: { id?: string | number; name?: string }[] };
	const found = list.users?.find((u) => u.name === name);
	if (found?.id === undefined) {
		throw new Error(`Usuário ${name} não encontrado após criação`);
	}
	return String(found.id);
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

	let userId: string;
	try {
		userId = await ensureUser(nodeUser);
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}

	const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
	const res = await bs('POST', 'preauthkey', {
		user:       userId,
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
