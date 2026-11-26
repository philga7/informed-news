<script lang="ts" module>
	export type TrackerStory = { id: string; title: string; newCount: number };
	export type TrackerWeather = { newCount: number };

	export type Trackers = {
		stories: TrackerStory[];
		weather: TrackerWeather | null;
	};

	function trackerSentence(trackers: Trackers): string {
		const count = trackers.stories.length + (trackers.weather === null ? 0 : 1);
		if (count === 0) return '0 trackers have news';
		if (count === 1) return '1 tracker has news';
		return `${count} trackers have news`;
	}
</script>

<script lang="ts">
	interface Props {
		trackers: Trackers;
	}

	let { trackers }: Props = $props();
</script>

<div class="line">
	<p class="count">{trackerSentence(trackers)}</p>
	{#if trackers.stories.length > 0 || trackers.weather !== null}
		<ul style="display: flex; flex-wrap: wrap; gap: 0.75rem; list-style: none; margin: 0; padding: 0;">
			{#each trackers.stories as story (story.id)}
				<li>{story.title} +{story.newCount}</li>
			{/each}
			{#if trackers.weather !== null}
				<li>Weather +1</li>
			{/if}
		</ul>
	{/if}
</div>

<style>
	.line {
		padding: 0.9rem 0 0.2rem;
	}

	.count {
		margin: 0 0 0.45rem;
		font-size: 0.95rem;
	}

	li {
		border: 1px solid #3c414b;
		border-radius: 999px;
		padding: 0.15rem 0.65rem;
		font-size: 0.8rem;
		color: #d9d4c8;
	}
</style>