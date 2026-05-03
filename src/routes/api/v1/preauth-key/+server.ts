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

interface PreAuthKey {
	id?:         string | number;
	key?:        string;
	user?:       { id?: string | number };
	used?:       boolean;
	expiration?: string;
}

interface PreAuthKeysResp {
	preAuthKeys?: PreAuthKey[];
}

async function findReusableKey(userId: string): Promise<string | null> {
	// Each click on "Entrar" used to mint a brand new key, polluting the
	// server with dozens of unused keys per user. Reuse one that's still
	// good (belongs to this user, hasn't been redeemed, hasn't expired).
	const listRes = await bs('GET', 'preauthkey', undefined, { user: userId });
	if (!listRes.ok) return null;
	const list = (await listRes.json()) as PreAuthKeysResp;
	const now = Date.now();
	const candidate = list.preAuthKeys?.find(
		(k) =>
			String(k.user?.id) === userId &&
			k.used !== true &&
			!!k.expiration &&
			Date.parse(k.expiration) > now &&
			!!k.key
	);
	return candidate?.key ?? null;
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

	// Reuse an existing valid key for this user before minting a new one.
	const reusable = await findReusableKey(userId);
	if (reusable) {
		return json({ authkey: reusable, server_url: BIGSCALE_PUBLIC_URL });
	}

	// 24h gives the user enough headroom to actually click Connect after the
	// dialog closes (the old 1h was easy to miss).
	const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
