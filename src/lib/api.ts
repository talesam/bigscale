import type { ApiKey, Device, Policy, PreAuthKey, Route, User } from './types';

// All calls go through our backend proxy — API key never leaves the server
const BASE = '/api/bs/v1';

async function req<T = unknown>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
	const url = new URL(BASE + '/' + path, location.origin);
	if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

	const res = await fetch(url.toString(), {
		method,
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: body !== undefined ? JSON.stringify(body) : undefined
	});

	if (res.status === 401) {
		location.href = '/login';
		throw new Error('Sessão expirada');
	}

	if (!res.ok) {
		const text = await res.text();
		let msg = text;
		try { msg = JSON.parse(text).message ?? text; } catch { /* use raw text */ }
		throw new Error(msg || `HTTP ${res.status}`);
	}

	return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<void> {
	const res = await fetch('/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password })
	});
	if (!res.ok) {
		const d = await res.json().catch(() => ({})) as { error?: string };
		throw new Error(d.error ?? 'Credenciais inválidas');
	}
}

export async function logout(): Promise<void> {
	await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<User[]> {
	const d = await req<{ users: User[] }>('GET', 'user');
	return d.users ?? [];
}

export async function createUser(name: string): Promise<User> {
	const d = await req<{ user: User }>('POST', 'user', { name: name.toLowerCase() });
	return d.user;
}

export async function renameUser(id: string, newName: string): Promise<User> {
	const d = await req<{ user: User }>('POST', `user/${id}/rename/${newName}`);
	return d.user;
}

export async function deleteUser(id: string): Promise<void> {
	await req('DELETE', `user/${id}`);
}

// ─── Devices ─────────────────────────────────────────────────────────────────

export async function getDevices(): Promise<Device[]> {
	const d = await req<{ nodes: Device[] }>('GET', 'node');
	return d.nodes ?? [];
}

export async function renameDevice(id: string, name: string): Promise<Device> {
	const d = await req<{ node: Device }>('POST', `node/${id}/rename/${name}`);
	return d.node;
}

export async function deleteDevice(id: string): Promise<void> {
	await req('DELETE', `node/${id}`);
}

export async function moveDevice(id: string, userId: string): Promise<Device> {
	const d = await req<{ node: Device }>('POST', `node/${id}/user`, { user: parseInt(userId) });
	return d.node;
}

export async function expireDevice(id: string): Promise<Device> {
	const d = await req<{ node: Device }>('POST', `node/${id}/expire`);
	return d.node;
}

export async function setDeviceTags(id: string, tags: string[]): Promise<Device> {
	const d = await req<{ node: Device }>('POST', `node/${id}/tags`, { tags });
	return d.node;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function getRoutes(): Promise<Route[]> {
	const d = await req<{ routes: Route[] }>('GET', 'routes');
	return d.routes ?? [];
}

export async function getNodeRoutes(nodeId: string): Promise<Route[]> {
	const d = await req<{ routes: Route[] }>('GET', `node/${nodeId}/routes`);
	return d.routes ?? [];
}

export async function enableRoute(routeId: string): Promise<void> {
	await req('POST', `routes/${routeId}/enable`);
}

export async function disableRoute(routeId: string): Promise<void> {
	await req('POST', `routes/${routeId}/disable`);
}

export async function deleteRoute(routeId: string): Promise<void> {
	await req('DELETE', `routes/${routeId}`);
}

// ─── PreAuth Keys ─────────────────────────────────────────────────────────────

export async function getPreAuthKeys(userId: string): Promise<PreAuthKey[]> {
	const d = await req<{ preAuthKeys: PreAuthKey[] }>('GET', 'preauthkey', undefined, { user: userId });
	return d.preAuthKeys ?? [];
}

export async function createPreAuthKey(userId: string, expiration: string, reusable: boolean, ephemeral: boolean): Promise<string> {
	const d = await req<{ preAuthKey: PreAuthKey }>('POST', 'preauthkey', { user: userId, expiration, reusable, ephemeral });
	return d.preAuthKey?.key ?? '';
}

export async function expirePreAuthKey(id: string): Promise<void> {
	await req('POST', 'preauthkey/expire', { id });
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export async function getApiKeys(): Promise<ApiKey[]> {
	const d = await req<{ apiKeys: ApiKey[] }>('GET', 'apikey');
	return d.apiKeys ?? [];
}

export async function createApiKey(expiration: string): Promise<string> {
	const d = await req<{ apiKey: string }>('POST', 'apikey', { expiration });
	return d.apiKey ?? '';
}

export async function expireApiKey(prefix: string): Promise<void> {
	// BigScale v0.28+ devolve o prefix mascarado como "<prefix>-***" no list;
	// a API de expire não aceita o sufixo, precisa do prefix puro.
	const cleanPrefix = prefix.replace(/-\*+$/, '');
	await req('POST', 'apikey/expire', { prefix: cleanPrefix });
}

export async function deleteApiKey(prefix: string): Promise<void> {
	const cleanPrefix = prefix.replace(/-\*+$/, '');
	await req('DELETE', `apikey/${cleanPrefix}`);
}

// ─── Policy / ACL ─────────────────────────────────────────────────────────────

export async function getPolicy(): Promise<Policy> {
	// Policy ainda não existe → backend retorna erro "acl policy not found".
	// Tratamos como policy vazia em vez de propagar erro.
	try {
		return await req<Policy>('GET', 'policy');
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : '';
		if (/not found/i.test(msg)) return { policy: '' };
		throw e;
	}
}

export async function setPolicy(policy: string): Promise<Policy> {
	return req<Policy>('PUT', 'policy', { policy });
}

// ─── System ───────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<{ ok: boolean; version?: string }> {
	try {
		const res = await fetch('/api/bs/health', { credentials: 'include' });
		if (!res.ok) return { ok: false };
		return res.json();
	} catch {
		return { ok: false };
	}
}
