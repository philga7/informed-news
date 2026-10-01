<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { dataReloadService } from '$lib/services/dataService';
	import {
		BRIEF_REFRESHING_LABEL,
		BRIEF_REFRESH_ERROR,
		BRIEF_REFRESH_LABEL,
		BRIEF_REFRESH_LOGIN_HINT,
		BRIEF_REFRESH_POLL_MS,
		fetchBriefOverview,
		isRecoverableRefreshFailure,
		lastSuccessAt,
		nextRefreshLabel,
		overviewPollFailure,
		postBriefRefresh,
		refreshPollOutcome,
		updatedLabel,
		type BriefOverviewRefresh,
	} from '$lib/topicBrief';

	interface Props {
		refresh: BriefOverviewRefresh;
		notices?: string[];
	}

	let { refresh, notices = [] }: Props = $props();

	let now = $state(new Date());
	let refreshing = $state(false);
	let polling = $state(false);
	let polled = $state<{ refresh: BriefOverviewRefresh; notices: string[] } | null>(null);
	let errorMessage = $state<string | null>(null);
	let loginHint = $state(false);

	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let pollBaseline: string | null = null;
	let pollFailures = 0;
	let destroyed = false;

	const currentRefresh = $derived(polled?.refresh ?? refresh);
	const currentNotices = $derived(polled?.notices ?? notices);
	const updated = $derived(updatedLabel(currentRefresh, now));
	const next = $derived(nextRefreshLabel(currentRefresh.nextAt, now));
	const busy = $derived(refreshing || polling || currentRefresh.running);

	$effect(() => {
		const timer = setInterval(() => {
			now = new Date();
		}, 60_000);
		return () => clearInterval(timer);
	});

	// A new overview from the parent (e.g. after a reload) replaces data from an earlier poll.
	$effect(() => {
		void refresh;
		untrack(() => {
			if (!polling) polled = null;
		});
	});

	onMount(() => {
		if (refresh.running) startPolling(lastSuccessAt(refresh), false);
		return () => {
			destroyed = true;
			if (pollTimer !== null) clearTimeout(pollTimer);
		};
	});

	/** Poll the overview until the refresh stops running, then reload if it produced a new Brief. */
	function startPolling(baseline: string | null, immediately: boolean): void {
		if (polling || destroyed) return;
		polling = true;
		pollBaseline = baseline;
		pollFailures = 0;
		if (immediately) void pollOnce();
		else schedulePoll();
	}

	function schedulePoll(): void {
		pollTimer = setTimeout(() => {
			pollTimer = null;
			void pollOnce();
		}, BRIEF_REFRESH_POLL_MS);
	}

	async function pollOnce(): Promise<void> {
		const overview = await fetchBriefOverview();
		if (destroyed) return;
		if (!overview) {
			const failure = overviewPollFailure(pollFailures);
			pollFailures = failure.failures;
			if (!failure.stop) {
				schedulePoll();
				return;
			}
			polling = false;
			errorMessage = BRIEF_REFRESH_ERROR;
			return;
		}
		pollFailures = 0;
		polled = { refresh: overview.refresh, notices: overview.notices };
		const outcome = refreshPollOutcome(pollBaseline, overview.refresh);
		if (outcome.kind === 'running') {
			schedulePoll();
			return;
		}
		polling = false;
		errorMessage = outcome.error;
		if (outcome.reload) await dataReloadService.reloadData();
	}

	async function handleRefresh(): Promise<void> {
		if (busy) return;
		const baseline = lastSuccessAt(currentRefresh);
		polled = null;
		refreshing = true;
		errorMessage = null;
		loginHint = false;

		const result = await postBriefRefresh();
		refreshing = false;
		if (destroyed) return;

		if (result.ok) {
			await dataReloadService.reloadData();
			return;
		}
		if (result.unauthenticated) {
			loginHint = true;
			return;
		}
		if (isRecoverableRefreshFailure(result)) {
			startPolling(baseline, true);
			return;
		}
		errorMessage = result.error ? `Refresh failed: ${result.error}` : BRIEF_REFRESH_ERROR;
	}
</script>

<div class="mb-6 border-b border-gray-200 pb-3 dark:border-gray-700" data-testid="brief-refresh-bar">
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
		<p class="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-600 dark:text-gray-400">
			<span class="font-medium text-gray-800 dark:text-gray-200">{updated}</span>
			{#if next}
				<span aria-hidden="true" class="text-gray-400 dark:text-gray-600">·</span>
				<span>{next}</span>
			{/if}
		</p>
		<button
			type="button"
			class="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-800"
			disabled={busy}
			aria-busy={busy}
			onclick={handleRefresh}
		>
			{busy ? BRIEF_REFRESHING_LABEL : BRIEF_REFRESH_LABEL}
		</button>
	</div>

	{#if currentNotices.length > 0}
		<p class="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
			{currentNotices.join(' · ')}
		</p>
	{/if}

	{#if loginHint}
		<p class="mt-2 text-xs" role="alert">
			<a
				href="/topics"
				class="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				{BRIEF_REFRESH_LOGIN_HINT}
			</a>
		</p>
	{:else if errorMessage}
		<p class="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{errorMessage}</p>
	{/if}
</div>
