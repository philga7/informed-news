<script lang="ts">
	import { dataReloadService } from '$lib/services/dataService';
	import {
		BRIEF_REFRESHING_LABEL,
		BRIEF_REFRESH_ERROR,
		BRIEF_REFRESH_LABEL,
		BRIEF_REFRESH_LOGIN_HINT,
		nextRefreshLabel,
		postBriefRefresh,
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
	let errorMessage = $state<string | null>(null);
	let loginHint = $state(false);

	const updated = $derived(updatedLabel(refresh, now));
	const next = $derived(nextRefreshLabel(refresh.nextAt, now));
	const busy = $derived(refreshing || refresh.running);

	$effect(() => {
		const timer = setInterval(() => {
			now = new Date();
		}, 60_000);
		return () => clearInterval(timer);
	});

	async function handleRefresh(): Promise<void> {
		if (busy) return;
		refreshing = true;
		errorMessage = null;
		loginHint = false;

		const result = await postBriefRefresh();
		refreshing = false;

		if (!result.ok) {
			loginHint = Boolean(result.unauthenticated);
			errorMessage = loginHint
				? null
				: result.error
					? `Refresh failed: ${result.error}`
					: BRIEF_REFRESH_ERROR;
			return;
		}

		await dataReloadService.reloadData();
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

	{#if notices.length > 0}
		<p class="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
			{notices.join(' · ')}
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
