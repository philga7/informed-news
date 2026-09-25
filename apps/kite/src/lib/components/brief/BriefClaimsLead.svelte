<script lang="ts">
	import {
		BRIEF_CLAIMS_EMPTY_COPY,
		BRIEF_CLAIMS_HIDE_HEADLINES,
		BRIEF_CLAIMS_LINKED_HEADLINES_LABEL,
		BRIEF_CLAIMS_LOAD_ERROR,
		BRIEF_CLAIMS_SECTION_TITLE,
		BRIEF_CLAIMS_SHOW_HEADLINES,
		BRIEF_CLAIMS_UNACCEPT_LABEL,
		BRIEF_CLAIMS_UNACCEPT_PENDING,
		formatClaimConfidence,
		formatClaimDateTime,
		humanizeClaimLabel,
		postClaimUnaccept,
		type BriefClaimItem,
		type BriefClaimsResponse,
	} from '$lib/briefClaims';

	interface Props {
		batchId?: string | null;
		isLatestBatch?: boolean;
	}

	let { batchId = null, isLatestBatch = true }: Props = $props();

	let loading = $state(true);
	let claims = $state<BriefClaimItem[]>([]);
	let loadError = $state<string | null>(null);
	let unacceptError = $state<string | null>(null);
	let unacceptLoginHint = $state(false);
	let pendingClaimId = $state<string | null>(null);
	let expandedClaimIds = $state<Set<string>>(new Set());
	let requestSequence = 0;

	function claimsEndpoint(currentBatchId: string | null, latest: boolean): string | null {
		if (latest) return '/api/batches/latest/claims';
		if (!currentBatchId) return null;
		return `/api/batches/${encodeURIComponent(currentBatchId)}/claims`;
	}

	async function loadClaims(): Promise<void> {
		const endpoint = claimsEndpoint(batchId, isLatestBatch);
		if (!endpoint) {
			loading = false;
			claims = [];
			loadError = null;
			return;
		}

		const currentRequest = ++requestSequence;
		loading = true;
		loadError = null;

		try {
			const response = await fetch(endpoint);
			const body = (await response.json().catch(() => null)) as BriefClaimsResponse | null;

			if (currentRequest !== requestSequence) return;

			if (!response.ok || !body || body.ok === false) {
				loadError = (body && 'error' in body && body.error) || BRIEF_CLAIMS_LOAD_ERROR;
				claims = [];
				return;
			}

			claims = body.claims;
		} catch (error) {
			console.error('Error loading accepted claims', error);
			if (currentRequest !== requestSequence) return;
			loadError = BRIEF_CLAIMS_LOAD_ERROR;
			claims = [];
		} finally {
			if (currentRequest === requestSequence) {
				loading = false;
			}
		}
	}

	function toggleExpanded(claimId: string): void {
		const next = new Set(expandedClaimIds);
		if (next.has(claimId)) next.delete(claimId);
		else next.add(claimId);
		expandedClaimIds = next;
	}

	async function handleUnaccept(claimId: string): Promise<void> {
		if (pendingClaimId) return;

		pendingClaimId = claimId;
		unacceptError = null;
		unacceptLoginHint = false;

		const result = await postClaimUnaccept(claimId);
		if (!result.ok) {
			pendingClaimId = null;
			unacceptError = result.error;
			unacceptLoginHint = Boolean(result.unauthenticated);
			return;
		}

		const nextExpanded = new Set(expandedClaimIds);
		nextExpanded.delete(claimId);
		expandedClaimIds = nextExpanded;

		await loadClaims();
		pendingClaimId = null;
	}

	$effect(() => {
		batchId;
		isLatestBatch;
		void loadClaims();
	});
</script>

