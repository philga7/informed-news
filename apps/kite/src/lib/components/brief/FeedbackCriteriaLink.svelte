<script module lang="ts">
	/** Ids from one shared GET /api/feedback for citation links in advisory reasons. */
	const knownIds = new Set<string>();
	let loadPromise: Promise<'ok' | 'failed'> | null = null;

	/** Test seam: forget the page-load GET so the next mount loads again. */
	export function resetFeedbackCriteriaCache(): void {
		knownIds.clear();
		loadPromise = null;
	}

	function isIdEntry(value: unknown): value is { id: string } {
		const e = value as Partial<{ id: unknown }> | null;
		return !!e && typeof e.id === 'string';
	}

	function loadOnce(): Promise<'ok' | 'failed'> {
		loadPromise ??= (async () => {
			try {
				const res = await fetch('/api/feedback', { credentials: 'include' });
				const body = (await res.json().catch(() => null)) as { entries?: unknown } | null;
				if (!res.ok || !Array.isArray(body?.entries)) {
					loadPromise = null;
					return 'failed';
				}
				for (const raw of body.entries) if (isIdEntry(raw)) knownIds.add(raw.id);
				return 'ok';
			} catch {
				loadPromise = null;
				return 'failed';
			}
		})();
		return loadPromise;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		feedbackId: string;
	}

	let { feedbackId }: Props = $props();

	let loadFinished = $state(false);
	let loadFailed = $state(false);
	let idPresent = $state(false);

	const criteriaLabel = $derived(`feedback:${feedbackId}`);

	onMount(() => {
		void loadOnce().then((result) => {
			loadFailed = result === 'failed';
			idPresent = result === 'ok' && knownIds.has(feedbackId);
			loadFinished = true;
		});
	});
</script>

{#if !loadFinished || loadFailed}
	<span class="font-mono text-[10px]">{criteriaLabel}</span>
{:else if idPresent}
	<a
		class="font-mono text-[10px] underline-offset-2 hover:underline"
		href="/feedback#{feedbackId}"
		data-testid="feedback-criteria-link"
	>{criteriaLabel}</a>
{:else}
	<span class="font-mono text-[10px]" data-testid="feedback-criteria-removed">feedback removed</span>
{/if}
