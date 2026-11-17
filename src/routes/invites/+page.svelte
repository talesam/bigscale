<script lang="ts">
	import { onMount } from 'svelte';
	import { createInvite, getInvites, inviteAppLink, inviteLink, revokeInvite } from '$lib/api';
	import { addToast } from '$lib/stores';
	import { t, locale } from '$lib/i18n';
	import type { Invite } from '$lib/types';
	import QrCode from '$lib/components/QrCode.svelte';

	const NEW_GROUP = '__new__';
	const NO_GROUP = '__none__';
	const GROUP_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

	let invites: Invite[] = [];
	let groups: string[] = [];
	let groupsError = '';
	let loading = true;

	let showCreate = false;
	let groupChoice = NO_GROUP;
	let newGroup = '';
	let mutual = true;
	let maxUses = 1;
	let validDays = 7;
	let note = '';
	let creating = false;

	// Shown once, right after creation: the token isn't stored on the server.
	let created: { token: string; invite: Invite } | null = null;
	let copied = '';

	let revokeTarget: Invite | null = null;
	let revoking = false;

	$: newGroupValid = groupChoice !== NEW_GROUP || GROUP_RE.test(newGroup.trim().toLowerCase());
	$: activeCount = invites.filter((i) => i.status === 'active').length;

	onMount(load);

	async function load() {
		loading = true;
		try {
			const d = await getInvites();
			invites = d.invites;
			groups = d.groups;
			groupsError = d.groupsError ?? '';
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		groupChoice = groups[0] ?? NO_GROUP;
		newGroup = '';
		mutual = true;
		maxUses = 1;
		validDays = 7;
		note = '';
		showCreate = true;
	}

	async function doCreate() {
		creating = true;
		try {
			let group: string | null = null;
			if (groupChoice === NEW_GROUP) group = newGroup.trim().toLowerCase();
			else if (groupChoice !== NO_GROUP) group = groupChoice;
			created = await createInvite({ group, mutual, note, maxUses, validDays });
			showCreate = false;
			await load();
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		} finally {
			creating = false;
		}
	}

	async function doRevoke() {
		if (!revokeTarget) return;
		revoking = true;
		try {
			await revokeInvite(revokeTarget.id);
			addToast($t('invites.toast.revoked'));
			revokeTarget = null;
			await load();
		} catch (e: unknown) {
			addToast(e instanceof Error ? e.message : $t('common.error'), 'error');
		} finally {
			revoking = false;
		}
	}

	function copy(text: string, which: string) {
		navigator.clipboard.writeText(text).then(() => {
			copied = which;
			setTimeout(() => (copied = ''), 2000);
		});
	}

	function formatDate(d: string) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString($locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	const BADGE: Record<Invite['status'], string> = {
		active: 'badge-success',
		used: 'badge-info',
		expired: 'badge-ghost',
		revoked: 'badge-ghost'
	};
</script>

<div class="max-w-5xl mx-auto space-y-6">
	<div class="flex flex-col sm:flex-row sm:items-center gap-4">
		<div class="flex-1">
			<h1 class="text-2xl font-bold">{$t('invites.title')}</h1>
			<p class="text-base-content/50 text-sm mt-0.5">{$t('invites.subtitle', { n: activeCount })}</p>
		</div>
		<div class="flex gap-2">
			<button class="btn btn-ghost btn-sm gap-2" on:click={load} disabled={loading}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
				</svg>
				{$t('common.refresh')}
			</button>
			<button class="btn btn-primary btn-sm gap-2" on:click={openCreate} disabled={loading}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				{$t('invites.new')}
			</button>
		</div>
	</div>

	<div class="alert text-sm">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
		</svg>
		<span>{$t('invites.howItWorks')}</span>
	</div>

	{#if groupsError}
		<div class="alert alert-warning text-sm"><span>{$t('invites.groupsError', { error: groupsError })}</span></div>
	{/if}

	{#if loading}
		<div class="flex justify-center py-16">
			<span class="loading loading-spinner loading-md text-primary"></span>
		</div>
	{:else if invites.length === 0}
		<div class="text-center py-16 text-base-content/40">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
			</svg>
			<p>{$t('invites.empty')}</p>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			{#each invites as inv (inv.id)}
				<div class="card bg-base-100 border border-base-200 shadow-sm" class:opacity-60={inv.status === 'expired' || inv.status === 'revoked'}>
					<div class="card-body p-4 gap-2">
						<div class="flex items-center gap-3 flex-wrap">
							<span class="badge {BADGE[inv.status]} badge-sm">{$t(`invites.status.${inv.status}`)}</span>
							<span class="font-semibold">
								{inv.group ? $t('invites.groupLabel', { group: inv.group }) : $t('invites.noGroupLabel')}
							</span>
							{#if inv.note}<span class="text-base-content/60 text-sm truncate">— {inv.note}</span>{/if}
							<span class="flex-1"></span>
							{#if inv.status === 'active'}
								<button class="btn btn-ghost btn-xs text-error" on:click={() => (revokeTarget = inv)}>{$t('invites.revoke')}</button>
							{/if}
						</div>
						<div class="text-xs text-base-content/60 flex flex-wrap gap-x-4 gap-y-1">
							<span>{$t('invites.uses', { used: inv.uses.length, max: inv.maxUses })}</span>
							<span>{$t('invites.created', { date: formatDate(inv.createdAt) })}</span>
							{#if inv.status === 'active'}
								<span>{$t('invites.expires', { date: formatDate(inv.expiresAt) })}</span>
							{/if}
						</div>
						{#if inv.uses.length}
							<div class="flex flex-wrap gap-1">
								{#each inv.uses as u}
									<span class="badge badge-outline badge-sm" title={formatDate(u.at)}>{u.user}</span>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if showCreate}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-4">{$t('invites.new')}</h3>

			<div class="form-control mb-3">
				<label class="label" for="inv-group"><span class="label-text">{$t('invites.form.group')}</span></label>
				<select id="inv-group" class="select select-bordered" bind:value={groupChoice}>
					{#each groups as g}<option value={g}>{g}</option>{/each}
					<option value={NEW_GROUP}>{$t('invites.form.newGroup')}</option>
					<option value={NO_GROUP}>{$t('invites.form.noGroup')}</option>
				</select>
				<span class="label-text-alt text-base-content/50 mt-1">{$t('invites.form.groupHint')}</span>
			</div>

			{#if groupChoice === NEW_GROUP}
				<div class="form-control mb-3">
					<label class="label" for="inv-newgroup"><span class="label-text">{$t('invites.form.newGroupName')}</span></label>
					<input id="inv-newgroup" class="input input-bordered" class:input-error={newGroup && !newGroupValid} bind:value={newGroup} placeholder={$t('invites.form.newGroupPlaceholder')} />
				</div>
				<label class="flex items-center gap-2 mb-3 cursor-pointer text-sm">
					<input type="checkbox" class="checkbox checkbox-sm" bind:checked={mutual} />
					{$t('invites.form.mutual')}
				</label>
			{/if}

			<div class="grid grid-cols-2 gap-3 mb-3">
				<div class="form-control">
					<label class="label" for="inv-uses"><span class="label-text">{$t('invites.form.maxUses')}</span></label>
					<input id="inv-uses" type="number" min="1" max="50" class="input input-bordered" bind:value={maxUses} />
				</div>
				<div class="form-control">
					<label class="label" for="inv-days"><span class="label-text">{$t('invites.form.validFor')}</span></label>
					<select id="inv-days" class="select select-bordered" bind:value={validDays}>
						<option value={1}>{$t('invites.form.days', { n: 1 })}</option>
						<option value={7}>{$t('invites.form.days', { n: 7 })}</option>
						<option value={30}>{$t('invites.form.days', { n: 30 })}</option>
					</select>
				</div>
			</div>

			<div class="form-control mb-1">
				<label class="label" for="inv-note"><span class="label-text">{$t('invites.form.note')}</span></label>
				<input id="inv-note" class="input input-bordered" maxlength="80" bind:value={note} placeholder={$t('invites.form.notePlaceholder')} />
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" on:click={() => (showCreate = false)}>{$t('common.cancel')}</button>
				<button class="btn btn-primary" on:click={doCreate} disabled={creating || !newGroupValid || maxUses < 1 || maxUses > 50}>
					{#if creating}<span class="loading loading-spinner loading-xs"></span>{/if}
					{$t('common.create')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" on:click={() => (showCreate = false)}></button>
	</dialog>
{/if}

{#if created}
	{@const link = inviteLink(created.token)}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-1">{$t('invites.created.title')}</h3>
			<p class="text-sm text-base-content/60 mb-4">{$t('invites.created.hint')}</p>

			<div class="flex justify-center mb-4">
				<QrCode value={link} size={240} label={$t('invites.created.qrLabel')} />
			</div>

			<div class="bg-base-200 rounded-lg p-3 break-all font-mono text-xs text-base-content/90 mb-3 select-all">{link}</div>

			<div class="flex flex-col sm:flex-row gap-2">
				<button class="btn btn-primary flex-1" on:click={() => copy(link, 'link')}>
					{copied === 'link' ? $t('common.copied') : $t('invites.created.copyLink')}
				</button>
				<button class="btn btn-ghost flex-1" on:click={() => created && copy(inviteAppLink(created.token), 'app')}>
					{copied === 'app' ? $t('common.copied') : $t('invites.created.copyAppLink')}
				</button>
			</div>

			<div class="alert alert-warning text-xs mt-4"><span>{$t('invites.created.once')}</span></div>

			<div class="modal-action mt-4">
				<button class="btn btn-ghost btn-sm" on:click={() => (created = null)}>{$t('common.close')}</button>
			</div>
		</div>
	</dialog>
{/if}

{#if revokeTarget}
	<dialog class="modal modal-open modal-bottom sm:modal-middle">
		<div class="modal-box">
			<h3 class="font-bold text-lg mb-2">{$t('invites.revokeTitle')}</h3>
			<p class="text-sm text-base-content/70">{$t('invites.revokeBody')}</p>
			<div class="modal-action">
				<button class="btn btn-ghost" on:click={() => (revokeTarget = null)}>{$t('common.cancel')}</button>
				<button class="btn btn-error" on:click={doRevoke} disabled={revoking}>
					{#if revoking}<span class="loading loading-spinner loading-xs"></span>{/if}
					{$t('invites.revoke')}
				</button>
			</div>
		</div>
		<button class="modal-backdrop" on:click={() => (revokeTarget = null)}></button>
	</dialog>
{/if}
