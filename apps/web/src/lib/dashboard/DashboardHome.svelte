<script lang="ts">
	import { onMount } from 'svelte';
	import {
		parseBriefStatus,
		postRefresh,
		REFRESH_POLL_MAX_MS,
		REFRESH_POLL_MS,
		settleRefresh,
		type BriefStatus,
	} from '$lib/brief/briefClient';
	import DevelopingList, {
		isDashboardCategory,
		isDashboardStory,
		isHiddenStory,
		type DashboardCategory,
		type DashboardStory,
		type HiddenStory,
	} from './DevelopingList.svelte';
	import MorningCards, { type MorningDeck } from './MorningCards.svelte';
	import FetchStatus from './FetchStatus.svelte';
	import TrackersLine, { type Trackers } from './TrackersLine.svelte';

	/**
	 * Home at /shell. The nav is in the first render. Block headings appear
	 * after /api/me and /api/dashboard. A 401 skips the blocks.
	 */

	type DashboardOk = {
		ok: true;
		developing: DashboardStory[];
		quiet: DashboardStory[];
		hidden: HiddenStory[];
		categories: DashboardCategory[];
		trackers: Trackers;
		morning: MorningDeck;
	};

	type View =
		| { kind: 'loading' }
		| { kind: 'signed-out' }
		| { kind: 'unavailable' }
		| { kind: 'ready'; dashboard: DashboardOk; hasAccount: boolean; status: BriefStatus | null };

	let view = $state<View>({ kind: 'loading' });
	let refreshing = $state(false);
	/** A newer load drops an older one that is still in flight. */
	let loadGeneration = 0;
	/** False after unmount, so a poll in flight does not schedule another. */
	let refreshWatchAlive = true;
	let runningWatch: { timer: number | null; waited: number } | null = null;

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function isDashboard(value: unknown): value is DashboardOk {
		if (!isRecord(value) || value.ok !== true) return false;
		if (!Array.isArray(value.developing) || !value.developing.every(isDashboardStory)) return false;
		if (!Array.isArray(value.quiet) || !value.quiet.every(isDashboardStory)) return false;
		if (!Array.isArray(value.hidden) || !value.hidden.every(isHiddenStory)) return false;
		if (!Array.isArray(value.categories) || !value.categories.every(isDashboardCategory)) return false;
		if (!isRecord(value.trackers) || !Array.isArray(value.trackers.stories)) return false;
		if (!isRecord(value.morning)) return false;
		return true;
	}

	/** Overview status only. The shell does not render the Brief's stories. */
	async function loadStatus(): Promise<BriefStatus | null> {
		try {
			const response = await fetch('/api/brief/overview', {
				credentials: 'include',
				cache: 'no-store',
			});
			if (!response.ok) return null;
			return parseBriefStatus(await response.json());
		} catch {
			return null;
		}
	}

	async function load(): Promise<void> {
		const generation = ++loadGeneration;
		try {
			const me = await fetch('/api/me', { credentials: 'include' });
			if (generation !== loadGeneration) return;
			if (me.status === 401) {
				view = { kind: 'signed-out' };
				return;
			}
			const meBody: unknown = await me.json().catch(() => null);
			if (generation !== loadGeneration) return;
			const account = isRecord(meBody) && isRecord(meBody.user);
			const dashboard = await fetch('/api/dashboard', { credentials: 'include' });
			if (generation !== loadGeneration) return;
			if (dashboard.status === 401) {
				view = { kind: 'signed-out' };
				return;
			}
			const body: unknown = await dashboard.json().catch(() => null);
			if (generation !== loadGeneration) return;
			if (!dashboard.ok || !isDashboard(body)) {
				view = { kind: 'unavailable' };
				return;
			}
			const status = await loadStatus();
			if (generation !== loadGeneration || !refreshWatchAlive) return;
			view = { kind: 'ready', dashboard: body, hasAccount: account, status };
			watchRunningFetch();
		} catch {
			if (generation !== loadGeneration || !refreshWatchAlive) return;
			view = { kind: 'unavailable' };
		}
	}

	function clearRunningWatch(): void {
		if (!runningWatch) return;
		if (runningWatch.timer !== null) window.clearTimeout(runningWatch.timer);
		runningWatch = null;
	}

	/**
	 * A load that found a fetch already running has no click to settle. Read the
	 * overview until that run stops. Do not POST. At the poll cap, leave the
	 * running line and do not invent a failure.
	 */
	function watchRunningFetch(): void {
		if (!refreshWatchAlive || refreshing) return;
		if (view.kind !== 'ready' || !view.status?.running) {
			clearRunningWatch();
			return;
		}
		if (runningWatch) return;
		const watch: { timer: number | null; waited: number } = { timer: null, waited: 0 };
		runningWatch = watch;
		const schedule = (): void => {
			watch.timer = window.setTimeout(() => {
				watch.timer = null;
				void readRunningFetch();
			}, REFRESH_POLL_MS);
		};
		const readRunningFetch = async (): Promise<void> => {
			if (!refreshWatchAlive || runningWatch !== watch) return;
			watch.waited += REFRESH_POLL_MS;
			const status = await loadStatus();
			if (!refreshWatchAlive || runningWatch !== watch) return;
			if (status && !status.running) {
				runningWatch = null;
				if (view.kind === 'ready') view = { ...view, status };
				return;
			}
			if (!refreshWatchAlive || runningWatch !== watch) return;
			if (watch.waited >= REFRESH_POLL_MAX_MS) {
				runningWatch = null;
				return;
			}
			schedule();
		};
		schedule();
	}

	async function refreshPipeline(): Promise<void> {
		if (refreshing) return;
		if (view.kind !== 'ready' || view.status === null || !view.status.keysOn || view.status.running) {
			return;
		}
		refreshing = true;
		clearRunningWatch();
		const generation = loadGeneration;
		const clickedAt = Date.now();
		try {
			const result = await postRefresh();
			if (!refreshWatchAlive || generation !== loadGeneration || view.kind !== 'ready') return;
			// A dropped POST can still be running on the server. Ask before calling it done.
			if (!result.ok && !result.unauthenticated) {
				await settleRefresh(clickedAt);
				if (!refreshWatchAlive || generation !== loadGeneration || view.kind !== 'ready') return;
			}
			const status = await loadStatus();
			if (!refreshWatchAlive || generation !== loadGeneration || view.kind !== 'ready') return;
			// A non-OK overview, bad JSON, or a network error is null. Keep the line we had.
			if (status === null) return;
			view = { ...view, status };
		} catch {
			// An unexpected throw leaves the line as it was.
		} finally {
			refreshing = false;
			if (refreshWatchAlive) watchRunningFetch();
		}
	}

	onMount(() => {
		void load();
		return () => {
			refreshWatchAlive = false;
			clearRunningWatch();
		};
	});
