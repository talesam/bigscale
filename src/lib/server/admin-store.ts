import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ADMIN_DATA_DIR, ADMIN_DEFAULT_USER, ADMIN_DEFAULT_PASS } from './config.js';

interface AdminRecord {
	username: string;
	passwordHash: string;       // formato: scrypt$N$r$p$saltHex$hashHex
	passwordChanged: boolean;   // false enquanto o usuário não trocou a senha default
	updatedAt: string;
}

const ADMIN_FILE = join(ADMIN_DATA_DIR, 'admin.json');
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

function hashPassword(plain: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(plain, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
	return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyHash(plain: string, stored: string): boolean {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
	const N = parseInt(parts[1], 10);
	const r = parseInt(parts[2], 10);
	const p = parseInt(parts[3], 10);
	const salt = Buffer.from(parts[4], 'hex');
	const expected = Buffer.from(parts[5], 'hex');
	const actual = scryptSync(plain, salt, expected.length, { N, r, p });
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function ensureFile(): AdminRecord {
	if (!existsSync(ADMIN_FILE)) {
		mkdirSync(dirname(ADMIN_FILE), { recursive: true });
		const seed: AdminRecord = {
			username: ADMIN_DEFAULT_USER,
			passwordHash: hashPassword(ADMIN_DEFAULT_PASS),
			passwordChanged: false,
			updatedAt: new Date().toISOString()
		};
		writeFileSync(ADMIN_FILE, JSON.stringify(seed, null, 2), { mode: 0o600 });
		return seed;
	}
	return JSON.parse(readFileSync(ADMIN_FILE, 'utf-8')) as AdminRecord;
}

function save(rec: AdminRecord): void {
	writeFileSync(ADMIN_FILE, JSON.stringify(rec, null, 2), { mode: 0o600 });
}

export function verifyAdmin(username: string, password: string): { ok: boolean; mustChangePassword: boolean } {
	const rec = ensureFile();
	if (username !== rec.username) return { ok: false, mustChangePassword: false };
	if (!verifyHash(password, rec.passwordHash)) return { ok: false, mustChangePassword: false };
	return { ok: true, mustChangePassword: !rec.passwordChanged };
}

export function getAdminState(): { username: string; mustChangePassword: boolean } {
	const rec = ensureFile();
	return { username: rec.username, mustChangePassword: !rec.passwordChanged };
}

export function changeAdminPassword(newPassword: string): { ok: boolean; error?: string } {
	const rec = ensureFile();
	if (!newPassword || newPassword.length < 8) {
		return { ok: false, error: 'A nova senha precisa ter pelo menos 8 caracteres' };
	}
	const updated: AdminRecord = {
		username: rec.username,
		passwordHash: hashPassword(newPassword),
		passwordChanged: true,
		updatedAt: new Date().toISOString()
	};
	save(updated);
	return { ok: true };
}
