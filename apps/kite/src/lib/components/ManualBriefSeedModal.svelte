<script lang="ts">
import { goto } from '$app/navigation';
import BaseModal from '$lib/components/BaseModal.svelte';
import {
	BRIEF_SEED_ERROR_GENERIC,
	BRIEF_SEED_LOGIN_HINT,
	BRIEF_SEED_MODAL_TITLE,
	BRIEF_SEED_NOTE_LABEL,
	BRIEF_SEED_PENDING_LABEL,
	BRIEF_SEED_SUBMIT_LABEL,
	BRIEF_SEED_TITLE_LABEL,
	BRIEF_SEED_URLS_LABEL,
	parseUrlsFromTextarea,
	postBriefSeed,
} from '$lib/briefSeed';
import { closeBriefSeedModal } from '$lib/briefSeedUi.svelte';
import { dataReloadService } from '$lib/services/dataService';

interface Props {
	isOpen: boolean;
}

let { isOpen }: Props = $props();

let title = $state('');
let note = $state('');
let urlsText = $state('');
let submitting = $state(false);
let error = $state<string | null>(null);
let unauthenticated = $state(false);

function resetForm(): void {
	title = '';
	note = '';
	urlsText = '';
	submitting = false;
	error = null;
	unauthenticated = false;
}

function handleClose(): void {
	if (submitting) return;
	closeBriefSeedModal();
	resetForm();
}

async function handleSubmit(event: Event): Promise<void> {
	event.preventDefault();
	if (submitting) return;

	const trimmedTitle = title.trim();
	if (!trimmedTitle) {
		error = 'Title is required.';
		return;
	}

	submitting = true;
	error = null;
	unauthenticated = false;

	const urls = parseUrlsFromTextarea(urlsText);
	const trimmedNote = note.trim();

	const result = await postBriefSeed({
		title: trimmedTitle,
		...(trimmedNote ? { note: trimmedNote } : {}),
		...(urls.length > 0 ? { urls } : {}),
	});

	submitting = false;

	if (!result.ok) {
		error = result.error || BRIEF_SEED_ERROR_GENERIC;
		unauthenticated = Boolean(result.unauthenticated);
		return;
	}

	closeBriefSeedModal();
	resetForm();
	await dataReloadService.reloadData();
	await goto('/');
}
</script>

<BaseModal
	{isOpen}
	onClose={handleClose}
	title={BRIEF_SEED_MODAL_TITLE}
	size="sm"
	position="center"
	closeOnBackdrop={!submitting}
	closeOnEscape={!submitting}
	showCloseButton={!submitting}
>
	<form
		class="space-y-3 p-4"
		style="font-family: var(--font-lufga), system-ui, sans-serif;"
		onsubmit={handleSubmit}
	>
		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">
			{BRIEF_SEED_TITLE_LABEL}
			<input
				type="text"
				class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
				bind:value={title}
				required
				disabled={submitting}
				autocomplete="off"
			/>
		</label>

		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">
			{BRIEF_SEED_NOTE_LABEL}
			<textarea
				class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
				rows="2"
				bind:value={note}
				disabled={submitting}
			></textarea>
		</label>

		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">
			{BRIEF_SEED_URLS_LABEL}
			<textarea
				class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
				rows="3"
				bind:value={urlsText}
				disabled={submitting}
				placeholder="https://example.com/story"
			></textarea>
		</label>

		{#if error}
			<p class="text-xs text-red-600 dark:text-red-400" role="alert">
				{error}
			</p>
		{/if}

		{#if unauthenticated}
			<p class="text-xs text-gray-600 dark:text-gray-400">
				{BRIEF_SEED_LOGIN_HINT}
				<a
					href="/radar"
					class="ms-1 font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
				>
					Open Radar login
				</a>
			</p>
		{/if}

		<div class="flex items-center justify-end gap-2 pt-1">
			<button
				type="button"
				class="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200"
				onclick={handleClose}
				disabled={submitting}
			>
				Cancel
			</button>
			<button
				type="submit"
				class="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
				disabled={submitting || !title.trim()}
			>
				{submitting ? BRIEF_SEED_PENDING_LABEL : BRIEF_SEED_SUBMIT_LABEL}
			</button>
		</div>
	</form>
</BaseModal>
