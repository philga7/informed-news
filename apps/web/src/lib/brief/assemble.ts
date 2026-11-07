/**
 * Topic Brief grouping, keyword filters, and shared-story lookup.
 * Ported from apps/kite (`topicBrief`, content-filter match, `sharedStory`)
 * so the shell does not import the Kite tree.
 */

/** The owned Brief category slug served by mvp/server (named "Brief"). */
export const TOPIC_BRIEF_CATEGORY_ID = 'world';

/** Heading above the story list on the Brief page. */
export const BRIEF_STORIES_SECTION_TITLE = 'Your topics';

export const BRIEF_LEVEL_LABEL: Record<TopicBriefLevel, string> = {
	core: 'Core',
	watch: 'Watch',
};

export const BRIEF_LESS_LABEL = 'Show fewer';

export const BRIEF_QUIET_PREFIX = 'Nothing new:';

export const BRIEF_ALL_FILTERED = 'Your keyword filters hide every story in your Brief.';

export const BRIEF_OTHER_SECTION_NAME = 'Other stories';

export const BRIEF_OFFICIAL_LABEL = 'Official statement';

export const BRIEF_ADDED_BY_YOU_LABEL = 'Added by you';

export const BRIEF_AI_SUMMARY_NOTE = 'AI summary — not ground truth';

export const BRIEF_SUMMARY_UNAVAILABLE = 'Full text unavailable';

export const BRIEF_SUMMARY_MISSING = 'Summary loads when you open this story';

export const BRIEF_SUMMARY_LOADING = 'Loading summary…';

export const BRIEF_SUMMARY_LOGIN_HINT = 'Log in on Topics to load summaries';

export const BRIEF_SUMMARY_ERROR = 'Summary could not be loaded right now.';

/** Quiet inline copy when full-story generation had no usable source text (NEWS-101). */
export const BRIEF_FULL_STORY_UNAVAILABLE = 'Full story unavailable — no readable text';

export const BRIEF_FULL_STORY_LOADING = 'Loading full story…';

export const BRIEF_FULL_STORY_LOGIN_HINT = 'Log in on Topics to load full stories';

export const BRIEF_FULL_STORY_ERROR = 'Full story could not be loaded right now.';

export const BRIEF_FULL_STORY_RATE_LIMITED = 'Full story limit reached for this hour. Try again later.';

export const BRIEF_FULL_STORY_NOT_IN_BRIEF = 'This story is no longer in the Brief.';

export const BRIEF_NOT_REFRESHED = 'Not refreshed yet';

export const BRIEF_SEEN_DEBOUNCE_MS = 1000;

/** Kite content-filter localStorage key. */
export const CONTENT_FILTER_STORAGE_KEY = 'kite-content-filter';

export const SHARED_STORY_NOT_FOUND =
	"The shared story couldn't be found, so you're seeing the latest stories.";

export type TopicBriefLevel = 'core' | 'watch';

export type FilterMode = 'hide' | 'blur';

export type FilterScope = 'title' | 'summary' | 'all';

/** Stored shape of `kite-content-filter` (version 1). */
export type ContentFilterSettings = {
	keywords: string[];
	filterMode: FilterMode;
	filterScope: FilterScope;
	version: 1;
};

export type SummaryStatus = 'ok' | 'missing' | 'unavailable';

export type FullStoryStatus = 'missing' | 'ok' | 'unavailable' | 'error';

export type StoryPerspective = {
	text?: string;
	sources?: { name?: string; url?: string }[];
};

export type StoryArticle = {
	title?: string;
	link?: string;
	domain?: string;
};

export type TimelineEvent = {
	date?: string;
	content?: string;
};

export type StoryDomain = {
	name?: string;
};

