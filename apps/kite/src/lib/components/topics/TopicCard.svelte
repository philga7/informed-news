<script lang="ts">
import { untrack } from 'svelte';
import TopicForm from '$lib/components/topics/TopicForm.svelte';
import {
	TOPIC_SECTIONS,
	TOPICS_CORE_TITLE,
	TOPICS_EDIT_LABEL,
	TOPICS_FIELD_QUERY,
	TOPICS_MOVE_TO_CORE_LABEL,
	TOPICS_MOVE_TO_WATCH_LABEL,
	TOPICS_REMOVE_LABEL,
	TOPICS_SAVE_LABEL,
	TOPICS_WATCH_TITLE,
	topicToForm,
	type Topic,
	type TopicLevel,
	type TopicPayload,
} from '$lib/topics';

interface Props {
	topic: Topic;
	pending: boolean;
	error: string | null;
	onMoveLevel?: (level: TopicLevel) => void;
	onSave: (payload: TopicPayload) => void;
	onRemove: () => void;
}

let { topic, pending, error, onMoveLevel, onSave, onRemove }: Props = $props();

let editing = $state(false);
let seenUpdatedAt = untrack(() => topic.updatedAt);

$effect(() => {
	if (topic.updatedAt !== seenUpdatedAt) {
		seenUpdatedAt = topic.updatedAt;
		editing = false;
	}
});

const desired = $derived(topic.kind === 'desired');
const nextLevel = $derived<TopicLevel>(topic.level === 'core' ? 'watch' : 'core');
const sectionLabels = $derived(
	TOPIC_SECTIONS.filter((s) => topic.sections.includes(s.id)).map((s) => s.label),
);

const chipClass =
	'inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600';
const linkButtonClass =
	'text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300';
</script>

<article
	class="rounded-md border border-gray-200 bg-white/70 p-4 text-sm shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60"
	aria-label={topic.name}
>
	{#if editing}
		<TopicForm
			initial={topicToForm(topic)}
			submitLabel={TOPICS_SAVE_LABEL}
			{pending}
			{error}
			onSubmit={onSave}
			onCancel={() => (editing = false)}
		/>
	{:else}
		<div class="flex items-start justify-between gap-3">
			<h3 class="font-semibold tracking-tight text-gray-900 dark:text-gray-100">{topic.name}</h3>
			{#if desired}
				<span class="{chipClass} shrink-0 uppercase text-gray-600 dark:text-gray-300">
					{topic.level === 'core' ? TOPICS_CORE_TITLE : TOPICS_WATCH_TITLE}
				</span>
			{/if}
		</div>

		{#if topic.description}
			<p class="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
				{topic.description}
			</p>
		{/if}

		{#if topic.keywords.length > 0}
			<ul class="mt-2 flex flex-wrap gap-1.5">
				{#each topic.keywords as keyword}
					<li class="{chipClass} text-gray-700 dark:text-gray-300">{keyword}</li>
				{/each}
			</ul>
		{/if}

		{#if desired && topic.searchQuery}
			<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
				<span class="font-medium">{TOPICS_FIELD_QUERY}:</span>
				<code class="ml-1 font-mono text-gray-800 dark:text-gray-200">{topic.searchQuery}</code>
			</p>
		{/if}

		{#if sectionLabels.length > 0}
			<ul class="mt-2 flex flex-wrap gap-1.5">
				{#each sectionLabels as label (label)}
					<li
						class="{chipClass} border-blue-200 text-blue-700 dark:border-blue-800 dark:text-blue-300"
					>
						{label}
					</li>
				{/each}
			</ul>
		{/if}

		{#if topic.notes}
			<p class="mt-2 text-xs italic leading-relaxed text-gray-500 dark:text-gray-400">
				{topic.notes}
			</p>
		{/if}

		{#if error}
			<p class="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
		{/if}

		<div class="mt-3 flex flex-wrap items-center gap-4">
			{#if desired && onMoveLevel}
				<button
					type="button"
					class={linkButtonClass}
					disabled={pending}
					onclick={() => onMoveLevel(nextLevel)}
				>
					{nextLevel === 'core' ? TOPICS_MOVE_TO_CORE_LABEL : TOPICS_MOVE_TO_WATCH_LABEL}
				</button>
			{/if}
			<button type="button" class={linkButtonClass} disabled={pending} onclick={() => (editing = true)}>
				{TOPICS_EDIT_LABEL}
			</button>
			<button
				type="button"
				class="text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
				disabled={pending}
				onclick={onRemove}
			>
				{TOPICS_REMOVE_LABEL}
			</button>
		</div>
	{/if}
</article>
