<script lang="ts">
	import { onMount } from 'svelte';
	import { locale, t } from '$lib/i18n';

	/** Valor em formato datetime-local: "YYYY-MM-DDTHH:mm" (sem timezone). */
	export let value: string = '';
	export let placeholder: string = '';
	/** Quick relative presets shown above the calendar (24h / 48h / 7d / 30d). */
	export let presets: boolean = true;

	let open = false;

	// Currently selected date
	$: selectedDate = value ? parseLocal(value) : null;
	// Date shown in the grid (month/year)
	let viewYear = (selectedDate ?? new Date()).getFullYear();
	let viewMonth = (selectedDate ?? new Date()).getMonth();

	// Hours/minutes shown in the time input
	$: timeStr = selectedDate
		? `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}`
		: '00:00';

	function pad(n: number) {
		return n.toString().padStart(2, '0');
	}

	function parseLocal(s: string): Date {
		// Treat "YYYY-MM-DDTHH:mm" as local time
		const [d, t = '00:00'] = s.split('T');
		const [y, mo, da] = d.split('-').map(Number);
		const [h, mi] = t.split(':').map(Number);
		return new Date(y, mo - 1, da, h, mi);
	}

	function formatLocal(d: Date): string {
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function display(d: Date | null): string {
		if (!d) return '';
		return new Intl.DateTimeFormat($locale, {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(d);
	}

	$: monthLabel = new Intl.DateTimeFormat($locale, {
		month: 'long',
		year: 'numeric'
	}).format(new Date(viewYear, viewMonth, 1));

	// Localized weekday labels (starting on Sunday)
	$: weekdays = (() => {
		const fmt = new Intl.DateTimeFormat($locale, { weekday: 'short' });
		const ref = new Date(2024, 0, 7); // Jan 7, 2024 = Sunday
		return Array.from({ length: 7 }, (_, i) => {
			const d = new Date(ref);
			d.setDate(ref.getDate() + i);
			return fmt.format(d).slice(0, 1).toUpperCase();
		});
	})();

	// 6x7 grid: 42 cells — trailing days of the previous month + current month + leading days of the next.
	$: grid = (() => {
		const first = new Date(viewYear, viewMonth, 1);
		const start = new Date(first);
		start.setDate(1 - first.getDay()); // step back to Sunday
		return Array.from({ length: 42 }, (_, i) => {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			return d;
		});
	})();

	function isSameDay(a: Date, b: Date | null) {
		return !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
	}
	function isToday(d: Date) {
		return isSameDay(d, new Date());
	}
	function isCurrentMonth(d: Date) {
		return d.getMonth() === viewMonth;
	}

	function pickDay(d: Date) {
		const cur = selectedDate ?? new Date();
		const next = new Date(d);
		next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
		value = formatLocal(next);
		// Auto-close: keeping the popover open after a click hid the trigger
		// label, so users had to click outside to confirm the value updated.
		open = false;
	}

	function pickPreset(hours: number) {
		const next = new Date();
		next.setMinutes(next.getMinutes() + hours * 60);
		next.setSeconds(0, 0);
		value = formatLocal(next);
		viewYear = next.getFullYear();
		viewMonth = next.getMonth();
		open = false;
	}

	function onTimeChange(e: Event) {
		const v = (e.target as HTMLInputElement).value; // "HH:mm"
		const [h, m] = v.split(':').map(Number);
		const base = selectedDate ?? new Date();
		const next = new Date(base);
		next.setHours(h ?? 0, m ?? 0, 0, 0);
		value = formatLocal(next);
	}

	function prevMonth() {
		if (viewMonth === 0) {
			viewMonth = 11;
			viewYear--;
		} else viewMonth--;
	}
	function nextMonth() {
		if (viewMonth === 11) {
			viewMonth = 0;
			viewYear++;
		} else viewMonth++;
	}
	function goToday() {
		const now = new Date();
		viewYear = now.getFullYear();
		viewMonth = now.getMonth();
		value = formatLocal(now);
	}
	function clear() {
		value = '';
	}

	// Move the popover to <body> to escape any containing block created by
	// transform/filter/will-change on ancestors (e.g. DaisyUI modal-box).
	// Without this, `position: fixed` resolves against the transformed
	// ancestor and the modal's scrollbar "captures" the popover.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode === document.body) {
					document.body.removeChild(node);
				}
			}
		};
	}

	function toggle() {
		open = !open;
		if (open && selectedDate) {
			viewYear = selectedDate.getFullYear();
			viewMonth = selectedDate.getMonth();
		}
	}

	function onBackdropClick() {
		open = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	onMount(() => {
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="dtpicker relative">
	<button
		type="button"
		class="input input-bordered w-full flex items-center justify-between gap-2 cursor-pointer hover:border-primary/50 transition-colors"
		class:input-primary={open}
		on:click={toggle}
	>
		<span class="text-sm {selectedDate ? 'text-base-content' : 'text-base-content/40'}">
			{selectedDate ? display(selectedDate) : placeholder || '—'}
		</span>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
		</svg>
	</button>

	{#if open}
		<div use:portal role="presentation" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" on:mousedown|self={onBackdropClick}>
		<div class="rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden w-full max-w-sm max-h-[90vh] overflow-y-auto">
			{#if presets}
				<!-- Quick presets — relative to "now". One click sets value and closes. -->
				<div class="flex gap-1 px-3 pt-2.5 pb-1.5 border-b border-base-300 bg-base-200/30">
					<button type="button" class="btn btn-ghost btn-xs flex-1" on:click={() => pickPreset(24)}>{$t('picker.preset24h')}</button>
					<button type="button" class="btn btn-ghost btn-xs flex-1" on:click={() => pickPreset(48)}>{$t('picker.preset48h')}</button>
					<button type="button" class="btn btn-ghost btn-xs flex-1" on:click={() => pickPreset(24 * 7)}>{$t('picker.preset7d')}</button>
					<button type="button" class="btn btn-ghost btn-xs flex-1" on:click={() => pickPreset(24 * 30)}>{$t('picker.preset30d')}</button>
				</div>
			{/if}

			<!-- Header -->
			<div class="flex items-center justify-between gap-2 px-3 py-2.5 bg-base-200/50 border-b border-base-300">
				<button type="button" class="btn btn-ghost btn-xs btn-square" on:click={prevMonth} aria-label="prev">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
					</svg>
				</button>
				<span class="text-sm font-semibold capitalize">{monthLabel}</span>
				<button type="button" class="btn btn-ghost btn-xs btn-square" on:click={nextMonth} aria-label="next">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>

			<!-- Calendar -->
			<div class="px-3 py-3">
				<div class="grid grid-cols-7 gap-1 mb-1">
					{#each weekdays as w}
						<div class="text-center text-[10px] font-bold uppercase text-base-content/40 py-1">{w}</div>
					{/each}
				</div>
				<div class="grid grid-cols-7 gap-1">
					{#each grid as d}
						{@const sel = isSameDay(d, selectedDate)}
						{@const today = isToday(d)}
						{@const inMonth = isCurrentMonth(d)}
						<button
							type="button"
							on:click={() => pickDay(d)}
							class="aspect-square flex items-center justify-center text-xs rounded-lg transition-colors
								{sel ? 'bg-primary text-primary-content font-bold shadow-sm' : ''}
								{!sel && today ? 'border border-primary text-primary font-semibold' : ''}
								{!sel && !today && inMonth ? 'hover:bg-base-200 text-base-content' : ''}
								{!inMonth ? 'text-base-content/25 hover:bg-base-200/50' : ''}"
						>
							{d.getDate()}
						</button>
					{/each}
				</div>
			</div>

			<!-- Time + actions -->
			<div class="border-t border-base-300 bg-base-200/30 px-3 py-2.5 flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<input
						type="time"
						value={timeStr}
						on:input={onTimeChange}
						class="input input-sm input-bordered w-24 px-2 text-center font-mono tabular-nums"
					/>
				</div>
				<div class="flex gap-1">
					<button type="button" class="btn btn-ghost btn-xs" on:click={clear}>{$t('picker.clear')}</button>
					<button type="button" class="btn btn-primary btn-xs" on:click={goToday}>{$t('picker.now')}</button>
				</div>
			</div>
		</div>
		</div>
	{/if}
</div>

<style>
	/* Hide the native time-input icon for a cleaner look. */
	.dtpicker :global(input[type='time']::-webkit-calendar-picker-indicator) {
		display: none;
	}
</style>
