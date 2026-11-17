<script lang="ts">
	import { onMount } from 'svelte';
	import { addToast } from '$lib/stores';
	import { t } from '$lib/i18n';

	// Who else administers the network: members of the policy group `admins`
	// open this panel from BigLace (menu → "Open admin panel"), each signed
	// in as themselves. The built-in admin account keeps working.

	let admins: string[] = [];
	let users: string[] = [];
	let loading = true;
	let saving = false;
	let pick = '';
	let loadError = '';

	$: candidates = users.filter((u) => !admins.includes(u));

	onMount(load);

	async function call(method: string, body?: unknown) {
		const res = await fetch('/api/admins', {
			method,
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
		return data;
	}

	async function load() {
		loading = true;
		loadError = '';
		try {
			({ admins, users } = await call('GET'));
		} catch (e) {
			loadError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function save(next: string[]) {
		saving = true;
		try {
			({ admins } = await call('PUT', { admins: next }));
			addToast($t('admins.saved'));
		} catch (e) {
			const code = (e as Error).message;
			addToast(code === 'open_network' ? $t('admins.openNetwork') : code, 'error');
		} finally {
			saving = false;
		}
	}
</script>

<div class="card bg-base-100 border border-base-200 shadow-sm">
	<div class="card-body gap-4">
		<div>
			<h2 class="font-semibold">{$t('admins.title')}</h2>
			<p class="text-sm text-base-content/60 mt-1">{$t('admins.desc')}</p>
		</div>
		{#if loading}
			<span class="loading loading-spinner loading-sm" aria-label={$t('common.loading')}></span>
		{:else if loadError}
			<p class="text-error text-sm">{loadError}</p>
		{:else}
			{#if admins.length}
				<ul class="flex flex-wrap gap-2" aria-label={$t('admins.title')}>
					{#each admins as a}
						<li class="badge badge-lg gap-2 pr-1">
							{a}
							<button
								class="btn btn-ghost btn-xs btn-circle"
								aria-label={$t('admins.remove', { name: a })}
								title={$t('admins.remove', { name: a })}
								disabled={saving}
								on:click={() => save(admins.filter((x) => x !== a))}>✕</button
							>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-base-content/60">{$t('admins.none')}</p>
			{/if}
			<div class="flex gap-2 items-center">
				<label class="sr-only" for="admin-pick">{$t('admins.add')}</label>
				<select id="admin-pick" class="select select-bordered select-sm" bind:value={pick} disabled={saving || !candidates.length}>
					<option value="" disabled selected>{$t('admins.choose')}</option>
					{#each candidates as u}
						<option value={u}>{u}</option>
					{/each}
				</select>
				<button class="btn btn-primary btn-sm" disabled={!pick || saving} on:click={() => { save([...admins, pick]); pick = ''; }}>
					{$t('admins.add')}
				</button>
			</div>
		{/if}
	</div>
</div>
