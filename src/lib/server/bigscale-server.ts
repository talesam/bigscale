import { BIGSCALE_SERVER_URL, BIGSCALE_API_KEY } from './config.js';

export async function bs(
	method: string,
	path: string,
	body?: unknown,
	query?: Record<string, string>
): Promise<Response> {
	if (!BIGSCALE_SERVER_URL) {
		throw new Error('BIGSCALE_SERVER_URL não configurada — defina a variável de ambiente antes de subir o painel.');
	}
	if (!BIGSCALE_API_KEY) {
		throw new Error('BIGSCALE_API_KEY não configurada — gerada automaticamente pelo bigscale-init no primeiro start.');
	}
	const url = new URL(`${BIGSCALE_SERVER_URL}/api/v1/${path}`);
	if (query) {
		for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
	}
	return fetch(url.toString(), {
		method,
		headers: {
			Authorization: `Bearer ${BIGSCALE_API_KEY}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
}

export async function bsJson<T = unknown>(
	method: string,
	path: string,
	body?: unknown,
	query?: Record<string, string>
): Promise<T> {
	const res = await bs(method, path, body, query);
	return res.json() as Promise<T>;
}
