<script lang="ts">
	import '../app.css';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { theme, toasts } from '$lib/stores';
	import { logout as apiLogout, getHealth } from '$lib/api';
	import { initLocale, t } from '$lib/i18n';

	$: isLogin = $page.url.pathname === '/login';

	let serverHealth: { ok: boolean; version?: string } = { ok: false };
	let healthTimer: ReturnType<typeof setInterval> | null = null;

	async function refreshHealth() {
		serverHealth = await getHealth();
	}

	onMount(() => {
		initLocale();

		const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
		if (saved) $theme = saved;
		else if (window.matchMedia('(prefers-color-scheme: dark)').matches) $theme = 'dark';
		document.documentElement.setAttribute('data-theme', $theme);
		theme.subscribe((tt) => {
			document.documentElement.setAttribute('data-theme', tt);
			localStorage.setItem('theme', tt);
		});

		if (!isLogin) {
			refreshHealth();
			healthTimer = setInterval(refreshHealth, 30000);
		}
	});

	onDestroy(() => {
		if (healthTimer) clearInterval(healthTimer);
	});

	function toggleTheme() {
		$theme = $theme === 'light' ? 'dark' : 'light';
	}

	async function logout() {
		await apiLogout();
		goto('/login');
	}

	$: navLinks = [
		{ href: '/devices',  label: $t('nav.devices'),  icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
		{ href: '/users',    label: $t('nav.users'),    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
		{ href: '/settings', label: $t('nav.settings'), icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
	];
</script>

{#if isLogin}
	<slot />
{:else}
	<div class="drawer lg:drawer-open min-h-screen bg-base-200">
		<input id="main-drawer" type="checkbox" class="drawer-toggle" />

		<!-- Main content -->
		<div class="drawer-content flex flex-col">
			<!-- Mobile top bar -->
			<header class="navbar bg-base-100 border-b border-base-200 lg:hidden px-2 sticky top-0 z-30">
				<label for="main-drawer" class="btn btn-ghost btn-sm" aria-label={$t('nav.menu')}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
					</svg>
				</label>
				<span class="font-bold text-primary ml-2 flex-1">BigScale</span>
				<button class="btn btn-ghost btn-sm btn-circle" on:click={toggleTheme} aria-label={$t('nav.theme')}>
					{#if $theme === 'dark'}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
						</svg>
					{/if}
				</button>
			</header>

			<main class="flex-1 p-4 lg:p-6"><slot /></main>
		</div>

		<!-- Sidebar -->
		<div class="drawer-side z-40">
			<label for="main-drawer" class="drawer-overlay"></label>
			<nav class="flex flex-col bg-base-100 border-r border-base-200 min-h-full py-4">
				<!-- Logo -->
				<div class="px-5 mb-6 flex items-center gap-3">
					<div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 64 64" fill="none">
							<g stroke="currentColor" class="text-primary-content/70" stroke-width="3" stroke-linecap="round">
								<line x1="14" y1="14" x2="50" y2="14" />
								<line x1="50" y1="14" x2="50" y2="50" />
								<line x1="50" y1="50" x2="14" y2="50" />
								<line x1="14" y1="50" x2="14" y2="14" />
								<line x1="14" y1="14" x2="32" y2="32" />
								<line x1="50" y1="14" x2="32" y2="32" />
								<line x1="50" y1="50" x2="32" y2="32" />
								<line x1="14" y1="50" x2="32" y2="32" />
							</g>
							<g class="fill-primary-content">
								<circle cx="14" cy="14" r="4" />
								<circle cx="50" cy="14" r="4" />
								<circle cx="50" cy="50" r="4" />
								<circle cx="14" cy="50" r="4" />
							</g>
							<circle cx="32" cy="32" r="6.5" class="fill-primary-content" />
							<circle cx="32" cy="32" r="3" class="fill-primary" />
						</svg>
					</div>
					<span class="font-extrabold text-lg text-base-content">BigScale</span>
				</div>

				<!-- Links -->
				<ul class="menu menu-md flex-1 px-2 gap-1">
					{#each navLinks as link}
						<li>
							<a
								href={link.href}
								class:active={$page.url.pathname.startsWith(link.href)}
								class="gap-3 font-medium"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d={link.icon} />
								</svg>
								{link.label}
							</a>
						</li>
					{/each}
				</ul>

				<!-- Bottom -->
				<div class="px-2 mt-4 flex flex-col gap-1">
					<!-- Server health -->
					<div class="px-3 py-2 mb-1 flex items-center gap-2 text-xs text-base-content/60" title={serverHealth.ok ? $t('settings.server.online') : $t('settings.server.offline')}>
						<span class="inline-block w-2 h-2 rounded-full {serverHealth.ok ? 'bg-success' : 'bg-error'}"></span>
						<span>{serverHealth.ok ? $t('settings.server.online') : $t('settings.server.offline')}</span>
						{#if serverHealth.version}<span class="text-base-content/40 ml-auto">v{serverHealth.version}</span>{/if}
					</div>
					<button class="btn btn-ghost btn-sm justify-start gap-3 font-medium w-full" on:click={toggleTheme}>
						{#if $theme === 'dark'}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
							</svg>
							{$t('nav.themeLight')}
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
							</svg>
							{$t('nav.themeDark')}
						{/if}
					</button>
					<button class="btn btn-ghost btn-sm justify-start gap-3 font-medium w-full text-error" on:click={logout}>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
						</svg>
						{$t('nav.logout')}
					</button>
				</div>
			</nav>
		</div>
	</div>
{/if}

{#if $toasts.length > 0}
	<div class="toast toast-end toast-bottom z-50 gap-2">
		{#each $toasts as tt (tt.id)}
			<div class="alert shadow-lg max-w-sm"
				class:alert-success={tt.type === 'success'}
				class:alert-error={tt.type === 'error'}
				class:alert-info={tt.type === 'info'}>
				<span class="text-sm">{tt.message}</span>
			</div>
		{/each}
	</div>
{/if}
