<script lang="ts">
	/** A suggestion is either a bare value or a {label, value} pair (label shown, value inserted). */
	type Suggestion = string | { label: string; value: string };

	export let values: string[] = [];
	export let placeholder = '';
	export let suggestions: Suggestion[] = [];
	export let onChange: (next: string[]) => void = () => {};
	/** Optional validator. Return null when valid, or an error message to flag the chip. */
	export let validate: ((v: string) => string | null) | undefined = undefined;

	let input = '';
	let inputEl: HTMLInputElement;

	$: liveError = validate && input.trim() ? validate(input.trim()) : null;

	function add(v: string) {
		const trimmed = v.trim();
		if (!trimmed) return;
		if (values.includes(trimmed)) {
			input = '';
			return;
		}
		// Allow adding even when invalid — flagged visually so the user notices,
		// but don't silently drop their input.
		onChange([...values, trimmed]);
		input = '';
	}

	function remove(idx: number) {
		onChange(values.filter((_, i) => i !== idx));
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add(input);
		} else if (e.key === 'Backspace' && !input && values.length) {
			remove(values.length - 1);
		}
	}

	function onBlur() {
		if (input.trim()) add(input);
	}

	function norm(s: Suggestion): { label: string; value: string } {
		return typeof s === 'string' ? { label: s, value: s } : s;
	}

	$: filteredSuggestions = input
		? suggestions
			.map(norm)
			.filter((s) => s.value.toLowerCase().includes(input.toLowerCase()) && !values.includes(s.value))
			.slice(0, 8)
		: [];

	$: chipErrors = validate ? values.map((v) => validate!(v)) : values.map(() => null);
	$: hasInvalid = chipErrors.some((e) => e !== null);
</script>

<div class="flex flex-wrap items-center gap-1.5 px-2 py-1.5 input input-bordered min-h-10 h-auto" class:input-error={hasInvalid}>
	{#each values as v, i}
		{@const err = chipErrors[i]}
		<span
			class="badge gap-1 font-mono text-xs {err ? 'badge-error' : 'badge-neutral'}"
			title={err ?? ''}
		>
			{v}
			<button type="button" class="hover:text-error-content" on:click={() => remove(i)} aria-label="remove">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</span>
	{/each}
	<input
		bind:this={inputEl}
		bind:value={input}
		on:keydown={onKeyDown}
		on:blur={onBlur}
		{placeholder}
		class="flex-1 min-w-32 outline-none bg-transparent text-sm font-mono"
		spellcheck="false"
	/>
</div>

{#if liveError}
	<p class="mt-1 text-xs text-error">{liveError}</p>
{:else if hasInvalid}
	<p class="mt-1 text-xs text-error">
		{chipErrors.find((e) => e !== null)}
	</p>
{/if}

{#if filteredSuggestions.length}
	<div class="mt-1 flex flex-wrap gap-1">
		{#each filteredSuggestions as s}
			<!-- mousedown|preventDefault: keep focus on the input so its blur doesn't
			     commit the half-typed text before this click selects the suggestion. -->
			<button
				type="button"
				class="btn btn-ghost btn-xs font-mono"
				title={s.value}
				on:mousedown|preventDefault={() => {
					add(s.value);
					inputEl?.focus();
				}}
			>
				+ {s.label}
			</button>
		{/each}
	</div>
{/if}
