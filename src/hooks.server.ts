import { building } from '$app/environment';
import { ensurePanelReachable } from '$lib/server/policy-groups.js';

// On start, make sure devices can reach the panel's peer-facing API over the
// tailnet (see ensurePanelReachable). The engine may still be booting, so
// retry for a while; failures only cost the BigLace "invite" and "SSH user"
// features until the next start, never the admin panel.
const RETRY_MS = 15_000;
const MAX_TRIES = 40;

async function panelRule(attempt = 1): Promise<void> {
	try {
		if (await ensurePanelReachable()) console.log('[bigscale] policy: devices may now reach the panel API (port 3000)');
	} catch (e) {
		if (attempt >= MAX_TRIES) {
			console.error('[bigscale] policy: could not add the panel rule:', (e as Error).message);
			return;
		}
		setTimeout(() => void panelRule(attempt + 1), RETRY_MS);
	}
}

// Not while `vite build` analyses the app: no engine there, and the retry
// timer would keep the build process alive.
if (!building) void panelRule();
