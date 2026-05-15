<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import {
		getDevices, getUsers, renameDevice, deleteDevice, moveDevice,
		expireDevice, setDeviceTags,
		getNodeRoutes, enableRoute, disableRoute
	} from '$lib/api';
	import { addToast } from '$lib/stores';
	import { t } from '$lib/i18n';
	import type { Device, Route, User } from '$lib/types';

	let devices: Device[] = [];
	let users: User[] = [];
	let loading = true;
	let search = '';

	// Modal state
	let modalDevice: Device | null = null;
	let modalAction: 'rename' | 'move' | 'delete' | 'tags' | 'routes' | 'expire' | null = null;
	let modalValue = '';
	let modalLoading = false;
	let modalError = '';
	let modalShowTagOwnersLink = false;
	let modalTags: string[] = [];
	let modalTagInput = '';
	let modalRoutes: Route[] = [];

	// Ticking store so "5m ago" labels keep refreshing while the page stays
	// open. Without this the timestamps freeze at first render and a user who
	// leaves the tab open for an hour sees "5m ago" forever.
	const tick = writable(0);
	let tickInterval: ReturnType<typeof setInterval> | undefined;

	$: searchLower = search.toLowerCase();
	$: filtered = devices.filter(
		(d) =>
			d.name.toLowerCase().includes(searchLower) ||
			d.givenName?.toLowerCase().includes(searchLower) ||
			d.ipAddresses?.some((ip) => ip.toLowerCase().includes(searchLower)) ||
			d.user?.name?.toLowerCase().includes(searchLower)
	);

	$: online = devices.filter((d) => d.online).length;

	// Void-reading $tick pulls the recomputation into Svelte's dependency
	// graph, so every interval bump re-renders timestamp cells.
	$: relTime = (() => {
		void $tick;
		return (dateStr: string) => relativeTime(dateStr);
	})();
	function ownerLabel(device: Device): string {
		// Headscale uses the pseudo-user `tagged-devices` to own any node
		// registered with `tag:`. That label means nothing to a human reader,
		// so when we have actual tags we show the first one (e.g. `tag:ihx-client`).
		if (device.user?.name === 'tagged-devices' && device.forcedTags?.length) {
			return device.forcedTags[0];
		}
		return device.user?.name || $t('common.dash');
	}
	function isTagged(device: Device): boolean {
		return device.user?.name === 'tagged-devices' && !!device.forcedTags?.length;
	}

	onMount(() => {
		load();
		tickInterval = setInterval(() => tick.update((n) => n + 1), 30_000);
	});

	onDestroy(() => {
		if (tickInterval) clearInterval(tickInterval);
	});

	async function load() {
		loading = true;
		try {
			[devices, users] = await Promise.all([getDevices(), getUsers()]);
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('devices.toast.loadError'), 'error');
		} finally {
			loading = false;
		}
	}

	async function openModal(device: Device, action: typeof modalAction) {
		modalDevice = device;
		modalAction = action;
		modalValue = action === 'rename' ? (device.givenName || device.name) : device.user?.id || '';
		modalTags = (device.forcedTags ?? []).map((t) => t.replace(/^tag:/, ''));
		modalTagInput = '';
		modalRoutes = [];
		modalLoading = false;
		modalError = '';
		modalShowTagOwnersLink = false;

		if (action === 'routes') {
			try {
				modalRoutes = await getNodeRoutes(device.id);
			} catch (e: unknown) {
				addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
			}
		}
	}

	function closeModal() {
		modalDevice = null;
		modalAction = null;
		modalValue = '';
		modalTags = [];
		modalTagInput = '';
		modalRoutes = [];
		modalError = '';
		modalShowTagOwnersLink = false;
	}

	function addTagFromInput() {
		const v = modalTagInput.trim().replace(/^tag:/, '');
		if (v && !modalTags.includes(v)) modalTags = [...modalTags, v];
		modalTagInput = '';
	}

	function removeTag(t: string) {
		modalTags = modalTags.filter((x) => x !== t);
	}

	async function toggleRoute(route: Route) {
		try {
			if (route.enabled) await disableRoute(route.id);
			else await enableRoute(route.id);
			if (modalDevice) modalRoutes = await getNodeRoutes(modalDevice.id);
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		}
	}

	async function confirmModal() {
		if (!modalDevice) return;
		modalLoading = true;
		modalError = '';
		modalShowTagOwnersLink = false;
		try {
			if (modalAction === 'rename') {
				await renameDevice(modalDevice.id, modalValue.trim());
				addToast($t('devices.toast.renamed'));
			} else if (modalAction === 'move') {
				await moveDevice(modalDevice.id, modalValue);
				addToast($t('devices.toast.moved'));
			} else if (modalAction === 'delete') {
				await deleteDevice(modalDevice.id);
				addToast($t('devices.toast.removed'));
			} else if (modalAction === 'tags') {
				// Flush pending input so users who type a tag and click "Save" without
				// hitting Enter / Add still get their tag persisted instead of an
				// empty-tags request that headscale rejects.
				if (modalTagInput.trim()) addTagFromInput();
				await setDeviceTags(modalDevice.id, modalTags.map((t) => `tag:${t}`));
				addToast($t('devices.toast.tagsSaved'));
			} else if (modalAction === 'expire') {
				await expireDevice(modalDevice.id);
				addToast($t('devices.toast.expired'));
			}
			await load();
			closeModal();
		} catch (e: unknown) {
			const raw = e instanceof Error ? e.message : '';
			// Headscale rejects emptying tags on a node that was registered tagged.
			// Surface the error inline (toast gets clipped) plus a friendly hint.
			if (modalAction === 'tags' && /cannot remove all tags/i.test(raw)) {
				modalError = $t('devices.modal.tagsCannotEmpty');
			} else if (modalAction === 'tags' && /invalid or not permitted/i.test(raw)) {
				// Engine rejects tags that aren't declared in the ACL policy under
				// `tagOwners`. Extract the offending tag name so the message can name
				// it, and direct the user to Settings → Tag owners.
				const m = raw.match(/tag:([^\]\s,]+)/i);
				const tag = m ? m[1] : '';
				modalError = $t('devices.modal.tagsNotPermitted', { tag });
				modalShowTagOwnersLink = true;
			} else {
				modalError = raw || $t('common.error');
			}
			addToast(modalError, 'error');
		} finally {
			modalLoading = false;
		}
	}

	function relativeTime(dateStr: string): string {
		if (!dateStr) return $t('common.dash');
		const diff = Date.now() - new Date(dateStr).getTime();
		const m = Math.floor(diff / 60000);
		if (m < 1) return $t('time.now');
		if (m < 60) return $t('time.minutesAgo', { n: m });
		const h = Math.floor(m / 60);
		if (h < 24) return $t('time.hoursAgo', { n: h });
		return $t('time.daysAgo', { n: Math.floor(h / 24) });
	}
