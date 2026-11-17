<script lang="ts">
	import { onMount } from 'svelte';
	import { inviteAppLink } from '$lib/api';
	import { t, locale } from '$lib/i18n';

	// Public landing page for an invite link: https://<panel>/join#<token>.
	// The token lives in the URL fragment, which the browser never sends to
	// any server (nor to the reverse proxy's access log). This page only
	// checks it and hands it to BigLace; the account is created by the app.

	const RELEASES = 'https://github.com/big-comm/biglace/releases/latest';

	let token = '';
	let state: 'checking' | 'valid' | 'invalid' = 'checking';
	let reason = '';
	let group: string | null = null;
	let expiresAt = '';
	let copied = false;

	$: appLink = token ? inviteAppLink(token) : '';
	$: pageLink = token ? `${location.origin}/join#${token}` : '';

	// Re-check when only the fragment changes (another invite opened in the
	// same tab): the browser doesn't reload the page for that.
	onMount(() => {
		check();
		window.addEventListener('hashchange', check);
		return () => window.removeEventListener('hashchange', check);
	});

	async function check() {
		state = 'checking';
		group = null;
		expiresAt = '';
		try {
			token = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
		} catch {
			token = '';
		}
		if (!token) {
			state = 'invalid';
			reason = 'unknown';
			return;
		}
		try {
			const res = await fetch('/api/join/check', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ invite: token })
			});
			const d = (await res.json().catch(() => ({}))) as { error?: string; group?: string | null; expiresAt?: string };
			if (res.ok) {
				group = d.group ?? null;
				expiresAt = d.expiresAt ?? '';
				state = 'valid';
			} else {
				reason = d.error ?? 'unknown';
				state = 'invalid';
			}
		} catch {
			reason = 'server_error';
			state = 'invalid';
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(pageLink).then(() => {
			copied = true;
			setTimeout(() => (copied = false), 2000);
		});
	}

	function formatDate(d: string) {
		return new Date(d).toLocaleDateString($locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
</script>

<svelte:head><title>{$t('join.title')} — BigScale</title></svelte:head>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
	<div class="card bg-base-100 shadow-xl w-full max-w-md">
		<div class="card-body gap-4">
			<h1 class="text-2xl font-bold text-center">{$t('join.title')}</h1>

			{#if state === 'checking'}
				<div class="flex justify-center py-8"><span class="loading loading-spinner loading-md text-primary"></span></div>
			{:else if state === 'invalid'}
				<div class="alert alert-error text-sm">
					<span>{$t(`join.error.${reason}`) === `join.error.${reason}` ? $t('join.error.unknown') : $t(`join.error.${reason}`)}</span>
				</div>
				<p class="text-sm text-base-content/60 text-center">{$t('join.askAgain')}</p>
			{:else}
				<p class="text-center text-base-content/70">
					{group ? $t('join.invitedToGroup', { group }) : $t('join.invited')}
				</p>
				{#if expiresAt}
					<p class="text-center text-xs text-base-content/50 -mt-2">{$t('join.validUntil', { date: formatDate(expiresAt) })}</p>
				{/if}

				<ol class="space-y-4 text-sm">
					<li class="flex gap-3">
						<span class="badge badge-primary badge-lg flex-shrink-0">1</span>
						<div>
							<p class="font-semibold">{$t('join.step1')}</p>
							<p class="text-base-content/60">{$t('join.step1Hint')}</p>
							<a class="link link-primary" href={RELEASES} target="_blank" rel="noopener noreferrer">{$t('join.download')}</a>
						</div>
					</li>
					<li class="flex gap-3">
						<span class="badge badge-primary badge-lg flex-shrink-0">2</span>
						<div class="flex-1">
							<p class="font-semibold">{$t('join.step2')}</p>
							<a class="btn btn-primary btn-block mt-2" href={appLink}>{$t('join.open')}</a>
						</div>
					</li>
				</ol>

				<div class="divider text-xs text-base-content/40 my-0">{$t('join.or')}</div>
				<p class="text-xs text-base-content/60">{$t('join.pasteHint')}</p>
				<button class="btn btn-ghost btn-sm" on:click={copyLink}>{copied ? $t('common.copied') : $t('join.copy')}</button>
			{/if}
		</div>
	</div>
</div>
