<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { PRODUCT_NAME } from '$lib/brand';
	import {
		RADAR_ACCEPT_ERROR,
		RADAR_ACCEPT_LABEL,
		RADAR_ACCEPT_PENDING,
		RADAR_EMPTY_COPY,
		RADAR_ERROR_GENERIC,
		RADAR_HIDDEN_MUTED_PREFIX,
		RADAR_LOGIN_INTRO,
		RADAR_META_HELP,
		RADAR_MUTED_LABEL,
		RADAR_MUTES_ADD_LABEL,
		RADAR_MUTES_DELETE_ERROR,
		RADAR_MUTES_DELETE_LABEL,
		RADAR_MUTES_EMPTY_COPY,
		RADAR_MUTES_KEYWORD_LABEL,
		RADAR_MUTES_LOAD_ERROR,
		RADAR_MUTES_SAVE_ERROR,
		RADAR_MUTES_SECTION_HELP,
		RADAR_MUTES_SECTION_TITLE,
		RADAR_MUTES_SOURCE_LABEL,
		RADAR_NETWORK_ERROR,
		RADAR_PAGE_DESCRIPTION,
		RADAR_PAGE_TITLE,
		RADAR_TRACKED_SECTION_HELP,
		RADAR_TRACKED_SECTION_TITLE,
		RADAR_TRACKED_ACK_ERROR,
		RADAR_TRACKED_DISMISS_LABEL,
		RADAR_TRACKED_DISMISS_PENDING,
		RADAR_TRACKED_UPDATE_BADGE,
		RADAR_TRACK_ERROR,
		RADAR_TRACK_LABEL,
		RADAR_TRACK_PENDING,
		RADAR_UNACCEPT_LABEL,
		RADAR_UNTRACK_LABEL,
	} from '$lib/radar';

	type RadarHeadline = {
		id: string;
		title: string;
		sourceKind: 'cfp' | 'rss';
		publisherDomain: string | null;
		publishedAt: string | null;
		canonicalUrl: string;
		citationLabel: string | null;
	};

	type RadarCluster = {
		clusterId: string;
		headlines: RadarHeadline[];
		newestAt: string | null;
		accepted: boolean;
		tracked: boolean;
		pendingUpdate?: boolean;
	};

	type MuteRule = {
		id: string;
		keyword: string;
		source: string | null;
		createdAt: string;
	};

	type RadarMeta = {
		lastFetchAt: string | null;
		lastError: string | null;
	};

	type TrackedEntry = {
		clusterId: string;
		trackedAt: string;
		memberCountSnapshot: number;
		pendingUpdate: boolean;
		muted?: boolean;
	};

	type RadarResponse =
		| {
				ok: true;
				clusters: RadarCluster[];
				hiddenMutedCount: number;
				meta: RadarMeta;
		  }
		| {
				ok: false;
				error: string;
		  };

	type MutesResponse =
		| {
				ok: true;
				rules: MuteRule[];
				updatedAt: string | null;
		  }
		| {
				ok: false;
				error: string;
		  };

	type TrackedResponse =
		| {
				ok: true;
				entries: TrackedEntry[];
				updatedAt: string | null;
		  }
		| {
				ok: false;
				error: string;
		  };

	let loading = true;
	let unauthenticated = false;
	let clusters: RadarCluster[] = [];
	let trackedEntries: TrackedEntry[] = [];
	let hiddenMutedCount = 0;
	let meta: RadarMeta | null = null;
	let error: string | null = null;

	let password = '';
	let loginError: string | null = null;
	let loggingIn = false;
	let pendingClusterId: string | null = null;
	let pendingTrackClusterId: string | null = null;
	let pendingAckClusterId: string | null = null;
	let acceptError: string | null = null;
	let trackError: string | null = null;
	let ackError: string | null = null;

	let muteRules: MuteRule[] = [];
	let muteLoadError: string | null = null;
	let pendingMute = false;
	let pendingDeleteMuteId: string | null = null;
	let muteActionError: string | null = null;
	let keyword = '';
	let source = '';

	function trackedClusterRows(): Array<
		| { kind: 'resolved'; entry: TrackedEntry; cluster: RadarCluster }
		| { kind: 'stub'; entry: TrackedEntry }
	> {
		const byClusterId = new Map(clusters.map((c) => [c.clusterId, c]));
		const entries = [...trackedEntries].sort((a, b) => b.trackedAt.localeCompare(a.trackedAt));
		return entries.map((entry) => {
			const resolved = byClusterId.get(entry.clusterId);
			if (resolved) return { kind: 'resolved', entry, cluster: resolved };
			return { kind: 'stub', entry };
		});
	}

	function formatDateTime(value: string | null): string {
		if (!value) return 'not yet run';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return value;
		}
		return date.toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	}

	async function loadRadar(initial = false): Promise<void> {
		if (initial) {
			unauthenticated = false;
		}
		loading = true;
		error = null;
		acceptError = null;
		trackError = null;
		ackError = null;
		muteLoadError = null;
		muteActionError = null;

		try {
			const [radarResponse, trackedResponse, mutesResponse] = await Promise.all([
				fetch('/api/radar', { credentials: 'include' }),
				fetch('/api/brief/tracked', { credentials: 'include' }),
				fetch('/api/brief/mutes', { credentials: 'include' }),
			]);

			if (
				radarResponse.status === 401 ||
				trackedResponse.status === 401 ||
				mutesResponse.status === 401
			) {
				unauthenticated = true;
				clusters = [];
				trackedEntries = [];
				muteRules = [];
				hiddenMutedCount = 0;
				meta = null;
				return;
			}

			const radar = (await radarResponse.json()) as RadarResponse;
			if (!radar.ok) {
				error = radar.error || RADAR_ERROR_GENERIC;
				return;
			}

			clusters = radar.clusters;
			hiddenMutedCount =
				typeof radar.hiddenMutedCount === 'number' ? radar.hiddenMutedCount : 0;
			meta = radar.meta;

			if (!mutesResponse.ok) {
				muteRules = [];
				const mutes = (await mutesResponse.json().catch(() => null)) as MutesResponse | null;
				muteLoadError =
					(mutes && !mutes.ok && mutes.error) ||
					RADAR_MUTES_LOAD_ERROR;
			} else {
				const mutes = (await mutesResponse.json().catch(() => null)) as MutesResponse | null;
				if (mutes && mutes.ok) {
					muteRules = mutes.rules;
				} else {
					muteRules = [];
					muteLoadError =
						(mutes && !mutes.ok && mutes.error) ||
						RADAR_MUTES_LOAD_ERROR;
				}
			}

			// Do not leave a stale tracked list mounted after transient failures.
			// Any tracked-endpoint failure (non-401) clears trackedEntries rather than keeping
			// the last successful list as if it were current.
			if (!trackedResponse.ok) {
				trackedEntries = [];
				const tracked = (await trackedResponse.json().catch(() => null)) as TrackedResponse | null;
				trackError =
					(tracked && !tracked.ok && tracked.error) ||
					RADAR_TRACK_ERROR;
			} else {
				const tracked = (await trackedResponse.json().catch(() => null)) as TrackedResponse | null;
				if (tracked && tracked.ok) {
					trackedEntries = tracked.entries;
				} else {
					trackedEntries = [];
					trackError =
						(tracked && !tracked.ok && tracked.error) ||
						RADAR_TRACK_ERROR;
				}
			}
		} catch (err) {
			console.error('Error loading radar', err);
			error = RADAR_NETWORK_ERROR;
		} finally {
			loading = false;
		}
	}

	async function ackTrackedUpdate(clusterId: string): Promise<void> {
		if (pendingAckClusterId || loading) return;

		pendingAckClusterId = clusterId;
		ackError = null;

		try {
			const response = await fetch('/api/brief/tracked/ack', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ clusterId }),
			});

			if (response.status === 401) {
				unauthenticated = true;
				clusters = [];
				trackedEntries = [];
				muteRules = [];
				hiddenMutedCount = 0;
				meta = null;
				return;
			}

			const body = (await response.json().catch(() => null)) as
				| { ok?: boolean; error?: string; entries?: TrackedEntry[] }
				| null;

			if (!response.ok || (body && body.ok === false)) {
				ackError = (body && body.error) || RADAR_TRACKED_ACK_ERROR;
				return;
			}

			if (body && Array.isArray(body.entries)) {
				trackedEntries = body.entries;
			} else {
				await loadRadar();
			}
		} catch (err) {
			console.error('Error acknowledging tracked update', err);
			ackError = RADAR_NETWORK_ERROR;
		} finally {
			pendingAckClusterId = null;
		}
	}

	async function openOnBrief(clusterId: string, pendingUpdate: boolean): Promise<void> {
		if (pendingUpdate) {
			await ackTrackedUpdate(clusterId);
		}
		await goto('/');
	}

	async function addMuteRule(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (pendingMute || loading) return;

		const nextKeyword = keyword.trim();
		const nextSource = source.trim();
		if (!nextKeyword) {
			muteActionError = 'Keyword is required.';
			return;
		}

		muteActionError = null;
		pendingMute = true;

		try {
			const response = await fetch('/api/brief/mutes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					keyword: nextKeyword,
					...(nextSource ? { source: nextSource } : {}),
				}),
			});

			if (response.status === 401) {
				unauthenticated = true;
				clusters = [];
				trackedEntries = [];
				muteRules = [];
				hiddenMutedCount = 0;
				meta = null;
				return;
			}

			const body = (await response.json().catch(() => null)) as
				| { ok?: boolean; error?: string; rules?: MuteRule[] }
				| null;

			if (!response.ok || (body && body.ok === false)) {
				muteActionError =
					(body && body.error) || RADAR_MUTES_SAVE_ERROR;
				return;
			}

			keyword = '';
			source = '';
			await loadRadar();
		} catch (err) {
			console.error('Error creating mute rule', err);
			muteActionError = RADAR_NETWORK_ERROR;
		} finally {
			pendingMute = false;
		}
	}

	async function deleteMuteRule(id: string): Promise<void> {
		if (pendingDeleteMuteId || loading) return;
		pendingDeleteMuteId = id;
		muteActionError = null;

		try {
			const response = await fetch(`/api/brief/mutes/${encodeURIComponent(id)}`, {
				method: 'DELETE',
				credentials: 'include',
			});

			if (response.status === 401) {
				unauthenticated = true;
				clusters = [];
				trackedEntries = [];
				muteRules = [];
				hiddenMutedCount = 0;
				meta = null;
				return;
			}

			const body = (await response.json().catch(() => null)) as
				| { ok?: boolean; error?: string; rules?: MuteRule[] }
				| null;

			if (!response.ok || (body && body.ok === false)) {
				muteActionError =
					(body && body.error) || RADAR_MUTES_DELETE_ERROR;
				return;
			}

			await loadRadar();
		} catch (err) {
			console.error('Error deleting mute rule', err);
			muteActionError = RADAR_NETWORK_ERROR;
		} finally {
			pendingDeleteMuteId = null;
		}
	}

	async function handleLogin(event: SubmitEvent): Promise<void> {
		event.preventDefault();

		if (!password || loggingIn) return;

		loginError = null;
		loggingIn = true;

		try {
			const response = await fetch('/api/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
				body: JSON.stringify({ password }),
			});

			const body = (await response.json().catch(() => null)) as
				| { ok?: boolean; error?: string }
				| null;

			if (!response.ok || (body && body.ok === false)) {
				loginError =
					(body && body.error) ||
					'Login failed. Check the password and try again.';
				return;
			}

			password = '';
			unauthenticated = false;
			await loadRadar();
		} catch (err) {
			console.error('Error during radar login', err);
			loginError = RADAR_NETWORK_ERROR;
		} finally {
			loggingIn = false;
		}
	}

	async function handleLogout(): Promise<void> {
		try {
			await fetch('/api/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				credentials: 'include',
			});
		} catch (err) {
			console.error('Error during radar logout', err);
		} finally {
			clusters = [];
			trackedEntries = [];
			muteRules = [];
			hiddenMutedCount = 0;
			meta = null;
			error = null;
			acceptError = null;
			trackError = null;
			muteLoadError = null;
			muteActionError = null;
			pendingClusterId = null;
			pendingTrackClusterId = null;
			unauthenticated = true;
		}
	}

	function setClusterAccepted(clusterId: string, accepted: boolean): void {
		clusters = clusters.map((cluster) =>
			cluster.clusterId === clusterId ? { ...cluster, accepted } : cluster,
		);
	}

	function setClusterTracked(clusterId: string, tracked: boolean): void {
		clusters = clusters.map((cluster) =>
			cluster.clusterId === clusterId ? { ...cluster, tracked } : cluster,
		);
	}

	async function toggleAccept(cluster: RadarCluster): Promise<void> {
		if (pendingClusterId || loading) return;

		const nextAccepted = !cluster.accepted;
		const previousAccepted = cluster.accepted;
		acceptError = null;
		pendingClusterId = cluster.clusterId;
		setClusterAccepted(cluster.clusterId, nextAccepted);

		try {
			const response = await fetch(
				nextAccepted ? '/api/brief/accept' : '/api/brief/unaccept',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					credentials: 'include',
					body: JSON.stringify({ clusterId: cluster.clusterId }),
				},
			);

			if (response.status === 401) {
				setClusterAccepted(cluster.clusterId, previousAccepted);
				unauthenticated = true;
				clusters = [];
				trackedEntries = [];
				meta = null;
				return;
			}

			const body = (await response.json().catch(() => null)) as
				| { ok?: boolean; error?: string }
				| null;

			if (!response.ok || (body && body.ok === false)) {
				setClusterAccepted(cluster.clusterId, previousAccepted);
				acceptError =
					(body && body.error) || RADAR_ACCEPT_ERROR;
				return;
			}

			if (nextAccepted) {
				// Accept defaults to track on the server (NEWS-59).
				setClusterTracked(cluster.clusterId, true);
				if (!trackedEntries.some((entry) => entry.clusterId === cluster.clusterId)) {
					await loadRadar();
				}
			}
		} catch (err) {
			console.error('Error toggling Brief membership', err);
			setClusterAccepted(cluster.clusterId, previousAccepted);
			acceptError = RADAR_NETWORK_ERROR;
		} finally {
			pendingClusterId = null;
		}
	}

	async function toggleTrack(clusterId: string, currentlyTracked: boolean): Promise<void> {
		if (pendingTrackClusterId || loading) return;
		const previousTracked = currentlyTracked;
		const nextTracked = !currentlyTracked;
		trackError = null;
		pendingTrackClusterId = clusterId;
		setClusterTracked(clusterId, nextTracked);

		try {
			const response = await fetch(
				nextTracked ? '/api/brief/track' : '/api/brief/untrack',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ clusterId }),
				},
			);

			if (response.status === 401) {
				setClusterTracked(clusterId, previousTracked);
				unauthenticated = true;
				clusters = [];
				trackedEntries = [];
				meta = null;
				return;
			}

			const body = (await response.json().catch(() => null)) as
				| { ok?: boolean; error?: string; entries?: TrackedEntry[] }
				| null;

			if (!response.ok || (body && body.ok === false)) {
				setClusterTracked(clusterId, previousTracked);
				trackError = (body && body.error) || RADAR_TRACK_ERROR;
				return;
			}

			if (body && Array.isArray(body.entries)) {
				trackedEntries = body.entries;
			} else {
				await loadRadar();
			}
		} catch (err) {
			console.error('Error toggling tracked stories', err);
			setClusterTracked(clusterId, previousTracked);
			trackError = RADAR_NETWORK_ERROR;
		} finally {
			pendingTrackClusterId = null;
		}
	}

	onMount(() => {
		void loadRadar(true);
	});
