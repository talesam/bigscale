<script lang="ts">
	import { t } from '$lib/i18n';

	// Landing page for a pairing code opened in a browser (a phone's camera
	// app reads the QR code as a web link): https://<panel>/pair#<token>.
	// The code is meant for BigLace's own scanner; the token stays in the
	// fragment, never sent to any server, and nothing is done with it here.

	const RELEASES = 'https://github.com/big-comm/biglace/releases/latest';
</script>

<svelte:head><title>{$t('pair.title')}</title></svelte:head>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
	<div class="card bg-base-100 shadow-xl w-full max-w-md">
		<div class="card-body gap-4">
			<h1 class="text-2xl font-bold text-center">{$t('pair.title')}</h1>
			<p class="text-center text-base-content/70">{$t('pair.body')}</p>
			<ol class="space-y-3 text-sm list-decimal list-inside">
				<li>{$t('pair.step1')} <a class="link link-primary" href={RELEASES} target="_blank" rel="noopener noreferrer">{$t('pair.download')}</a></li>
				<li>{$t('pair.step2')}</li>
			</ol>
		</div>
	</div>
</div>