</script>

<div class="max-w-5xl mx-auto space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-base-content">{$t('devices.title')}</h1>
			<p class="text-base-content/50 text-sm mt-0.5">
				{#if !loading}{$t('devices.summary', { online, total: devices.length })}{/if}
			</p>
		</div>
		<button class="btn btn-primary btn-sm gap-2" on:click={load} disabled={loading}>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
			{$t('common.refresh')}
		</button>
	</div>

	<!-- Search -->
	<label class="input input-bordered flex items-center gap-2 w-full max-w-sm">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
		</svg>
		<input type="text" placeholder={$t('devices.searchPlaceholder')} class="grow bg-transparent outline-none text-sm" bind:value={search} />
	</label>

	<!-- Table / Cards -->
	{#if loading}
		<div class="overflow-x-auto rounded-xl border border-base-200 bg-base-100 hidden md:block" aria-busy="true" aria-label={$t('common.loading')}>
			<table class="table w-full text-sm">
				<thead>
					<tr class="text-xs text-base-content/50 uppercase tracking-wide">
						<th>{$t('devices.col.status')}</th>
						<th>{$t('devices.col.name')}</th>
						<th>{$t('devices.col.ip')}</th>
						<th>{$t('devices.col.user')}</th>
						<th>{$t('devices.col.lastSeen')}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each Array(5) as _}
						<tr>
							<td><span class="skeleton h-3 w-16 inline-block"></span></td>
							<td><span class="skeleton h-3 w-32 inline-block"></span></td>
							<td><span class="skeleton h-3 w-24 inline-block"></span></td>
							<td><span class="skeleton h-3 w-20 inline-block"></span></td>
							<td><span class="skeleton h-3 w-16 inline-block"></span></td>
							<td></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="flex flex-col gap-3 md:hidden" aria-busy="true" aria-label={$t('common.loading')}>
			{#each Array(3) as _}
				<div class="card bg-base-100 border border-base-200 shadow-sm">
					<div class="card-body p-4 gap-3">
						<span class="skeleton h-4 w-40"></span>
						<span class="skeleton h-3 w-24"></span>
						<span class="skeleton h-3 w-full"></span>
					</div>
				</div>
			{/each}
		</div>
	{:else if filtered.length === 0}
		<div class="text-center py-16 text-base-content/40">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
			</svg>
			<p>{$t('devices.empty')}</p>
		</div>
	{:else}
		<!-- Desktop table -->
		<div class="overflow-x-auto rounded-xl border border-base-200 bg-base-100 hidden md:block">
			<table class="table table-zebra w-full text-sm">
				<thead>
					<tr class="text-xs text-base-content/50 uppercase tracking-wide">
						<th>{$t('devices.col.status')}</th>
						<th>{$t('devices.col.name')}</th>
						<th>{$t('devices.col.ip')}</th>
						<th>{$t('devices.col.user')}</th>
						<th>{$t('devices.col.lastSeen')}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as device}
						<tr class="hover">
							<td>
								<div class="flex items-center gap-2" role="status" aria-live="polite">
									<span class="w-2 h-2 rounded-full inline-block {device.online ? 'bg-success' : 'bg-base-300'}"></span>
									<span class="text-xs {device.online ? 'text-success' : 'text-base-content/40'}">
										{device.online ? $t('devices.online') : $t('devices.offline')}
									</span>
								</div>
							</td>
							<td>
								<span class="font-medium">{device.givenName || device.name}</span>
								{#if device.givenName && device.givenName !== device.name}
									<span class="text-xs text-base-content/40 block">{device.name}</span>
								{/if}
							</td>
							<td>
								{#if device.ipAddresses?.length}
									<code class="text-xs bg-base-200 px-1.5 py-0.5 rounded">{device.ipAddresses[0]}</code>
								{:else}{$t('common.dash')}{/if}
							</td>
							<td class="text-base-content/70">
								<div class="flex items-center gap-2">
									<span>{ownerLabel(device)}</span>
									{#if isTagged(device)}
										<span class="badge badge-xs badge-ghost">{$t('devices.tagged')}</span>
									{/if}
								</div>
							</td>
							<td class="text-base-content/50 text-xs">{relTime(device.lastSeen)}</td>
							<td>
								<div class="flex gap-1 justify-end">
									<button class="btn btn-ghost btn-xs" title={$t('devices.action.rename')} on:click={() => openModal(device, 'rename')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
										</svg>
									</button>
									<button class="btn btn-ghost btn-xs" title={$t('devices.action.move')} on:click={() => openModal(device, 'move')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
										</svg>
									</button>
									<button class="btn btn-ghost btn-xs" title={$t('devices.action.tags')} on:click={() => openModal(device, 'tags')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
										</svg>
									</button>
									<button class="btn btn-ghost btn-xs" title={$t('devices.action.routes')} on:click={() => openModal(device, 'routes')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
										</svg>
									</button>
									<button class="btn btn-ghost btn-xs text-warning" title={$t('devices.action.expire')} on:click={() => openModal(device, 'expire')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
									</button>
									<button class="btn btn-ghost btn-xs text-error" title={$t('devices.action.remove')} on:click={() => openModal(device, 'delete')}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Mobile cards -->
		<div class="flex flex-col gap-3 md:hidden">
			{#each filtered as device}
				<div class="card bg-base-100 border border-base-200 shadow-sm">
					<div class="card-body p-4 gap-3">
						<div class="flex items-start justify-between">
							<div>
								<div class="flex items-center gap-2" role="status" aria-live="polite">
									<span class="w-2 h-2 rounded-full {device.online ? 'bg-success' : 'bg-base-300'}"></span>
									<span class="font-semibold">{device.givenName || device.name}</span>
								</div>
								{#if device.ipAddresses?.length}
									<code class="text-xs text-base-content/60 mt-1 block">{device.ipAddresses[0]}</code>
								{/if}
							</div>
							<span class="badge badge-sm {device.online ? 'badge-success' : 'badge-ghost'}">
								{device.online ? $t('devices.online') : $t('devices.offline')}
							</span>
						</div>
						<div class="text-sm text-base-content/50 flex justify-between items-center">
							<span class="flex items-center gap-2">
								<span>{ownerLabel(device)}</span>
								{#if isTagged(device)}
									<span class="badge badge-xs badge-ghost">{$t('devices.tagged')}</span>
								{/if}
							</span>
							<span>{relTime(device.lastSeen)}</span>
						</div>
						<div class="flex flex-wrap gap-2 justify-end">
							<button class="btn btn-ghost btn-xs" on:click={() => openModal(device, 'rename')}>{$t('devices.action.rename')}</button>
							<button class="btn btn-ghost btn-xs" on:click={() => openModal(device, 'move')}>{$t('devices.action.move')}</button>
							<button class="btn btn-ghost btn-xs" on:click={() => openModal(device, 'tags')}>{$t('devices.action.tags')}</button>
							<button class="btn btn-ghost btn-xs" on:click={() => openModal(device, 'routes')}>{$t('devices.action.routes')}</button>
							<button class="btn btn-ghost btn-xs text-warning" on:click={() => openModal(device, 'expire')}>{$t('devices.action.expire')}</button>
							<button class="btn btn-ghost btn-xs text-error" on:click={() => openModal(device, 'delete')}>{$t('devices.action.remove')}</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Modal -->
{#if modalDevice && modalAction}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			{#if modalAction === 'rename'}
				<h3 class="font-bold text-lg mb-4">{$t('devices.modal.renameTitle')}</h3>
				<input
					type="text"
					class="input input-bordered w-full"
					placeholder={$t('devices.modal.renamePlaceholder')}
					bind:value={modalValue}
				/>
			{:else if modalAction === 'move'}
				<h3 class="font-bold text-lg mb-4">{$t('devices.modal.moveTitle')}</h3>
				<select class="select select-bordered w-full" bind:value={modalValue}>
					{#each users as u}
						<option value={u.id}>{u.name}</option>
					{/each}
				</select>
			{:else if modalAction === 'delete'}
				<h3 class="font-bold text-lg mb-2">{$t('devices.modal.deleteTitle')}</h3>
				<p class="text-base-content/60 text-sm mb-4">
					{@html $t('devices.modal.deleteWarning', { name: `<strong>${modalDevice.givenName || modalDevice.name}</strong>` })}
				</p>
			{:else if modalAction === 'expire'}
				<h3 class="font-bold text-lg mb-2">{$t('devices.modal.expireTitle')}</h3>
				<p class="text-base-content/60 text-sm mb-4">
					{@html $t('devices.modal.expireWarning', { name: `<strong>${modalDevice.givenName || modalDevice.name}</strong>` })}
				</p>
			{:else if modalAction === 'tags'}
				<h3 class="font-bold text-lg mb-2">{$t('devices.modal.tagsTitle')}</h3>
				<p class="text-xs text-base-content/50 mb-3">{$t('devices.modal.tagsHint')}</p>
				{#if modalError}
					<div class="alert alert-error text-xs py-2 mb-3 flex-col items-start gap-2">
						<span>{modalError}</span>
						<div class="flex gap-2">
							{#if modalShowTagOwnersLink}
								<a href="/settings#acl" class="btn btn-xs btn-error btn-outline">
									{$t('devices.modal.tagsOpenSettings')}
								</a>
							{/if}
							<button type="button" class="btn btn-xs btn-error btn-outline" on:click={confirmModal} disabled={modalLoading}>
								{$t('devices.action.retry')}
							</button>
						</div>
					</div>
				{/if}
				<div class="flex flex-wrap gap-1.5 mb-3 min-h-8">
					{#each modalTags as tag}
						<span class="badge badge-primary badge-sm gap-1">
							tag:{tag}
							<button type="button" class="text-primary-content/80 hover:text-primary-content" on:click={() => removeTag(tag)}>×</button>
						</span>
					{/each}
				</div>
				<div class="flex gap-2">
					<input
						type="text"
						class="input input-bordered input-sm flex-1"
						placeholder={$t('devices.modal.tagsPlaceholder')}
						bind:value={modalTagInput}
						on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTagFromInput(); } }}
					/>
					<button type="button" class="btn btn-sm" on:click={addTagFromInput}>{$t('common.add')}</button>
				</div>
			{:else if modalAction === 'routes'}
				<h3 class="font-bold text-lg mb-2">{$t('devices.modal.routesTitle')}</h3>
				<p class="text-xs text-base-content/50 mb-3">{$t('devices.modal.routesHint')}</p>
				{#if modalRoutes.length === 0}
					<p class="text-sm text-base-content/40 py-4 text-center">{$t('devices.modal.routesEmpty')}</p>
				{:else}
					<div class="space-y-2">
						{#each modalRoutes as route}
							<div class="flex items-center justify-between p-2 bg-base-200 rounded">
								<div>
									<code class="text-xs">{route.prefix}</code>
									{#if route.isPrimary}
										<span class="badge badge-xs badge-info ml-2">primary</span>
									{/if}
								</div>
								<input
									type="checkbox"
									class="toggle toggle-sm toggle-success"
									checked={route.enabled}
									on:change={() => toggleRoute(route)}
								/>
							</div>
						{/each}
					</div>
				{/if}
			{/if}

			<div class="modal-action mt-6">
				<button class="btn btn-ghost" on:click={closeModal} disabled={modalLoading}>{$t('common.cancel')}</button>
				{#if modalAction !== 'routes'}
					<button
						class="btn {modalAction === 'delete' || modalAction === 'expire' ? (modalAction === 'expire' ? 'btn-warning' : 'btn-error') : 'btn-primary'}"
						on:click={confirmModal}
						disabled={modalLoading}
					>
						{#if modalLoading}<span class="loading loading-spinner loading-sm"></span>{/if}
						{modalAction === 'delete'
							? $t('common.remove')
							: modalAction === 'expire'
							? $t('devices.action.expire')
							: $t('common.save')}
					</button>
				{:else}
					<button class="btn btn-primary" on:click={closeModal}>{$t('common.done')}</button>
				{/if}
			</div>
		</div>
		<button class="modal-backdrop" on:click={closeModal}></button>
	</dialog>
{/if}
