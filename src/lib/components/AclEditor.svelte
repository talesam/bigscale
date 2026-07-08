<script lang="ts">
	import { get } from 'svelte/store';
	import { t } from '$lib/i18n';
	import {
		type AclAction,
		type AclPolicy,
		type AclRule,
		emptyPolicy,
		parsePolicy,
		serializePolicy,
		policyHasAdvanced,
		advancedKeys
	} from '$lib/acl';
	import ChipInput from './ChipInput.svelte';

	export let value = '';
	export let users: string[] = [];
	export let onChange: (v: string) => void = () => {};

	// Translate helper usable inside plain functions (validators/presets).
	const tr = (k: string, p?: Record<string, string | number>) => get(t)(k, p);

	type Tab = 'visual' | 'json';
	let tab: Tab = 'visual';
	let showHelp = true;

	// The "base rule": everyone reaches their own devices. Foundational — flagged
	// and protected so it isn't removed by accident.
	function isBaseRule(rule: AclRule): boolean {
		return rule.src.includes('*') && rule.dst.some((d) => d.startsWith('autogroup:self'));
	}

	let policy: AclPolicy = emptyPolicy();
	let parseError = '';
	let lastSyncedFromValue = '';

	// Stable per-rule keys so reordering/removing a rule doesn't scramble the
	// (component-local) half-typed text of the ChipInputs. They travel WITH the
	// rule through add/remove/move, and reset when the policy is loaded anew.
	let uidSeq = 0;
	let ruleKeys: number[] = [];

	$: syncFromValue(value);

	function syncFromValue(v: string) {
		if (v === lastSyncedFromValue) return;
		lastSyncedFromValue = v;
		try {
			policy = parsePolicy(v);
			ruleKeys = policy.acls.map(() => ++uidSeq);
			parseError = '';
		} catch (e: unknown) {
			parseError = e instanceof Error ? e.message : 'erro';
		}
	}

	function commit() {
		const next = serializePolicy(policy);
		lastSyncedFromValue = next;
		value = next;
		onChange(next);
	}

	// ─── Groups ─────────────────────────────────────────────────────────────────
	let newGroupName = '';
	let groupError = '';

	function addGroup() {
		const raw = newGroupName.trim();
		if (!raw) return;
		const key = raw.startsWith('group:') ? raw : `group:${raw}`;
		if (!GROUP_RE.test(key)) {
			groupError = tr('settings.acl.err.groupName');
			return;
		}
		groupError = '';
		if (policy.groups[key]) {
			newGroupName = '';
			return;
		}
		policy.groups = { ...policy.groups, [key]: [] };
		newGroupName = '';
		commit();
	}

	function removeGroup(key: string) {
		const { [key]: _omit, ...rest } = policy.groups;
		policy.groups = rest;
		commit();
	}

	function setGroupMembers(key: string, members: string[]) {
		policy.groups = { ...policy.groups, [key]: members };
		commit();
	}

	// ─── Tag owners ─────────────────────────────────────────────────────────────
	let newTagName = '';
	let tagError = '';

	function addTag() {
		const raw = newTagName.trim();
		if (!raw) return;
		const key = raw.startsWith('tag:') ? raw : `tag:${raw}`;
		if (!TAG_RE.test(key)) {
			tagError = tr('settings.acl.err.tagName');
			return;
		}
		tagError = '';
		if (policy.tagOwners[key]) {
			newTagName = '';
			return;
		}
		policy.tagOwners = { ...policy.tagOwners, [key]: [] };
		newTagName = '';
		commit();
	}

	function removeTag(key: string) {
		const { [key]: _omit, ...rest } = policy.tagOwners;
		policy.tagOwners = rest;
		commit();
	}

	function setTagOwners(key: string, owners: string[]) {
		policy.tagOwners = { ...policy.tagOwners, [key]: owners };
		commit();
	}

	// ─── ACL rules ──────────────────────────────────────────────────────────────
	function addRule() {
		policy.acls = [...policy.acls, { action: 'accept', src: [], dst: [] }];
		ruleKeys = [...ruleKeys, ++uidSeq];
		commit();
	}

	function removeRule(idx: number) {
		if (isBaseRule(policy.acls[idx]) && !confirm(tr('settings.acl.baseRuleConfirm'))) return;
		policy.acls = policy.acls.filter((_, i) => i !== idx);
		ruleKeys = ruleKeys.filter((_, i) => i !== idx);
		commit();
	}

	function updateRule(idx: number, patch: Partial<AclRule>) {
		policy.acls = policy.acls.map((r, i) => (i === idx ? { ...r, ...patch } : r));
		commit();
	}

	function moveRule(idx: number, dir: -1 | 1) {
		const j = idx + dir;
		if (j < 0 || j >= policy.acls.length) return;
		const next = [...policy.acls];
		[next[idx], next[j]] = [next[j], next[idx]];
		policy.acls = next;
		const keys = [...ruleKeys];
		[keys[idx], keys[j]] = [keys[j], keys[idx]];
		ruleKeys = keys;
		commit();
	}

	function setRuleAction(idx: number, val: string) {
		const action: AclAction = val === 'drop' ? 'drop' : 'accept';
		updateRule(idx, { action });
	}

	// ─── Quick examples (non-destructive: they append, never overwrite) ──────────
	function ensureGroup(key: string) {
		if (!policy.groups[key]) policy.groups = { ...policy.groups, [key]: [] };
	}
	function ensureTag(key: string) {
		if (!policy.tagOwners[key]) policy.tagOwners = { ...policy.tagOwners, [key]: [] };
	}
	function addRuleIfAbsent(src: string[], dst: string[]) {
		const key = JSON.stringify([src, dst]);
		if (!policy.acls.some((r) => JSON.stringify([r.src, r.dst]) === key)) {
			policy.acls = [...policy.acls, { action: 'accept', src, dst }];
			ruleKeys = [...ruleKeys, ++uidSeq];
		}
	}
	function exFamily() {
		ensureGroup('group:familia');
		addRuleIfAbsent(['group:familia'], ['group:familia:*']);
		commit();
	}
	function exAllowAll() {
		addRuleIfAbsent(['*'], ['*:*']);
		commit();
	}
	function exSupportTag() {
		ensureGroup('group:suporte');
		ensureTag('tag:suporte-acesso');
		addRuleIfAbsent(['group:suporte'], ['tag:suporte-acesso:*']);
		commit();
	}
	function exOneWay() {
		// One-way: pre-fill with two known users if available so it's concrete.
		const a = users[0] ?? '';
		const b = users[1] ?? '';
		policy.acls = [...policy.acls, { action: 'accept', src: a ? [a] : [], dst: b ? [`${b}:*`] : [] }];
		ruleKeys = [...ruleKeys, ++uidSeq];
		commit();
	}

	// Suggestions for src/dst — MUST be the forms the validators accept.
	$: srcSuggestions = [
		'*',
		...users,
		...Object.keys(policy.groups),
		...Object.keys(policy.tagOwners),
		'autogroup:member',
		'autogroup:tagged'
	];
	$: dstSuggestions = [
		'*:*',
		...users.map((u) => `${u}:*`),
		...Object.keys(policy.groups).map((g) => `${g}:*`),
		...Object.keys(policy.tagOwners).map((tg) => `${tg}:*`),
		'autogroup:self:*',
		'autogroup:internet:*'
	];
	$: memberSuggestions = users;

	// ─── Validators ─────────────────────────────────────────────────────────────
	// Headscale expects bare `username@` (trailing @, no domain). No `i` flag —
	// names are case-sensitive lowercase, so `Alice@`/`group:Eng` must fail here,
	// not only server-side.
	const USER_RE = /^[a-z0-9][a-z0-9_-]*@$/;
	const GROUP_RE = /^group:[a-z0-9][a-z0-9_-]*$/;
	const TAG_RE = /^tag:[a-z0-9][a-z0-9_-]*$/;
	const AUTOGROUP_RE = /^autogroup:(internet|self|member|members|tagged|nonroot)$/;

	function userHint(v: string): string | null {
		if (v.startsWith('@')) return tr('settings.acl.err.userLeadingAt', { v: `${v.slice(1)}@` });
		const at = v.indexOf('@');
		if (at === -1) return tr('settings.acl.err.userNoAt', { v: `${v}@` });
		if (at !== v.length - 1) return tr('settings.acl.err.userDomain', { v: `${v.slice(0, at)}@` });
		if (!USER_RE.test(v)) return tr('settings.acl.err.userChars');
		return null;
	}

	function validateGroupMember(v: string): string | null {
		return userHint(v);
	}

	function validateTagOwner(v: string): string | null {
		if (v.startsWith('group:')) return GROUP_RE.test(v) ? null : tr('settings.acl.err.groupRef');
		return userHint(v);
	}

	function validateAclRef(v: string): string | null {
		if (v === '*') return null;
		if (v.startsWith('group:')) return GROUP_RE.test(v) ? null : tr('settings.acl.err.groupRef');
		if (v.startsWith('tag:')) return TAG_RE.test(v) ? null : tr('settings.acl.err.tagRef');
		if (v.startsWith('autogroup:')) return AUTOGROUP_RE.test(v) ? null : tr('settings.acl.err.autogroup');
		return userHint(v);
	}

	function validatePort(port: string): boolean {
		return port.split(',').every((raw) => {
			const p = raw.trim();
			if (p === '*') return true;
			const m = p.match(/^(\d+)(?:-(\d+))?$/);
			if (!m) return false;
			const lo = +m[1];
			const hi = m[2] ? +m[2] : lo;
			return lo >= 1 && hi <= 65535 && lo <= hi;
		});
	}

	function validateAclDst(v: string): string | null {
		// A bare ref with no ":port" (e.g. "group:eng", "alice@", "*") — clearer message.
		if (validateAclRef(v) === null) return tr('settings.acl.err.missingPort');
		const colon = v.lastIndexOf(':');
		if (colon === -1) return tr('settings.acl.err.missingPort');
		const refErr = validateAclRef(v.slice(0, colon));
		if (refErr) return refErr;
		return validatePort(v.slice(colon + 1)) ? null : tr('settings.acl.err.port');
	}

	// ─── JSON tab ───────────────────────────────────────────────────────────────
	let jsonText = '';
	let jsonError = '';
	let jsonLoadedFrom = '';

	$: if (tab === 'json' && value !== jsonLoadedFrom) {
		jsonText = value;
		jsonLoadedFrom = value;
	}

	function applyJson() {
		try {
			const parsed = parsePolicy(jsonText);
			policy = parsed;
			ruleKeys = policy.acls.map(() => ++uidSeq);
			parseError = '';
			lastSyncedFromValue = jsonText;
			value = jsonText;
			onChange(jsonText);
			jsonError = '';
		} catch (e: unknown) {
			jsonError = e instanceof Error ? e.message : 'Invalid JSON';
		}
	}
