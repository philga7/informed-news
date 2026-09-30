<script lang="ts">
import { untrack } from 'svelte';
import {
	TOPIC_SECTIONS,
	TOPICS_CANCEL_LABEL,
	TOPICS_CORE_TITLE,
	TOPICS_FIELD_DESCRIPTION,
	TOPICS_FIELD_KEYWORDS,
	TOPICS_FIELD_KIND,
	TOPICS_FIELD_LEVEL,
	TOPICS_FIELD_NAME,
	TOPICS_FIELD_NOTES,
	TOPICS_FIELD_QUERY,
	TOPICS_FIELD_SECTIONS,
	TOPICS_KIND_DESIRED,
	TOPICS_KIND_UNDESIRED,
	TOPICS_NAME_REQUIRED,
	TOPICS_PENDING_LABEL,
	TOPICS_WATCH_TITLE,
	formToPayload,
	type TopicFormState,
	type TopicPayload,
} from '$lib/topics';

interface Props {
	initial: TopicFormState;
	submitLabel: string;
	pending: boolean;
	error: string | null;
	onSubmit: (payload: TopicPayload) => void;
	onCancel?: () => void;
}

let { initial, submitLabel, pending, error, onSubmit, onCancel }: Props = $props();

let form = $state<TopicFormState>(
	untrack(() => ({ ...initial, sections: [...initial.sections] })),
);
let localError = $state<string | null>(null);

const desired = $derived(form.kind === 'desired');
const shownError = $derived(localError ?? error);

const inputClass =
	'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
const labelClass = 'block text-xs font-medium text-gray-700 dark:text-gray-300';
const choiceClass = 'inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300';

function handleSubmit(event: SubmitEvent): void {
	event.preventDefault();
	if (pending) return;
	if (!form.name.trim()) {
		localError = TOPICS_NAME_REQUIRED;
		return;
	}
	localError = null;
	onSubmit(formToPayload(form));
}
</script>

<form class="space-y-3" onsubmit={handleSubmit}>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end">
		<fieldset class="sm:flex-1">
			<legend class={labelClass}>{TOPICS_FIELD_KIND}</legend>
			<div class="mt-2 flex gap-4">
				<label class={choiceClass}>
					<input type="radio" value="desired" bind:group={form.kind} disabled={pending} />
					{TOPICS_KIND_DESIRED}
				</label>
				<label class={choiceClass}>
					<input type="radio" value="undesired" bind:group={form.kind} disabled={pending} />
					{TOPICS_KIND_UNDESIRED}
				</label>
			</div>
		</fieldset>
		{#if desired}
			<label class="{labelClass} sm:w-40">
				{TOPICS_FIELD_LEVEL}
				<select class={inputClass} bind:value={form.level} disabled={pending}>
					<option value="core">{TOPICS_CORE_TITLE}</option>
					<option value="watch">{TOPICS_WATCH_TITLE}</option>
				</select>
			</label>
		{/if}
	</div>

	<label class={labelClass}>
		{TOPICS_FIELD_NAME}
		<input
			type="text"
			class={inputClass}
			maxlength="80"
			required
			autocomplete="off"
			bind:value={form.name}
			disabled={pending}
		/>
	</label>

	<label class={labelClass}>
		{TOPICS_FIELD_DESCRIPTION}
		<textarea class={inputClass} rows="2" bind:value={form.description} disabled={pending}
		></textarea>
	</label>

	<label class={labelClass}>
		{TOPICS_FIELD_KEYWORDS}
		<textarea class={inputClass} rows="2" bind:value={form.keywordsText} disabled={pending}
		></textarea>
	</label>

	{#if desired}
		<label class={labelClass}>
			{TOPICS_FIELD_QUERY}
			<input
				type="text"
				class="{inputClass} font-mono"
				autocomplete="off"
				bind:value={form.searchQuery}
				disabled={pending}
			/>
		</label>
	{/if}

	<label class={labelClass}>
		{TOPICS_FIELD_NOTES}
		<textarea class={inputClass} rows="2" bind:value={form.notes} disabled={pending}></textarea>
	</label>

	{#if desired}
		<fieldset>
			<legend class={labelClass}>{TOPICS_FIELD_SECTIONS}</legend>
			<div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
				{#each TOPIC_SECTIONS as section (section.id)}
					<label class={choiceClass}>
						<input
							type="checkbox"
							value={section.id}
							bind:group={form.sections}
							disabled={pending}
						/>
						{section.label}
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if shownError}
		<p class="text-xs text-red-600 dark:text-red-400" role="alert">{shownError}</p>
	{/if}

	<div class="flex items-center justify-end gap-3 pt-1">
		{#if onCancel}
			<button
				type="button"
				class="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200"
				onclick={onCancel}
				disabled={pending}
			>
				{TOPICS_CANCEL_LABEL}
			</button>
		{/if}
		<button
			type="submit"
			class="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-100 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-offset-gray-900"
			disabled={pending || !form.name.trim()}
		>
			{pending ? TOPICS_PENDING_LABEL : submitLabel}
		</button>
	</div>
</form>
