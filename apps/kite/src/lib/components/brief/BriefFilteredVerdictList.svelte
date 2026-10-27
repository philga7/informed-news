<script lang="ts">
	/**
	 * NEWS-167: last-refresh dropped stories for the Brief Filtered / All toggle.
	 * Separate from /filtered (spot-check page); reason expander is advisory.
	 */
	import {
		FILTERED_ARTICLE_GONE,
		FILTERED_EMPTY,
		FILTERED_LOAD_ERROR,
		FILTERED_LOADING_LABEL,
		FILTERED_LOGIN_HINT,
		FILTERED_REASON_LABEL,
		itemTitle,
		mutedByLine,
		type FilteredOutItem,
	} from '$lib/filteredOut';
	import VerdictReasonExpander from './VerdictReasonExpander.svelte';

	interface Props {
		items: FilteredOutItem[] | null;
		loading?: boolean;
		error?: string | null;
		unauthenticated?: boolean;
	}

	let {
		items,
		loading = false,
		error = null,
		unauthenticated = false,
	}: Props = $props();

	const linkClass =
		'text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300';
</script>

<section
	class="mt-10 border-t border-gray-200 pt-6 dark:border-gray-700"
	aria-labelledby="brief-filtered-verdict-heading"
	data-testid="brief-filtered-verdict-list"
>
	<header class="mb-3">
		<h3
			id="brief-filtered-verdict-heading"
			class="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100"
		>
			Filtered this refresh
		</h3>
		<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
			Dropped by the last triage run. Advisory reasons are AI-assisted, not ground truth.
		</p>
	</header>

	{#if loading && items === null}
		<p class="py-4 text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
			{FILTERED_LOADING_LABEL}
		</p>
	{:else if unauthenticated}
		<p class="py-4 text-sm">
			<a
				href="/topics"
				class="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				{FILTERED_LOGIN_HINT}
			</a>
		</p>
	{:else if error}
		<p class="py-4 text-sm text-red-600 dark:text-red-400" role="alert">{error || FILTERED_LOAD_ERROR}</p>
	{:else if !items || items.length === 0}
		<p class="py-4 text-sm text-gray-600 dark:text-gray-400">{FILTERED_EMPTY}</p>
	{:else}
		<ul class="space-y-3">
			{#each items as item (item.articleId)}
				{@const muted = mutedByLine(item)}
				{@const reasonLabel = FILTERED_REASON_LABEL[item.group] ?? item.reason}
				{@const reasonText = item.reasonText?.trim() || null}
				<li
					class="rounded-md border border-gray-200 bg-white/70 px-3 py-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
					data-testid="brief-filtered-verdict-card"
				>
					<p class="font-medium text-gray-900 dark:text-gray-100">
						{#if item.url}
							<a href={item.url} target="_blank" rel="noopener noreferrer" class={linkClass}>
								{itemTitle(item)}
							</a>
						{:else}
							{itemTitle(item) || FILTERED_ARTICLE_GONE}
						{/if}
					</p>
					<p class="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-gray-400">
						<span>{reasonLabel}</span>
						{#if item.publisherDomain}<span>{item.publisherDomain}</span>{/if}
						{#if item.topics.length > 0}
							<span>{item.topics.map((t) => t.name).join(', ')}</span>
						{/if}
					</p>
					{#if muted}
						<p class="mt-1 text-xs text-gray-600 dark:text-gray-300">{muted}</p>
					{/if}
					{#if reasonText}
						<VerdictReasonExpander reasonText={reasonText} criteriaRef={item.criteriaRef} />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
