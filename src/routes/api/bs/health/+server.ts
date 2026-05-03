import { json } from '@sveltejs/kit';
import { validateSession } from '$lib/server/session.js';
import { BIGSCALE_SERVER_URL } from '$lib/server/config.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('bs_session');
	if (!token || !validateSession(token)) return json({ ok: false }, { status: 401 });

	if (!BIGSCALE_SERVER_URL) return json({ ok: false });

	try {
		const [healthRes, versionRes] = await Promise.allSettled([
			fetch(`${BIGSCALE_SERVER_URL}/health`),
			fetch(`${BIGSCALE_SERVER_URL}/version`)
		]);

		const ok = healthRes.status === 'fulfilled' && healthRes.value.ok;
		let version: string | undefined;
		if (versionRes.status === 'fulfilled' && versionRes.value.ok) {
			const raw = (await versionRes.value.text()).trim();
			try {
				const parsed = JSON.parse(raw) as { version?: string };
				version = parsed.version?.replace(/^v/, '');
			} catch {
				version = raw.replace(/^v/, '');
			}
		}
		return json({ ok, version });
	} catch {
		return json({ ok: false });
	}
};
