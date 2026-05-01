<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';

	let newPassword = '';
	let confirm = '';
	let loading = false;
	let error = '';

	async function submit() {
		error = '';
		if (newPassword.length < 8) { error = $t('changePassword.errors.tooShort'); return; }
		if (newPassword !== confirm)  { error = $t('changePassword.errors.mismatch'); return; }

		loading = true;
		try {
			const res = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ newPassword })
			});
			if (!res.ok) {
				const d = await res.json().catch(() => ({})) as { error?: string };
				error = d.error || $t('changePassword.errors.failed');
				return;
			}
			await goto('/devices', { invalidateAll: true });
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 px-4">
	<div class="w-full max-w-md">
		<div class="text-center mb-6">
			<div class="w-16 h-16 rounded-2xl bg-warning flex items-center justify-center mx-auto mb-4 shadow-lg">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-9 w-9 text-warning-content" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
				</svg>
			</div>
			<h1 class="text-2xl font-extrabold text-base-content">{$t('changePassword.title')}</h1>
			<p class="text-base-content/60 mt-1 text-sm">{$t('changePassword.subtitle')}</p>
		</div>

		<div class="card bg-base-100 shadow-xl">
			<div class="card-body gap-4">
				{#if error}
					<div class="alert alert-error text-sm">
						<span>{error}</span>
					</div>
				{/if}

				<form on:submit|preventDefault={submit} class="flex flex-col gap-3">
					<label class="form-control">
						<div class="label pb-1"><span class="label-text font-medium">{$t('changePassword.newPassword')}</span></div>
						<input type="password" class="input input-bordered" bind:value={newPassword} required minlength="8" autocomplete="new-password" autofocus />
					</label>

					<label class="form-control">
						<div class="label pb-1"><span class="label-text font-medium">{$t('changePassword.confirm')}</span></div>
						<input type="password" class="input input-bordered" bind:value={confirm} required minlength="8" autocomplete="new-password" />
					</label>

					<button type="submit" class="btn btn-primary mt-2" disabled={loading}>
						{#if loading}<span class="loading loading-spinner loading-sm"></span>{/if}
						{$t('changePassword.submit')}
					</button>
				</form>
			</div>
		</div>
	</div>
</div>
