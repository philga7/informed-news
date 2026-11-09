<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import {
		applyFullStory,
		autoFullStoryRequestKeys,
		BRIEF_ALL_FILTERED,
		BRIEF_LESS_LABEL,
		BRIEF_LEVEL_LABEL,
		BRIEF_STORIES_SECTION_TITLE,
		decideTopicBriefFilterMatches,
		filteredCountLabel,
		BRIEF_SEEN_SAVE_ERROR,
		createSeenBatcher,
		fullStoryErrorCopy,
		groupTopicBrief,
		hideFilteredStories,
		isTopicBriefStory,
		loadContentFilter,
		moreLabel,
		newlyExpandedKeys,
		openKeysForFilterDecision,
		nextRefreshLabel,
		quietLine,
		SHARED_STORY_NOT_FOUND,
		shouldFilterStory,
		shouldRequestFullStory,
		storyKey,
		storyKeys,
		survivingExpandedStories,
		toggleExpandAllKeys,
		updatedLabel,
		type ContentFilterSettings,
	} from './assemble';
	import {
		buildSeedPayload,
		fetchFilteredVerdicts,
		fetchSeedTopics,
		filteredOutLinkLabel,
		loadBrief,
		postBriefSeen,
		postFullStory,
		postRefresh,
		postSeed,
		postSummary,
		readSinglePage,
		readStoryCount,
		REFRESH_ERROR,
		REFRESH_LABEL,
		REFRESH_LOGIN,
		REFRESHING_LABEL,
		sharedHrefVisit,
		storyIndexFromPath,
		type BriefStory,
		type FilteredVerdictItem,
		type SeedTopic,
	} from './briefClient';
	import FilteredVerdictList from './FilteredVerdictList.svelte';
	import {
		createGgDetector,
		createKeyboardSelection,
		enterTogglesSelection,
		selectedStoryAnnouncement,
	} from './keyboard';
	import StoryArticle from './StoryArticle.svelte';

	const VERDICT_VIEWS = ['approved', 'filtered', 'all'] as const;
	type VerdictView = (typeof VERDICT_VIEWS)[number];

	const SETTINGS_TABS = ['language', 'stories', 'about', 'filters'] as const;
	type SettingsTab = (typeof SETTINGS_TABS)[number];

	const EMPTY_FILTER: ContentFilterSettings = {
		keywords: [],
		filterMode: 'blur',
		filterScope: 'all',
		version: 1,
	};

	const uid = $props.id();
	const seedTitleId = `${uid}-seed`;
	const settingsTitleId = `${uid}-settings`;

	const nav = createKeyboardSelection([]);
	const gg = createGgDetector();

	let stories = $state<BriefStory[]>([]);
	let overview = $state<Awaited<ReturnType<typeof loadBrief>>['overview']>(null);
	let categoryName = $state('Brief');
	let loaded = $state(false);
	let contentFilter = $state<ContentFilterSettings>(EMPTY_FILTER);
	let storyCount = $state(12);
	let singlePage = $state(false);
	let expandedStories = $state<Record<string, boolean>>({});
	let readStories = $state<Record<string, boolean>>({});
	let summaryRequests = $state<Record<string, 'loading' | 'login' | 'error'>>({});
	let fullStoryRequests = $state<
		Record<string, { phase: 'loading' | 'login' | 'error'; message?: string }>
	>({});
	let clockNow = $state(new Date());
	let seenError = $state(false);
	let readAnnouncement = $state('');
	const seen = createSeenBatcher({
		post: (ids) => postBriefSeen(ids),
		onError: () => {
			seenError = true;
		},
	});
	const fullStarted = new Set<string>();
	let previousExpanded: Record<string, boolean> = {};
	let openMore = $state<Record<string, boolean>>({});
	let revealed = $state<Set<string>>(new Set());
	let matchByKey = $state<Record<string, string[]>>({});
	let filterSessionSawOpen = $state(false);
	let verdictView = $state<VerdictView>('approved');
	let filteredItems = $state<FilteredVerdictItem[] | null>(null);
	let filteredLoading = $state(false);
	let filteredUnauthenticated = $state(false);
	let filteredRequested = false;
	let filteredLoadSeq = 0;
	let refreshing = $state(false);
	let refreshMessage = $state<string | null>(null);
	let selectedIndex = $state(-1);
	let announcement = $state('');
	let sharedActive = $state(false);
	let sharedIndex = $state<number | null>(null);
	let sharedMissingNotice = $state(false);
	let linkedIndex = $state<number | null>(null);
	let settingsOpen = $state(false);
	let settingsTab = $state<SettingsTab>('language');
	let addStoryOpen = $state(false);
	let seedTopics = $state<SeedTopic[]>([]);
	let seedTopicsError = $state<string | null>(null);
	let seedError = $state<string | null>(null);
	let seedSaving = $state(false);
	let seedTitle = $state('');
	let seedTopicId = $state('');
	let seedNote = $state('');
	let seedUrls = $state('');

	let carry = new Map<string, string[]>();
	let carryKey: string | null = null;
	let lastSharedHref = '';
	let linkedAppliedPath = '';
	const requestedSummaries = new Set<string>();
	const summaryGeneration = new Map<string, number>();

	const showTopics = $derived(loaded && overview !== null && !singlePage && !sharedActive);
	const grouped = $derived(overview ? groupTopicBrief(overview, stories) : []);
	const afterHide = $derived(
		contentFilter.keywords.length > 0 && contentFilter.filterMode === 'hide'
			? hideFilteredStories(grouped, (story) => Boolean(matchByKey[storyKey(story)]?.length))
			: { sections: grouped, hiddenCount: 0 },
	);
	const visibleTopicStories = $derived(
		afterHide.sections.flatMap((section) =>
			openMore[section.topicId] ? [...section.top, ...section.more] : section.top,
		),
	);
	const capped = $derived(stories.slice(0, storyCount));
	const flatShown = $derived(
		contentFilter.keywords.length > 0 && contentFilter.filterMode === 'hide'
			? capped.filter((story) => !matchByKey[storyKey(story)]?.length)
			: capped,
	);
	const flatHiddenCount = $derived.by(() => {
		if (!loaded || contentFilter.keywords.length === 0) return 0;
		if (contentFilter.filterMode === 'hide') return capped.length - flatShown.length;
		return capped.filter((story) => Boolean(matchByKey[storyKey(story)]?.length)).length;
	});
	const topicFilteredCount = $derived.by(() => {
		if (!showTopics || contentFilter.keywords.length === 0) return 0;
		if (contentFilter.filterMode === 'hide') return afterHide.hiddenCount;
		return visibleTopicStories.filter((story) => Boolean(matchByKey[storyKey(story)]?.length)).length;
	});
	const quiet = $derived(overview ? quietLine(overview.quiet) : null);
	const renderedStories = $derived.by(() => {
		if (!loaded || sharedActive) return [];
		if (showTopics) return showsApproved(verdictView) ? visibleTopicStories : [];
		return flatShown;
	});
	const hasUnread = $derived(renderedStories.some((story) => story.id && !readStories[story.id]));
	const keyboardOrder = $derived(
		renderedStories.flatMap((story) => {
			const index = stories.indexOf(story);
			return index < 0 ? [] : [index];
		}),
	);
	const sharedStory = $derived(
		sharedActive && sharedIndex !== null ? (stories[sharedIndex] ?? null) : null,
	);
	const coreTopics = $derived(seedTopics.filter((topic) => topic.level === 'core'));
	const watchTopics = $derived(seedTopics.filter((topic) => topic.level === 'watch'));

	function showsApproved(view: VerdictView): boolean {
		switch (view) {
			case 'approved':
			case 'all':
				return true;
			case 'filtered':
				return false;
			default: {
				const unreachable: never = view;
				return unreachable;
			}
		}
	}

	function showsFiltered(view: VerdictView): boolean {
		switch (view) {
			case 'filtered':
			case 'all':
				return true;
			case 'approved':
				return false;
			default: {
				const unreachable: never = view;
				return unreachable;
			}
		}
	}

	function verdictLabel(view: VerdictView): string {
		switch (view) {
			case 'approved':
				return 'Approved';
			case 'filtered':
				return 'Filtered';
			case 'all':
				return 'All';
			default: {
				const unreachable: never = view;
				return unreachable;
			}
		}
	}

	function settingsLabel(tab: SettingsTab): string {
		switch (tab) {
			case 'language':
				return 'Language';
			case 'stories':
				return 'Stories';
			case 'about':
				return 'About';
			case 'filters':
				return 'Filters';
			default: {
				const unreachable: never = tab;
				return unreachable;
			}
		}
	}

	function isBlurred(story: BriefStory): boolean {
		if (contentFilter.filterMode === 'hide' || contentFilter.keywords.length === 0) {
			return false;
		}
		const key = storyKey(story);
		if (revealed.has(key)) return false;
		return Boolean(matchByKey[key]?.length);
	}

	function publishSelection(announce: boolean): void {
		selectedIndex = nav.selectedIndex;
		if (selectedIndex < 0) {
			announcement = '';
			return;
		}
		if (!announce) return;
		const story = stories[selectedIndex];
		if (!story) {
			announcement = '';
			return;
		}
		const keywords = isBlurred(story) ? (matchByKey[storyKey(story)] ?? []) : undefined;
		announcement = selectedStoryAnnouncement(story.title, keywords);
	}

	function toggleStory(story: BriefStory): void {
		if (sharedActive) return;
		const key = storyKey(story);
		expandedStories = { ...expandedStories, [key]: !expandedStories[key] };
	}

	function revealStory(story: BriefStory): void {
		const key = storyKey(story);
		const next = new Set(revealed);
		next.add(key);
		revealed = next;
		if (!expandedStories[key]) expandedStories = { ...expandedStories, [key]: true };
		if (stories[nav.selectedIndex] === story) publishSelection(true);
	}

	function toggleRead(story: BriefStory | undefined): void {
		if (!story?.id) return;
		const next = !readStories[story.id];
		readStories = { ...readStories, [story.id]: next };
		readAnnouncement = `${next ? 'Marked as read' : 'Marked as unread'}: ${story.title}`;
		if (next) seen.add([story.id]);
	}

	function markAllRead(): void {
		const ids: string[] = [];
		const next = { ...readStories };
		for (const story of renderedStories) {
			if (!story.id || next[story.id]) continue;
			next[story.id] = true;
			ids.push(story.id);
		}
		readStories = next;
		if (ids.length > 0) {
			readAnnouncement = `Marked ${ids.length} ${ids.length === 1 ? 'story' : 'stories'} as read`;
			seen.add(ids);
		}
	}

	function removeStory(story: BriefStory): void {
		const key = storyKey(story);
		stories = stories.filter((candidate) => storyKey(candidate) !== key);
	}

	function toggleMore(topicId: string): void {
		openMore = { ...openMore, [topicId]: !openMore[topicId] };
	}

	function expandAll(): void {
		const list = renderedStories;
		expandedStories = toggleExpandAllKeys(
			list.map((story) => storyKey(story)),
			expandedStories,
			(key) => list.some((story) => storyKey(story) === key && isBlurred(story)),
		);
	}

	function openSelected(kind: 'toggle' | 'open' | 'close'): void {
		const story = stories[nav.selectedIndex];
		if (!story || sharedActive) return;
		if (kind !== 'close' && isBlurred(story)) {
			revealStory(story);
			return;
		}
		const key = storyKey(story);
		const open = Boolean(expandedStories[key]);
		if (kind === 'open') {
			if (!open) expandedStories = { ...expandedStories, [key]: true };
			return;
		}
		if (kind === 'close') {
			if (open) expandedStories = { ...expandedStories, [key]: false };
			return;
		}
		expandedStories = { ...expandedStories, [key]: !open };
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (addStoryOpen || settingsOpen) {
			if (event.key === 'Escape') {
				event.preventDefault();
				addStoryOpen = false;
				settingsOpen = false;
			}
			return;
		}
		if (isTypingTarget(event.target) && event.key !== 'Escape') return;

		if (gg(event.key, Date.now())) {
			event.preventDefault();
			nav.selectEdge('first');
			publishSelection(true);
			return;
		}
		if (event.key === 'g') return;

		if (event.key === 'j') {
			event.preventDefault();
			nav.selectNext();
			publishSelection(true);
			return;
		}
		if (event.key === 'k') {
			event.preventDefault();
			nav.selectPrevious();
			publishSelection(true);
			return;
		}
		if (event.key === 'G') {
			event.preventDefault();
			nav.selectEdge('last');
			publishSelection(true);
			return;
		}
		if (event.key === 'Enter') {
			const target = event.target instanceof Element ? event.target : null;
			if (!enterTogglesSelection(nav.hasSelection, target)) return;
			event.preventDefault();
			openSelected('toggle');
			publishSelection(true);
			return;
		}
		if (event.key === 'o') {
			if (!nav.hasSelection) return;
			event.preventDefault();
			openSelected('open');
			publishSelection(true);
			return;
		}
		if (event.key === 'x') {
			if (!nav.hasSelection) return;
			event.preventDefault();
			openSelected('close');
			return;
		}
		if (event.key === 'm') {
			if (!nav.hasSelection) return;
			event.preventDefault();
			toggleRead(stories[nav.selectedIndex]);
			return;
		}
		if (event.key === 'Escape' && nav.hasSelection) {
			event.preventDefault();
			nav.clearSelection();
			publishSelection(true);
		}
	}

	function openSettings(tab: SettingsTab): void {
		settingsTab = tab;
		settingsOpen = true;
		if (tab === 'filters' && location.hash !== '#settings/filters') {
			location.hash = '#settings/filters';
		}
	}

	function closeSettings(): void {
		settingsOpen = false;
		if (location.hash.startsWith('#settings')) {
			history.replaceState(history.state, '', `${location.pathname}${location.search}`);
		}
	}

	function applyHash(): void {
		const hash = location.hash;
		if (hash === '#settings/filters') {
			settingsTab = 'filters';
			settingsOpen = true;
			return;
		}
		if (hash === '#settings' || hash.startsWith('#settings/')) settingsOpen = true;
	}

	async function loadTopics(): Promise<void> {
		const result = await fetchSeedTopics();
		if (!addStoryOpen) return;
		if (!result.ok) {
			seedTopics = [];
			seedTopicsError = result.error;
			return;
		}
		seedTopics = result.topics;
		seedTopicsError = null;
	}

	function openAddStory(): void {
		seedError = null;
		addStoryOpen = true;
		void loadTopics();
	}

	async function submitSeed(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (seedSaving) return;
		const built = buildSeedPayload({
			title: seedTitle,
			topicId: seedTopicId,
			note: seedNote,
			urlsText: seedUrls,
		});
		if (!built.ok) {
			seedError = built.error;
			return;
		}
		seedSaving = true;
		const result = await postSeed(built.payload);
		seedSaving = false;
		if (!result.ok) {
			seedError = result.error;
			return;
		}
		addStoryOpen = false;
		seedTitle = '';
		seedTopicId = '';
		seedNote = '';
		seedUrls = '';
		seedError = null;
		await reload();
	}

	async function reload(): Promise<void> {
		const previous = expandedStories;
		const data = await loadBrief();
		stories = data.stories;
		overview = data.overview;
		categoryName = data.categoryName;
		loaded = true;
		expandedStories = survivingExpandedStories(previous, data.stories);
		// Clear the one-shot latch here, not from a render effect. Fetch again
		// only when Filtered or All is already showing.
		filteredRequested = false;
		if (showsFiltered(verdictView)) void loadFiltered();
	}

	async function refreshBrief(): Promise<void> {
		if (refreshing) return;
		refreshing = true;
		refreshMessage = null;
		await seen.flush();
		const result = await postRefresh();
		if (!result.ok) {
			refreshing = false;
			refreshMessage = result.unauthenticated ? REFRESH_LOGIN : REFRESH_ERROR;
			return;
		}
		await reload();
		refreshing = false;
	}

	async function loadFiltered(): Promise<void> {
		if (filteredRequested) return;
		filteredRequested = true;
		const seq = ++filteredLoadSeq;
		filteredLoading = true;
		const result = await fetchFilteredVerdicts();
		if (seq !== filteredLoadSeq) return;
		filteredLoading = false;
		if (result.ok) {
			filteredItems = result.items;
			filteredUnauthenticated = false;
			return;
		}
		filteredItems = null;
		filteredUnauthenticated = result.unauthenticated;
	}

	function setVerdict(view: VerdictView): void {
		verdictView = view;
		if (showsFiltered(view)) void loadFiltered();
	}

	async function viewLatest(): Promise<void> {
		// Stay in the shared view until `/` commits. Clearing `sharedActive` first
		// paints the topic list on this page, then `goto` remounts BriefScreen and
		// drops a selection made in that gap.
		await goto('/');
	}

	function releaseSummary(id: string): void {
		if (!requestedSummaries.delete(id)) return;
		summaryGeneration.set(id, (summaryGeneration.get(id) ?? 0) + 1);
		if (summaryRequests[id] === undefined) return;
		const { [id]: _dropped, ...rest } = summaryRequests;
		summaryRequests = rest;
	}

	async function requestSummary(id: string): Promise<void> {
		const generation = (summaryGeneration.get(id) ?? 0) + 1;
		summaryGeneration.set(id, generation);
		summaryRequests = { ...summaryRequests, [id]: 'loading' };
		const result = await postSummary(id);
		if (summaryGeneration.get(id) !== generation) return;
		if (!result.ok) {
			summaryRequests = {
				...summaryRequests,
				[id]: result.unauthenticated ? 'login' : 'error',
			};
			return;
		}
		const { [id]: _done, ...rest } = summaryRequests;
		summaryRequests = rest;
		stories = stories.map((story) => {
			if (story.id !== id) return story;
			if (result.status === 'ok') {
				return { ...story, short_summary: result.text, informed_summary_status: 'ok' };
			}
			return { ...story, short_summary: '', informed_summary_status: 'unavailable' };
		});
	}

	async function requestFullStory(story: BriefStory): Promise<void> {
		const id = story.id;
		if (!id || !shouldRequestFullStory(story) || fullStarted.has(id)) return;
		fullStarted.add(id);
		fullStoryRequests = { ...fullStoryRequests, [id]: { phase: 'loading' } };
		const result = await postFullStory(id);
		if (!result.ok) {
			fullStoryRequests = {
				...fullStoryRequests,
				[id]: result.unauthenticated
					? { phase: 'login' }
					: { phase: 'error', message: fullStoryErrorCopy(result.status, result.error) },
			};
			if (!result.unauthenticated) {
				stories = stories.map((item) =>
					item.id === id ? { ...item, informed_full_story_status: 'error' } : item,
				);
			}
			return;
		}
		const { [id]: _done, ...rest } = fullStoryRequests;
		fullStoryRequests = rest;
		stories = stories.map((item) => (item.id === id ? applyFullStory(item, result.fullStory) : item));
	}

	/** Explicit user action for a card the budget guard skipped: one request, this card only. */
	function loadFullStory(story: BriefStory): void {
		if (story.id && story.informed_full_story_status === 'error') fullStarted.delete(story.id);
		void requestFullStory(story);
	}

	$effect(() => {
		const settings = contentFilter;
		const current = stories;
		const open = expandedStories;
		const saw = filterSessionSawOpen;
		const settingsKey =
			settings.keywords.length === 0
				? null
				: `${settings.filterMode}\0${settings.filterScope}\0${settings.keywords.join('\0')}`;
		if (settingsKey === null) {
			carry = new Map();
			carryKey = null;
			matchByKey = {};
			if (saw) filterSessionSawOpen = false;
			return;
		}
		if (carryKey !== settingsKey) {
			carry = new Map();
			carryKey = settingsKey;
			revealed = new Set();
		}
		const openKeys = new Set(
			Object.entries(open)
				.filter(([, value]) => value)
				.map(([key]) => key),
		);
		const known = new Set(current.map((story) => storyKey(story)));
		const decision = openKeysForFilterDecision(openKeys, carry, known, saw);
		const result = decideTopicBriefFilterMatches(
			current,
			(story) => shouldFilterStory(story, settings.keywords, settings.filterScope).matchedKeywords,
			decision.effectiveOpen,
			carry,
		);
		carry = result.carry;
		const next: Record<string, string[]> = {};
		for (const [story, keywords] of result.matches) next[storyKey(story)] = keywords;
		matchByKey = next;
		if (filterSessionSawOpen !== decision.sessionSawOpen) {
			filterSessionSawOpen = decision.sessionSawOpen;
		}
	});

	$effect(() => {
		const keys = storyKeys(stories);
		const order = keyboardOrder;
		nav.followStories(keys, order);
		if (nav.hasSelection && !order.includes(nav.selectedIndex)) nav.clearSelection();
		selectedIndex = nav.selectedIndex;
		if (selectedIndex < 0) announcement = '';
	});

	$effect(() => {
		if (!loaded) return;
		for (const story of stories) {
			const id = story.id;
			if (!id || !isTopicBriefStory(story) || story.informed_summary_status !== 'missing') continue;
			if (!expandedStories[storyKey(story)]) {
				releaseSummary(id);
				continue;
			}
			if (requestedSummaries.has(id)) continue;
			requestedSummaries.add(id);
			void requestSummary(id);
		}
	});

	$effect(() => {
		const current = { ...expandedStories };
		const opened = newlyExpandedKeys(previousExpanded, current);
		previousExpanded = current;
		if (!loaded || opened.length === 0) return;
		const fullKeys = new Set(autoFullStoryRequestKeys(opened));
		untrack(() => {
			const ids: string[] = [];
			for (const key of opened) {
				const story = stories.find((item) => storyKey(item) === key);
				if (!story?.id || !isTopicBriefStory(story)) continue;
				ids.push(story.id);
				if (fullKeys.has(key)) {
					if (story.informed_full_story_status === 'error') fullStarted.delete(story.id);
					void requestFullStory(story);
				}
			}
			if (ids.length > 0) seen.add(ids);
		});
	});

	$effect(() => {
		const story = sharedStory;
		if (!story?.id || !loaded) return;
		untrack(() => {
			seen.add([story.id as string]);
			void requestFullStory(story);
		});
	});

	$effect(() => {
		if (!browser) return;
		const url = page.url;
		const href = `${url.pathname}${url.search}`;
		const shared = url.searchParams.get('shared') === '1';
		const index = storyIndexFromPath(url.pathname);
		if (!shared || index === null) {
			sharedActive = false;
			sharedIndex = null;
			lastSharedHref = '';
			return;
		}
		if (!loaded) return;
		const story = stories[index];
		const visit = sharedHrefVisit(href, lastSharedHref, story !== undefined);
		switch (visit.action) {
			case 'skip':
				return;
			case 'missing': {
				// Clear the latch now. replaceState does not update page.url, so the
				// !shared branch will not run to clear it.
				lastSharedHref = visit.latch;
				sharedActive = false;
				sharedIndex = null;
				sharedMissingNotice = true;
				const next = new URL(url);
				next.searchParams.delete('shared');
				replaceState(`${next.pathname}${next.search}`, {});
				return;
			}
			case 'found': {
				if (!story) return;
				lastSharedHref = visit.latch;
				sharedMissingNotice = false;
				sharedActive = true;
				sharedIndex = index;
				untrack(() => {
					const key = storyKey(story);
					if (!expandedStories[key]) expandedStories = { ...expandedStories, [key]: true };
					nav.clearSelection();
					selectedIndex = nav.selectedIndex;
					announcement = '';
				});
				return;
			}
			default: {
				const unreachable: never = visit;
				return unreachable;
			}
		}
	});

	$effect(() => {
		if (!browser || !loaded) return;
		const url = page.url;
		if (url.searchParams.get('shared') === '1') {
			linkedIndex = null;
			return;
		}
		const index = storyIndexFromPath(url.pathname);
		linkedIndex = index;
		if (index === null) {
			linkedAppliedPath = '';
			return;
		}
		if (linkedAppliedPath === url.pathname) return;
		const story = stories[index];
		if (!story) return;
		linkedAppliedPath = url.pathname;
		untrack(() => {
			const key = storyKey(story);
			expandedStories = { ...expandedStories, [key]: true };
		});
	});

	onMount(() => {
		contentFilter = loadContentFilter();
		storyCount = readStoryCount();
		singlePage = readSinglePage();
		applyHash();
		const onHash = () => applyHash();
		window.addEventListener('hashchange', onHash);
		window.addEventListener('keydown', onKeyDown);
		const clock = window.setInterval(() => {
			clockNow = new Date();
		}, 30_000);
		void reload();
		return () => {
			window.removeEventListener('hashchange', onHash);
			window.removeEventListener('keydown', onKeyDown);
			window.clearInterval(clock);
			void seen.flush();
		};
	});
