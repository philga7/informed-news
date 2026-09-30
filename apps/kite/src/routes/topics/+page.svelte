<script lang="ts">
import { onMount } from 'svelte';
import { PRODUCT_NAME } from '$lib/brand';
import TopicCard from '$lib/components/topics/TopicCard.svelte';
import TopicForm from '$lib/components/topics/TopicForm.svelte';
import {
	RADAR_MUTES_ADD_LABEL,
	RADAR_MUTES_DELETE_ERROR,
	RADAR_MUTES_DELETE_LABEL,
	RADAR_MUTES_EMPTY_COPY,
	RADAR_MUTES_KEYWORD_LABEL,
	RADAR_MUTES_LOAD_ERROR,
	RADAR_MUTES_SAVE_ERROR,
	RADAR_MUTES_SOURCE_LABEL,
} from '$lib/radar';
import {
	TOPICS_ADD_LABEL,
	TOPICS_ADD_TITLE,
	TOPICS_BACK_TO_BRIEF,
	TOPICS_CORE_TITLE,
	TOPICS_EMPTY_DESIRED,
	TOPICS_EMPTY_UNDESIRED,
	TOPICS_FOOTER_NOTE,
	TOPICS_INTRO_HELP,
	TOPICS_LOAD_ERROR,
	TOPICS_LOADING_LABEL,
	TOPICS_LOGIN_ERROR,
	TOPICS_LOGIN_INTRO,
	TOPICS_LOGIN_PASSWORD_LABEL,
	TOPICS_LOGIN_PENDING_LABEL,
	TOPICS_LOGIN_SUBMIT_LABEL,
	TOPICS_LOGIN_TITLE,
	TOPICS_LOGOUT_LABEL,
	TOPICS_MUTES_HELP,
	TOPICS_MUTES_KEYWORD_REQUIRED,
	TOPICS_MUTES_TITLE,
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

type MuteRule = {
	id: string;
	keyword: string;
	source: string | null;
	createdAt: string;
};

type ApiBody = {
	ok?: boolean;
	error?: string;
	topics?: Topic[];
	rules?: MuteRule[];
} | null;

type MutationResult = { ok: true; body: ApiBody } | { ok: false; error: string | null };

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
let pendingDeleteMuteId = $state<string | null>(null);

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
	pendingDeleteMuteId = null;
}

function enterLoginShell(): void {
	unauthenticated = true;
	clearSessionState();
}

async function readBody(response: Response): Promise<ApiBody> {
	return (await response.json().catch(() => null)) as ApiBody;
}

async function loadAll(): Promise<void> {
	loading = true;
	loadError = null;
	muteLoadError = null;
	muteActionError = null;

	try {
		const [topicsResponse, mutesResponse] = await Promise.all([
			fetch('/api/topics', { credentials: 'include' }),
			fetch('/api/brief/mutes', { credentials: 'include' }),
		]);

		if (topicsResponse.status === 401 || mutesResponse.status === 401) {
			enterLoginShell();
			return;
		}

		const topicsBody = await readBody(topicsResponse);
		if (topicsResponse.ok && topicsBody?.ok && Array.isArray(topicsBody.topics)) {
			topics = topicsBody.topics;
		} else {
			topics = [];
			loadError = topicsBody?.error || TOPICS_LOAD_ERROR;
		}

		const mutesBody = await readBody(mutesResponse);
		if (mutesResponse.ok && mutesBody?.ok && Array.isArray(mutesBody.rules)) {
			muteRules = mutesBody.rules;
		} else {
			muteRules = [];
			muteLoadError = mutesBody?.error || RADAR_MUTES_LOAD_ERROR;
		}
	} catch (err) {
		console.error('Error loading topics', err);
		loadError = TOPICS_NETWORK_ERROR;
	} finally {
		loading = false;
	}
}

