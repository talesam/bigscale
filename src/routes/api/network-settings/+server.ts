import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin-guard.js';
import { DEFAULTS, LIMITS, getSettings, updateSettings } from '$lib/server/network-settings.js';
import type { RequestHandler } from './$types';

// GET /api/network-settings → { settings, defaults, limits }
// PUT /api/network-settings { …fields to change } → { settings }
// How people get into this network and what members see (admin only).

export const GET: RequestHandler = async ({ cookies }) => {
	requireAdmin(cookies);
	return json({ settings: getSettings(), defaults: DEFAULTS, limits: LIMITS });
};

export const PUT: RequestHandler = async ({ cookies, request }) => {
	requireAdmin(cookies);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid_request' }, { status: 400 });
	}
	return json({ settings: updateSettings(body) });
};