<section class="mt-8 space-y-4" aria-label="Accepted claims">
	<header class="space-y-1">
		<h2 class="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
			{BRIEF_CLAIMS_SECTION_TITLE}
		</h2>
	</header>

	{#if unacceptError}
		<p class="text-xs text-red-600 dark:text-red-400" role="alert">
			{unacceptError}
			{#if unacceptLoginHint}
				<a
					href="/radar"
					class="ms-1 font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
				>
					Open Radar login
				</a>
			{/if}
		</p>
	{/if}

	{#if loading}
		<p class="text-xs text-gray-600 dark:text-gray-400">Loading accepted claims…</p>
	{:else if loadError}
		<p class="text-xs text-red-600 dark:text-red-400">{loadError}</p>
	{:else if claims.length === 0}
		<p class="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
			{BRIEF_CLAIMS_EMPTY_COPY}
		</p>
	{:else}
		<ul class="space-y-3">
			{#each claims as claim (claim.claimId)}
				<li class="rounded-md border border-gray-200 bg-white/70 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/60">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
								{claim.text}
							</p>
							<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
								<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
									{humanizeClaimLabel(claim.status)}
								</span>
								<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
									{humanizeClaimLabel(claim.claimType)}
								</span>
								<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
									Evidence {claim.evidence.total} (S{claim.evidence.supports} C{claim.evidence.contradicts} M{claim.evidence.mentions})
								</span>
								<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
									Primary {claim.evidence.primary} · Sensor {claim.evidence.sensor}
								</span>
								<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] tracking-wide dark:border-gray-600">
									Confidence {formatClaimConfidence(claim.confidence)}
								</span>
							</div>
						</div>

						<div class="shrink-0 flex flex-col items-end gap-2">
							<button
								type="button"
								class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
								disabled={pendingClaimId === claim.claimId}
								onclick={() => handleUnaccept(claim.claimId)}
							>
								{#if pendingClaimId === claim.claimId}
									{BRIEF_CLAIMS_UNACCEPT_PENDING}
								{:else}
									{BRIEF_CLAIMS_UNACCEPT_LABEL}
								{/if}
							</button>
							{#if claim.linkedHeadlines.length > 0 || claim.verbiage}
								<button
									type="button"
									class="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
									aria-expanded={expandedClaimIds.has(claim.claimId)}
									onclick={() => toggleExpanded(claim.claimId)}
								>
									{expandedClaimIds.has(claim.claimId)
										? BRIEF_CLAIMS_HIDE_HEADLINES
										: BRIEF_CLAIMS_SHOW_HEADLINES}
									{#if claim.linkedHeadlines.length > 0}
										({claim.linkedHeadlines.length})
									{/if}
								</button>
							{/if}
						</div>
					</div>

					{#if expandedClaimIds.has(claim.claimId)}
						<div class="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
							{#if claim.verbiage}
								<div class="space-y-2">
									<p class="text-sm text-gray-700 dark:text-gray-300">
										{claim.verbiage.short_summary}
									</p>
									{#if claim.verbiage.talking_points.length > 0}
										<ul class="list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
											{#each claim.verbiage.talking_points as point}
												<li>{point}</li>
											{/each}
										</ul>
									{/if}
									<p class="text-xs text-gray-500 dark:text-gray-400">
										AI-assisted — not ground truth.
									</p>
								</div>
							{/if}

							{#if claim.linkedHeadlines.length > 0}
								<div>
									<p class="text-[11px] font-medium text-gray-700 dark:text-gray-300">
										{BRIEF_CLAIMS_LINKED_HEADLINES_LABEL}
									</p>
									<ul class="mt-2 space-y-2">
										{#each claim.linkedHeadlines as headline (headline.id)}
											<li class="flex flex-col gap-0.5">
												<a
													href={headline.canonicalUrl}
													target="_blank"
													rel="noreferrer"
													class="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
												>
													{headline.title}
												</a>
												<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
													{#if headline.publisherDomain}
														<span>{headline.publisherDomain}</span>
													{/if}
													<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
														{headline.sourceTier === 'primary' ? 'PRIMARY' : 'SENSOR'}
													</span>
													<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide dark:border-gray-600">
														{headline.stance}
													</span>
													{#if headline.publishedAt}
														<span>· {formatClaimDateTime(headline.publishedAt)}</span>
													{/if}
												</div>
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
