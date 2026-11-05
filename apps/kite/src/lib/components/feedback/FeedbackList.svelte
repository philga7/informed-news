<script lang="ts">
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { formatTimeAgoShort } from '$lib/topicBrief';

	type Signal = 'like' | 'not_relevant';

	type Entry = {
		id: string;
		itemId: string;
		signal: Signal;
		comment: string;
		ts: string;
		snapshot: {
			headline: string;
			source: string;
			url: string;
			topics: { id: string; name: string }[];
		};
	};

	const COMMENT_MAX = 500;
	const FALLBACK_ERROR = 'Could not save feedback. Try again.';
	const LOAD_ERROR = 'Could not load feedback. Try again.';
	const LOGIN_HINT = 'Log in on Topics to see feedback.';

	let status = $state<'loading' | 'ready' | 'unauthenticated' | 'error'>('loading');
	let entries = $state<Entry[]>([]);
	let now = $state(new Date());
	let commentOpenId = $state<string | null>(null);
	let confirmId = $state<string | null>(null);
	let drafts = $state<Record<string, string>>({});
	let pendingId = $state<string | null>(null);
	let errors = $state<Record<string, string | null>>({});
	let highlightedId = $state<string | null>(null);
	let box = $state<HTMLTextAreaElement>();

	function isSignal(value: unknown): value is Signal {
		return value === 'like' || value === 'not_relevant';
	}

	function isEntry(value: unknown): value is Entry {
		if (value === null || typeof value !== 'object') return false;
		const raw = value as Partial<Entry> & { snapshot?: Partial<Entry['snapshot']> };
		const snap = raw.snapshot;
		if (!snap || typeof snap !== 'object') return false;
		return (
			typeof raw.id === 'string' &&
			typeof raw.itemId === 'string' &&
			isSignal(raw.signal) &&
			typeof raw.comment === 'string' &&
			typeof raw.ts === 'string' &&
			typeof snap.headline === 'string' &&
			typeof snap.source === 'string' &&
			typeof snap.url === 'string' &&
			Array.isArray(snap.topics)
		);
	}

	function hashTarget(): string {
		const fromPage = page.url.hash.startsWith('#') ? page.url.hash.slice(1) : '';
		const raw =
			fromPage || (typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '');
		if (!raw) return '';
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	}

	onMount(() => {
		void load();
	});

	$effect(() => {
		if (status !== 'ready') return;
		const id = hashTarget();
		const match = entries.some((entry) => entry.id === id);
		if (!id || !match) return;
		highlightedId = id;
		const node = document.getElementById(id);
		if (!(node instanceof HTMLElement)) return;
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (typeof node.scrollIntoView === 'function') {
			node.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
		}
		node.focus();
	});

	async function load(): Promise<void> {
		try {
			const res = await fetch('/api/feedback', { credentials: 'include' });
			if (res.status === 401) {
				status = 'unauthenticated';
				return;
			}
			const body = (await res.json().catch(() => null)) as { entries?: unknown } | null;
			if (!res.ok || !Array.isArray(body?.entries)) {
				status = 'error';
				return;
			}
			entries = body.entries.filter(isEntry);
			now = new Date();
			status = 'ready';
		} catch {
			status = 'error';
		}
	}

	type Outcome = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

	async function call(method: string, path: string, payload?: unknown): Promise<Outcome> {
		try {
			const res = await fetch(`/api/feedback${path}`, {
				method,
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
			});
			const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
			if (res.ok && body?.ok === true) return { ok: true, body };
			const text = typeof body?.error === 'string' ? body.error : '';
			return { ok: false, error: res.status < 500 && text ? text : FALLBACK_ERROR };
		} catch {
			return { ok: false, error: FALLBACK_ERROR };
		}
	}

	function replaceEntry(next: Entry): void {
		entries = entries.map((entry) => (entry.id === next.id ? next : entry));
	}

	async function openBox(entry: Entry): Promise<void> {
		drafts = { ...drafts, [entry.id]: entry.comment };
		commentOpenId = entry.id;
		confirmId = null;
		await tick();
		box?.focus();
	}

	function cancelBox(): void {
		commentOpenId = null;
	}

	async function choose(entry: Entry, signal: Signal): Promise<void> {
		if (pendingId || entry.signal === signal) return;
		pendingId = entry.id;
		errors = { ...errors, [entry.id]: null };
		const outcome = await call('PATCH', `/${encodeURIComponent(entry.id)}`, { signal });
		pendingId = null;
		if (!outcome.ok) {
			errors = { ...errors, [entry.id]: outcome.error };
			return;
		}
		const next = isEntry(outcome.body.entry) ? outcome.body.entry : { ...entry, signal };
		replaceEntry(next);
		await openBox(next);
	}

	async function save(entry: Entry, event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (pendingId) return;
		pendingId = entry.id;
		errors = { ...errors, [entry.id]: null };
		const comment = drafts[entry.id] ?? '';
		const outcome = await call('PATCH', `/${encodeURIComponent(entry.id)}`, { comment });
		pendingId = null;
		if (!outcome.ok) {
			errors = { ...errors, [entry.id]: outcome.error };
			return;
		}
		const next = isEntry(outcome.body.entry) ? outcome.body.entry : { ...entry, comment };
		replaceEntry(next);
		commentOpenId = null;
	}

	async function confirmDelete(entry: Entry): Promise<void> {
		if (pendingId) return;
		pendingId = entry.id;
		errors = { ...errors, [entry.id]: null };
		const outcome = await call('DELETE', `/${encodeURIComponent(entry.id)}`);
		pendingId = null;
		if (!outcome.ok) {
			errors = { ...errors, [entry.id]: outcome.error };
			return;
		}
		entries = entries.filter((item) => item.id !== entry.id);
		if (commentOpenId === entry.id) commentOpenId = null;
		if (confirmId === entry.id) confirmId = null;
		if (highlightedId === entry.id) highlightedId = null;
	}

	const isolateShortcuts: Attachment<HTMLElement> = (node) => {
		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				const id = node.dataset.entryId;
				if (id && commentOpenId === id) {
					event.preventDefault();
					cancelBox();
				} else if (id && confirmId === id) {
					event.preventDefault();
					confirmId = null;
				}
			}
			event.stopPropagation();
		};
		node.addEventListener('keydown', onKeydown);
		return () => node.removeEventListener('keydown', onKeydown);
	};

	const toggleClass =
		'rounded-md border px-2 py-0.5 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60';
	const offClass =
		'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';
	const onClass =
		'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900';
	const quietButton =
		'rounded-md border border-gray-300 px-3 py-1 font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800';
	const linkClass =
		'text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300';