async function mutate(
	path: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	fallbackError: string,
	payload?: unknown,
): Promise<MutationResult> {
	try {
		const response = await fetch(path, {
			method,
			credentials: 'include',
			...(payload === undefined
				? {}
				: { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
		});

		if (response.status === 401) {
			enterLoginShell();
			return { ok: false, error: null };
		}

		const body = await readBody(response);
		if (!response.ok || !body || body.ok === false) {
			return { ok: false, error: body?.error || fallbackError };
		}
		return { ok: true, body };
	} catch (err) {
		console.error(`Error calling ${method} ${path}`, err);
		return { ok: false, error: TOPICS_NETWORK_ERROR };
	}
}

async function addTopic(payload: TopicPayload): Promise<void> {
	if (addPending) return;
	addPending = true;
	addError = null;

	const result = await mutate('/api/topics', 'POST', TOPICS_SAVE_ERROR, payload);
	addPending = false;

	if (!result.ok) {
		addError = result.error;
		return;
	}
	if (Array.isArray(result.body?.topics)) topics = result.body.topics;
	addFormKey += 1;
}

async function runCardAction(
	id: string,
	method: 'PATCH' | 'DELETE',
	fallbackError: string,
	payload?: Partial<TopicPayload>,
): Promise<void> {
	if (cardPending[id]) return;
	cardPending[id] = true;
	cardErrors[id] = null;

	const result = await mutate(
		`/api/topics/${encodeURIComponent(id)}`,
		method,
		fallbackError,
		payload,
	);
	delete cardPending[id];

	if (!result.ok) {
		if (!unauthenticated) cardErrors[id] = result.error;
		return;
	}
	delete cardErrors[id];
	if (Array.isArray(result.body?.topics)) topics = result.body.topics;
}

function moveLevel(topic: Topic, level: TopicLevel): void {
	void runCardAction(topic.id, 'PATCH', TOPICS_SAVE_ERROR, { level });
}

function saveTopic(topic: Topic, payload: TopicPayload): void {
	void runCardAction(topic.id, 'PATCH', TOPICS_SAVE_ERROR, payload);
}

function removeTopic(topic: Topic): void {
	if (!window.confirm(removeConfirmMessage(topic.name))) return;
	void runCardAction(topic.id, 'DELETE', TOPICS_REMOVE_ERROR);
}

async function applyMuteResult(result: MutationResult, fallbackError: string): Promise<boolean> {
	if (!result.ok) {
		if (!unauthenticated) muteActionError = result.error || fallbackError;
		return false;
	}
	if (Array.isArray(result.body?.rules)) muteRules = result.body.rules;
	else await loadAll();
	return true;
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
	const result = await mutate('/api/brief/mutes', 'POST', RADAR_MUTES_SAVE_ERROR, {
		keyword: nextKeyword,
		...(nextSource ? { source: nextSource } : {}),
	});
	if (await applyMuteResult(result, RADAR_MUTES_SAVE_ERROR)) {
		keyword = '';
		source = '';
	}
	pendingMute = false;
}

async function deleteMuteRule(id: string): Promise<void> {
	if (pendingDeleteMuteId || loading) return;
	pendingDeleteMuteId = id;
	muteActionError = null;
	const result = await mutate(
		`/api/brief/mutes/${encodeURIComponent(id)}`,
		'DELETE',
		RADAR_MUTES_DELETE_ERROR,
	);
	await applyMuteResult(result, RADAR_MUTES_DELETE_ERROR);
	pendingDeleteMuteId = null;
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
		const body = await readBody(response);

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
		{#if list.length === 0}
			<p class="text-xs text-gray-600 dark:text-gray-400">{emptyCopy}</p>
		{:else}
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

				{#if muteLoadError}
					<p class="text-xs text-red-600 dark:text-red-400" role="alert">{muteLoadError}</p>
				{/if}
				{#if muteActionError}
					<p class="text-xs text-red-600 dark:text-red-400" role="alert">{muteActionError}</p>
				{/if}

				<form class="flex flex-col gap-3 sm:flex-row sm:items-end" onsubmit={addMuteRule}>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
						{RADAR_MUTES_KEYWORD_LABEL}
						<input
							type="text"
							class={inputClass}
							placeholder="keyword"
							autocomplete="off"
							bind:value={keyword}
						/>
					</label>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
						{RADAR_MUTES_SOURCE_LABEL}
						<input
							type="text"
							class={inputClass}
							placeholder="domain or source"
							autocomplete="off"
							bind:value={source}
						/>
					</label>
					<button
						type="submit"
						class={primaryButtonClass}
						disabled={pendingMute || !keyword.trim()}
					>
						{RADAR_MUTES_ADD_LABEL}
					</button>
				</form>

				{#if muteRules.length === 0}
					<p class="text-xs text-gray-600 dark:text-gray-400">{RADAR_MUTES_EMPTY_COPY}</p>
				{:else}
					<ul class="space-y-2">
						{#each muteRules as rule (rule.id)}
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
									disabled={pendingDeleteMuteId === rule.id}
									onclick={() => deleteMuteRule(rule.id)}
								>
									{RADAR_MUTES_DELETE_LABEL}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<div class="mt-8 flex items-center justify-between">
				<p class="text-xs text-gray-500 dark:text-gray-400">{TOPICS_FOOTER_NOTE}</p>
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
