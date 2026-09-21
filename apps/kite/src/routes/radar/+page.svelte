<script lang="ts">
	import { onMount } from 'svelte';
	import { PRODUCT_NAME } from '$lib/brand';
	import {
		RADAR_EMPTY_COPY,
		RADAR_ERROR_GENERIC,
		RADAR_LOGIN_INTRO,
		RADAR_META_HELP,
		RADAR_NETWORK_ERROR,
		RADAR_PAGE_DESCRIPTION,
		RADAR_PAGE_TITLE,
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
	};

	type RadarMeta = {
		lastFetchAt: string | null;
		lastError: string | null;
	};

	type RadarResponse =
		| {
				ok: true;
				clusters: RadarCluster[];
				meta: RadarMeta;
		  }
		| {
				ok: false;
				error: string;
		  };

	let loading = true;
	let unauthenticated = false;
	let clusters: RadarCluster[] = [];
	let meta: RadarMeta | null = null;
	let error: string | null = null;

	let password = '';
	let loginError: string | null = null;
	let loggingIn = false;

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

		try {
			const response = await fetch('/api/radar', {
				credentials: 'include',
			});

			if (response.status === 401) {
				unauthenticated = true;
				clusters = [];
				meta = null;
				return;
			}

			const data = (await response.json()) as RadarResponse;

			if (!data.ok) {
				error = data.error || RADAR_ERROR_GENERIC;
				return;
			}

			clusters = data.clusters;
			meta = data.meta;
		} catch (err) {
			console.error('Error loading radar', err);
			error = RADAR_NETWORK_ERROR;
		} finally {
			loading = false;
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
			meta = null;
			error = null;
			unauthenticated = true;
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

			{#if meta}
				<div
					class="mt-6 space-y-1 text-xs text-gray-500 dark:text-gray-400"
					aria-label="Radar ingest status"
				>
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

			{#if clusters.length === 0 && !error}
				<p class="mt-8 text-sm text-gray-600 dark:text-gray-300">
					{RADAR_EMPTY_COPY}
				</p>
			{:else if clusters.length > 0}
				<section class="mt-8 space-y-6" aria-label="Radar clusters">
					{#each clusters as cluster}
						<article class="border-l border-gray-200 pl-4 dark:border-gray-700">
							{#if cluster.newestAt}
								<p class="text-xs text-gray-500 dark:text-gray-400">
									Latest in cluster:
									<span class="font-medium">{formatDateTime(cluster.newestAt)}</span>
								</p>
							{/if}

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