</script>

<div class="mt-8" data-testid="feedback-list">
	{#if status === 'loading'}
		<p class="text-sm text-gray-600 dark:text-gray-300">Loading feedback…</p>
	{:else if status === 'unauthenticated'}
		<p class="text-sm" role="alert">
			<a href="/topics" class="font-medium {linkClass}">{LOGIN_HINT}</a>
		</p>
	{:else if status === 'error'}
		<p class="text-sm text-red-600 dark:text-red-400" role="alert">{LOAD_ERROR}</p>
	{:else if entries.length === 0}
		<p class="text-sm text-gray-600 dark:text-gray-300">No feedback yet.</p>
	{:else}
		<ul class="space-y-4">
			{#each entries as entry (entry.id)}
				{@const headingId = `${entry.id}-headline`}
				{@const commentId = `${entry.id}-comment`}
				{@const countId = `${entry.id}-count`}
				{@const draft = drafts[entry.id] ?? entry.comment}
				{@const pending = pendingId === entry.id}
				{@const when = formatTimeAgoShort(entry.ts, now) ?? entry.ts}
				<li>
					<article
						id={entry.id}
						class="rounded-md border border-gray-200 bg-white/70 px-3 py-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900/60 {highlightedId ===
						entry.id
							? 'feedback-highlight'
							: ''}"
						data-testid="feedback-entry"
						data-entry-id={entry.id}
						tabindex="-1"
						aria-labelledby={headingId}
						{@attach isolateShortcuts}
					>
						<h2 id={headingId} class="text-base font-medium text-gray-900 dark:text-gray-100">
							{entry.snapshot.headline}
						</h2>
						<p class="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-500 dark:text-gray-400">
							<span>{entry.snapshot.source}</span>
							<a
								href={entry.snapshot.url}
								target="_blank"
								rel="noopener noreferrer"
								class={linkClass}
							>
								{entry.snapshot.url}
							</a>
							{#if entry.snapshot.topics.length > 0}
								<span>{entry.snapshot.topics.map((topic) => topic.name).join(', ')}</span>
							{/if}
							<time datetime={entry.ts}>{when}</time>
						</p>
						{#if commentOpenId !== entry.id && entry.comment}
							<p class="mt-2 text-sm text-gray-800 dark:text-gray-100">{entry.comment}</p>
						{/if}

						<div class="space-y-2 pt-2 text-xs">
							<div
								class="flex flex-wrap items-center gap-2"
								role="group"
								aria-label="Feedback on this story"
							>
								<button
									type="button"
									class="{toggleClass} {entry.signal === 'like' ? onClass : offClass}"
									aria-pressed={entry.signal === 'like'}
									disabled={pending}
									onclick={() => choose(entry, 'like')}
								>
									Like
								</button>
								<button
									type="button"
									class="{toggleClass} {entry.signal === 'not_relevant' ? onClass : offClass}"
									aria-pressed={entry.signal === 'not_relevant'}
									disabled={pending}
									onclick={() => choose(entry, 'not_relevant')}
								>
									Not relevant
								</button>
								<button
									type="button"
									class={quietButton}
									disabled={pending}
									onclick={() => openBox(entry)}
								>
									Edit comment
								</button>
							</div>

							{#if commentOpenId === entry.id}
								<form class="space-y-1" onsubmit={(event) => save(entry, event)} aria-busy={pending}>
									<label class="block text-gray-600 dark:text-gray-400" for={commentId}>
										Comment (optional)
									</label>
									<textarea
										bind:this={box}
										id={commentId}
										class="block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
										rows="2"
										maxlength={COMMENT_MAX}
										aria-describedby={countId}
										value={draft}
										disabled={pending}
										oninput={(event) => {
											const value = event.currentTarget.value;
											drafts = { ...drafts, [entry.id]: value };
										}}
									></textarea>
									<p id={countId} class="text-gray-500 dark:text-gray-400" aria-live="polite">
										{draft.length} / {COMMENT_MAX}
									</p>
									<div class="flex gap-2">
										<button
											type="submit"
											class="rounded-md bg-gray-900 px-3 py-1 font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
											disabled={pending}
										>
											Save
										</button>
										<button
											type="button"
											class={quietButton}
											disabled={pending}
											onclick={cancelBox}
										>
											Cancel
										</button>
									</div>
								</form>
							{/if}

							{#if confirmId === entry.id}
								<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Delete this feedback?">
									<span>Delete?</span>
									<button
										type="button"
										class={quietButton}
										disabled={pending}
										onclick={() => confirmDelete(entry)}
									>
										Yes
									</button>
									<button
										type="button"
										class={quietButton}
										disabled={pending}
										onclick={() => (confirmId = null)}
									>
										No
									</button>
								</div>
							{:else}
								<button
									type="button"
									class={quietButton}
									disabled={pending}
									onclick={() => {
										confirmId = entry.id;
										commentOpenId = null;
									}}
								>
									Delete
								</button>
							{/if}

							{#if errors[entry.id]}
								<p class="text-red-700 dark:text-red-400" role="alert">{errors[entry.id]}</p>
							{/if}
						</div>
					</article>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.feedback-highlight {
		background-color: rgb(254 249 195);
		animation: feedback-highlight-fade 1.6s ease forwards;
	}

	@keyframes feedback-highlight-fade {
		from {
			background-color: rgb(254 249 195);
		}
		to {
			background-color: transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.feedback-highlight {
			animation: none;
			background-color: rgb(254 249 195);
		}
	}
</style>
