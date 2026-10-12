<script lang="ts">
import { onMount } from 'svelte';
import { PRODUCT_NAME } from '$lib/brand';
import TopicCard from '$lib/components/topics/TopicCard.svelte';
import TopicForm from '$lib/components/topics/TopicForm.svelte';
import TopicsMuteSection from '$lib/components/topics/TopicsMuteSection.svelte';
import { FILTERED_TOPICS_LINK } from '$lib/filteredOut';
import {
	fetchTopicsPage,
	mutateTopicsApi,
	type TopicsApiBody,
} from '$lib/topicsApi';
import {
	MUTES_DELETE_ERROR,
	MUTES_SAVE_ERROR,
	type MuteRule,
	TOPICS_ADD_LABEL,
	TOPICS_ADD_TITLE,
	TOPICS_BACK_TO_BRIEF,
	TOPICS_CORE_TITLE,
	TOPICS_EMPTY_DESIRED,
	TOPICS_EMPTY_UNDESIRED,
	TOPICS_FOOTER_NOTE,
	TOPICS_INTRO_HELP,
	TOPICS_LOADING_LABEL,
	TOPICS_LOGIN_ERROR,
	TOPICS_LOGIN_INTRO,
	TOPICS_LOGIN_PASSWORD_LABEL,
	TOPICS_LOGIN_PENDING_LABEL,
	TOPICS_LOGIN_SUBMIT_LABEL,
	TOPICS_LOGIN_TITLE,
	TOPICS_LOGOUT_LABEL,
	TOPICS_MUTES_KEYWORD_REQUIRED,
	TOPICS_NETWORK_ERROR,
	TOPICS_PAGE_DESCRIPTION,
	TOPICS_PAGE_TITLE,
	TOPICS_REMOVE_ERROR,
	TOPICS_SAVE_ERROR,
	TOPICS_UNDESIRED_TITLE,
	TOPICS_WATCH_TITLE,
	emptyTopicForm,
	groupTopics,
	removeConfirmMessage,
	type Topic,
	type TopicLevel,
	type TopicPayload,
} from '$lib/topics';

type MutationResult =
	| { ok: true; body: TopicsApiBody; seq: number | null }
	| { ok: false; error: string | null };

let loading = $state(true);
let unauthenticated = $state(false);
let password = $state('');
let loggingIn = $state(false);
let loginError = $state<string | null>(null);

let topics = $state<Topic[]>([]);
let loadError = $state<string | null>(null);
let addPending = $state(false);
let addError = $state<string | null>(null);
let addFormKey = $state(0);
let cardPending = $state<Record<string, boolean>>({});
let cardErrors = $state<Record<string, string | null>>({});

let muteRules = $state<MuteRule[]>([]);
let muteLoadError = $state<string | null>(null);
let muteActionError = $state<string | null>(null);
let keyword = $state('');
let source = $state('');
let pendingMute = $state(false);
let pendingDeleteMute = $state(false);

/** Monotonic seq so overlapping write responses cannot apply an older list. */
let topicsRequestSeq = 0;
let topicsAppliedSeq = 0;

const grouped = $derived(groupTopics(topics));

const inputClass =
	'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
const primaryButtonClass =
	'inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-100 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-offset-gray-900';
const panelClass =
	'rounded-md border border-gray-200 bg-white/80 p-4 text-sm shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/70';

function clearSessionState(): void {
	topics = [];
	muteRules = [];
	loadError = null;
	addError = null;
	muteLoadError = null;
	muteActionError = null;
	cardPending = {};
	cardErrors = {};
	pendingDeleteMute = false;
	topicsRequestSeq = 0;
	topicsAppliedSeq = 0;
}

function enterLoginShell(): void {
	unauthenticated = true;
	clearSessionState();
}

function applyTopics(next: Topic[], seq: number): void {
	if (seq <= topicsAppliedSeq) return;
	topicsAppliedSeq = seq;
	topics = next;
}

async function loadAll(): Promise<void> {
	loading = true;
	loadError = null;
	muteLoadError = null;
	muteActionError = null;

	const result = await fetchTopicsPage();
	loading = false;

	if (!result.ok && result.unauthenticated) {
		enterLoginShell();
		return;
	}
	if (!result.ok) {
		topics = [];
		muteRules = [];
		loadError = result.loadError;
		return;
	}

	if (result.loadError) {
		topics = [];
		loadError = result.loadError;
	} else {
		const seq = ++topicsRequestSeq;
		applyTopics(result.topics, seq);
	}
	muteRules = result.muteRules;
	muteLoadError = result.muteLoadError;
}

