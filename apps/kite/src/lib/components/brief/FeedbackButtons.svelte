<script module lang="ts">
	import { SvelteMap } from 'svelte/reactivity';

	/**
	 * Like / Not relevant (NEWS-191). Self-contained: only talks to /api/feedback.
	 * A soft signal only; it never mutes. "Less like this" stays the hard mute.
	 */
	type Signal = 'like' | 'not_relevant';
	type Entry = { id: string; itemId: string; signal: Signal; comment: string };

	const COMMENT_MAX = 500;
	const FALLBACK_ERROR = 'Could not save feedback. Try again.';

	/** Feedback by itemId for this page load, filled by one GET shared by every card. */
	const entries = new SvelteMap<string, Entry>();
	let loadPromise: Promise<void> | null = null;

	/** Test seam: forget the page-load GET so the next card loads again. */
	export function resetFeedbackCache(): void {
		entries.clear();
		loadPromise = null;
	}

	function isEntry(value: unknown): value is Entry {
		const e = value as Partial<Entry> | null;
		return (
			!!e &&
			typeof e.id === 'string' &&
			typeof e.itemId === 'string' &&
			(e.signal === 'like' || e.signal === 'not_relevant') &&
			typeof e.comment === 'string'
		);
	}

	function loadOnce(): Promise<void> {
		loadPromise ??= (async () => {
			try {
				const res = await fetch('/api/feedback', { credentials: 'include' });
				const body = (await res.json().catch(() => null)) as { entries?: unknown } | null;
				if (!res.ok || !Array.isArray(body?.entries)) throw new Error('load failed');
				for (const raw of body.entries) if (isEntry(raw)) entries.set(raw.itemId, raw);
			} catch {
				loadPromise = null; // let the next card retry
			}
		})();
		return loadPromise;
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
			// Show the server's text for client errors; keep 5xx internals (paths) out of the UI.
			const text = typeof body?.error === 'string' ? body.error : '';
			return { ok: false, error: res.status < 500 && text ? text : FALLBACK_ERROR };
		} catch {
			return { ok: false, error: FALLBACK_ERROR };
		}
	}
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		itemId: string;
	}

	let { itemId }: Props = $props();

	const uid = $props.id();
	const current = $derived(entries.get(itemId) ?? null);

	let commentOpen = $state(false);
	let comment = $state('');
	let pending = $state(false);
	let error = $state<string | null>(null);
	let box = $state<HTMLTextAreaElement>();

	onMount(() => {
		void loadOnce();
	});

	/** Keep page shortcuts (Enter / j / k / ? …) out of this control; Escape cancels an open box. */
	const isolateShortcuts: Attachment<HTMLElement> = (node) => {
		const onKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && commentOpen) {
				event.preventDefault();
				cancel();
			}
			event.stopPropagation();
		};
		node.addEventListener('keydown', onKeydown);
		return () => node.removeEventListener('keydown', onKeydown);
	};

	async function openBox(): Promise<void> {
		comment = entries.get(itemId)?.comment ?? '';
		commentOpen = true;
		await tick();
		box?.focus();
	}

	function cancel(): void {
		commentOpen = false;
		error = null;
	}

	async function choose(signal: Signal): Promise<void> {
		if (pending) return;
		pending = true;
		error = null;
		await loadOnce(); // a click before the page-load GET lands must not POST over saved feedback
		const existing = entries.get(itemId);
		let outcome: Outcome;
		if (!existing) {
			outcome = await call('POST', '', { itemId, signal });
		} else if (existing.signal === signal) {
			outcome = await call('DELETE', `/${encodeURIComponent(existing.id)}`);
			if (outcome.ok) {
				entries.delete(itemId);
				commentOpen = false;
			}
			pending = false;
			if (!outcome.ok) error = outcome.error;
			return;
		} else {
			outcome = await call('PATCH', `/${encodeURIComponent(existing.id)}`, { signal });
		}
		pending = false;
		if (!outcome.ok) {
			error = outcome.error;
			return;
		}
		if (isEntry(outcome.body.entry)) entries.set(itemId, outcome.body.entry);
		await openBox();
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const existing = entries.get(itemId);
		if (!existing || pending) return;
		pending = true;
		error = null;
		const outcome = await call('PATCH', `/${encodeURIComponent(existing.id)}`, { comment });
		pending = false;
		if (!outcome.ok) {
			error = outcome.error;
			return;
		}
		if (isEntry(outcome.body.entry)) entries.set(itemId, outcome.body.entry);
		commentOpen = false;
	}

	const toggleClass =
		'rounded-md border px-2 py-0.5 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60';
	const offClass =
		'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800';
	const onClass =
		'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900';
</script>

<div class="space-y-2 pt-1 text-xs" data-testid="feedback-buttons" {@attach isolateShortcuts}>
	<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Feedback on this story">
		<button
			type="button"
			class="{toggleClass} {current?.signal === 'like' ? onClass : offClass}"
			aria-pressed={current?.signal === 'like'}
			disabled={pending}
			onclick={() => choose('like')}
		>
			Like
		</button>
		<button
			type="button"
			class="{toggleClass} {current?.signal === 'not_relevant' ? onClass : offClass}"
			aria-pressed={current?.signal === 'not_relevant'}
			disabled={pending}
			onclick={() => choose('not_relevant')}
		>
			Not relevant
		</button>
	</div>

	{#if commentOpen && current}
		<form class="space-y-1" onsubmit={save} aria-busy={pending}>
			<label class="block text-gray-600 dark:text-gray-400" for="{uid}-comment">
				Comment (optional)
			</label>
			<textarea
				bind:this={box}
				id="{uid}-comment"
				class="block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
				rows="2"
				maxlength={COMMENT_MAX}
				aria-describedby="{uid}-count"
				bind:value={comment}
				disabled={pending}
			></textarea>
			<p id="{uid}-count" class="text-gray-500 dark:text-gray-400" aria-live="polite">
				{comment.length} / {COMMENT_MAX}
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
					class="rounded-md border border-gray-300 px-3 py-1 font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
					disabled={pending}
					onclick={cancel}
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	{#if error}
		<p class="text-red-700 dark:text-red-400" role="alert">{error}</p>
	{/if}
</div>
