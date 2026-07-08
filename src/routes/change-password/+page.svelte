<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';

	let newPassword = '';
	let confirm = '';
	let showPass = false;
	let showConfirm = false;
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
		} catch (e: unknown) {
			// Network/TLS failure — without this the rejection is swallowed and the
			// button just re-enables with no message.
			error = e instanceof Error ? e.message : $t('changePassword.errors.failed');
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 px-4">
	<div class="w-full max-w-md">
		<!-- Header: same proportions as login (mb-8, gap-5) so the two screens feel like one flow -->
		<div class="text-center mb-8">
			<div class="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-9 w-9 text-primary-content" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
				</svg>
			</div>
			<h1 class="text-3xl font-extrabold text-base-content">{$t('changePassword.title')}</h1>
			<p class="text-base-content/60 mt-1">{$t('changePassword.subtitle')}</p>
		</div>

		<div class="card bg-base-100 shadow-xl">
			<div class="card-body gap-5">
				{#if error}
					<div class="alert alert-error text-sm">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
						<span>{error}</span>
					</div>
				{/if}

				<form on:submit|preventDefault={submit} class="flex flex-col gap-4">
					<div class="form-control">
						<div class="label pb-1"><span class="label-text font-medium">{$t('changePassword.newPassword')}</span></div>
						<div class="input-neon">
							<svg xmlns="http://www.w3.org/2000/svg" class="input-neon-icon h-4 w-4 text-base-content/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
							</svg>
							{#if showPass}
								<input type="text" bind:value={newPassword} required minlength="8" autocomplete="new-password" autofocus />
							{:else}
								<input type="password" bind:value={newPassword} required minlength="8" autocomplete="new-password" autofocus />
							{/if}
							<button type="button" class="input-neon-btn" on:click={() => (showPass = !showPass)} aria-label={showPass ? $t('login.hidePassword') : $t('login.showPassword')}>
								{#if showPass}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
									</svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
									</svg>
								{/if}
							</button>
						</div>
					</div>

					<div class="form-control">
						<div class="label pb-1"><span class="label-text font-medium">{$t('changePassword.confirm')}</span></div>
						<div class="input-neon">
							<svg xmlns="http://www.w3.org/2000/svg" class="input-neon-icon h-4 w-4 text-base-content/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
							{#if showConfirm}
								<input type="text" bind:value={confirm} required minlength="8" autocomplete="new-password" />
							{:else}
								<input type="password" bind:value={confirm} required minlength="8" autocomplete="new-password" />
							{/if}
							<button type="button" class="input-neon-btn" on:click={() => (showConfirm = !showConfirm)} aria-label={showConfirm ? $t('login.hidePassword') : $t('login.showPassword')}>
								{#if showConfirm}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
									</svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
								{/if}
							</button>
						</div>
					</div>

					<button type="submit" class="btn btn-primary w-full mt-1" disabled={loading}>
						{#if loading}
							<span class="loading loading-spinner loading-sm"></span>
						{/if}
						{$t('changePassword.submit')}
					</button>
				</form>
			</div>
		</div>
	</div>
</div>
