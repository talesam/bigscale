import { error } from '@sveltejs/kit';
import { validateSession } from '$lib/server/session.js';
import { bs } from '$lib/server/bigscale-server.js';
import type { RequestHandler } from './$types';

function guard(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const token = cookies.get('bs_session');
	if (!token || !validateSession(token)) throw error(401, 'Não autenticado');
}

async function proxy(method: string, path: string, request: Request, cookies: Parameters<RequestHandler>[0]['cookies'], url: URL) {
	guard(cookies);

	// Forward query string
	const query: Record<string, string> = {};
	url.searchParams.forEach((v, k) => { query[k] = v; });

	// Forward body for mutating methods
	let body: unknown;
	if (['POST', 'PUT', 'PATCH'].includes(method)) {
		const text = await request.text();
		if (text) body = JSON.parse(text);
	}

	const res = await bs(method, path, body, Object.keys(query).length ? query : undefined);
	const data = await res.text();

	return new Response(data, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export const GET:    RequestHandler = ({ params, cookies, request, url }) => proxy('GET',    params.path, request, cookies, url);
export const POST:   RequestHandler = ({ params, cookies, request, url }) => proxy('POST',   params.path, request, cookies, url);
export const PUT:    RequestHandler = ({ params, cookies, request, url }) => proxy('PUT',    params.path, request, cookies, url);
export const PATCH:  RequestHandler = ({ params, cookies, request, url }) => proxy('PATCH',  params.path, request, cookies, url);
export const DELETE: RequestHandler = ({ params, cookies, request, url }) => proxy('DELETE', params.path, request, cookies, url);