async function mutate(
	path: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	fallbackError: string,
	payload?: unknown,
	options?: { trackTopicsSeq?: boolean },
): Promise<MutationResult> {
	const seq = options?.trackTopicsSeq ? ++topicsRequestSeq : null;
	const result = await mutateTopicsApi(path, method, fallbackError, payload);
	if (!result.ok && result.unauthenticated) {
		enterLoginShell();
		return { ok: false, error: null };
	}
	if (!result.ok) {
		return { ok: false, error: result.error };
	}
	return { ok: true, body: result.body, seq };
}

async function addTopic(payload: TopicPayload): Promise<void> {
	if (addPending) return;
	addPending = true;
	addError = null;

	const result = await mutate('/api/topics', 'POST', TOPICS_SAVE_ERROR, payload, {
		trackTopicsSeq: true,
	});
	addPending = false;

	if (!result.ok) {
		addError = result.error;
		return;
	}
	if (Array.isArray(result.body?.topics) && result.seq !== null) {
		applyTopics(result.body.topics, result.seq);
	}
	addFormKey += 1;
}

async function runCardAction(
	id: string,
	method: 'PATCH' | 'DELETE',
	fallbackError: string,
	payload?: Partial<TopicPayload>,
): Promise<boolean> {
	if (cardPending[id]) return false;
	cardPending[id] = true;
	cardErrors[id] = null;

	const result = await mutate(
		`/api/topics/${encodeURIComponent(id)}`,
		method,
		fallbackError,
		payload,
		{ trackTopicsSeq: true },
	);
	delete cardPending[id];

	if (!result.ok) {
		if (!unauthenticated) cardErrors[id] = result.error;
		return false;
	}
	delete cardErrors[id];
	if (Array.isArray(result.body?.topics) && result.seq !== null) {
		applyTopics(result.body.topics, result.seq);
	}
	return true;
}

function moveLevel(topic: Topic, level: TopicLevel): void {
	void runCardAction(topic.id, 'PATCH', TOPICS_SAVE_ERROR, { level });
}

function saveTopic(topic: Topic, payload: TopicPayload): Promise<boolean> {
	return runCardAction(topic.id, 'PATCH', TOPICS_SAVE_ERROR, payload);
}

function clearCardError(id: string): void {
	delete cardErrors[id];
}

function removeTopic(topic: Topic): void {
	if (!window.confirm(removeConfirmMessage(topic.name))) return;
	void runCardAction(topic.id, 'DELETE', TOPICS_REMOVE_ERROR);
}

function applyMuteResult(result: MutationResult, fallbackError: string): boolean {
	if (!result.ok) {
		if (!unauthenticated) muteActionError = result.error || fallbackError;
		return false;
	}
	if (Array.isArray(result.body?.rules)) {
		muteRules = result.body.rules;
		return true;
	}
	// API always returns rules; avoid a destructive reload that would wipe in-progress forms.
	muteActionError = fallbackError;
	return false;
}

async function addMuteRule(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (pendingMute || loading) return;

	const nextKeyword = keyword.trim();
	const nextSource = source.trim();
	if (!nextKeyword) {
		muteActionError = TOPICS_MUTES_KEYWORD_REQUIRED;
		return;
	}

	muteActionError = null;
	pendingMute = true;
	const result = await mutate('/api/brief/mutes', 'POST', MUTES_SAVE_ERROR, {
		keyword: nextKeyword,
		...(nextSource ? { source: nextSource } : {}),
	});
	if (applyMuteResult(result, MUTES_SAVE_ERROR)) {
		keyword = '';
		source = '';
	}
	pendingMute = false;
}

async function deleteMuteRule(id: string): Promise<void> {
	if (pendingDeleteMute || loading) return;
	pendingDeleteMute = true;
	muteActionError = null;
	const result = await mutate(
		`/api/brief/mutes/${encodeURIComponent(id)}`,
		'DELETE',
		MUTES_DELETE_ERROR,
	);
	applyMuteResult(result, MUTES_DELETE_ERROR);
	pendingDeleteMute = false;
}

async function handleLogin(event: SubmitEvent): Promise<void> {
	event.preventDefault();
	if (!password || loggingIn) return;

	loginError = null;
	loggingIn = true;

	try {
		const response = await fetch('/api/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ password }),
		});
		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			error?: string;
		} | null;

		if (!response.ok || (body && body.ok === false)) {
			loginError = body?.error || TOPICS_LOGIN_ERROR;
			return;
		}

		password = '';
		unauthenticated = false;
		await loadAll();
	} catch (err) {
		console.error('Error during topics login', err);
		loginError = TOPICS_NETWORK_ERROR;
	} finally {
		loggingIn = false;
	}
}

async function handleLogout(): Promise<void> {
	try {
		await fetch('/api/logout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
		});
	} catch (err) {
		console.error('Error during topics logout', err);
	} finally {
		enterLoginShell();
	}
}

onMount(() => {
	void loadAll();
});
</script>

