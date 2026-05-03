// Modelo estruturado de policy ACL e (de)serialização tolerante a HuJSON
// (JSON com comentários // e /* */ e trailing commas).

export type AclAction = 'accept' | 'drop';

export interface AclRule {
	action: AclAction;
	src: string[];
	dst: string[];
}

export interface AclPolicy {
	groups: Record<string, string[]>;
	tagOwners: Record<string, string[]>;
	acls: AclRule[];
}

export function emptyPolicy(): AclPolicy {
	return { groups: {}, tagOwners: {}, acls: [] };
}

// Remove comentários (// e /* */) e trailing commas → vira JSON válido.
// Não interpreta strings (mantém aspas), e ignora delimitadores dentro de strings.
function stripHuJson(input: string): string {
	let out = '';
	let i = 0;
	const n = input.length;
	let inString = false;
	let stringQuote = '"';

	while (i < n) {
		const c = input[i];
		const next = input[i + 1];

		if (inString) {
			out += c;
			if (c === '\\' && i + 1 < n) {
				out += input[i + 1];
				i += 2;
				continue;
			}
			if (c === stringQuote) {
				inString = false;
			}
			i++;
			continue;
		}

		if (c === '"') {
			inString = true;
			stringQuote = '"';
			out += c;
			i++;
			continue;
		}

		if (c === '/' && next === '/') {
			while (i < n && input[i] !== '\n') i++;
			continue;
		}

		if (c === '/' && next === '*') {
			i += 2;
			while (i < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
			i += 2;
			continue;
		}

		out += c;
		i++;
	}

	// Trailing commas: ,] ou ,} (com whitespace entre)
	out = out.replace(/,(\s*[\]}])/g, '$1');
	return out;
}

export function parsePolicy(text: string): AclPolicy {
	const trimmed = (text ?? '').trim();
	if (!trimmed) return emptyPolicy();

	const json = stripHuJson(trimmed);
	const raw = JSON.parse(json) as Partial<{
		groups: Record<string, string[]>;
		tagOwners: Record<string, string[]>;
		acls: Array<{ action?: string; src?: string[]; dst?: string[] }>;
	}>;

	const groups: Record<string, string[]> = {};
	for (const [k, v] of Object.entries(raw.groups ?? {})) {
		groups[k] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	}

	const tagOwners: Record<string, string[]> = {};
	for (const [k, v] of Object.entries(raw.tagOwners ?? {})) {
		tagOwners[k] = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	}

	const acls: AclRule[] = (raw.acls ?? []).map((r) => ({
		action: r.action === 'drop' ? 'drop' : 'accept',
		src: Array.isArray(r.src) ? r.src.filter((x): x is string => typeof x === 'string') : [],
		dst: Array.isArray(r.dst) ? r.dst.filter((x): x is string => typeof x === 'string') : []
	}));

	return { groups, tagOwners, acls };
}

export function serializePolicy(p: AclPolicy): string {
	// Só inclui chaves não vazias para manter o JSON enxuto.
	const out: Record<string, unknown> = {};
	if (Object.keys(p.groups).length) out.groups = p.groups;
	if (Object.keys(p.tagOwners).length) out.tagOwners = p.tagOwners;
	out.acls = p.acls;
	return JSON.stringify(out, null, 2);
}

export function isPolicyEmpty(p: AclPolicy): boolean {
	return (
		Object.keys(p.groups).length === 0 &&
		Object.keys(p.tagOwners).length === 0 &&
		p.acls.length === 0
	);
}