/** Story fields these helpers read. */
export type Story = {
	id?: string;
	cluster_number?: number;
	category?: string;
	title: string;
	short_summary?: string;
	articles?: StoryArticle[];
	domains?: StoryDomain[];
	talking_points?: string[];
	timeline?: TimelineEvent[] | null;
	perspectives?: StoryPerspective[] | null;
	quote?: string | null;
	quote_author?: string | null;
	informed_full_story_updated?: string;
	informed_article_id?: string;
	informed_topic_id?: string;
	informed_topic_name?: string;
	informed_more?: boolean;
	informed_outlet_count?: number | null;
	informed_labels?: string[];
	informed_added_by_you?: boolean;
	informed_summary_status?: SummaryStatus;
	informed_full_story_status?: FullStoryStatus;
};

export type BriefOverviewSection = {
	topicId: string;
	name: string;
	level: TopicBriefLevel;
	storyIds: string[];
	moreIds: string[];
};

export type BriefTopicRef = { id: string; name: string; level: TopicBriefLevel };

export type TopicBriefSection = {
	topicId: string;
	name: string;
	level: TopicBriefLevel;
	top: Story[];
	more: Story[];
};

export type SummaryLine =
	| { kind: 'ok'; text: string; note: string }
	| { kind: 'unavailable'; text: string }
	| { kind: 'missing'; text: string };

export type SharedStoryRef = {
	clusterId?: number | null;
	storyIndex?: number | null;
};

/** Kite's story key: id, then cluster number, then title. */
export function storyKey(story: Story): string {
	return story.id || story.cluster_number?.toString() || story.title;
}

/** Same key as `storyKey`, one per story. */
export function storyKeys(stories: readonly Story[]): string[] {
	return stories.map((story) => storyKey(story));
}

export function isTopicBriefStory(story: Story): boolean {
	return typeof story.informed_article_id === 'string' && story.informed_article_id.length > 0;
}

/** "+N outlets" for a card covered by more than one outlet; null otherwise. */
export function outletBadge(outletCount: number | null | undefined): string | null {
	if (typeof outletCount !== 'number' || !Number.isFinite(outletCount)) return null;
	const others = Math.floor(outletCount) - 1;
	if (others < 1) return null;
	return `+${others} ${others === 1 ? 'outlet' : 'outlets'}`;
}

export function isOfficialStory(story: Story): boolean {
	return Array.isArray(story.informed_labels) && story.informed_labels.includes('official');
}

/** Operator-added seed (NEWS-98). */
export function isManualSeedStory(story: Story): boolean {
	return story.informed_added_by_you === true;
}

/** Card summary line; null when the story carries no summary status (or an empty ok summary). */
export function summaryLine(story: Story): SummaryLine | null {
	switch (story.informed_summary_status) {
		case 'ok': {
			const text = story.short_summary?.trim() ?? '';
			return text ? { kind: 'ok', text, note: BRIEF_AI_SUMMARY_NOTE } : null;
		}
		case 'unavailable':
			return { kind: 'unavailable', text: BRIEF_SUMMARY_UNAVAILABLE };
		case 'missing':
			return { kind: 'missing', text: BRIEF_SUMMARY_MISSING };
		case undefined:
			return null;
		default: {
			const _exhaustive: never = story.informed_summary_status;
			return _exhaustive;
		}
	}
}

export function moreLabel(count: number): string {
	return `More (${count})`;
}

export function quietLine(quiet: BriefTopicRef[]): string | null {
	if (quiet.length === 0) return null;
	return `${BRIEF_QUIET_PREFIX} ${quiet.map((topic) => topic.name).join(', ')}`;
}

/**
 * Stories grouped by overview section order. Stories the overview does not
 * reference (e.g. a reload raced the overview fetch) are kept: they join their
 * topic's section, or a trailing section per topic, so nothing disappears.
 */