{#snippet topicGroup(id: string, title: string, list: Topic[], emptyCopy: string)}
	<section class="mt-8 space-y-3" aria-labelledby={id}>
		<h2 {id} class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
			{title}
			<span class="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400">({list.length})</span>
		</h2>
		{#if list.length === 0 && !loadError}
			<p class="text-xs text-gray-600 dark:text-gray-400">{emptyCopy}</p>
		{:else if list.length > 0}
			<ul class="space-y-3">
				{#each list as topic (topic.id)}
					<li>
						<TopicCard
							{topic}
							pending={Boolean(cardPending[topic.id])}
							error={cardErrors[topic.id] ?? null}
							onMoveLevel={topic.kind === 'desired'
								? (level: TopicLevel) => moveLevel(topic, level)
								: undefined}
							onSave={(payload: TopicPayload) => saveTopic(topic, payload)}
							onRemove={() => removeTopic(topic)}
							onClearError={() => clearCardError(topic.id)}
						/>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/snippet}

<svelte:head>
	<title>{TOPICS_PAGE_TITLE}</title>
	<meta name="description" content={TOPICS_PAGE_DESCRIPTION} />
</svelte:head>

<div
	class="min-h-screen bg-app-bg text-gray-900 dark:text-gray-100"
	style="font-family: var(--font-lufga), system-ui, sans-serif;"
>
	<main class="mx-auto max-w-3xl px-4 py-12 sm:py-16">
		<p class="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">
			{PRODUCT_NAME}
		</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Topics</h1>
		<p class="mt-3 text-base text-gray-600 dark:text-gray-300">{TOPICS_INTRO_HELP}</p>

		{#if loading}
			<p class="mt-8 text-sm text-gray-600 dark:text-gray-300">{TOPICS_LOADING_LABEL}</p>
		{:else if unauthenticated}
			<section class="mt-8 max-w-sm {panelClass}" aria-labelledby="topics-login-title">
				<h2
					id="topics-login-title"
					class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100"
				>
					{TOPICS_LOGIN_TITLE}
				</h2>
				<p class="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
					{TOPICS_LOGIN_INTRO}
				</p>
				{#if loginError}
					<p class="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">{loginError}</p>
				{/if}
				<form class="mt-4 space-y-3" onsubmit={handleLogin}>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">
						{TOPICS_LOGIN_PASSWORD_LABEL}
						<input
							type="password"
							class={inputClass}
							autocomplete="current-password"
							bind:value={password}
						/>
					</label>
					<button type="submit" class={primaryButtonClass} disabled={loggingIn || !password}>
						{loggingIn ? TOPICS_LOGIN_PENDING_LABEL : TOPICS_LOGIN_SUBMIT_LABEL}
					</button>
				</form>
			</section>
		{:else}
			{#if loadError}
				<p class="mt-8 text-sm text-red-600 dark:text-red-400" role="alert">{loadError}</p>
			{/if}

			<section class="mt-8 {panelClass}" aria-labelledby="topics-add-title">
				<h2
					id="topics-add-title"
					class="mb-3 text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100"
				>
					{TOPICS_ADD_TITLE}
				</h2>
				{#key addFormKey}
					<TopicForm
						initial={emptyTopicForm()}
						submitLabel={TOPICS_ADD_LABEL}
						pending={addPending}
						error={addError}
						onSubmit={addTopic}
					/>
				{/key}
			</section>

			{@render topicGroup('topics-core', TOPICS_CORE_TITLE, grouped.core, TOPICS_EMPTY_DESIRED)}
			{@render topicGroup('topics-watch', TOPICS_WATCH_TITLE, grouped.watch, TOPICS_EMPTY_DESIRED)}
			{@render topicGroup(
				'topics-undesired',
				TOPICS_UNDESIRED_TITLE,
				grouped.undesired,
				TOPICS_EMPTY_UNDESIRED,
			)}

			<TopicsMuteSection
				rules={muteRules}
				{keyword}
				{source}
				{pendingMute}
				pendingDelete={pendingDeleteMute}
				loadError={muteLoadError}
				actionError={muteActionError}
				showEmpty={!loadError}
				onKeywordChange={(value) => (keyword = value)}
				onSourceChange={(value) => (source = value)}
				onAdd={addMuteRule}
				onDelete={deleteMuteRule}
			/>

			<div class="mt-8 flex items-center justify-between gap-4">
				<p class="text-xs text-gray-500 dark:text-gray-400">
					{TOPICS_FOOTER_NOTE}
					<a
						href="/filtered"
						class="ml-1 font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						{FILTERED_TOPICS_LINK}
					</a>
				</p>
				<button
					type="button"
					class="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					onclick={handleLogout}
				>
					{TOPICS_LOGOUT_LABEL}
				</button>
			</div>
		{/if}

		<p class="mt-12">
			<a
				href="/"
				class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				{TOPICS_BACK_TO_BRIEF}
			</a>
		</p>
	</main>
</div>
