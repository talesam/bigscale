import { readFileSync } from 'node:fs';

function readSecret(envValue: string | undefined, fileEnv: string | undefined): string {
	if (envValue && envValue.trim() && envValue !== 'change-me') return envValue.trim();
	if (fileEnv) {
		try {
			return readFileSync(fileEnv, 'utf-8').trim();
		} catch {
			return '';
		}
	}
	return '';
}

export const BIGSCALE_SERVER_URL = process.env.BIGSCALE_SERVER_URL || 'http://localhost:8080';
// Public URL — the one external clients use to reach the coordinator.
// In production behind a proxy/TLS, set BIGSCALE_PUBLIC_URL to the public
// domain (must match server_url in config.yaml). Falls back to BIGSCALE_SERVER_URL.
export const BIGSCALE_PUBLIC_URL = (process.env.BIGSCALE_PUBLIC_URL || process.env.BIGSCALE_SERVER_URL || 'http://localhost:8080').replace(/\/$/, '');
export const BIGSCALE_API_KEY    = readSecret(process.env.BIGSCALE_API_KEY, process.env.BIGSCALE_API_KEY_FILE);
export const ADMIN_DATA_DIR      = process.env.ADMIN_DATA_DIR      || '/data';
export const ADMIN_DEFAULT_USER  = process.env.ADMIN_USERNAME      || 'admin';
export const ADMIN_DEFAULT_PASS  = process.env.ADMIN_PASSWORD      || 'bigscale';
export const DAY_MS              = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS      = DAY_MS;
// In production behind an HTTPS reverse proxy, set COOKIE_SECURE=true.
// In dev (http://localhost), leave empty/false.
export const COOKIE_SECURE       = process.env.COOKIE_SECURE === 'true';
