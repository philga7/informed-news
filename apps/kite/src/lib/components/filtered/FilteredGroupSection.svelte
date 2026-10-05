<script lang="ts">
	import {
		FILTERED_DUPLICATE_PREFIX,
		FILTERED_GROUP_PREVIEW,
		FILTERED_NON_FINAL_NOTE,
		FILTERED_SHOW_FEWER,
		duplicateOfTitle,
		groupHeading,
		itemTitle,
		mutedByLine,
		showAllLabel,
		type FilteredGroup,
	} from '$lib/filteredOut';
	import { formatTimeAgoShort } from '$lib/topicBrief';

	interface Props {
		group: FilteredGroup;
		now: Date;
	}

	let { group, now }: Props = $props();

	let expanded = $state(false);

	const headingId = $derived(`filtered-${group.group}`);
	const hasMore = $derived(group.items.length > FILTERED_GROUP_PREVIEW);
	const visible = $derived(
		expanded || !hasMore ? group.items : group.items.slice(0, FILTERED_GROUP_PREVIEW),
	);

	const linkClass =
		'text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300';
</script>

<section class="mt-8 space-y-3" aria-labelledby={headingId} data-testid="filtered-group">
	<h2 id={headingId} class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
		{groupHeading(group.label, group.items.length)}
	</h2>
	<ul class="space-y-2">
		{#each visible as item (item.articleId)}
			{@const published = item.publishedAt ? formatTimeAgoShort(item.publishedAt, now) : null}
			{@const muted = mutedByLine(item)}
			<li
				class="rounded-md border border-gray-200 bg-white/70 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60"
				data-testid="filtered-item"
			>
				<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
					{#if item.url}
						<a href={item.url} target="_blank" rel="noopener noreferrer" class={linkClass}>
							{itemTitle(item)}
						</a>
					{:else}
						{itemTitle(item)}
					{/if}
				</p>
				<p class="mt-1 flex flex-wrap gap-x-2 text-gray-500 dark:text-gray-400">
					{#if item.publisherDomain}<span>{item.publisherDomain}</span>{/if}
					{#if published}<span>{published}</span>{/if}
					{#if item.topics.length > 0}
						<span>{item.topics.map((t) => t.name).join(', ')}</span>
					{/if}
				</p>
				{#if muted}
					<p class="mt-1 text-gray-600 dark:text-gray-300">{muted}</p>
				{/if}
				{#if item.duplicateOf}
					<p class="mt-1 text-gray-600 dark:text-gray-300">
						{FILTERED_DUPLICATE_PREFIX}
						{#if item.duplicateOf.url}
							<a
								href={item.duplicateOf.url}
								target="_blank"
								rel="noopener noreferrer"
								class={linkClass}
							>
								{duplicateOfTitle(item.duplicateOf)}
							</a>
						{:else}
							{duplicateOfTitle(item.duplicateOf)}
						{/if}
					</p>
				{/if}
				{#if !item.final}
					<p class="mt-1 text-amber-700 dark:text-amber-400">{FILTERED_NON_FINAL_NOTE}</p>
				{/if}
			</li>
		{/each}
	</ul>
	{#if hasMore}
		<button
			type="button"
			class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? FILTERED_SHOW_FEWER : showAllLabel(group.items.length)}
		</button>
	{/if}
</section>
