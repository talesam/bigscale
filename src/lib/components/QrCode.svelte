<script lang="ts">
	import qrcode from 'qrcode-generator';

	/** Text to encode (an invite link). */
	export let value: string;
	/** Rendered size in CSS pixels. */
	export let size = 220;
	export let label = '';

	// Quiet zone of 4 modules, as the QR spec asks, so phone cameras lock on.
	const MARGIN = 4;

	let count = 0;
	let path = '';

	$: {
		const qr = qrcode(0, 'M');
		qr.addData(value, 'Byte');
		qr.make();
		count = qr.getModuleCount();
		// One path with a 1×1 square per dark module: a single DOM node,
		// crisp at any zoom, and no innerHTML.
		let d = '';
		for (let r = 0; r < count; r++) {
			for (let c = 0; c < count; c++) {
				if (qr.isDark(r, c)) d += `M${c + MARGIN} ${r + MARGIN}h1v1h-1z`;
			}
		}
		path = d;
	}
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 {count + MARGIN * 2} {count + MARGIN * 2}"
	width={size}
	height={size}
	shape-rendering="crispEdges"
	role="img"
	aria-label={label}
	class="rounded-lg"
>
	<rect width="100%" height="100%" fill="#ffffff" />
	<path d={path} fill="#000000" />
</svg>
