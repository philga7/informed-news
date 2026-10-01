<script module lang="ts">
	/** Story ids whose on-demand summary was already requested this page load. */
	const requestedSummaries = new Set<string>();
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { s } from '$lib/client/localization.svelte';
	import { kiteDB } from '$lib/db/dexie';
	import { keyboardNavigation } from '$lib/stores/keyboardNavigation.svelte';
	import type { Story } from '$lib/types';
	import StoryCard from '$lib/components/story/StoryCard.svelte';
	import StoryCardSkeleton from '$lib/components/story/StoryCardSkeleton.svelte';
	import BriefRefreshBar from './BriefRefreshBar.svelte';
	import {
		BRIEF_LESS_LABEL,
		BRIEF_LEVEL_LABEL,
		BRIEF_OFFICIAL_LABEL,
		BRIEF_SUMMARY_LOADING,
		BRIEF_SUMMARY_LOGIN_HINT,
		createSeenBatcher,
		fetchBriefOverview,
		groupTopicBrief,
		isOfficialStory,
		isTopicBriefStory,
		moreLabel,
		newlyReadIds,
		outletBadge,
		postBriefSeen,
		postStorySummary,
		quietLine,
		storyKey,
		summaryErrorCopy,
		summaryLine,
		type BriefOverview,
	} from '$lib/topicBrief';

	interface Props {
		stories?: Story[];
		batchId?: string;
		batchDateSlug?: string | null;
		categoryId: string;
		categoryUuid?: string;
		readStories?: Record<string, boolean>;
		expandedStories?: Record<string, boolean>;
		onStoryToggle?: (storyId: string) => void;
		showSourceOverlay?: boolean;
		currentSource?: any;
		sourceArticles?: any[];
		currentMediaInfo?: any;
		isLoadingMediaInfo?: boolean;
		/** Rendered when the overview is the empty-store fixture or cannot be loaded. */
		fallback: Snippet;
	}

	let {
		stories = [],
		batchId,
		batchDateSlug = null,
		categoryId,
		categoryUuid,
		readStories = $bindable({}),
		expandedStories = $bindable({}),
		onStoryToggle,
		showSourceOverlay = $bindable(false),
		currentSource = $bindable(null),
		sourceArticles = $bindable([]),
		currentMediaInfo = $bindable(null),
		isLoadingMediaInfo = $bindable(false),
		fallback,
	}: Props = $props();

	type SummaryRequestState =
		| { phase: 'loading' }
		| { phase: 'error'; message: string; login: boolean };

	let overview = $state<BriefOverview | null>(null);
	let overviewLoaded = $state(false);
	let openMore = $state<Record<string, boolean>>({});
	let summaryRequests = $state<Record<string, SummaryRequestState>>({});
	let overviewSequence = 0;

	const useSections = $derived(overviewLoaded && overview !== null && !overview.fixture);
	const sections = $derived(overview ? groupTopicBrief(overview, stories) : []);
	const quiet = $derived(overview ? quietLine(overview.quiet) : null);
	const storyIndex = $derived(new Map(stories.map((story, index) => [story, index])));
	const topicStoryIds = $derived(
		new Set(stories.filter(isTopicBriefStory).map((story) => story.id as string)),
	);
	const visibleStories = $derived(
		sections.flatMap((section) =>
			openMore[section.topicId] ? [...section.top, ...section.more] : section.top,
		),
	);
	const allVisibleRead = $derived(
		visibleStories.every((story) => story.id && readStories[story.id]),
	);
	const allVisibleExpanded = $derived(
		visibleStories.length > 0 && visibleStories.every((story) => expandedStories[storyKey(story)]),
	);

	const seen = createSeenBatcher({ post: (ids) => postBriefSeen(ids) });

	$effect(() => () => {
		void seen.flush();
	});

	async function loadOverview(): Promise<void> {
		const sequence = ++overviewSequence;
		const next = await fetchBriefOverview();
		if (sequence !== overviewSequence) return;
		overview = next;
		overviewLoaded = true;
	}

	$effect(() => {
		stories;
		void loadOverview();
	});

	function recordNewlyRead(before: Record<string, boolean>): void {
		const ids = newlyReadIds(before, readStories, topicStoryIds);
		if (ids.length > 0) seen.add(ids);
	}

	async function requestSummary(story: Story): Promise<void> {
		const id = story.id;
		if (!id || story.informed_summary_status !== 'missing' || requestedSummaries.has(id)) return;
		requestedSummaries.add(id);
		summaryRequests = { ...summaryRequests, [id]: { phase: 'loading' } };

		const result = await postStorySummary(id);
		const { [id]: _done, ...rest } = summaryRequests;

		if (result.ok) {
			if (result.status === 'ok') {
				story.short_summary = result.text;
				story.informed_summary_status = 'ok';
			} else {
				story.short_summary = '';
				story.informed_summary_status = 'unavailable';
			}
			summaryRequests = rest;
			return;
		}

		summaryRequests = {
			...rest,
			[id]: result.unauthenticated
				? { phase: 'error', message: BRIEF_SUMMARY_LOGIN_HINT, login: true }
				: { phase: 'error', message: summaryErrorCopy(result.error), login: false },
		};
	}

	function handleToggle(story: Story): void {
		const key = storyKey(story);
		const opening = !expandedStories[key];
		const before = { ...readStories };
		onStoryToggle?.(key);
		recordNewlyRead(before);
		if (opening) void requestSummary(story);
	}

	async function handleReadToggle(story: Story): Promise<void> {
		if (!story.id) return;
		const id = story.id;
		const before = { ...readStories };
		const next = { ...readStories };
		if (next[id]) delete next[id];
		else next[id] = true;
		readStories = next;
		recordNewlyRead(before);

		if (next[id]) await kiteDB.markStoryAsRead(id, story.title, batchId, categoryUuid);
		else await kiteDB.unmarkStoryAsRead(id, batchId, categoryUuid);
	}

	function markAllAsRead(): void {
		const before = { ...readStories };
		const next = { ...readStories };
		const toPersist = visibleStories.filter((story) => story.id && !next[story.id]);
		for (const story of toPersist) next[story.id as string] = true;
		readStories = next;
		recordNewlyRead(before);
		for (const story of toPersist) {
			void kiteDB.markStoryAsRead(story.id as string, story.title, batchId, categoryUuid);
		}
	}

	function toggleMore(topicId: string): void {
		openMore = { ...openMore, [topicId]: !openMore[topicId] };
	}

	/** StoryListInstance (page keyboard shortcuts / category double-click). */
	export function toggleExpandAll(): void {
		if (allVisibleExpanded) {
			expandedStories = {};
			return;
		}
		const next = { ...expandedStories };
		for (const story of visibleStories) next[storyKey(story)] = true;
		expandedStories = next;
	}

	export function toggleReadStatus(index: number): void {
		const story = stories[index];
		if (story) void handleReadToggle(story);
	}
