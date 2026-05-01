<script lang="ts">
	import { goto } from '$app/navigation';
	import { login } from '$lib/api';
	import { t } from '$lib/i18n';

	let username = 'admin';
	let password = '';
	let showPass = false;
	let error = '';
	let loading = false;

	async function doLogin() {
		error = '';
		loading = true;
		try {
			await login(username, password);
			goto('/devices');
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : $t('login.authError');
		} finally {
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 px-4">
	<div class="w-full max-w-md">
		<!-- Logo -->
		<div class="text-center mb-8">
			<div class="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-9 w-9 text-primary-content" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
			</div>
			<h1 class="text-3xl font-extrabold text-base-content">{$t('app.title')}</h1>
			<p class="text-base-content/60 mt-1">{$t('app.subtitle')}</p>
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

				<form on:submit|preventDefault={doLogin} class="flex flex-col gap-4">
					<label class="form-control">
						<div class="label pb-1"><span class="label-text font-medium">{$t('login.username')}</span></div>
						<input type="text" class="input input-bordered" bind:value={username} required autocomplete="username" />
					</label>

					<label class="form-control">
						<div class="label pb-1"><span class="label-text font-medium">{$t('login.password')}</span></div>
						<div class="join w-full">
							{#if showPass}
								<input type="text" class="input input-bordered join-item flex-1" bind:value={password} required autocomplete="current-password" />
							{:else}
								<input type="password" class="input input-bordered join-item flex-1" bind:value={password} required autocomplete="current-password" />
							{/if}
							<button type="button" class="btn btn-outline join-item" on:click={() => (showPass = !showPass)}>
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
					</label>

					<button type="submit" class="btn btn-primary w-full mt-1" disabled={loading}>
						{#if loading}
							<span class="loading loading-spinner loading-sm"></span>
							{$t('login.submitting')}
						{:else}
							{$t('login.submit')}
						{/if}
					</button>
				</form>
			</div>
		</div>

		<p class="text-center text-xs text-base-content/40 mt-6">
			{$t('login.envHint')}
		</p>
	</div>
</div>
