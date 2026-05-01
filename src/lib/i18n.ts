import { writable, derived, type Readable } from 'svelte/store';
import { en } from './locales/en';
import { ptBR } from './locales/pt-BR';
import { es } from './locales/es';

export type Locale = 'en' | 'pt-BR' | 'es';

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
	{ code: 'en',    label: 'English',            flag: '🇺🇸' },
	{ code: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
	{ code: 'es',    label: 'Español',            flag: '🇪🇸' },
];

const dicts: Record<Locale, Record<string, string>> = {
	'en':    en,
	'pt-BR': ptBR,
	'es':    es,
};

function detectLocale(): Locale {
	if (typeof window === 'undefined') return 'en';
	const stored = localStorage.getItem('locale') as Locale | null;
	if (stored && stored in dicts) return stored;
	const nav = navigator.language;
	if (nav.startsWith('pt')) return 'pt-BR';
	if (nav.startsWith('es')) return 'es';
	return 'en';
}

export const locale = writable<Locale>('en');

export function initLocale() {
	const detected = detectLocale();
	locale.set(detected);
	locale.subscribe((l) => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('locale', l);
			document.documentElement.lang = l;
		}
	});
}

function format(template: string, vars?: Record<string, string | number>): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export const t: Readable<(key: string, vars?: Record<string, string | number>) => string> = derived(
	locale,
	($locale) => (key: string, vars?: Record<string, string | number>) => {
		const dict = dicts[$locale] ?? dicts['en'];
		const str = dict[key] ?? dicts['en'][key] ?? key;
		return format(str, vars);
	}
);
