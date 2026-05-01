<script lang="ts">
	import { onMount } from 'svelte';
	import { getUsers, createUser, renameUser, deleteUser, getPreAuthKeys, createPreAuthKey, expirePreAuthKey } from '$lib/api';
	import { addToast } from '$lib/stores';
	import { t, locale } from '$lib/i18n';
	import type { User, PreAuthKey } from '$lib/types';
	import DateTimePicker from '$lib/components/DateTimePicker.svelte';

	let users: User[] = [];
	let loading = true;
	let search = '';

	let keysMap: Record<string, PreAuthKey[]> = {};
	let keysLoading: Record<string, boolean> = {};
	let expandedUsers: Set<string> = new Set();

	let showCreateUser = false;
	let newUserName = '';
	let createUserLoading = false;

	let renameTarget: User | null = null;
	let renameValue = '';
	let renameLoading = false;

	let deleteTarget: User | null = null;
	let deleteLoading = false;

	let keyUser: User | null = null;
	let keyExpiry = '';
	let keyReusable = false;
	let keyEphemeral = false;
	let keyLoading = false;

	let revealedKey = '';
	let revealedKeyCopied = false;

	let hideInactive = true;

	$: filtered = users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()));
	$: countLabel = users.length === 1 ? $t('users.count.one', { n: users.length }) : $t('users.count.many', { n: users.length });

	onMount(load);

	async function load() {
		loading = true;
		try {
			users = await getUsers();
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('users.toast.loadError'), 'error');
		} finally {
			loading = false;
		}
	}

	async function toggleExpand(user: User) {
		if (expandedUsers.has(user.id)) {
			expandedUsers.delete(user.id);
			expandedUsers = new Set(expandedUsers);
		} else {
			expandedUsers.add(user.id);
			expandedUsers = new Set(expandedUsers);
			await loadKeys(user);
		}
	}

	async function loadKeys(user: User) {
		keysLoading = { ...keysLoading, [user.id]: true };
		try {
			keysMap = { ...keysMap, [user.id]: await getPreAuthKeys(user.id) };
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('users.toast.keysLoadError'), 'error');
		} finally {
			keysLoading = { ...keysLoading, [user.id]: false };
		}
	}

	async function doCreateUser() {
		if (!newUserName.trim()) return;
		createUserLoading = true;
		try {
			await createUser(newUserName.trim());
			addToast($t('users.toast.created'));
			newUserName = '';
			showCreateUser = false;
			await load();
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		} finally {
			createUserLoading = false;
		}
	}

	async function doRenameUser() {
		if (!renameTarget || !renameValue.trim()) return;
		renameLoading = true;
		try {
			await renameUser(renameTarget.id, renameValue.trim());
			addToast($t('users.toast.renamed'));
			renameTarget = null;
			await load();
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		} finally {
			renameLoading = false;
		}
	}

	async function doDeleteUser() {
		if (!deleteTarget) return;
		deleteLoading = true;
		try {
			await deleteUser(deleteTarget.id);
			addToast($t('users.toast.removed'));
			deleteTarget = null;
			await load();
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		} finally {
			deleteLoading = false;
		}
	}

	function openKeyModal(user: User) {
		keyUser = user;
		const d = new Date();
		d.setDate(d.getDate() + 30);
		keyExpiry = d.toISOString().slice(0, 16);
		keyReusable = false;
		keyEphemeral = false;
	}

	async function doCreateKey() {
		if (!keyUser) return;
		keyLoading = true;
		const uid = keyUser.id;
		try {
			const fullKey = await createPreAuthKey(uid, new Date(keyExpiry).toISOString(), keyReusable, keyEphemeral);
			revealedKey = fullKey;
			revealedKeyCopied = false;
			keyUser = null;
			if (expandedUsers.has(uid)) loadKeys({ id: uid } as User);
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('users.toast.keyCreateError'), 'error');
		} finally {
			keyLoading = false;
		}
	}

	async function doExpireKey(user: User, key: PreAuthKey) {
		try {
			await expirePreAuthKey(key.id);
			addToast($t('users.toast.keyExpired'));
			await loadKeys(user);
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		}
	}

	function copyRevealedKey() {
		navigator.clipboard.writeText(revealedKey).then(() => {
			revealedKeyCopied = true;
			setTimeout(() => (revealedKeyCopied = false), 2000);
		});
	}

	function isActive(key: PreAuthKey) {
		return new Date(key.expiration).getTime() > Date.now() && (!key.used || key.reusable);
	}

	function formatDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString($locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="max-w-4xl mx-auto space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold text-base-content">{$t('users.title')}</h1>
			<p class="text-base-content/50 text-sm mt-0.5">{countLabel}</p>
		</div>
		<div class="flex gap-2">
			<button class="btn btn-ghost btn-sm gap-2" on:click={load} disabled={loading}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
				</svg>
				{$t('common.refresh')}
			</button>
			<button class="btn btn-primary btn-sm gap-2" on:click={() => (showCreateUser = true)}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				{$t('users.newUser')}
			</button>
		</div>
	</div>

	<!-- Search -->
	<label class="input input-bordered flex items-center gap-2 w-full max-w-sm">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
		</svg>
		<input type="text" placeholder={$t('users.searchPlaceholder')} class="grow bg-transparent outline-none text-sm" bind:value={search} />
	</label>

	{#if loading}
		<div class="flex justify-center py-16">
			<span class="loading loading-spinner loading-md text-primary"></span>
		</div>
	{:else if filtered.length === 0}
		<div class="text-center py-16 text-base-content/40">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
			</svg>
			<p>{$t('users.empty')}</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each filtered as user}
				<div class="card bg-base-100 border border-base-200 shadow-sm">
					<div class="card-body p-4">
						<div class="flex items-center gap-3">
							<div class="avatar placeholder">
								<div class="bg-primary text-primary-content rounded-full w-10">
									<span class="text-sm font-bold uppercase">{user.name[0]}</span>
								</div>
							</div>
							<div class="flex-1 min-w-0">
								<p class="font-semibold truncate">{user.name}</p>
								{#if user.email}
									<p class="text-xs text-base-content/50 truncate">{user.email}</p>
								{/if}
							</div>
							<div class="flex gap-1 flex-shrink-0">
								<button class="btn btn-ghost btn-xs gap-1" title={$t('users.newKey')} on:click={() => openKeyModal(user)}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
									</svg>
									<span class="hidden sm:inline">{$t('users.newKey')}</span>
								</button>
								<button class="btn btn-ghost btn-xs" title={$t('common.rename')} on:click={() => { renameTarget = user; renameValue = user.name; }}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
									</svg>
								</button>
								<button class="btn btn-ghost btn-xs text-error" title={$t('common.remove')} on:click={() => (deleteTarget = user)}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
								<button class="btn btn-ghost btn-xs" title={$t('users.keysSection')} on:click={() => toggleExpand(user)}>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform {expandedUsers.has(user.id) ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
									</svg>
								</button>
							</div>
						</div>

						{#if expandedUsers.has(user.id)}
							<div class="mt-4 border-t border-base-200 pt-4">
								<div class="flex items-center justify-between mb-3">
									<h4 class="text-sm font-semibold">{$t('users.keysSection')}</h4>
									<label class="flex items-center gap-2 text-xs text-base-content/60 cursor-pointer">
										<input type="checkbox" class="toggle toggle-xs" bind:checked={hideInactive} />
										{$t('users.hideInactive')}
									</label>
								</div>

								{#if keysLoading[user.id]}
									<div class="flex justify-center py-4">
										<span class="loading loading-spinner loading-sm"></span>
									</div>
								{:else if !keysMap[user.id]?.length}
									<p class="text-sm text-base-content/40 text-center py-4">{$t('users.noKeys')}</p>
								{:else}
									<div class="flex flex-col gap-2">
										{#each keysMap[user.id] as key}
											{@const active = isActive(key)}
											{#if !hideInactive || active}
												<div class="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg bg-base-200 text-xs">
													<div class="flex-1 min-w-0">
														<code class="break-all font-mono text-base-content/80">{key.key}</code>
														<div class="flex flex-wrap gap-1 mt-1.5">
															{#if active}
																<span class="badge badge-success badge-xs">{$t('users.key.active')}</span>
															{:else}
																<span class="badge badge-ghost badge-xs">{$t('users.key.inactive')}</span>
															{/if}
															{#if key.reusable}<span class="badge badge-info badge-xs">{$t('users.key.reusableTag')}</span>{/if}
															{#if key.ephemeral}<span class="badge badge-warning badge-xs">{$t('users.key.ephemeralTag')}</span>{/if}
															{#if key.used}<span class="badge badge-ghost badge-xs">{$t('users.key.used')}</span>{/if}
															<span class="text-base-content/40">{$t('users.key.expires', { date: formatDate(key.expiration) })}</span>
														</div>
													</div>
													{#if active}
														<button
															class="btn btn-ghost btn-xs text-error flex-shrink-0"
															title={$t('users.key.expire')}
															on:click={() => doExpireKey(user, key)}
														>
															<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
															</svg>
															{$t('common.expire')}
														</button>
													{/if}
												</div>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Create user modal -->
{#if showCreateUser}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">{$t('users.newUser')}</h3>
			<input
				type="text"
				class="input input-bordered w-full"
				placeholder={$t('users.newUserPlaceholder')}
				bind:value={newUserName}
			/>
			<div class="modal-action">
				<button class="btn btn-ghost" on:click={() => (showCreateUser = false)} disabled={createUserLoading}>{$t('common.cancel')}</button>
				<button class="btn btn-primary" on:click={doCreateUser} disabled={createUserLoading || !newUserName.trim()}>
					{#if createUserLoading}<span class="loading loading-spinner loading-sm"></span>{/if}
					{$t('common.create')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" on:click={() => (showCreateUser = false)}></button>
	</dialog>
{/if}

<!-- Rename user modal -->
{#if renameTarget}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">{$t('users.modal.renameTitle')}</h3>
			<input type="text" class="input input-bordered w-full" bind:value={renameValue} />
			<div class="modal-action">
				<button class="btn btn-ghost" on:click={() => (renameTarget = null)} disabled={renameLoading}>{$t('common.cancel')}</button>
				<button class="btn btn-primary" on:click={doRenameUser} disabled={renameLoading}>
					{#if renameLoading}<span class="loading loading-spinner loading-sm"></span>{/if}
					{$t('common.save')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" on:click={() => (renameTarget = null)}></button>
	</dialog>
{/if}

<!-- Delete user modal -->
{#if deleteTarget}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-2">{$t('users.modal.deleteTitle')}</h3>
			<p class="text-base-content/60 text-sm">
				{@html $t('users.modal.deleteWarning', { name: `<strong>${deleteTarget.name}</strong>` })}
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" on:click={() => (deleteTarget = null)} disabled={deleteLoading}>{$t('common.cancel')}</button>
				<button class="btn btn-error" on:click={doDeleteUser} disabled={deleteLoading}>
					{#if deleteLoading}<span class="loading loading-spinner loading-sm"></span>{/if}
					{$t('common.remove')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" on:click={() => (deleteTarget = null)}></button>
	</dialog>
{/if}

<!-- New key modal -->
{#if keyUser}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">{$t('users.key.title')} — <span class="text-primary">{keyUser.name}</span></h3>

			<div class="flex flex-col gap-4">
				<div class="form-control">
					<div class="label"><span class="label-text">{$t('users.key.validity')}</span></div>
					<DateTimePicker bind:value={keyExpiry} />
				</div>

				<div class="flex gap-6">
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" class="checkbox checkbox-sm" bind:checked={keyReusable} />
						<span class="text-sm">{$t('users.key.reusable')}</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input type="checkbox" class="checkbox checkbox-sm" bind:checked={keyEphemeral} />
						<span class="text-sm">{$t('users.key.ephemeral')}</span>
					</label>
				</div>
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" on:click={() => (keyUser = null)} disabled={keyLoading}>{$t('common.cancel')}</button>
				<button class="btn btn-primary" on:click={doCreateKey} disabled={keyLoading}>
					{#if keyLoading}<span class="loading loading-spinner loading-sm"></span>{/if}
					{$t('users.key.submit')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" on:click={() => (keyUser = null)}></button>
	</dialog>
{/if}

<!-- Revealed key modal -->
{#if revealedKey}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<h3 class="font-bold text-lg">{$t('users.revealed.title')}</h3>
			</div>

			<div class="alert alert-warning text-xs mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				<span>{@html $t('users.revealed.warning')}</span>
			</div>

			<div class="bg-base-200 rounded-lg p-3 break-all font-mono text-sm text-base-content/90 mb-4 select-all">
				{revealedKey}
			</div>

			<button
				class="btn w-full gap-2 {revealedKeyCopied ? 'btn-success' : 'btn-primary'}"
				on:click={copyRevealedKey}
			>
				{#if revealedKeyCopied}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					{$t('common.copied')}
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
					</svg>
					{$t('users.revealed.copy')}
				{/if}
			</button>

			<div class="modal-action mt-4">
				<button class="btn btn-ghost btn-sm" on:click={() => (revealedKey = '')}>{$t('common.close')}</button>
			</div>
		</div>
	</dialog>
{/if}
