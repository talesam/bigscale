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
export const BIGSCALE_API_KEY    = readSecret(process.env.BIGSCALE_API_KEY, process.env.BIGSCALE_API_KEY_FILE);
export const ADMIN_DATA_DIR      = process.env.ADMIN_DATA_DIR      || '/data';
export const ADMIN_DEFAULT_USER  = process.env.ADMIN_USERNAME      || 'admin';
export const ADMIN_DEFAULT_PASS  = process.env.ADMIN_PASSWORD      || 'bigscale';
export const SESSION_TTL_MS      = 24 * 60 * 60 * 1000; // 24 h
// Em produção atrás de reverse proxy HTTPS, defina COOKIE_SECURE=true.
// Em dev (http://localhost), deixe vazio/false.
export const COOKIE_SECURE       = process.env.COOKIE_SECURE === 'true';