</script>

{#snippet card(story: BriefStory)}
	{@const index = stories.indexOf(story)}
	<StoryArticle
		{story}
		storyIndex={index}
		expanded={Boolean(expandedStories[storyKey(story)])}
		blurred={isBlurred(story)}
		blurKeywords={matchByKey[storyKey(story)] ?? []}
		selected={index >= 0 && index === selectedIndex}
		linked={!sharedActive && index === linkedIndex}
		shared={sharedActive}
		read={Boolean(story.id && readStories[story.id])}
		summaryPhase={story.id ? summaryRequests[story.id] : undefined}
		fullPhase={story.id ? fullStoryRequests[story.id] : undefined}
		onToggle={() => toggleStory(story)}
		onReveal={() => revealStory(story)}
		onReadToggle={() => toggleRead(story)}
		onLoadFull={() => loadFullStory(story)}
		onRemoved={() => removeStory(story)}
	/>
{/snippet}

<div class="screen">
	<header class="top">
		<h1 class="brand">Informed News</h1>
		<div class="top-actions">
			<button type="button" aria-label="Settings" onclick={() => openSettings('language')}>Settings</button>
			{#if !sharedActive}
				<button type="button" onclick={openAddStory}>Add story</button>
			{/if}
		</div>
	</header>

	{#if !sharedActive}
		<ul aria-label="News categories">
			<li>
				<button type="button" ondblclick={expandAll}>{categoryName}</button>
			</li>
		</ul>
	{/if}

	<div class="sr-only" data-testid="keyboard-selection-announcer" aria-live="polite">{announcement}</div>

	<div class="sr-only" data-testid="read-announcer" aria-live="polite">{readAnnouncement}</div>
	{#if seenError}
		<p role="alert">{BRIEF_SEEN_SAVE_ERROR}</p>
	{/if}

	{#if sharedMissingNotice}
		<div role="status">
			<p>{SHARED_STORY_NOT_FOUND}</p>
			<button type="button" onclick={() => (sharedMissingNotice = false)}>Close</button>
		</div>
	{/if}

	{#if sharedStory}
		<div class="shared-banner">
			<p>Viewing a shared story</p>
			<button type="button" onclick={viewLatest}>View latest stories</button>
		</div>
		{@render card(sharedStory)}
	{:else if showTopics && overview}
		<section class="topics-heading" aria-label={BRIEF_STORIES_SECTION_TITLE}>
			<h2>{BRIEF_STORIES_SECTION_TITLE}</h2>
		</section>
		<div data-testid="brief-refresh-bar">
			<p class="bar-links">
				<span>{updatedLabel(overview.refresh, clockNow)}</span>
				{#if nextRefreshLabel(overview.refresh?.nextAt, clockNow)}
					<span>{nextRefreshLabel(overview.refresh?.nextAt, clockNow)}</span>
				{/if}
				<a href="/filtered" data-testid="brief-filtered-link">{filteredOutLinkLabel(overview.filteredOut)}</a>
				<a href="/feedback" data-testid="brief-feedback-link">Feedback</a>
			</p>
			{#if overview.notices.length > 0}
				<p>{overview.notices.join(' · ')}</p>
			{/if}
			<div class="verdict-row">
				<div role="group" aria-label="Brief verdict view" data-testid="brief-verdict-view">
					{#each VERDICT_VIEWS as view (view)}
						<button
							type="button"
							aria-pressed={verdictView === view ? 'true' : 'false'}
							onclick={() => setVerdict(view)}
						>
							{verdictLabel(view)}
						</button>
					{/each}
				</div>
				<button type="button" disabled={refreshing} aria-busy={refreshing} onclick={refreshBrief}>
					{refreshing ? REFRESHING_LABEL : REFRESH_LABEL}
				</button>
			</div>
			{#if refreshMessage === REFRESH_LOGIN}
				<p role="alert"><a href="/topics">{REFRESH_LOGIN}</a></p>
			{:else if refreshMessage}
				<p role="alert">{refreshMessage}</p>
			{/if}
		</div>

		{#if showsApproved(verdictView)}
			{#if afterHide.sections.length === 0 && afterHide.hiddenCount > 0}
				<p>
					{BRIEF_ALL_FILTERED}
					<a
						href="#settings/filters"
						onclick={(event) => {
							event.preventDefault();
							openSettings('filters');
						}}>Adjust filters</a>
				</p>
			{:else if afterHide.sections.length === 0}
				<p>
					{#if overview.quiet.length === 0}
						No topics yet.
						<a href="/topics">Add topics</a>
						to build your Brief.
					{:else}
						No new stories for your topics.
					{/if}
				</p>
			{/if}

			{#each afterHide.sections as section (section.topicId)}
				<section
					data-testid="topic-brief-section"
					aria-labelledby={'topic-' + section.topicId}
				>
					<header class="section-head">
						<h3 id={'topic-' + section.topicId}>{section.name}</h3>
						<span>{BRIEF_LEVEL_LABEL[section.level]}</span>
					</header>
					{#each section.top as story (storyKey(story))}
						{@render card(story)}
					{/each}
					{#if openMore[section.topicId]}
						{#each section.more as story (storyKey(story))}
							{@render card(story)}
						{/each}
					{/if}
					{#if section.more.length > 0}
						<button
							type="button"
							aria-expanded={openMore[section.topicId] ? 'true' : 'false'}
							onclick={() => toggleMore(section.topicId)}
						>
							{openMore[section.topicId] ? BRIEF_LESS_LABEL : moreLabel(section.more.length)}
						</button>
					{/if}
				</section>
			{/each}

			{#if topicFilteredCount > 0}
				<p>{filteredCountLabel(contentFilter.filterMode, topicFilteredCount)}</p>
			{/if}
			{#if quiet}
				<p data-testid="topic-brief-quiet">{quiet}</p>
			{/if}
			{#if hasUnread}
				<button type="button" onclick={markAllRead}>Mark all as read</button>
			{/if}
		{/if}

		{#if showsFiltered(verdictView)}
			<FilteredVerdictList
				items={filteredItems}
				loading={filteredLoading}
				unauthenticated={filteredUnauthenticated}
			/>
		{/if}
	{:else if loaded}
		{#if flatShown.length === 0 && flatHiddenCount > 0 && contentFilter.filterMode === 'hide'}
			<p>All stories in this category were filtered</p>
			<button type="button" onclick={() => openSettings('filters')}>Adjust filters</button>
		{/if}
		{#each flatShown as story (storyKey(story))}
			{@render card(story)}
		{/each}
		{#if flatHiddenCount > 0}
			<p>{filteredCountLabel(contentFilter.filterMode, flatHiddenCount)}</p>
		{/if}
		{#if hasUnread}
			<button type="button" onclick={markAllRead}>Mark all as read</button>
		{/if}
	{/if}

	<footer>
		<a href="/topics">Topics</a>
		<a href="/transparency">Transparency</a>
	</footer>
</div>

{#if settingsOpen}
	<div class="backdrop">
		<div class="dialog" role="dialog" aria-modal="true" aria-labelledby={settingsTitleId}>
			<h2 id={settingsTitleId}>Settings</h2>
			<div role="tablist" aria-label="Settings sections">
				{#each SETTINGS_TABS as tab (tab)}
					<button
						type="button"
						role="tab"
						aria-selected={settingsTab === tab ? 'true' : 'false'}
						onclick={() => (settingsTab = tab)}
					>
						{settingsLabel(tab)}
					</button>
				{/each}
			</div>
			{#if settingsTab === 'language'}
				<p>Choose how Informed News reads.</p>
			{:else if settingsTab === 'stories'}
				<p>Story count for the plain list is kept in this browser.</p>
			{:else if settingsTab === 'about'}
				<p>Informed News shows what the Brief knows and what it does not.</p>
			{:else if settingsTab === 'filters'}
				<h3>Keyword filters</h3>
				{#if contentFilter.keywords.length === 0}
					<p>No keyword filters yet.</p>
				{:else}
					<ul>
						{#each contentFilter.keywords as keyword, index (keyword + index)}
							<li>{keyword}</li>
						{/each}
					</ul>
				{/if}
			{/if}
			<button type="button" onclick={closeSettings}>Done</button>
		</div>
	</div>
{/if}

{#if addStoryOpen}
	<div class="backdrop">
		<div class="dialog" role="dialog" aria-modal="true" aria-labelledby={seedTitleId}>
			<h2 id={seedTitleId}>Add story to Brief</h2>
			<form onsubmit={submitSeed}>
				<label class="field">
					Title
					<input bind:value={seedTitle} autocomplete="off" />
				</label>
				<label class="field">
					Topic
					<select bind:value={seedTopicId}>
						<option value="" disabled>Choose a topic</option>
						{#if coreTopics.length > 0}
							<optgroup label={BRIEF_LEVEL_LABEL.core}>
								{#each coreTopics as topic (topic.id)}
									<option value={topic.id}>{topic.name}</option>
								{/each}
							</optgroup>
						{/if}
						{#if watchTopics.length > 0}
							<optgroup label={BRIEF_LEVEL_LABEL.watch}>
								{#each watchTopics as topic (topic.id)}
									<option value={topic.id}>{topic.name}</option>
								{/each}
							</optgroup>
						{/if}
					</select>
				</label>
				<label class="field">
					Note (optional)
					<textarea bind:value={seedNote} rows="2"></textarea>
				</label>
				<label class="field">
					URLs (one per line, at least one)
					<textarea bind:value={seedUrls} rows="3"></textarea>
				</label>
				{#if seedTopicsError}
					<p role="alert">{seedTopicsError}</p>
				{/if}
				{#if seedError}
					<p role="alert">{seedError}</p>
				{/if}
				<button type="submit" disabled={seedSaving || seedTopics.length === 0}>
					{seedSaving ? 'Saving…' : 'Add to Brief'}
				</button>
				<button type="button" onclick={() => (addStoryOpen = false)} disabled={seedSaving}>Cancel</button>
			</form>
		</div>
	</div>
{/if}

<style>
	.screen {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem 1rem 2rem;
		font-family: system-ui, sans-serif;
		color: #111827;
	}

	.top,
	.top-actions,
	.verdict-row,
	.section-head,
	.bar-links,
	footer {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}

	.top {
		justify-content: space-between;
	}

	.brand {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
	}

	.topics-heading h2 {
		margin: 1.25rem 0 0.25rem;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.section-head {
		border-bottom: 1px solid #111827;
		margin-top: 1.5rem;
	}

	.section-head h3 {
		margin: 0;
		font-size: 1.125rem;
	}

	.section-head span {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #6b7280;
	}

	.shared-banner {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin: 1rem 0;
		padding: 0.75rem 1rem;
		border-left: 4px solid #9ca3af;
		background: #f9fafb;
	}

	footer {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid #e5e7eb;
	}

	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(17, 24, 39, 0.45);
		padding: 1rem;
	}

	.dialog {
		width: min(32rem, 100%);
		max-height: 90vh;
		overflow: auto;
		background: #fff;
		padding: 1rem;
	}

	.field {
		display: block;
		margin: 0.75rem 0;
		font-size: 0.875rem;
	}

	.field input,
	.field select,
	.field textarea {
		display: block;
		width: 100%;
		margin-top: 0.25rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
