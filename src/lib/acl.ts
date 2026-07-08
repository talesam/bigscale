// Structured ACL policy model + HuJSON-tolerant (de)serialization
// (JSON allowing // and /* */ comments and trailing commas).

export type AclAction = 'accept' | 'drop';

export interface AclRule {
	action: AclAction;
	src: string[];
	dst: string[];
	// Per-rule keys we don't model in the visual editor (e.g. "proto"). Kept
	// verbatim so a visual edit never silently strips them.
	_extra?: Record<string, unknown>;
}

export interface AclPolicy {
	groups: Record<string, string[]>;
	tagOwners: Record<string, string[]>;
	acls: AclRule[];
	// Top-level keys we don't model (hosts, ssh, autoApprovers, postures,
	// derpMap, tests, …). Preserved so editing groups/rules in the visual tab
	// doesn't wipe advanced sections of a production policy.
	_extra?: Record<string, unknown>;
}

export function emptyPolicy(): AclPolicy {
	return { groups: {}, tagOwners: {}, acls: [] };
}

function strArr(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function strArrMap(v: unknown): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	if (v && typeof v === 'object') {
		for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = strArr(val);
	}
	return out;
}

// Strip // and /* */ comments and trailing commas, leaving valid JSON.
// Does not interpret strings (preserves quoting) and ignores delimiters inside strings.
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
	const raw = JSON.parse(json) as Record<string, unknown>;

	const groups = strArrMap(raw.groups);
	const tagOwners = strArrMap(raw.tagOwners);

	const rawAcls = Array.isArray(raw.acls) ? raw.acls : [];
	const acls: AclRule[] = rawAcls.map((r) => {
		const rule = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
		const { action, src, dst, ...rest } = rule;
		const out: AclRule = {
			action: action === 'drop' ? 'drop' : 'accept',
			src: strArr(src),
			dst: strArr(dst)
		};
		if (Object.keys(rest).length) out._extra = rest;
		return out;
	});

	// Everything we don't model (hosts, ssh, autoApprovers, …) is kept verbatim.
	const { groups: _g, tagOwners: _t, acls: _a, ...extra } = raw;
	const policy: AclPolicy = { groups, tagOwners, acls };
	if (Object.keys(extra).length) policy._extra = extra;
	return policy;
}

export function serializePolicy(p: AclPolicy): string {
	const out: Record<string, unknown> = {};
	if (Object.keys(p.groups).length) out.groups = p.groups;
	if (Object.keys(p.tagOwners).length) out.tagOwners = p.tagOwners;
	// Merge back unmodeled top-level keys (hosts, ssh, autoApprovers, …) so they
	// survive a visual-tab round-trip.
	if (p._extra) for (const [k, v] of Object.entries(p._extra)) out[k] = v;
	// acls last; re-attach any per-rule extras (proto, …).
	out.acls = p.acls.map((r) => ({ action: r.action, src: r.src, dst: r.dst, ...(r._extra ?? {}) }));
	return JSON.stringify(out, null, 2);
}

/**
 * True when the policy carries sections the visual editor doesn't model
 * (hosts, ssh, autoApprovers, per-rule proto, …). The editor uses this to warn
 * that those parts are only editable in the JSON tab (they ARE preserved).
 */
export function policyHasAdvanced(p: AclPolicy): boolean {
	if (p._extra && Object.keys(p._extra).length) return true;
	return p.acls.some((r) => r._extra && Object.keys(r._extra).length);
}

/** List of the unmodeled top-level section names, for a friendly warning. */
export function advancedKeys(p: AclPolicy): string[] {
	return p._extra ? Object.keys(p._extra) : [];
}
