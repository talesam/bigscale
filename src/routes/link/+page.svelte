<script lang="ts">
	import { t } from '$lib/i18n';

	// Landing page for a computer's sign-in code opened in a browser (a phone's camera
	// app reads the QR code as a web link): https://<panel>/link#<code>.
	// The code is meant for BigLace's own scanner; it stays in the
	// fragment, never sent to any server, and nothing is done with it here.

	const RELEASES = 'https://github.com/big-comm/biglace/releases/latest';
</script>

<svelte:head><title>{$t('link.title')}</title></svelte:head>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
	<div class="card bg-base-100 shadow-xl w-full max-w-md">
		<div class="card-body gap-4">
			<h1 class="text-2xl font-bold text-center">{$t('link.title')}</h1>
			<p class="text-center text-base-content/70">{$t('link.body')}</p>
			<ol class="space-y-3 text-sm list-decimal list-inside">
				<li>{$t('link.step1')} <a class="link link-primary" href={RELEASES} target="_blank" rel="noopener noreferrer">{$t('link.download')}</a></li>
				<li>{$t('link.step2')}</li>
			</ol>
		</div>
	</div>
</div>
