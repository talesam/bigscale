<script lang="ts">
	import { onMount } from 'svelte';
	import { locale } from '$lib/i18n';

	/** Valor em formato datetime-local: "YYYY-MM-DDTHH:mm" (sem timezone). */
	export let value: string = '';
	export let placeholder: string = '';

	let wrapper: HTMLDivElement;
	let open = false;

	// Data atualmente selecionada
	$: selectedDate = value ? parseLocal(value) : null;
	// Data exibida no grid (mês/ano)
	let viewYear = (selectedDate ?? new Date()).getFullYear();
	let viewMonth = (selectedDate ?? new Date()).getMonth();

	// Hora/minuto exibidos no input de tempo
	$: timeStr = selectedDate
		? `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}`
		: '00:00';

	function pad(n: number) {
		return n.toString().padStart(2, '0');
	}

	function parseLocal(s: string): Date {
		// Trata "YYYY-MM-DDTHH:mm" como local time
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

	// Dias da semana traduzidos (começando no domingo)
	$: weekdays = (() => {
		const fmt = new Intl.DateTimeFormat($locale, { weekday: 'short' });
		const ref = new Date(2024, 0, 7); // 7 de janeiro de 2024 = domingo
		return Array.from({ length: 7 }, (_, i) => {
			const d = new Date(ref);
			d.setDate(ref.getDate() + i);
			return fmt.format(d).slice(0, 1).toUpperCase();
		});
	})();

	// Grid 6x7: 42 células — alguns dias do mês anterior + dias do atual + dias do próximo
	$: grid = (() => {
		const first = new Date(viewYear, viewMonth, 1);
		const start = new Date(first);
		start.setDate(1 - first.getDay()); // recua até o domingo
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

	function toggle() {
		open = !open;
		if (open && selectedDate) {
			viewYear = selectedDate.getFullYear();
			viewMonth = selectedDate.getMonth();
		}
	}

	function onDocClick(e: MouseEvent) {
		if (wrapper && !wrapper.contains(e.target as Node)) open = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	onMount(() => {
		document.addEventListener('mousedown', onDocClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDocClick);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="dtpicker relative" bind:this={wrapper}>
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
		<div class="absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden">
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

			<!-- Calendário -->
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
					<button type="button" class="btn btn-ghost btn-xs" on:click={clear}>Limpar</button>
					<button type="button" class="btn btn-primary btn-xs" on:click={goToday}>Agora</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Esconde o ícone nativo do input type=time pra ficar mais limpo */
	.dtpicker :global(input[type='time']::-webkit-calendar-picker-indicator) {
		display: none;
	}
</style>
