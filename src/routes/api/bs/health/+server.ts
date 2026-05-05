import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { json } from '@sveltejs/kit';
import { validateSession } from '$lib/server/session.js';
import { BIGSCALE_SERVER_URL } from '$lib/server/config.js';
import type { RequestHandler } from './$types';

// Panel version, resolved once at startup. BIGSCALE_VERSION env wins (set in
// the Dockerfile so the production image carries the real release tag);
// otherwise read package.json from cwd so `npm run dev` shows a sensible value.
const PANEL_VERSION: string | undefined = (() => {
	const env = process.env.BIGSCALE_VERSION?.trim();
	if (env && env !== 'dev') return env.replace(/^v/, '');
	try {
		const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')) as { version?: string };
		return pkg.version?.replace(/^v/, '');
	} catch {
		return undefined;
	}
})();

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('bs_session');
	if (!token || !validateSession(token)) return json({ ok: false }, { status: 401 });

	if (!BIGSCALE_SERVER_URL) return json({ ok: false, panelVersion: PANEL_VERSION });

	try {
		const [healthRes, versionRes] = await Promise.allSettled([
			fetch(`${BIGSCALE_SERVER_URL}/health`),
			fetch(`${BIGSCALE_SERVER_URL}/version`)
		]);

		const ok = healthRes.status === 'fulfilled' && healthRes.value.ok;
		let engineVersion: string | undefined;
		if (versionRes.status === 'fulfilled' && versionRes.value.ok) {
			const raw = (await versionRes.value.text()).trim();
			try {
				const parsed = JSON.parse(raw) as { version?: string };
				engineVersion = parsed.version?.replace(/^v/, '');
			} catch {
				engineVersion = raw.replace(/^v/, '');
			}
		}
		return json({ ok, panelVersion: PANEL_VERSION, engineVersion });
	} catch {
		return json({ ok: false, panelVersion: PANEL_VERSION });
	}
};
