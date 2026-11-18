<script lang="ts">
	import { onMount } from 'svelte';
	import { addToast } from '$lib/stores';
	import { t } from '$lib/i18n';

	// How people get into this network and what members see of each other
	// (see $lib/server/network-settings.ts).

	type Policy = 'members' | 'approval' | 'admins';
	type Directory = 'contacts' | 'network';
	interface Settings {
		invites: Policy;
		directory: Directory;
		maxActive: number;
		dailyPerMember: number;
		dailyNetwork: number;
	}
	type LimitKey = 'maxActive' | 'dailyPerMember' | 'dailyNetwork';

	let settings: Settings | null = null;
	let saved = '';
	let limits: Record<LimitKey, [number, number]> = {
		maxActive: [1, 200],
		dailyPerMember: [1, 500],
		dailyNetwork: [1, 5000]
	};
	let loading = true;
	let saving = false;
	let loadError = '';

	const POLICIES: Policy[] = ['members', 'approval', 'admins'];
	const DIRECTORIES: Directory[] = ['contacts', 'network'];
	const LIMIT_KEYS: LimitKey[] = ['maxActive', 'dailyPerMember', 'dailyNetwork'];

	$: dirty = settings !== null && JSON.stringify(settings) !== saved;

	onMount(load);

	async function call(method: string, body?: unknown) {
		const res = await fetch('/api/network-settings', {
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
			const data = await call('GET');
			settings = data.settings;
			limits = data.limits ?? limits;
			saved = JSON.stringify(settings);
		} catch (e) {
			loadError = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function save() {
		if (!settings) return;
		saving = true;
		try {
			settings = (await call('PUT', settings)).settings;
			saved = JSON.stringify(settings);
			addToast($t('network.saved'));
		} catch (e) {
			addToast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}
</script>

<div class="card bg-base-100 border border-base-200 shadow-sm">
	<div class="card-body gap-5">
		<div>
			<h2 class="font-semibold">{$t('network.title')}</h2>
			<p class="text-sm text-base-content/60 mt-1">{$t('network.desc')}</p>
		</div>
		{#if loading}
			<span class="loading loading-spinner loading-sm" aria-label={$t('common.loading')}></span>
		{:else if loadError}
			<p class="text-error text-sm">{loadError}</p>
		{:else if settings}
			<fieldset class="flex flex-col gap-2">
				<legend class="text-sm font-medium mb-2">{$t('network.invites.label')}</legend>
				{#each POLICIES as p}
					<label class="flex items-start gap-3 cursor-pointer">
						<input type="radio" class="radio radio-sm radio-primary mt-0.5" name="invite-policy" value={p} bind:group={settings.invites} />
						<span>
							<span class="text-sm">{$t(`network.invites.${p}`)}</span>
							<span class="block text-xs text-base-content/60">{$t(`network.invites.${p}.hint`)}</span>
						</span>
					</label>
				{/each}
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="text-sm font-medium mb-2">{$t('network.directory.label')}</legend>
				{#each DIRECTORIES as d}
					<label class="flex items-start gap-3 cursor-pointer">
						<input type="radio" class="radio radio-sm radio-primary mt-0.5" name="directory" value={d} bind:group={settings.directory} />
						<span>
							<span class="text-sm">{$t(`network.directory.${d}`)}</span>
							<span class="block text-xs text-base-content/60">{$t(`network.directory.${d}.hint`)}</span>
						</span>
					</label>
				{/each}
			</fieldset>

			<fieldset>
				<legend class="text-sm font-medium mb-2">{$t('network.limits.label')}</legend>
				<div class="grid sm:grid-cols-3 gap-3">
					{#each LIMIT_KEYS as k}
						<label class="form-control">
							<span class="label-text text-xs mb-1">{$t(`network.limits.${k}`)}</span>
							<input
								type="number"
								class="input input-bordered input-sm"
								min={limits[k][0]}
								max={limits[k][1]}
								step="1"
								bind:value={settings[k]}
							/>
						</label>
					{/each}
				</div>
			</fieldset>

			<div class="flex justify-end gap-2">
				<button class="btn btn-ghost btn-sm" disabled={!dirty || saving} on:click={load}>{$t('common.cancel')}</button>
				<button class="btn btn-primary btn-sm" disabled={!dirty || saving} on:click={save}>
					{#if saving}<span class="loading loading-spinner loading-xs"></span>{/if}
					{$t('network.save')}
				</button>
			</div>
		{/if}
	</div>
</div>
