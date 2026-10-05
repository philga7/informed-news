<script lang="ts">
import { onMount } from 'svelte';
import { PRODUCT_NAME } from '$lib/brand';
import FilteredGroupSection from '$lib/components/filtered/FilteredGroupSection.svelte';
import {
	FILTERED_BACK_TO_BRIEF,
	FILTERED_DISCLAIMER,
	FILTERED_EMPTY,
	FILTERED_HEADING,
	FILTERED_INTRO,
	FILTERED_LOADING_LABEL,
	FILTERED_LOGIN_HINT,
	FILTERED_PAGE_DESCRIPTION,
	FILTERED_PAGE_TITLE,
	FILTERED_SCOPES,
	FILTERED_SCOPE_LABEL,
	fetchFilteredOut,
	groupFilteredItems,
	reasonCounts,
	runSummaryLine,
	type FilteredOut,
	type FilteredOutScope,
} from '$lib/filteredOut';

let scope = $state<FilteredOutScope>('last');
let loading = $state(true);
let unauthenticated = $state(false);
let loadError = $state<string | null>(null);
let data = $state<FilteredOut | null>(null);
let now = $state(new Date());

let requestId = 0;

const groups = $derived(data ? groupFilteredItems(data.items) : []);
const summaryRow = $derived(data ? reasonCounts(data.counts) : []);
const summaryLine = $derived(data ? runSummaryLine(data.run) : null);

const linkClass =
	'font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300';
const scopeButtonClass =
	'rounded-md border px-3 py-1 text-xs font-medium transition-colors border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50 aria-pressed:border-gray-900 aria-pressed:bg-gray-900 aria-pressed:text-white dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-800 dark:aria-pressed:border-gray-100 dark:aria-pressed:bg-gray-100 dark:aria-pressed:text-gray-900';

async function load(next: FilteredOutScope): Promise<void> {
	const id = ++requestId;
	scope = next;
	loading = true;
	loadError = null;

	const result = await fetchFilteredOut(next);
	if (id !== requestId) return;
	loading = false;
	now = new Date();

	if (result.ok) {
		unauthenticated = false;
		data = result.data;
		return;
	}
	data = null;
	unauthenticated = result.unauthenticated;
	if (!result.unauthenticated) loadError = result.error;
}

function selectScope(next: FilteredOutScope): void {
	if (next === scope && !loadError) return;
	void load(next);
}

onMount(() => {
	void load('last');
});
</script>

<svelte:head>
	<title>{FILTERED_PAGE_TITLE}</title>
	<meta name="description" content={FILTERED_PAGE_DESCRIPTION} />
</svelte:head>

<div
	class="min-h-screen bg-app-bg text-gray-900 dark:text-gray-100"
	style="font-family: var(--font-lufga), system-ui, sans-serif;"
>
	<main class="mx-auto max-w-3xl px-4 py-12 sm:py-16">
		<p class="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">
			{PRODUCT_NAME}
		</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{FILTERED_HEADING}</h1>
		<p class="mt-3 text-base text-gray-600 dark:text-gray-300">{FILTERED_INTRO}</p>

		{#if unauthenticated}
			<p class="mt-8 text-sm" role="alert">
				<a href="/topics" class={linkClass}>{FILTERED_LOGIN_HINT}</a>
			</p>
		{:else}
			<div class="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
				<p class="text-xs font-medium text-gray-800 dark:text-gray-200" data-testid="filtered-run">
					{summaryLine ?? ''}
				</p>
				<div class="flex gap-2" role="group" aria-label="Scope">
					{#each FILTERED_SCOPES as option (option)}
						<button
							type="button"
							class={scopeButtonClass}
							aria-pressed={scope === option}
							disabled={loading}
							onclick={() => selectScope(option)}
						>
							{FILTERED_SCOPE_LABEL[option]}
						</button>
					{/each}
				</div>
			</div>

			<p class="mt-3 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
				{FILTERED_DISCLAIMER}
			</p>

			{#if loading}
				<p class="mt-8 text-sm text-gray-600 dark:text-gray-300">{FILTERED_LOADING_LABEL}</p>
			{:else if loadError}
				<p class="mt-8 text-sm text-red-600 dark:text-red-400" role="alert">{loadError}</p>
			{:else if data}
				{#if groups.length === 0}
					<p class="mt-8 text-sm text-gray-600 dark:text-gray-300">{FILTERED_EMPTY}</p>
				{:else}
					<ul
						class="mt-6 flex flex-wrap gap-2 text-xs"
						aria-label="Reasons"
						data-testid="filtered-reasons"
					>
						{#each summaryRow as reason (reason.group)}
							<li>
								<a
									href="#filtered-{reason.group}"
									class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200 dark:hover:border-gray-500"
								>
									{reason.label}
									<span class="font-semibold text-gray-900 dark:text-gray-100">{reason.count}</span>
								</a>
							</li>
						{/each}
					</ul>

					{#each groups as group (`${data.scope}:${group.group}`)}
						<FilteredGroupSection {group} {now} />
					{/each}
				{/if}
			{/if}
		{/if}

		<p class="mt-12">
			<a
				href="/"
				class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				{FILTERED_BACK_TO_BRIEF}
			</a>
		</p>
	</main>
</div>
