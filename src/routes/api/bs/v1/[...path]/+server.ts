import { error } from '@sveltejs/kit';
import { validateSession } from '$lib/server/session.js';
import { bs } from '$lib/server/bigscale-server.js';
import { deleteDeviceMeta, getAllDeviceMeta } from '$lib/server/device-meta.js';
import type { RequestHandler } from './$types';

// Path looks like `node/<id>` (no trailing segments) — admin deleted the
// device. The id is what setOsUser keyed on, so prune the metadata too.
const NODE_DELETE_RE = /^node\/([^/]+)$/;

function guard(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const token = cookies.get('bs_session');
	if (!token || !validateSession(token)) throw error(401, 'Not authenticated');
}

// Splice panel-side metadata (os_user, etc) into the engine's node listing
// before returning it to clients. Only applied to the exact `node` GET — not
// to `node/<id>/...` subpaths, which return different shapes.
function mergeNodeMeta(payload: string): string {
	try {
		const parsed = JSON.parse(payload) as { nodes?: Array<{ id?: string } & Record<string, unknown>> };
		if (!Array.isArray(parsed.nodes)) return payload;
		const meta = getAllDeviceMeta();
		parsed.nodes = parsed.nodes.map((n) => {
			const m = n.id ? meta[n.id] : undefined;
			if (m?.os_user) return { ...n, os_user: m.os_user };
			return n;
		});
		return JSON.stringify(parsed);
	} catch {
		return payload;
	}
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
	let data = await res.text();

	if (method === 'GET' && path === 'node' && res.ok) {
		data = mergeNodeMeta(data);
	}

	if (method === 'DELETE' && res.ok) {
		const m = NODE_DELETE_RE.exec(path);
		if (m) deleteDeviceMeta(m[1]);
	}

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
