<script module lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	/** Saved result per story id for this page load; survives the card collapsing. */
	const savedResults = new SvelteMap<string, string>();
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { Story } from '$lib/types';
	import {
		LESS_LIKE_THIS_CANCEL,
		LESS_LIKE_THIS_KEYWORDS_LABEL,
		LESS_LIKE_THIS_LABEL,
		LESS_LIKE_THIS_LOGIN_HINT,
		LESS_LIKE_THIS_NAME_LABEL,
		LESS_LIKE_THIS_NAME_MAX,
		LESS_LIKE_THIS_OUTLET_HEADING,
		LESS_LIKE_THIS_SUBJECT_HEADING,
		LESS_LIKE_THIS_SUBJECT_SUBMIT,
		LESS_LIKE_THIS_TOPICS_LINK,
		lessLikeThisAddedCopy,
		lessLikeThisAlreadyBlockedCopy,
		lessLikeThisAlreadyTopicCopy,
		lessLikeThisErrorCopy,
		lessLikeThisOutletButton,
		lessLikeThisSubjectDefault,
		lessLikeThisSubjectRequest,
		postLessLikeThis,
		type LessLikeThisRequest,
	} from '$lib/topicBrief';

	interface Props {
		story: Story;
		articleId: string;
	}

	let { story, articleId }: Props = $props();

	type Failure = { message: string; login: boolean };

	const uid = $props.id();
	const domain = $derived(story.informed_publisher_domain?.trim() || null);

	let open = $state(false);
	let name = $state('');
	let keywordsText = $state('');
	let pending = $state(false);
	let failure = $state<Failure | null>(null);
	const success = $derived(savedResults.get(articleId) ?? null);
	let nameInput = $state<HTMLInputElement>();
	let trigger = $state<HTMLButtonElement>();
	let topicsLink = $state<HTMLAnchorElement>();

	const linkClass =
		'font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300';
	const inputClass =
		'mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
	const primaryButtonClass =
		'inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200';
	const secondaryButtonClass =
		'inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800';

	/**
	 * Page shortcuts (Enter / j / k / ? …) listen on window; keep them out of this control.
	 * Escape cancels the open panel; with the panel closed it reaches the page (clears selection).
	 */
	const isolateShortcuts: Attachment<HTMLElement> = (node) => {
		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (!open) return;
				event.preventDefault();
				if (!pending) void cancel();
			}
			event.stopPropagation();
		};
		node.addEventListener('keydown', onKeydown);
		return () => node.removeEventListener('keydown', onKeydown);
	};

	async function openPanel(): Promise<void> {
		name = lessLikeThisSubjectDefault(story);
		keywordsText = '';
		failure = null;
		open = true;
		await tick();
		nameInput?.focus();
	}

	async function cancel(): Promise<void> {
		open = false;
		failure = null;
		await tick();
		trigger?.focus();
	}

	async function submit(body: LessLikeThisRequest): Promise<void> {
		if (pending) return;
		pending = true;
		failure = null;
		const result = await postLessLikeThis(articleId, body);
		pending = false;
		const conflictName = body.kind === 'subject' ? body.name : domain;
		if (!result.ok && !(result.status === 409 && conflictName)) {
			failure = result.unauthenticated
				? { message: LESS_LIKE_THIS_LOGIN_HINT, login: true }
				: { message: lessLikeThisErrorCopy(result.error), login: false };
			return;
		}
		savedResults.set(
			articleId,
			!result.ok
				? lessLikeThisAlreadyTopicCopy(conflictName!)
				: body.kind === 'outlet' && !result.created && domain
					? lessLikeThisAlreadyBlockedCopy(domain)
					: lessLikeThisAddedCopy(result.topicName),
		);
		open = false;
		await tick();
		topicsLink?.focus();
	}

	function submitSubject(event: SubmitEvent): void {
		event.preventDefault();
		if (!name.trim()) return;
		void submit(lessLikeThisSubjectRequest(name, keywordsText, story.title));
	}

	function blockOutlet(): void {
		void submit({ kind: 'outlet' });
	}
</script>

<div class="pt-1 text-xs" data-testid="less-like-this" {@attach isolateShortcuts}>
	<div aria-live="polite">
		{#if success}
			<p class="text-gray-600 dark:text-gray-300" data-testid="less-like-this-success">
				{success}
				<a bind:this={topicsLink} href="/topics" class={linkClass}>{LESS_LIKE_THIS_TOPICS_LINK}</a>
			</p>
		{/if}
	</div>

	{#if !success && !open}
		<button
			bind:this={trigger}
			type="button"
			class="font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100"
			onclick={openPanel}
		>
			{LESS_LIKE_THIS_LABEL}
		</button>
	{:else if !success}
		<div
			class="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
			role="group"
			aria-label={LESS_LIKE_THIS_LABEL}
			aria-busy={pending}
		>
			<form class="space-y-2" onsubmit={submitSubject}>
				<fieldset class="space-y-2" disabled={pending}>
					<legend class="font-medium text-gray-800 dark:text-gray-200">
						{LESS_LIKE_THIS_SUBJECT_HEADING}
					</legend>
					<label class="block text-gray-600 dark:text-gray-400" for="{uid}-name">
						{LESS_LIKE_THIS_NAME_LABEL}
						<input
							bind:this={nameInput}
							id="{uid}-name"
							type="text"
							class={inputClass}
							bind:value={name}
							maxlength={LESS_LIKE_THIS_NAME_MAX}
							required
						/>
					</label>
					<label class="block text-gray-600 dark:text-gray-400" for="{uid}-keywords">
						{LESS_LIKE_THIS_KEYWORDS_LABEL}
						<input id="{uid}-keywords" type="text" class={inputClass} bind:value={keywordsText} />
					</label>
					<button type="submit" class={primaryButtonClass} disabled={!name.trim()}>
						{LESS_LIKE_THIS_SUBJECT_SUBMIT}
					</button>
				</fieldset>
			</form>

			{#if domain}
				<div class="space-y-2" role="group" aria-labelledby="{uid}-outlet">
					<p id="{uid}-outlet" class="font-medium text-gray-800 dark:text-gray-200">
						{LESS_LIKE_THIS_OUTLET_HEADING}
					</p>
					<button type="button" class={primaryButtonClass} disabled={pending} onclick={blockOutlet}>
						{lessLikeThisOutletButton(domain)}
					</button>
				</div>
			{/if}

			{#if failure?.login}
				<p role="alert">
					<a href="/topics" class={linkClass}>{failure.message}</a>
				</p>
			{:else if failure}
				<p class="text-red-700 dark:text-red-400" role="alert">{failure.message}</p>
			{/if}

			<button type="button" class={secondaryButtonClass} disabled={pending} onclick={cancel}>
				{LESS_LIKE_THIS_CANCEL}
			</button>
		</div>
	{/if}
</div>