</script>

{#snippet storyMeta(story: Story)}
	{@const key = storyKey(story)}
	{@const badge = outletBadge(story.informed_outlet_count)}
	{@const official = isOfficialStory(story)}
	{@const line = summaryLine(story)}
	{@const request = story.id ? summaryRequests[story.id] : undefined}
	{@const expanded = Boolean(expandedStories[key])}
	{#if badge || official || line}
		<div class="mb-2 space-y-1">
			{#if badge || official}
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
					{#if official}
						<span class="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-medium tracking-wide text-gray-700 dark:border-gray-600 dark:text-gray-300">
							{BRIEF_OFFICIAL_LABEL}
						</span>
					{/if}
					{#if badge}
						<span>{badge}</span>
					{/if}
				</div>
			{/if}

			{#if line?.kind === 'ok'}
				{#if !expanded}
					<p class="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{line.text}</p>
				{/if}
				<p class="text-[11px] text-gray-500 dark:text-gray-400">{line.note}</p>
			{:else if line?.kind === 'unavailable'}
				<p class="text-xs text-gray-500 dark:text-gray-400">{line.text}</p>
			{:else if line?.kind === 'missing'}
				{#if request?.phase === 'loading'}
					<p class="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">{BRIEF_SUMMARY_LOADING}</p>
				{:else if request?.phase === 'error' && request.login}
					<p class="text-xs">
						<a
							href="/topics"
							class="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
						>
							{request.message}
						</a>
					</p>
				{:else if request?.phase === 'error'}
					<p class="text-xs text-gray-500 dark:text-gray-400">{request.message}</p>
				{:else}
					<p class="text-xs text-gray-500 dark:text-gray-400">{line.text}</p>
				{/if}
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet card(story: Story)}
	{@const index = storyIndex.get(story) ?? -1}
	<StoryCard
		{story}
		storyIndex={index}
		{batchId}
		{batchDateSlug}
		{categoryId}
		isRead={Boolean(story.id && readStories[story.id])}
		isExpanded={Boolean(expandedStories[storyKey(story)])}
		shouldAutoScroll={!allVisibleExpanded}
		onToggle={() => handleToggle(story)}
		onReadToggle={() => handleReadToggle(story)}
		priority={index >= 0 && index < 3}
		bind:showSourceOverlay
		bind:currentSource
		bind:sourceArticles
		bind:currentMediaInfo
		bind:isLoadingMediaInfo
		isKeyboardSelected={index >= 0 && keyboardNavigation.selectedIndex === index}
	>
		{#snippet belowHeader()}
			{@render storyMeta(story)}
		{/snippet}
	</StoryCard>
{/snippet}

{#if !overviewLoaded}
	<div class="min-h-[300px]" aria-busy="true">
		{#each Array(3) as _, i}
			<StoryCardSkeleton variant={i} />
		{/each}
	</div>
{:else if !useSections || !overview}
	{@render fallback()}
{:else}
	<div class="topic-brief">
		<BriefRefreshBar refresh={overview.refresh} notices={overview.notices} />

		{#if sections.length === 0}
			<p class="py-6 text-sm text-gray-600 dark:text-gray-400">
				{#if overview.quiet.length === 0}
					No topics yet.
					<a
						href="/topics"
						class="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
					>
						Add topics
					</a>
					to build your Brief.
				{:else}
					No new stories for your topics.
				{/if}
			</p>
		{/if}

		{#each sections as section (section.topicId)}
			{@const headingId = `topic-brief-${section.topicId}`}
			<section class="mt-10 first-of-type:mt-0" aria-labelledby={headingId} data-testid="topic-brief-section">
				<header class="mb-2 flex items-baseline gap-2 border-b border-gray-800 pb-1.5 dark:border-gray-300">
					<h3 id={headingId} class="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100" dir="auto">
						{section.name}
					</h3>
					<span class="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
						{BRIEF_LEVEL_LABEL[section.level]}
					</span>
				</header>

				{#each section.top as story (storyKey(story))}
					{@render card(story)}
				{/each}

				{#if section.more.length > 0}
					{#if openMore[section.topicId]}
						{#each section.more as story (storyKey(story))}
							{@render card(story)}
						{/each}
					{/if}
					<button
						type="button"
						class="mt-2 text-xs font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100"
						aria-expanded={Boolean(openMore[section.topicId])}
						onclick={() => toggleMore(section.topicId)}
					>
						{openMore[section.topicId] ? BRIEF_LESS_LABEL : moreLabel(section.more.length)}
					</button>
				{/if}
			</section>
		{/each}

		{#if quiet}
			<p class="mt-10 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400" data-testid="topic-brief-quiet">
				{quiet}
			</p>
		{/if}

		{#if !allVisibleRead && visibleStories.length > 0}
			<div class="mt-6 w-full text-center">
				<button
					onclick={markAllAsRead}
					class="w-full rounded-lg bg-gray-100 px-6 py-3 text-gray-800 transition-colors duration-200 hover:bg-gray-200 md:w-auto dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
				>
					{s('article.markAllAsRead') || 'Mark all as read'}
				</button>
			</div>
		{/if}
	</div>
{/if}
