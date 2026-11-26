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

<div>
	<p>{trackerSentence(trackers)}</p>
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