export function groupTopicBrief(
	overview: { sections: BriefOverviewSection[] },
	stories: Story[],
): TopicBriefSection[] {
	const byId = new Map<string, Story>();
	for (const story of stories) {
		if (story.id) byId.set(story.id, story);
	}
	const placed = new Set<string>();
	const pick = (ids: string[]): Story[] => {
		const out: Story[] = [];
		for (const id of ids) {
			const story = byId.get(id);
			if (!story || placed.has(id)) continue;
			placed.add(id);
			out.push(story);
		}
		return out;
	};

	const sections: TopicBriefSection[] = overview.sections.map((section) => ({
		topicId: section.topicId,
		name: section.name,
		level: section.level,
		top: pick(section.storyIds),
		more: pick(section.moreIds),
	}));
	const sectionByTopic = new Map(sections.map((section) => [section.topicId, section]));

	for (const story of stories) {
		if (story.id && placed.has(story.id)) continue;
		const topicId = story.informed_topic_id ?? '';
		let section = sectionByTopic.get(topicId);
		if (!section) {
			section = {
				topicId,
				name: story.informed_topic_name?.trim() || BRIEF_OTHER_SECTION_NAME,
				level: 'watch',
				top: [],
				more: [],
			};
			sectionByTopic.set(topicId, section);
			sections.push(section);
		}
		(story.informed_more ? section.more : section.top).push(story);
	}

	return sections.filter((section) => section.top.length + section.more.length > 0);
}

/**
 * Kite content filter in hide mode: hidden stories leave their section, More
 * stories move up to keep each topic's top count, and emptied topics drop out.
 */
export function hideFilteredStories(
	sections: TopicBriefSection[],
	isHidden: (story: Story) => boolean,
): { sections: TopicBriefSection[]; hiddenCount: number } {
	let hiddenCount = 0;
	const shown: TopicBriefSection[] = [];
	for (const section of sections) {
		const all = [...section.top, ...section.more];
		const kept = all.filter((story) => !isHidden(story));
		hiddenCount += all.length - kept.length;
		if (kept.length === all.length) {
			shown.push(section);
		} else if (kept.length > 0) {
			const topCount = section.top.length;
			shown.push({ ...section, top: kept.slice(0, topCount), more: kept.slice(topCount) });
		}
	}
	return { sections: shown, hiddenCount };
}

/**
 * Which story keys count as "open" for filter carry.
 *
 * A Brief reload briefly empties expanded stories while the prior carry still holds
 * the open cards (NEWS-150). Before this session has seen any open card, treat
 * carried keys still in the list as open so that remount doesn't re-decide them.
 * Once the session has seen opens and every card is closed, return empty so closed
 * cards decide again (NEWS-154).
 */
export function openKeysForFilterDecision(
	openKeys: ReadonlySet<string>,
	priorCarry: ReadonlyMap<string, string[]>,
	knownKeys: ReadonlySet<string>,
	sessionSawOpen: boolean,
): { effectiveOpen: Set<string>; sessionSawOpen: boolean } {
	if (openKeys.size > 0) {
		return { effectiveOpen: new Set(openKeys), sessionSawOpen: true };
	}
	if (sessionSawOpen || priorCarry.size === 0) {
		return { effectiveOpen: new Set(), sessionSawOpen };
	}
	return {
		effectiveOpen: new Set([...priorCarry.keys()].filter((key) => knownKeys.has(key))),
		sessionSawOpen: false,
	};
}

/**
 * Filter matches for the topic Brief: open cards keep their prior decision by story key
 * across reloads (new story objects), so text gained after open can't hide/blur them.
 * Closed cards and a fresh prior (filter settings change) decide again.
 */
export function decideTopicBriefFilterMatches(
	stories: readonly Story[],
	match: (story: Story) => string[],
	openKeys: ReadonlySet<string>,
	priorCarry: ReadonlyMap<string, string[]>,
	keyOf: (story: Story) => string = storyKey,
): { matches: Map<Story, string[]>; carry: Map<string, string[]> } {
	const matches = new Map<Story, string[]>();
	const carry = new Map<string, string[]>();
	for (const story of stories) {
		const key = keyOf(story);
		const open = openKeys.has(key);
		const carried = open ? priorCarry.get(key) : undefined;
		// An empty list is a real prior decision (the card matched nothing when opened).
		const matched = carried !== undefined ? carried : match(story);
		if (open) carry.set(key, matched);
		if (matched.length > 0) matches.set(story, matched);
	}
	return { matches, carry };
}

