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
	sources?: { name?: string }[];
};

export type StoryArticle = {
	link?: string;
	domain?: string;
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
	perspectives?: StoryPerspective[] | null;
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
