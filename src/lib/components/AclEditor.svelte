<script lang="ts">
	import { t } from '$lib/i18n';
	import { type AclAction, type AclPolicy, type AclRule, emptyPolicy, parsePolicy, serializePolicy } from '$lib/acl';
	import ChipInput from './ChipInput.svelte';

	export let value = '';
	export let users: string[] = [];
	export let onChange: (v: string) => void = () => {};

	type Tab = 'visual' | 'json';
	let tab: Tab = 'visual';

	let policy: AclPolicy = emptyPolicy();
	let parseError = '';
	let lastSyncedFromValue = '';

	$: syncFromValue(value);

	function syncFromValue(v: string) {
		if (v === lastSyncedFromValue) return;
		lastSyncedFromValue = v;
		try {
			policy = parsePolicy(v);
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

	function addGroup() {
		const name = newGroupName.trim();
		if (!name) return;
		const key = name.startsWith('group:') ? name : `group:${name}`;
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

	function addTag() {
		const name = newTagName.trim();
		if (!name) return;
		const key = name.startsWith('tag:') ? name : `tag:${name}`;
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
		commit();
	}

	function removeRule(idx: number) {
		policy.acls = policy.acls.filter((_, i) => i !== idx);
		commit();
	}

	function updateRule(idx: number, patch: Partial<AclRule>) {
		policy.acls = policy.acls.map((r, i) => (i === idx ? { ...r, ...patch } : r));
		commit();
	}

	function setRuleAction(idx: number, value: string) {
		const action: AclAction = value === 'drop' ? 'drop' : 'accept';
		updateRule(idx, { action });
	}

	// Sugestões para src/dst: usuários, grupos, tags, *.
	$: srcSuggestions = [
		'*',
		...users,
		...Object.keys(policy.groups),
		...Object.keys(policy.tagOwners)
	];
	$: dstSuggestions = [
		'*:*',
		...users.map((u) => `${u}:*`),
		...Object.keys(policy.groups).map((g) => `${g}:*`),
		...Object.keys(policy.tagOwners).map((tg) => `${tg}:*`)
	];
	$: groupMemberSuggestions = users;
	$: tagOwnerSuggestions = users;

	// ─── Validators ─────────────────────────────────────────────────────────────
	// Headscale expects bare `username@` (trailing @, no domain). The form
	// "@username" and "user@bigscale.net" both fail policy validation server-side
	// without a clear error in the panel, so we catch them here.
	const USER_RE = /^[a-z0-9][a-z0-9_-]*@$/i;
	const GROUP_RE = /^group:[a-z0-9][a-z0-9_-]*$/i;
	const TAG_RE = /^tag:[a-z0-9][a-z0-9_-]*$/i;
	const AUTOGROUP_RE = /^autogroup:(internet|self|members|tagged)$/i;

	function userHint(v: string): string | null {
		if (v.startsWith('@')) return `use "${v.slice(1)}@" (trailing @, not leading)`;
		const at = v.indexOf('@');
		if (at === -1) return `missing trailing @ — try "${v}@"`;
		if (at !== v.length - 1) return `drop the part after @ — try "${v.slice(0, at)}@"`;
		if (!USER_RE.test(v)) return 'invalid username (use letters, digits, _ or -)';
		return null;
	}

	function validateGroupMember(v: string): string | null {
		return userHint(v);
	}

	function validateTagOwner(v: string): string | null {
		if (v.startsWith('group:')) {
			return GROUP_RE.test(v) ? null : 'invalid group name';
		}
		return userHint(v);
	}

	function validateAclRef(v: string): string | null {
		if (v === '*') return null;
		if (v.startsWith('group:')) return GROUP_RE.test(v) ? null : 'invalid group name';
		if (v.startsWith('tag:')) return TAG_RE.test(v) ? null : 'invalid tag name';
		if (v.startsWith('autogroup:'))
			return AUTOGROUP_RE.test(v) ? null : 'unknown autogroup (internet|self|members|tagged)';
		return userHint(v);
	}

	function validateAclDst(v: string): string | null {
		// dst entries are "<ref>:<port>" — split, validate the ref, then sanity-check the port.
		const colon = v.lastIndexOf(':');
		if (colon === -1) return 'missing ":port" suffix (use ":*" for any port)';
		const ref = v.slice(0, colon);
		const port = v.slice(colon + 1);
		const refErr = validateAclRef(ref);
		if (refErr) return refErr;
		if (port === '*' || /^\d+(-\d+)?$/.test(port)) return null;
		return 'invalid port (use "*", a number, or a range like "80-90")';
	}

	// ─── JSON tab ───────────────────────────────────────────────────────────────
	let jsonText = '';
	let jsonError = '';

	$: if (tab === 'json') {
		jsonText = value;
	}

	function applyJson() {
		try {
			const parsed = parsePolicy(jsonText);
			policy = parsed;
			parseError = '';
			lastSyncedFromValue = jsonText;
			value = jsonText;
			onChange(jsonText);
			jsonError = '';
		} catch (e: unknown) {
			jsonError = e instanceof Error ? e.message : 'JSON inválido';
		}
	}
</script>

<!-- Tabs -->
<div role="tablist" class="tabs tabs-boxed bg-base-200 self-start">
	<button
		role="tab"
		type="button"
		class="tab {tab === 'visual' ? 'tab-active' : ''}"
		on:click={() => (tab = 'visual')}
	>
		{$t('settings.acl.tab.visual')}
	</button>
	<button
		role="tab"
		type="button"
		class="tab {tab === 'json' ? 'tab-active' : ''}"
		on:click={() => (tab = 'json')}
	>
		{$t('settings.acl.tab.json')}
	</button>
</div>

{#if tab === 'visual'}
	{#if parseError}
		<div class="alert alert-warning text-sm">
			<span>{$t('settings.acl.parseError')}: {parseError}</span>
		</div>
	{/if}

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
					suggestions={groupMemberSuggestions}
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
					suggestions={tagOwnerSuggestions}
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
	</section>

	<div class="divider my-1"></div>

	<!-- Rules -->
	<section class="space-y-3">
		<div>
			<h3 class="font-medium text-sm">{$t('settings.acl.rules.title')}</h3>
			<p class="text-xs text-base-content/50">{$t('settings.acl.rules.hint')}</p>
		</div>

		{#each policy.acls as rule, idx (idx)}
			<div class="border border-base-200 rounded-lg p-3 space-y-3">
				<div class="flex items-center gap-2 flex-wrap">
					<span class="text-xs text-base-content/50 font-medium">#{idx + 1}</span>
					<select
						class="select select-bordered select-sm"
						value={rule.action}
						on:change={(e) => setRuleAction(idx, e.currentTarget.value)}
					>
						<option value="accept">{$t('settings.acl.rules.accept')}</option>
						<option value="drop">{$t('settings.acl.rules.drop')}</option>
					</select>
					<button
						class="btn btn-ghost btn-xs text-error ml-auto"
						on:click={() => removeRule(idx)}
						type="button"
					>
						{$t('common.remove')}
					</button>
				</div>

				<div>
					<div class="label py-1">
						<span class="label-text text-xs font-medium">{$t('settings.acl.rules.src')}</span>
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
						<span class="label-text text-xs font-medium">{$t('settings.acl.rules.dst')}</span>
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
