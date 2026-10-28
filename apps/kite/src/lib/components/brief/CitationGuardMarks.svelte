<script lang="ts">
	/**
	 * NEWS-172: advisory citation marks on Brief cards. Polite advisory wording
	 * only — not a verified / false / debunked badge.
	 */
	import type { InformedCitationMark } from '$lib/types';
	import {
		CITATION_MARK_REGION_LABEL,
		CITATION_MARK_SUMMARY,
		citationMarkAccessibleName,
		citationMarkCourtRecordUrl,
		citationMarkDetail,
		citationMarkVisibleLabel,
		visibleCitationMarks,
	} from '$lib/topicBrief';

	interface Props {
		marks: InformedCitationMark[] | null | undefined;
	}

	let { marks }: Props = $props();

	const visible = $derived(visibleCitationMarks(marks));
	let open = $state(false);
	let expanded = $state<Record<string, boolean>>({});
	const uid = $props.id();
</script>

{#if visible.length > 0}
	<details
		class="mt-2 text-xs text-gray-600 dark:text-gray-400"
		data-testid="citation-guard-marks"
		bind:open
	>
		<summary
			class="cursor-pointer select-none font-medium text-gray-700 underline-offset-2 hover:underline dark:text-gray-300"
		>
			{CITATION_MARK_SUMMARY}
		</summary>
		<div
			class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 leading-relaxed"
			role="region"
			aria-label={CITATION_MARK_REGION_LABEL}
		>
			{#each visible as mark, i (mark.itemId)}
				{@const label = citationMarkVisibleLabel(mark)}
				{@const accessible = citationMarkAccessibleName(mark)}
				{@const detail = citationMarkDetail(mark)}
				{@const recordUrl = citationMarkCourtRecordUrl(mark)}
				{@const panelId = `${uid}-mark-${i}`}
				{@const isOpen = expanded[mark.itemId] === true}
				{#if label && accessible}
					<button
						type="button"
						class="cursor-pointer rounded-sm text-left font-medium text-gray-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:text-gray-300"
						aria-label={accessible}
						aria-expanded={isOpen}
						aria-controls={panelId}
						onclick={() => (expanded[mark.itemId] = !isOpen)}
						data-testid="citation-guard-mark"
						data-citation-kind={mark.kind}
						data-citation-display={mark.display}
					>
						{label}
					</button>
					<span id={panelId} class="basis-full" hidden={!isOpen} data-testid="citation-guard-detail">
						{#if detail}{detail}{/if}
						{#if recordUrl}
							<a
								href={recordUrl}
								class="ml-1 underline"
								target="_blank"
								rel="noopener noreferrer">CourtListener record</a
							>
						{/if}
					</span>
				{/if}
			{/each}
			<p class="basis-full text-[11px] text-gray-500 dark:text-gray-500" data-testid="citation-guard-advisory">
				Advisory — not ground truth
			</p>
		</div>
	</details>
{/if}
