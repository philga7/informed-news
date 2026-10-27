<script lang="ts">
	/**
	 * NEWS-167: advisory triage reason on Brief cards. Labelled for assistive tech
	 * as advisory (not ground truth).
	 */
	interface Props {
		reasonText: string;
		/** Optional criteria ref shown quietly after the reason */
		criteriaRef?: string | null;
	}

	let { reasonText, criteriaRef = null }: Props = $props();

	let open = $state(false);
</script>

<details
	class="mt-2 text-xs text-gray-600 dark:text-gray-400"
	data-testid="verdict-reason-expander"
	bind:open
>
	<summary
		class="cursor-pointer select-none font-medium text-gray-700 underline-offset-2 hover:underline dark:text-gray-300"
	>
		Why this verdict
	</summary>
	<div class="mt-1.5 space-y-1 leading-relaxed" role="region" aria-label="Advisory triage reason">
		<p>
			<span class="sr-only">Advisory reason: </span>{reasonText}
		</p>
		<p class="text-[11px] text-gray-500 dark:text-gray-500" data-testid="verdict-reason-advisory">
			Advisory — AI-assisted judgment, not ground truth
			{#if criteriaRef}
				<span aria-hidden="true"> · </span>
				<span class="font-mono text-[10px]">{criteriaRef}</span>
			{/if}
		</p>
	</div>
</details>