</script>

<div class="dash">
	<header>
		<div class="brand">
			<h1>Informed News</h1>
			<p>informed-news</p>
		</div>
		<nav>
			<a href="/shell" aria-current="page">Home</a>
			<a href="/topics">Topics</a>
		</nav>
		{#if view.kind === 'ready' && view.status}
			<div class="status">
				<FetchStatus
					running={refreshing || view.status.running}
					runningSince={view.status.runningSince}
					lastFetchAt={view.status.lastFetchAt}
					lastFetchOk={view.status.lastFetchOk}
					keysOn={view.status.keysOn}
					onRefresh={refreshPipeline}
				/>
			</div>
		{/if}
	</header>

	{#if view.kind === 'signed-out'}
		<p class="notice"><a href="/topics">Sign in to see the dashboard</a></p>
	{:else if view.kind === 'unavailable'}
		<p class="notice">data unavailable</p>
	{:else if view.kind === 'ready'}
		<TrackersLine trackers={view.dashboard.trackers} />
		<section>
			<h2>Breaking</h2>
			<p class="empty">Not on this page yet</p>
		</section>
		<section>
			<h2>Developing stories</h2>
			<DevelopingList
				developing={view.dashboard.developing}
				quiet={view.dashboard.quiet}
				categories={view.dashboard.categories}
				hidden={view.dashboard.hidden}
				hasAccount={view.hasAccount}
				onReload={load}
			/>
		</section>
		<section>
			<h2>Morning</h2>
			<MorningCards morning={view.dashboard.morning} />
		</section>
		<section>
			<h2>CFP</h2>
			<p class="empty">Not on this page yet</p>
		</section>
		<section>
			<h2>My topics</h2>
			<p class="empty">Not on this page yet</p>
		</section>
	{/if}
</div>

<style>
	.dash {
		min-height: 100vh;
		box-sizing: border-box;
		background: #14161a;
		color: #e6e2d8;
		font-family: system-ui, sans-serif;
		font-size: 15px;
		line-height: 1.45;
		padding: 1.25rem 1.5rem 3rem;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.25rem;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid #2c3038;
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-right: auto;
	}

	.brand :global(h1),
	.brand p {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.brand p {
		color: #9c978c;
		font-weight: 500;
	}

	nav {
		display: flex;
		gap: 0.9rem;
	}

	nav a {
		color: #c8c3b8;
		text-decoration: none;
	}

	nav a[aria-current='page'] {
		color: #f3efe6;
	}

	.status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem;
		color: #b7b2a6;
		font-size: 0.85rem;
	}

	.status :global(p) {
		margin: 0;
	}

	.status :global(button) {
		font: inherit;
		color: #f3efe6;
		background: transparent;
		border: 1px solid #3c414b;
		border-radius: 999px;
		padding: 0.2rem 0.7rem;
		cursor: pointer;
	}

	.status :global(button:disabled) {
		opacity: 0.45;
		cursor: default;
	}

	section {
		padding: 1.1rem 0 0.2rem;
		border-top: 1px solid #2c3038;
	}

	h2 {
		margin: 0 0 0.7rem;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #9c978c;
	}

	.empty,
	.notice {
		margin: 0.4rem 0 1rem;
		color: #9c978c;
	}

	.notice a {
		color: #e6e2d8;
	}
</style>
