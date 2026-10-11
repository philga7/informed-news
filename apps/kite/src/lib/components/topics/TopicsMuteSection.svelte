<script lang="ts">
import {
	MUTES_ADD_LABEL,
	MUTES_DELETE_LABEL,
	MUTES_EMPTY_COPY,
	MUTES_KEYWORD_LABEL,
	MUTES_KEYWORD_PLACEHOLDER,
	MUTES_SOURCE_LABEL,
	MUTES_SOURCE_PLACEHOLDER,
	TOPICS_MUTES_HELP,
	TOPICS_MUTES_TITLE,
} from '$lib/topics';

export type MuteRule = {
	id: string;
	keyword: string;
	source: string | null;
	createdAt: string;
};

interface Props {
	rules: MuteRule[];
	keyword: string;
	source: string;
	pendingMute: boolean;
	pendingDelete: boolean;
	loadError: string | null;
	actionError: string | null;
	/** When false, hide the "no mute rules" empty copy (e.g. topics load failed). */
	showEmpty?: boolean;
	onKeywordChange: (value: string) => void;
	onSourceChange: (value: string) => void;
	onAdd: (event: SubmitEvent) => void | Promise<void>;
	onDelete: (id: string) => void | Promise<void>;
}

let {
	rules,
	keyword,
	source,
	pendingMute,
	pendingDelete,
	loadError,
	actionError,
	showEmpty = true,
	onKeywordChange,
	onSourceChange,
	onAdd,
	onDelete,
}: Props = $props();

const inputClass =
	'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
const primaryButtonClass =
	'inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-100 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-offset-gray-900';
</script>

<section class="mt-8 space-y-4" aria-labelledby="topics-mutes-title">
	<header class="space-y-1">
		<h2
			id="topics-mutes-title"
			class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100"
		>
			{TOPICS_MUTES_TITLE}
		</h2>
		<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
			{TOPICS_MUTES_HELP}
		</p>
	</header>

	{#if loadError}
		<p class="text-xs text-red-600 dark:text-red-400" role="alert">{loadError}</p>
	{/if}
	{#if actionError}
		<p class="text-xs text-red-600 dark:text-red-400" role="alert">{actionError}</p>
	{/if}

	<form class="flex flex-col gap-3 sm:flex-row sm:items-end" onsubmit={onAdd}>
		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
			{MUTES_KEYWORD_LABEL}
			<input
				type="text"
				class={inputClass}
				placeholder={MUTES_KEYWORD_PLACEHOLDER}
				autocomplete="off"
				value={keyword}
				oninput={(event) => onKeywordChange((event.currentTarget as HTMLInputElement).value)}
			/>
		</label>
		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
			{MUTES_SOURCE_LABEL}
			<input
				type="text"
				class={inputClass}
				placeholder={MUTES_SOURCE_PLACEHOLDER}
				autocomplete="off"
				value={source}
				oninput={(event) => onSourceChange((event.currentTarget as HTMLInputElement).value)}
			/>
		</label>
		<button type="submit" class={primaryButtonClass} disabled={pendingMute || !keyword.trim()}>
			{MUTES_ADD_LABEL}
		</button>
	</form>

	{#if rules.length === 0}
		{#if showEmpty}
			<p class="text-xs text-gray-600 dark:text-gray-400">{MUTES_EMPTY_COPY}</p>
		{/if}
	{:else}
		<ul class="space-y-2">
			{#each rules as rule (rule.id)}
				<li
					class="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white/70 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60"
				>
					<div class="min-w-0">
						<span class="font-medium text-gray-900 dark:text-gray-100">{rule.keyword}</span>
						{#if rule.source}
							<span class="ml-2 text-gray-500 dark:text-gray-400">({rule.source})</span>
						{/if}
					</div>
					<button
						type="button"
						class="shrink-0 text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
						disabled={pendingDelete}
						onclick={() => void onDelete(rule.id)}
					>
						{MUTES_DELETE_LABEL}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
