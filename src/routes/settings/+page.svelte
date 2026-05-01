<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getApiKeys, createApiKey, expireApiKey } from '$lib/api';
	import { addToast, theme } from '$lib/stores';
	import { logout as apiLogout } from '$lib/api';
	import { t, locale, LOCALES, type Locale } from '$lib/i18n';
	import type { ApiKey } from '$lib/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';

	let apiKeys: ApiKey[] = [];
	let keysLoading = false;
	let newKeyExpiry = '';
	let newKeyLoading = false;
	let newKeyResult = '';
	let newKeyCopied = false;
	let expireTarget: ApiKey | null = null;
	let expireLoading = false;

	onMount(() => {
		const d = new Date();
		d.setFullYear(d.getFullYear() + 1);
		newKeyExpiry = d.toISOString().slice(0, 16);
		loadApiKeys();
	});

	async function loadApiKeys() {
		keysLoading = true;
		try { apiKeys = await getApiKeys(); }
		catch (e: unknown) { addToast(e instanceof Error ? e.message : $t('common.error'), 'error'); }
		finally { keysLoading = false; }
	}

	async function doCreateApiKey() {
		newKeyLoading = true;
		try {
			newKeyResult = await createApiKey(new Date(newKeyExpiry).toISOString());
			newKeyCopied = false;
			await loadApiKeys();
		} catch (e: unknown) { addToast(e instanceof Error ? e.message : $t('common.error'), 'error'); }
		finally { newKeyLoading = false; }
	}

	async function doExpireApiKey() {
		if (!expireTarget) return;
		expireLoading = true;
		try {
			await expireApiKey(expireTarget.prefix);
			addToast($t('settings.toast.keyExpired'));
			expireTarget = null;
			await loadApiKeys();
		} catch (e: unknown) { addToast(e instanceof Error ? e.message : $t('common.error'), 'error'); }
		finally { expireLoading = false; }
	}

	function copyNewKey() {
		navigator.clipboard.writeText(newKeyResult).then(() => {
			newKeyCopied = true;
			setTimeout(() => (newKeyCopied = false), 2000);
		});
	}

	async function logout() {
		await apiLogout();
		goto('/login');
	}

	function formatDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString($locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function isExpired(d: string) { return new Date(d).getTime() < Date.now(); }

	function setLocale(l: Locale) { $locale = l; }
</script>

<div class="max-w-2xl mx-auto space-y-6">
	<div>
		<h1 class="text-2xl font-bold">{$t('settings.title')}</h1>
		<p class="text-base-content/50 text-sm mt-0.5">{$t('settings.subtitle')}</p>
	</div>

	<!-- Aparência -->
	<div class="card bg-base-100 border border-base-200 shadow-sm">
		<div class="card-body gap-4">
			<h2 class="font-semibold">{$t('settings.appearance')}</h2>
			<div class="flex items-center gap-3 flex-wrap">
				<span class="text-sm text-base-content/70">{$t('settings.theme')}</span>
				<button class="btn btn-sm gap-2 {$theme === 'light' ? 'btn-primary' : 'btn-outline'}" on:click={() => ($theme = 'light')}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
					</svg>
					{$t('settings.themeLight')}
				</button>
				<button class="btn btn-sm gap-2 {$theme === 'dark' ? 'btn-primary' : 'btn-outline'}" on:click={() => ($theme = 'dark')}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
					</svg>
					{$t('settings.themeDark')}
				</button>
			</div>
		</div>
	</div>

	<!-- Idioma -->
	<div class="card bg-base-100 border border-base-200 shadow-sm">
		<div class="card-body gap-4">
			<div>
				<h2 class="font-semibold">{$t('settings.language')}</h2>
				<p class="text-xs text-base-content/50 mt-0.5">{$t('settings.languageHint')}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each LOCALES as l}
					<button
						class="btn btn-sm gap-2 {$locale === l.code ? 'btn-primary' : 'btn-outline'}"
						on:click={() => setLocale(l.code)}
					>
						<span class="text-base leading-none">{l.flag}</span>
						{l.label}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- API keys -->
	<div class="card bg-base-100 border border-base-200 shadow-sm">
		<div class="card-body gap-4">
			<div class="flex items-center justify-between">
				<h2 class="font-semibold">{$t('settings.apiKeys')}</h2>
				<button class="btn btn-ghost btn-xs" on:click={loadApiKeys} disabled={keysLoading}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				</button>
			</div>

			{#if keysLoading}
				<div class="flex justify-center py-4"><span class="loading loading-spinner loading-sm"></span></div>
			{:else if apiKeys.length}
				<div class="overflow-x-auto">
					<table class="table table-sm text-sm">
						<thead>
							<tr class="text-xs text-base-content/50">
								<th>{$t('settings.api.prefix')}</th><th>{$t('settings.api.expires')}</th><th>{$t('settings.api.status')}</th><th></th>
							</tr>
						</thead>
						<tbody>
							{#each apiKeys as key}
								<tr>
									<td><code class="text-xs">{key.prefix}…</code></td>
									<td class="text-xs text-base-content/60">{formatDate(key.expiration)}</td>
									<td>
										{#if isExpired(key.expiration)}
											<span class="badge badge-xs badge-ghost">{$t('settings.api.expiredTag')}</span>
										{:else}
											<span class="badge badge-xs badge-success">{$t('settings.api.active')}</span>
										{/if}
									</td>
									<td>
										{#if !isExpired(key.expiration)}
											<button class="btn btn-ghost btn-xs text-error" on:click={() => (expireTarget = key)}>{$t('common.expire')}</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			<div class="border-t border-base-200 pt-4">
				<p class="text-sm font-medium mb-3">{$t('settings.api.create')}</p>
				<div class="flex gap-2 flex-wrap items-stretch">
					<div class="flex-1 min-w-40">
						<DateTimePicker bind:value={newKeyExpiry} />
					</div>
					<button class="btn btn-primary" on:click={doCreateApiKey} disabled={newKeyLoading}>
						{#if newKeyLoading}<span class="loading loading-spinner loading-sm"></span>{/if}
						{$t('common.create')}
					</button>
				</div>
				{#if newKeyResult}
					<div class="mt-3 p-3 bg-base-200 rounded-lg">
						<p class="text-xs text-warning font-medium mb-2">{$t('settings.api.copyWarn')}</p>
						<code class="text-xs break-all font-mono">{newKeyResult}</code>
						<button class="btn btn-xs mt-2 w-full {newKeyCopied ? 'btn-success' : 'btn-ghost'}" on:click={copyNewKey}>
							{newKeyCopied ? $t('common.copied') : $t('common.copy')}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Server info -->
	<div class="card bg-base-100 border border-base-200 shadow-sm">
		<div class="card-body">
			<h2 class="font-semibold mb-2">{$t('settings.server.title')}</h2>
			<p class="text-xs text-base-content/50">
				{$t('settings.server.hint')}
			</p>
		</div>
	</div>

	<!-- Logout -->
	<div class="card bg-base-100 border border-base-200 shadow-sm">
		<div class="card-body flex-row items-center justify-between gap-4">
			<div>
				<p class="font-semibold text-sm">{$t('settings.logout.title')}</p>
				<p class="text-xs text-base-content/50">{$t('settings.logout.desc')}</p>
			</div>
			<button class="btn btn-error btn-sm flex-shrink-0" on:click={logout}>{$t('settings.logout.button')}</button>
		</div>
	</div>
</div>

<!-- Expire modal -->
{#if expireTarget}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-2">{$t('settings.api.expireConfirmTitle')}</h3>
			<p class="text-sm text-base-content/60">
				{$t('settings.api.expireConfirmText', { prefix: expireTarget.prefix })}
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" on:click={() => (expireTarget = null)} disabled={expireLoading}>{$t('common.cancel')}</button>
				<button class="btn btn-error" on:click={doExpireApiKey} disabled={expireLoading}>
					{#if expireLoading}<span class="loading loading-spinner loading-sm"></span>{/if}
					{$t('common.expire')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" on:click={() => (expireTarget = null)}></button>
	</dialog>
{/if}
