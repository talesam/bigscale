import { error } from '@sveltejs/kit';
import { validateSession } from '$lib/server/session.js';
import { bs } from '$lib/server/bigscale-server.js';
import { deleteDeviceMeta, getAllDeviceMeta } from '$lib/server/device-meta.js';
import type { RequestHandler } from './$types';

// Path looks like `node/<id>` (no trailing segments) — admin deleted the
// device. The id is what setOsUser keyed on, so prune the metadata too.
const NODE_DELETE_RE = /^node\/([^/]+)$/;
const USER_DELETE_RE = /^user\/([^/]+)$/;

// The panel registers itself as a tailnet peer under this user/hostname
// (see scripts/entrypoint.sh). Removing either entity orphans the NodeKey
// persisted in /var/lib/tailscale and silently breaks tunnel-identity auth
// until the next container boot — so the proxy refuses to delete them.
const RESERVED_USER = '_panel';
const RESERVED_HOSTNAME = 'panel';

function guard(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const token = cookies.get('bs_session');
	if (!token || !validateSession(token)) throw error(401, 'Not authenticated');
}

// Splice panel-side metadata (os_user, etc) into the engine's node listing
// before returning it to clients. Only applied to the exact `node` GET — not
// to `node/<id>/...` subpaths, which return different shapes.
// Also hides the reserved `panel` peer so admins don't try to delete it.
function mergeNodeMeta(payload: string): string {
	try {
		const parsed = JSON.parse(payload) as {
			nodes?: Array<{ id?: string; givenName?: string; name?: string; user?: { name?: string } } & Record<string, unknown>>;
		};
		if (!Array.isArray(parsed.nodes)) return payload;
		const meta = getAllDeviceMeta();
		parsed.nodes = parsed.nodes
			.filter((n) => n.user?.name !== RESERVED_USER)
			.map((n) => {
				const m = n.id ? meta[n.id] : undefined;
				if (m?.os_user) return { ...n, os_user: m.os_user };
				return n;
			});
		return JSON.stringify(parsed);
	} catch {
		return payload;
	}
}

// Strip the reserved `_panel` user from the user listing.
function filterUsers(payload: string): string {
	try {
		const parsed = JSON.parse(payload) as { users?: Array<{ name?: string }> };
		if (!Array.isArray(parsed.users)) return payload;
		parsed.users = parsed.users.filter((u) => u.name !== RESERVED_USER);
		return JSON.stringify(parsed);
	} catch {
		return payload;
	}
}

// Resolve a user/node ID to its name (or owning user name) so we can refuse
// to delete the reserved entities. Failure is treated as "not reserved" —
// the engine itself will reject with 404 if the id doesn't exist.
async function isReservedUser(id: string): Promise<boolean> {
	try {
		const res = await bs('GET', `user/${id}`);
		if (!res.ok) return false;
		const body = (await res.json()) as { user?: { name?: string } };
		return body.user?.name === RESERVED_USER;
	} catch {
		return false;
	}
}
async function isReservedNode(id: string): Promise<boolean> {
	try {
		const res = await bs('GET', `node/${id}`);
		if (!res.ok) return false;
		const body = (await res.json()) as { node?: { user?: { name?: string } } };
		return body.node?.user?.name === RESERVED_USER;
	} catch {
		return false;
	}
}

async function proxy(method: string, path: string, request: Request, cookies: Parameters<RequestHandler>[0]['cookies'], url: URL) {
	guard(cookies);

	// Refuse to delete the reserved `_panel` user or its `panel` device —
	// tailscaled state in /var/lib/tailscale would orphan otherwise.
	if (method === 'DELETE') {
		const userMatch = USER_DELETE_RE.exec(path);
		if (userMatch && (await isReservedUser(userMatch[1]))) {
			return new Response(JSON.stringify({ message: 'reserved system user cannot be deleted' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const nodeMatch = NODE_DELETE_RE.exec(path);
		if (nodeMatch && (await isReservedNode(nodeMatch[1]))) {
			return new Response(JSON.stringify({ message: 'reserved system node cannot be deleted' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

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

	if (method === 'GET' && res.ok) {
		if (path === 'node') data = mergeNodeMeta(data);
		else if (path === 'user') data = filterUsers(data);
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