/**
 * Expand-all keys: skip still-blurred cards so expand-all never leaves a card
 * expanded under the blur (NEWS-149). Collapse when every expandable card is open.
 */
export function toggleExpandAllKeys(
	keys: readonly string[],
	expanded: Record<string, boolean>,
	isBlurred: (key: string) => boolean,
): Record<string, boolean> {
	const expandable = keys.filter((key) => !isBlurred(key));
	const allExpanded =
		expandable.length > 0 && expandable.every((key) => Boolean(expanded[key]));
	if (allExpanded) return {};
	// Never keep a blurred key expanded (even if it was already true).
	const next: Record<string, boolean> = {};
	for (const [key, open] of Object.entries(expanded)) {
		if (open && !isBlurred(key)) next[key] = true;
	}
	for (const key of expandable) next[key] = true;
	return next;
}

/**
 * Keep open cards open across a Brief data reload when the story key still exists
 * (NEWS-150). Drop keys for stories that disappeared.
 */
export function survivingExpandedStories(
	previous: Record<string, boolean>,
	stories: readonly Story[],
	keyOf: (story: Story) => string = storyKey,
): Record<string, boolean> {
	const known = new Set(stories.map(keyOf));
	const surviving: Record<string, boolean> = {};
	for (const [key, open] of Object.entries(previous)) {
		if (open && known.has(key)) surviving[key] = true;
	}
	return surviving;
}

/** English "N story/stories hidden|filtered" line. Singular only when count is 1. */
export function filteredCountLabel(mode: FilterMode, count: number): string {
	const noun = count === 1 ? 'story' : 'stories';
	switch (mode) {
		case 'hide':
			return `${count} ${noun} hidden`;
		case 'blur':
			return `${count} ${noun} filtered`;
		default: {
			const _exhaustive: never = mode;
			return _exhaustive;
		}
	}
}

/**
 * Keyword match on title (plus category), summary, or all story text.
 * Whole-word, case-insensitive. Special regex characters in keywords are escaped.
 */
export function shouldFilterStory(
	story: Story,
	keywords: string[],
	scope: FilterScope,
): { shouldFilter: boolean; matchedKeywords: string[] } {
	if (!keywords || keywords.length === 0) {
		return { shouldFilter: false, matchedKeywords: [] };
	}

	const matchedKeywords: string[] = [];
	const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
	let textToCheck = '';

	if (scope === 'title' || scope === 'all') {
		textToCheck += `${(story.title || '').toLowerCase()} `;
		textToCheck += `${(story.category || '').toLowerCase()} `;
	}

	if (scope === 'summary' || scope === 'all') {
		textToCheck += `${(story.short_summary || '').toLowerCase()} `;
	}

	if (scope === 'all') {
		if (story.perspectives && Array.isArray(story.perspectives)) {
			story.perspectives.forEach((perspective) => {
				textToCheck += `${(perspective.text || '').toLowerCase()} `;
				if (perspective.sources && Array.isArray(perspective.sources)) {
					perspective.sources.forEach((source) => {
						textToCheck += `${(source.name || '').toLowerCase()} `;
					});
				}
			});
		}

		if (story.domains && Array.isArray(story.domains)) {
			story.domains.forEach((domain) => {
				textToCheck += `${(domain.name || '').toLowerCase()} `;
			});
		}

		if (story.articles && Array.isArray(story.articles)) {
			story.articles.forEach((article) => {
				textToCheck += `${(article.link || '').toLowerCase()} `;
				textToCheck += `${(article.domain || '').toLowerCase()} `;
			});
		}
	}

	for (const keyword of normalizedKeywords) {
		const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const startsWithWordChar = /^\w/.test(keyword);
		const endsWithWordChar = /\w$/.test(keyword);
		// Dotted tokens such as "u.s." end on a non-word character, so a plain
		// trailing \b would miss "U.S. adults" (period, then space).
		const startBoundary = startsWithWordChar ? '\\b' : '(?:^|(?<=[^\\w]))';
		const endBoundary = endsWithWordChar ? '\\b' : '(?:$|(?=[^\\w]))';
		const regex = new RegExp(`${startBoundary}${escapedKeyword}${endBoundary}`, 'i');
		if (regex.test(textToCheck)) matchedKeywords.push(keyword);
	}

	return {
		shouldFilter: matchedKeywords.length > 0,
		matchedKeywords,
	};
}