</script>

<svelte:head>
	<title>{RADAR_PAGE_TITLE}</title>
	<meta name="description" content={RADAR_PAGE_DESCRIPTION} />
</svelte:head>

<div
	class="min-h-screen bg-app-bg text-gray-900 dark:text-gray-100"
	style="font-family: var(--font-lufga), system-ui, sans-serif;"
>
	<main class="mx-auto max-w-3xl px-4 py-12 sm:py-16">
		<p class="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400">
			{PRODUCT_NAME}
		</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Radar</h1>
		<p class="mt-3 text-base text-gray-600 dark:text-gray-300">
			Clustered headlines from Citizen Free Press and curated RSS sources, for dense triage
			rather than full Brief story cards.
		</p>
		<p class="mt-4 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
			{RADAR_META_HELP}
		</p>

		{#if loading}
			<p class="mt-8 text-sm text-gray-600 dark:text-gray-300">Loading radar…</p>
		{:else if unauthenticated}
			<section
				class="mt-8 max-w-sm rounded-md border border-gray-200 bg-white/80 p-4 text-sm shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/70"
				aria-label="Radar login"
			>
				<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
					Session required
				</h2>
				<p class="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
					{RADAR_LOGIN_INTRO}
				</p>

				{#if loginError}
					<p class="mt-3 text-xs text-red-600 dark:text-red-400">
						{loginError}
					</p>
				{/if}

				<form class="mt-4 space-y-3" on:submit={handleLogin}>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">
						MVP password
						<input
							type="password"
							class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
							autocomplete="current-password"
							bind:value={password}
						/>
					</label>
					<button
						type="submit"
						class="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-100 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-offset-gray-900"
						disabled={loggingIn || !password}
					>
						{#if loggingIn}
							Signing in…
						{:else}
							Sign in
						{/if}
					</button>
				</form>
			</section>
		{:else}
			{#if error}
				<p class="mt-8 text-sm text-red-600 dark:text-red-400">
					{error}
				</p>
			{/if}

			{#if acceptError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{acceptError}
				</p>
			{/if}

			{#if trackError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{trackError}
				</p>
			{/if}

			{#if ackError}
				<p class="mt-4 text-sm text-red-600 dark:text-red-400">
					{ackError}
				</p>
			{/if}

			{#if meta}
				<div
					class="mt-6 space-y-1 text-xs text-gray-500 dark:text-gray-400"
					aria-label="Radar ingest status"
				>
					{#if hiddenMutedCount > 0}
						<p class="font-medium">
							{RADAR_HIDDEN_MUTED_PREFIX} {hiddenMutedCount}
						</p>
					{/if}
					<p>
						<span class="font-medium">Last fetch:</span>
						<span class="ml-1">{formatDateTime(meta.lastFetchAt)}</span>
					</p>
					{#if meta.lastError}
						<p>
							<span class="font-medium">Last ingest error:</span>
							<span class="ml-1">{meta.lastError}</span>
						</p>
					{/if}
				</div>
			{/if}

			<section class="mt-8 space-y-4" aria-label="Mute rules">
				<header class="space-y-1">
					<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
						{RADAR_MUTES_SECTION_TITLE}
					</h2>
					<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
						{RADAR_MUTES_SECTION_HELP}
					</p>
				</header>

				{#if muteLoadError}
					<p class="text-xs text-red-600 dark:text-red-400">{muteLoadError}</p>
				{/if}

				{#if muteActionError}
					<p class="text-xs text-red-600 dark:text-red-400">{muteActionError}</p>
				{/if}

				<form class="flex flex-col gap-3 sm:flex-row sm:items-end" on:submit={addMuteRule}>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
						{RADAR_MUTES_KEYWORD_LABEL}
						<input
							type="text"
							class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
							placeholder="keyword"
							bind:value={keyword}
						/>
					</label>
					<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 sm:flex-1">
						{RADAR_MUTES_SOURCE_LABEL}
						<input
							type="text"
							class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
							placeholder="domain or source"
							bind:value={source}
						/>
					</label>
					<button
						type="submit"
						class="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-100 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-offset-gray-900"
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
							<li class="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white/70 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
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
									on:click={() => deleteMuteRule(rule.id)}
								>
									{RADAR_MUTES_DELETE_LABEL}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if trackedEntries.length > 0}
					<section class="mt-8 space-y-4" aria-label="Tracked clusters">
						<header class="space-y-1">
							<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
								{RADAR_TRACKED_SECTION_TITLE}
							</h2>
							<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
								{RADAR_TRACKED_SECTION_HELP}
							</p>
						</header>

						<ul class="space-y-3">
							{#each trackedClusterRows() as row (row.entry.clusterId)}
								<li class="rounded-md border border-gray-200 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											{#if row.kind === 'resolved'}
												{#if row.cluster.newestAt}
													<p class="text-xs text-gray-500 dark:text-gray-400">
														Latest in cluster:
														<span class="font-medium">{formatDateTime(row.cluster.newestAt)}</span>
													</p>
												{/if}
											{:else}
												<p class="text-xs text-gray-500 dark:text-gray-400">
													Cluster:
													<span class="font-mono text-[11px]">{row.entry.clusterId}</span>
												</p>
											{/if}
											{#if row.entry.pendingUpdate}
												<p class="mt-1 inline-flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
													<span class="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true"></span>
													{RADAR_TRACKED_UPDATE_BADGE}
												</p>
											{/if}
											{#if row.entry.muted}
												<p class="mt-1 text-[11px] font-medium text-gray-600 dark:text-gray-400">
													{RADAR_MUTED_LABEL}
												</p>
											{/if}
										</div>

										<div class="shrink-0 flex items-center gap-3">
											{#if row.entry.pendingUpdate}
												<button
													type="button"
													class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
													disabled={pendingAckClusterId === row.entry.clusterId}
													on:click={() => ackTrackedUpdate(row.entry.clusterId)}
												>
													{#if pendingAckClusterId === row.entry.clusterId}
														{RADAR_TRACKED_DISMISS_PENDING}
													{:else}
														{RADAR_TRACKED_DISMISS_LABEL}
													{/if}
												</button>
											{/if}
											{#if row.kind === 'resolved' && row.cluster.accepted}
												<button
													type="button"
													class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
													disabled={pendingAckClusterId === row.entry.clusterId}
													on:click={() => openOnBrief(row.entry.clusterId, row.entry.pendingUpdate)}
												>
													Open on Brief
												</button>
											{/if}
											{#if row.kind === 'resolved'}
												<button
													type="button"
													class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
													disabled={pendingClusterId === row.entry.clusterId}
													aria-pressed={row.cluster.accepted}
													on:click={() => toggleAccept(row.cluster)}
												>
													{#if pendingClusterId === row.entry.clusterId}
														{RADAR_ACCEPT_PENDING}
													{:else if row.cluster.accepted}
														{RADAR_UNACCEPT_LABEL}
													{:else}
														{RADAR_ACCEPT_LABEL}
													{/if}
												</button>
											{/if}
											<button
												type="button"
												class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
												disabled={pendingTrackClusterId === row.entry.clusterId}
												aria-pressed={true}
												on:click={() => toggleTrack(row.entry.clusterId, true)}
											>
												{#if pendingTrackClusterId === row.entry.clusterId}
													{RADAR_TRACK_PENDING}
												{:else}
													{RADAR_UNTRACK_LABEL}
												{/if}
											</button>
										</div>
									</div>

									{#if row.kind === 'resolved'}
										<ul class="mt-2 space-y-1">
											{#each row.cluster.headlines as headline (headline.id)}
												<li class="flex flex-col gap-0.5">
													<a
														href={headline.canonicalUrl}
														target="_blank"
														rel="noreferrer"
														class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
													>
														{headline.title}
													</a>
													<div
														class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400"
													>
														{#if headline.publisherDomain}
															<span>{headline.publisherDomain}</span>
														{/if}
														<span
															class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600"
														>
															{headline.sourceKind === 'cfp' ? 'CFP' : 'RSS'}
														</span>
														{#if headline.citationLabel}
															<span>· {headline.citationLabel}</span>
														{/if}
														{#if headline.publishedAt}
															<span>· {formatDateTime(headline.publishedAt)}</span>
														{/if}
													</div>
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
			{/if}

			{#if clusters.length === 0 && !error && trackedEntries.length === 0}
				<p class="mt-8 text-sm text-gray-600 dark:text-gray-300">
					{RADAR_EMPTY_COPY}
				</p>
			{:else if clusters.length > 0}
				<section class="mt-8 space-y-6" aria-label="Radar clusters">
					{#each clusters as cluster}
						<article class="border-l border-gray-200 pl-4 dark:border-gray-700">
							<div class="flex items-baseline justify-between gap-3">
								{#if cluster.newestAt}
									<p class="text-xs text-gray-500 dark:text-gray-400">
										Latest in cluster:
										<span class="font-medium">{formatDateTime(cluster.newestAt)}</span>
									</p>
								{:else}
									<span class="text-xs text-gray-500 dark:text-gray-400"></span>
								{/if}
								<div class="shrink-0 flex items-center gap-3">
									<button
										type="button"
										class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
										disabled={pendingTrackClusterId === cluster.clusterId}
										aria-pressed={cluster.tracked}
										on:click={() => toggleTrack(cluster.clusterId, cluster.tracked)}
									>
										{#if pendingTrackClusterId === cluster.clusterId}
											{RADAR_TRACK_PENDING}
										{:else if cluster.tracked}
											{RADAR_UNTRACK_LABEL}
										{:else}
											{RADAR_TRACK_LABEL}
										{/if}
									</button>
									<button
										type="button"
										class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
										disabled={pendingClusterId === cluster.clusterId}
										aria-pressed={cluster.accepted}
										on:click={() => toggleAccept(cluster)}
									>
										{#if pendingClusterId === cluster.clusterId}
											{RADAR_ACCEPT_PENDING}
										{:else if cluster.accepted}
											{RADAR_UNACCEPT_LABEL}
										{:else}
											{RADAR_ACCEPT_LABEL}
										{/if}
									</button>
								</div>
							</div>

							<ul class="mt-2 space-y-1">
								{#each cluster.headlines as headline}
									<li class="flex flex-col gap-0.5">
										<a
											href={headline.canonicalUrl}
											target="_blank"
											rel="noreferrer"
											class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
										>
											{headline.title}
										</a>
										<div
											class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400"
										>
											{#if headline.publisherDomain}
												<span>{headline.publisherDomain}</span>
											{/if}
											<span
												class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600"
											>
												{headline.sourceKind === 'cfp' ? 'CFP' : 'RSS'}
											</span>
											{#if headline.citationLabel}
												<span>· {headline.citationLabel}</span>
											{/if}
											{#if headline.publishedAt}
												<span>· {formatDateTime(headline.publishedAt)}</span>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						</article>
					{/each}
				</section>
			{/if}

			<div class="mt-8 flex items-center justify-between">
				<p class="text-xs text-gray-500 dark:text-gray-400">
					Headlines only — open links to read full context at the cited sources.
				</p>
				<button
					type="button"
					class="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
					on:click={handleLogout}
				>
					Log out
				</button>
			</div>
		{/if}

		<p class="mt-12">
			<a
				href="/"
				class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
			>
				← Back to Brief
			</a>
		</p>
	</main>
</div>