</script>

<!-- Tabs -->
<div class="flex items-center justify-between gap-2 flex-wrap">
	<div role="tablist" class="tabs tabs-boxed bg-base-200 self-start">
		<button role="tab" type="button" class="tab {tab === 'visual' ? 'tab-active' : ''}" on:click={() => (tab = 'visual')}>
			{$t('settings.acl.tab.visual')}
		</button>
		<button role="tab" type="button" class="tab {tab === 'json' ? 'tab-active' : ''}" on:click={() => (tab = 'json')}>
			{$t('settings.acl.tab.json')}
		</button>
	</div>
	<button type="button" class="btn btn-ghost btn-xs" on:click={() => (showHelp = !showHelp)}>
		{showHelp ? '▾' : '▸'} {$t('settings.acl.help.title')}
	</button>
</div>

<!-- Help / explainer -->
{#if showHelp}
	<div class="rounded-lg bg-base-200 p-3 text-sm space-y-1.5">
		<p><span class="font-semibold">{$t('settings.acl.groups.title')}:</span> {$t('settings.acl.help.groups')}</p>
		<p><span class="font-semibold">{$t('settings.acl.tags.title')}:</span> {$t('settings.acl.help.tags')}</p>
		<p><span class="font-semibold">{$t('settings.acl.rules.title')}:</span> {$t('settings.acl.help.rules')}</p>
		<p class="text-base-content/60 text-xs pt-1">{$t('settings.acl.help.format')}</p>
		<p class="text-base-content/60 text-xs">{$t('settings.acl.help.devices')}</p>
		<div class="flex flex-wrap items-center gap-2 pt-1 text-xs">
			<span class="text-base-content/60">{$t('settings.acl.legend.title')}</span>
			<span class="badge badge-info badge-sm">{$t('settings.acl.legend.user')}</span>
			<span class="badge badge-success badge-sm">{$t('settings.acl.legend.group')}</span>
			<span class="badge badge-warning badge-sm">{$t('settings.acl.legend.tag')}</span>
			<span class="badge badge-ghost badge-sm">{$t('settings.acl.legend.special')}</span>
		</div>
	</div>
{/if}

{#if tab === 'visual'}
	{#if parseError}
		<div class="alert alert-warning text-sm">
			<span>{$t('settings.acl.parseError')}: {parseError}</span>
		</div>
	{/if}

	{#if policyHasAdvanced(policy)}
		<div class="alert alert-info text-sm">
			<span>{$t('settings.acl.advancedWarn', { keys: advancedKeys(policy).join(', ') || 'proto' })}</span>
		</div>
	{/if}

	<!-- Quick examples -->
	<div class="rounded-lg border border-base-200 p-3 space-y-2">
		<p class="text-sm font-medium">{$t('settings.acl.ex.title')}</p>
		<div class="flex flex-wrap gap-2">
			<button type="button" class="btn btn-sm btn-outline" title={$t('settings.acl.ex.familyDesc')} on:click={exFamily}>
				{$t('settings.acl.ex.family')}
			</button>
			<button type="button" class="btn btn-sm btn-outline" title={$t('settings.acl.ex.supportDesc')} on:click={exSupportTag}>
				{$t('settings.acl.ex.support')}
			</button>
			<button type="button" class="btn btn-sm btn-outline" title={$t('settings.acl.ex.onewayDesc')} on:click={exOneWay}>
				{$t('settings.acl.ex.oneway')}
			</button>
			<button type="button" class="btn btn-sm btn-outline" title={$t('settings.acl.ex.allowAllDesc')} on:click={exAllowAll}>
				{$t('settings.acl.ex.allowAll')}
			</button>
		</div>
		<p class="text-xs text-base-content/50">{$t('settings.acl.ex.hint')}</p>
	</div>

	<!-- Groups -->
	<section class="space-y-3">
		<div>
			<h3 class="font-medium text-sm">{$t('settings.acl.groups.title')}</h3>
			<p class="text-xs text-base-content/50">{$t('settings.acl.groups.hint')}</p>
		</div>

		{#each Object.entries(policy.groups) as [key, members] (key)}
			<div class="border border-base-200 rounded-lg p-3 space-y-2">
				<div class="flex items-center justify-between gap-2">
					<code class="text-sm font-semibold">{key}</code>
					<button class="btn btn-ghost btn-xs text-error" on:click={() => removeGroup(key)} type="button">
						{$t('common.remove')}
					</button>
				</div>
				<ChipInput
					values={members}
					placeholder={$t('settings.acl.groups.memberPh')}
					suggestions={memberSuggestions}
					validate={validateGroupMember}
					onChange={(next) => setGroupMembers(key, next)}
				/>
			</div>
		{/each}

		<div class="flex gap-2">
			<input
				type="text"
				class="input input-bordered input-sm flex-1"
				placeholder={$t('settings.acl.groups.newPh')}
				bind:value={newGroupName}
				on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addGroup())}
			/>
			<button class="btn btn-sm btn-outline" on:click={addGroup} type="button">
				+ {$t('settings.acl.groups.add')}
			</button>
		</div>
		{#if groupError}<p class="text-xs text-error">{groupError}</p>{/if}
	</section>

	<div class="divider my-1"></div>

	<!-- Tag owners -->
	<section class="space-y-3">
		<div>
			<h3 class="font-medium text-sm">{$t('settings.acl.tags.title')}</h3>
			<p class="text-xs text-base-content/50">{$t('settings.acl.tags.hint')}</p>
		</div>

		{#each Object.entries(policy.tagOwners) as [key, owners] (key)}
			<div class="border border-base-200 rounded-lg p-3 space-y-2">
				<div class="flex items-center justify-between gap-2">
					<code class="text-sm font-semibold">{key}</code>
					<button class="btn btn-ghost btn-xs text-error" on:click={() => removeTag(key)} type="button">
						{$t('common.remove')}
					</button>
				</div>
				<ChipInput
					values={owners}
					placeholder={$t('settings.acl.tags.ownerPh')}
					suggestions={memberSuggestions}
					validate={validateTagOwner}
					onChange={(next) => setTagOwners(key, next)}
				/>
			</div>
		{/each}

		<div class="flex gap-2">
			<input
				type="text"
				class="input input-bordered input-sm flex-1"
				placeholder={$t('settings.acl.tags.newPh')}
				bind:value={newTagName}
				on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
			/>
			<button class="btn btn-sm btn-outline" on:click={addTag} type="button">
				+ {$t('settings.acl.tags.add')}
			</button>
		</div>
		{#if tagError}<p class="text-xs text-error">{tagError}</p>{/if}
	</section>

	<div class="divider my-1"></div>

	<!-- Rules -->
	<section class="space-y-3">
		<div>
			<h3 class="font-medium text-sm">{$t('settings.acl.rules.title')}</h3>
			<p class="text-xs text-base-content/50">{$t('settings.acl.rules.hint')}</p>
		</div>

		{#each policy.acls as rule, idx (ruleKeys[idx] ?? idx)}
			<div class="border border-base-200 rounded-lg p-3 space-y-3">
				<div class="flex items-center gap-2 flex-wrap">
					<span class="text-xs text-base-content/50 font-medium">#{idx + 1}</span>
					{#if isBaseRule(rule)}
						<span class="badge badge-sm badge-outline">🔒 {$t('settings.acl.baseRule')}</span>
					{/if}
					<select
						class="select select-bordered select-sm"
						value={rule.action}
						on:change={(e) => setRuleAction(idx, e.currentTarget.value)}
					>
						<option value="accept">{$t('settings.acl.rules.accept')}</option>
						<option value="drop">{$t('settings.acl.rules.drop')}</option>
					</select>
					<span class="text-xs text-base-content/50">{$t('settings.acl.rules.that')}</span>
					<div class="ml-auto flex items-center gap-1">
						<button class="btn btn-ghost btn-xs" title={$t('settings.acl.rules.moveUp')} on:click={() => moveRule(idx, -1)} type="button" disabled={idx === 0}>↑</button>
						<button class="btn btn-ghost btn-xs" title={$t('settings.acl.rules.moveDown')} on:click={() => moveRule(idx, 1)} type="button" disabled={idx === policy.acls.length - 1}>↓</button>
						<button class="btn btn-ghost btn-xs text-error" on:click={() => removeRule(idx)} type="button">
							{$t('common.remove')}
						</button>
					</div>
				</div>

				{#if isBaseRule(rule)}
					<p class="text-xs text-base-content/50">{$t('settings.acl.baseRuleDesc')}</p>
				{/if}

				<div>
					<div class="label py-1">
						<span class="label-text text-xs font-medium">{$t('settings.acl.rules.who')}</span>
					</div>
					<ChipInput
						values={rule.src}
						placeholder={$t('settings.acl.rules.srcPh')}
						suggestions={srcSuggestions}
						validate={validateAclRef}
						onChange={(next) => updateRule(idx, { src: next })}
					/>
				</div>

				<div>
					<div class="label py-1">
						<span class="label-text text-xs font-medium">{$t('settings.acl.rules.reaches')}</span>
					</div>
					<ChipInput
						values={rule.dst}
						placeholder={$t('settings.acl.rules.dstPh')}
						suggestions={dstSuggestions}
						validate={validateAclDst}
						onChange={(next) => updateRule(idx, { dst: next })}
					/>
				</div>
			</div>
		{/each}

		<button class="btn btn-sm btn-outline" on:click={addRule} type="button">
			+ {$t('settings.acl.rules.add')}
		</button>
	</section>
{:else}
	<!-- JSON / advanced -->
	<p class="text-xs text-base-content/50">{$t('settings.acl.json.hint')}</p>
	<textarea
		class="textarea textarea-bordered font-mono text-xs leading-relaxed h-72 resize-y"
		bind:value={jsonText}
		spellcheck="false"
		placeholder={'{\n  "acls": []\n}'}
	></textarea>
	{#if jsonError}
		<p class="text-xs text-error">{jsonError}</p>
	{/if}
	<div class="flex justify-end">
		<button class="btn btn-sm btn-outline" on:click={applyJson} type="button">
			{$t('settings.acl.json.apply')}
		</button>
	</div>
{/if}