function emptyContentFilter(): ContentFilterSettings {
	return { keywords: [], filterMode: 'blur', filterScope: 'all', version: 1 };
}

function isFilterMode(value: unknown): value is FilterMode {
	return value === 'hide' || value === 'blur';
}

function isFilterScope(value: unknown): value is FilterScope {
	return value === 'title' || value === 'summary' || value === 'all';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read `kite-content-filter` when `window` exists.
 * Missing window, a missing key, or unreadable JSON: no keywords and mode `blur`.
 */
export function loadContentFilter(): ContentFilterSettings {
	const fallback = emptyContentFilter();
	if (typeof window === 'undefined') return fallback;
	try {
		const stored = localStorage.getItem(CONTENT_FILTER_STORAGE_KEY);
		if (!stored) return fallback;
		const parsed: unknown = JSON.parse(stored);
		if (!isRecord(parsed)) return fallback;
		const keywords = Array.isArray(parsed.keywords)
			? parsed.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
			: fallback.keywords;
		return {
			keywords,
			filterMode: isFilterMode(parsed.filterMode) ? parsed.filterMode : fallback.filterMode,
			filterScope: isFilterScope(parsed.filterScope) ? parsed.filterScope : fallback.filterScope,
			version: 1,
		};
	} catch {
		return fallback;
	}
}

/** Same order as the URL navigation lookup: cluster id first, then story index. */
export function sharedStoryInList(stories: readonly Story[], ref: SharedStoryRef): boolean {
	const { clusterId, storyIndex } = ref;
	if (clusterId !== null && clusterId !== undefined) {
		return stories.some((story) => story.cluster_number === clusterId);
	}
	if (storyIndex !== null && storyIndex !== undefined) {
		return stories[storyIndex] !== undefined;
	}
	return false;
}

/** Expanded-card full-story status line; only unavailable needs quiet copy (NEWS-101). */
export function fullStoryLine(story: Story): { kind: 'unavailable'; text: string } | null {
	switch (story.informed_full_story_status) {
		case 'unavailable':
			return { kind: 'unavailable', text: BRIEF_FULL_STORY_UNAVAILABLE };
		case 'missing':
		case 'ok':
		case 'error':
		case undefined:
			return null;
		default: {
			const _exhaustive: never = story.informed_full_story_status;
			return _exhaustive;
		}
	}
}

export type BriefRefreshClock = {
	lastSuccess: { completedAt: string } | null;
	nextAt: string | null;
};

export type FullStoryPayload = {
	status: FullStoryStatus;
	changeSummary?: string;
	talking_points?: string[];
	timeline?: TimelineEvent[] | null;
	perspectives?: StoryPerspective[] | null;
	quote?: string | null;
	quote_author?: string | null;
};

/** "just now" / "5 min ago" / "3 h ago" / "2 d ago". */
export function formatTimeAgoShort(iso: string, now: Date): string | null {
	const at = Date.parse(iso);
	if (Number.isNaN(at)) return null;
	const minutes = Math.floor((now.getTime() - at) / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	return `${Math.floor(hours / 24)} d ago`;
}

export function updatedLabel(refresh: BriefRefreshClock | null, now: Date): string {
	const ago = refresh?.lastSuccess?.completedAt
		? formatTimeAgoShort(refresh.lastSuccess.completedAt, now)
		: null;
	return ago ? `Updated ${ago}` : BRIEF_NOT_REFRESHED;
}

export function nextRefreshLabel(nextAt: string | null | undefined, now: Date): string | null {
	if (!nextAt) return null;
	const at = Date.parse(nextAt);
	if (Number.isNaN(at)) return null;
	if (at <= now.getTime()) return 'Next refresh due now';
	const time = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	return `Next refresh ${time}`;
}

/** http(s) article links shown on a card. */
export function articleLinks(story: Story): { href: string; label: string }[] {
	const links: { href: string; label: string }[] = [];
	for (const article of story.articles ?? []) {
		const href = article.link?.trim() ?? '';
		if (!href.startsWith('http://') && !href.startsWith('https://')) continue;
		let host = '';
		try {
			host = new URL(href).host.replace(/^www\./, '');
		} catch {
			host = '';
		}
		const label = article.domain?.trim() || host || href;
		links.push({ href, label });
	}
	return links;
}

export function newlyExpandedKeys(
	prev: Record<string, boolean>,
	next: Record<string, boolean>,
): string[] {
	return Object.keys(next).filter((key) => next[key] && !prev[key]);
}

/** Full stories are on-demand work: only a single newly opened card auto-loads one. */
export function autoFullStoryRequestKeys(newlyExpanded: readonly string[]): readonly string[] {
	return newlyExpanded.length === 1 ? newlyExpanded : [];
}

export function shouldRequestFullStory(story: Story): boolean {
	return story.informed_full_story_status === 'missing' || story.informed_full_story_status === 'error';
}

export function applyFullStory<T extends Story>(story: T, fullStory: FullStoryPayload): T {
	const next: T = { ...story };
	if (fullStory.talking_points !== undefined) next.talking_points = fullStory.talking_points;
	if (fullStory.timeline !== undefined) next.timeline = fullStory.timeline;
	if (fullStory.perspectives !== undefined) next.perspectives = fullStory.perspectives;
	if (fullStory.quote !== undefined) next.quote = fullStory.quote;
	if (fullStory.quote_author !== undefined) next.quote_author = fullStory.quote_author;
	next.informed_full_story_status = fullStory.status;
	if (typeof fullStory.changeSummary === 'string' && fullStory.changeSummary.trim()) {
		next.informed_full_story_updated = fullStory.changeSummary.trim();
	}
	return next;
}

export function fullStoryErrorCopy(status: number, error: string | undefined): string {
	if (status === 429 || error === 'rate_limited') return BRIEF_FULL_STORY_RATE_LIMITED;
	if (error === 'not_in_brief') return BRIEF_FULL_STORY_NOT_IN_BRIEF;
	return BRIEF_FULL_STORY_ERROR;
}

export type SeenBatcher = {
	add(ids: string[]): void;
	flush(): Promise<void>;
};

/** Debounced seen marks. Each id is posted at most once. Failures are dropped. */
export function createSeenBatcher(options: {
	post: (ids: string[]) => Promise<unknown>;
	delayMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (handle: unknown) => void;
}): SeenBatcher {
	const delayMs = options.delayMs ?? BRIEF_SEEN_DEBOUNCE_MS;
	const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer =
		options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
	const sent = new Set<string>();
	let pending: string[] = [];
	let timer: unknown = null;

	async function flush(): Promise<void> {
		if (timer !== null) {
			clearTimer(timer);
			timer = null;
		}
		const ids = pending;
		pending = [];
		if (ids.length === 0) return;
		try {
			await options.post(ids);
		} catch {
			// Seen marks are best-effort.
		}
	}

	return {
		add(ids) {
			for (const id of ids) {
				if (!id || sent.has(id)) continue;
				sent.add(id);
				pending.push(id);
			}
			if (pending.length === 0) return;
			if (timer !== null) clearTimer(timer);
			timer = setTimer(() => {
				timer = null;
				void flush();
			}, delayMs);
		},
		flush,
	};
}
