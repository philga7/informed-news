<script lang="ts">
	import { FILTERED_LOGIN, type FilteredVerdictItem } from './briefClient';
	import FeedbackButtons from './FeedbackButtons.svelte';
	import VerdictReasonExpander from './VerdictReasonExpander.svelte';

	interface Props {
		items: FilteredVerdictItem[] | null;
		loading: boolean;
		unauthenticated: boolean;
	}

	let { items, loading, unauthenticated }: Props = $props();
</script>

<section data-testid="brief-filtered-verdict-list" aria-labelledby="brief-filtered-verdict-heading">
	<h3 id="brief-filtered-verdict-heading">Filtered this refresh</h3>
	<p>Dropped by the last triage run. Advisory reasons are AI-assisted, not ground truth.</p>
	{#if unauthenticated}
		<p>
			<a href="/topics">{FILTERED_LOGIN}</a>
		</p>
	{:else if loading && items === null}
		<p aria-live="polite">Loading filtered stories…</p>
	{:else if !items || items.length === 0}
		<p>Nothing was filtered out.</p>
	{:else}
		<ul>
			{#each items as item (item.articleId)}
				<li data-testid="brief-filtered-verdict-card">
					<p>
						{#if item.url}
							<a href={item.url}>{item.title ?? 'Article no longer stored'}</a>
						{:else}
							{item.title ?? 'Article no longer stored'}
						{/if}
					</p>
					{#if item.publisherDomain}
						<p>{item.publisherDomain}</p>
					{/if}
					<FeedbackButtons itemId={item.articleId} />
					{#if item.reasonText}
						<VerdictReasonExpander reasonText={item.reasonText} criteriaRef={item.criteriaRef} />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
