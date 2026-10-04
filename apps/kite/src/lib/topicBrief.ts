/** Topic-driven Brief (NEWS-88): overview, seen marks, on-demand summaries, manual refresh. */

import type { Story } from '$lib/types';

/** The owned Brief category slug served by mvp/server (named "Brief"). */
export const TOPIC_BRIEF_CATEGORY_ID = 'world';

export const BRIEF_LEVEL_LABEL: Record<TopicBriefLevel, string> = {
	core: 'Core',
	watch: 'Watch',
};

export const BRIEF_LESS_LABEL = 'Show fewer';

export const BRIEF_QUIET_PREFIX = 'Nothing new:';

export const BRIEF_OTHER_SECTION_NAME = 'Other stories';

export const BRIEF_OFFICIAL_LABEL = 'Official statement';

export const BRIEF_AI_SUMMARY_NOTE = 'AI summary — not ground truth';

export const BRIEF_SUMMARY_UNAVAILABLE = 'Full text unavailable';

export const BRIEF_SUMMARY_MISSING = 'Summary loads when you open this story';

export const BRIEF_SUMMARY_LOADING = 'Loading summary…';

export const BRIEF_SUMMARY_LOGIN_HINT = 'Log in on Topics to load summaries';

export const BRIEF_SUMMARY_ERROR = 'Summary could not be loaded right now.';

export const BRIEF_SUMMARY_RATE_LIMITED = 'Summary limit reached for this hour. Try again later.';

export const BRIEF_SUMMARY_NOT_IN_BRIEF = 'This story is no longer in the Brief.';

export const BRIEF_FULL_STORY_LOADING = 'Loading full story…';

export const BRIEF_FULL_STORY_LOGIN_HINT = 'Log in on Topics to load full stories';

export const BRIEF_FULL_STORY_ERROR = 'Full story could not be loaded right now.';

export const BRIEF_FULL_STORY_RATE_LIMITED = 'Full story limit reached for this hour. Try again later.';

export const BRIEF_FULL_STORY_NOT_IN_BRIEF = 'This story is no longer in the Brief.';

export const BRIEF_REFRESH_LABEL = 'Refresh';

export const BRIEF_REFRESHING_LABEL = 'Refreshing…';

export const BRIEF_REFRESH_LOGIN_HINT = 'Log in on Topics to refresh';

export const BRIEF_REFRESH_ERROR = 'Refresh failed. Try again.';

export const BRIEF_NOT_REFRESHED = 'Not refreshed yet';

export const BRIEF_SEEN_DEBOUNCE_MS = 1000;

export const BRIEF_REFRESH_POLL_MS = 10_000;

/** Server cap per `POST /api/brief/seen` call. */
export const BRIEF_SEEN_MAX_IDS = 100;

export type TopicBriefLevel = 'core' | 'watch';

export type BriefRefreshRun = {
	trigger: 'manual' | 'timer' | 'startup';
	startedAt: string;
	completedAt: string;
	ok: boolean;
	error: string | null;
};

export type BriefOverviewRefresh = {
	last: BriefRefreshRun | null;
	lastSuccess: BriefRefreshRun | null;
	nextAt: string | null;
	intervalHours: number | null;
	running: boolean;
};

export type BriefOverviewSection = {
	topicId: string;
	name: string;
	level: TopicBriefLevel;
	storyIds: string[];
	moreIds: string[];
};

export type BriefTopicRef = { id: string; name: string; level: TopicBriefLevel };

export type BriefOverview = {
	ok: true;
	fixture: boolean;
	refresh: BriefOverviewRefresh;
	notices: string[];
	sections: BriefOverviewSection[];
	quiet: BriefTopicRef[];
	/** Stories the last triage run dropped; null when no run (or it was skipped). */
	filteredOut: number | null;
};

export type TopicBriefSection = {
	topicId: string;
	name: string;
	level: TopicBriefLevel;
	top: Story[];
	more: Story[];
};

export type SummaryStatus = NonNullable<Story['informed_summary_status']>;

export type SummaryLine =
	| { kind: 'ok'; text: string; note: string }
	| { kind: 'unavailable'; text: string }
	| { kind: 'missing'; text: string };

/** Kite's story key (matches StoryList / useStoryToggle). */
export function storyKey(story: Story): string {
	return story.id || story.cluster_number?.toString() || story.title;
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
		default:
			return null;
	}
}

export function moreLabel(count: number): string {
	return `More (${count})`;
}

export function quietLine(quiet: BriefTopicRef[]): string | null {
	if (quiet.length === 0) return null;
	return `${BRIEF_QUIET_PREFIX} ${quiet.map((t) => t.name).join(', ')}`;
}

/**
 * Stories grouped by overview section order. Stories the overview does not
 * reference (e.g. a reload raced the overview fetch) are kept: they join their
 * topic's section, or a trailing section per topic, so nothing disappears.
 */
export function groupTopicBrief(
	overview: Pick<BriefOverview, 'sections'>,
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

/** Ids that became read between two read-state snapshots, limited to `candidates`. */
export function newlyReadIds(
	before: Record<string, boolean>,
	after: Record<string, boolean>,
	candidates: ReadonlySet<string>,
): string[] {
	return Object.keys(after).filter((id) => after[id] && !before[id] && candidates.has(id));
}

/** Keys expanded in `next` but not in `prev`. */
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

/**
 * Whether a summary attempt uses up the once-per-page-load guard. Login (401),
 * rate limit (429) and network failures (status 0) stay retryable.
 */
export function summaryAttemptCounts(result: StorySummaryResult): boolean {
	if (result.ok) return true;
	return result.status !== 0 && result.status !== 401 && result.status !== 429;
}

/** Refresh POST failures that may hide a still-running refresh (proxy timeout, 5xx, network). */
export function isRecoverableRefreshFailure(result: BriefPostResult): boolean {
	return !result.ok && !result.unauthenticated && (result.status === 0 || result.status >= 500);
}

export function lastSuccessAt(refresh: BriefOverviewRefresh | null | undefined): string | null {
	return refresh?.lastSuccess?.completedAt ?? null;
}

export type RefreshPollOutcome =
	| { kind: 'running' }
	| { kind: 'done'; reload: boolean; error: string | null };

/** Next step while polling the overview after (or during) a refresh. */
export function refreshPollOutcome(
	baselineLastSuccessAt: string | null,
	refresh: BriefOverviewRefresh,
): RefreshPollOutcome {
	if (refresh.running) return { kind: 'running' };
	const current = lastSuccessAt(refresh);
	const reload = current !== null && current !== baselineLastSuccessAt;
	const last = refresh.last;
	const error =
		last && last.ok === false
			? last.error
				? `Refresh failed: ${last.error}`
				: BRIEF_REFRESH_ERROR
			: null;
	return { kind: 'done', reload, error };
}

/** Consecutive failed overview polls tolerated while a refresh runs; one more stops polling. */
export const BRIEF_REFRESH_POLL_FAILURES_TOLERATED = 2;

/** After a failed (null) overview poll: the new consecutive-failure count and whether to stop. */
export function overviewPollFailure(consecutiveFailures: number): {
	failures: number;
	stop: boolean;
} {
	const failures = consecutiveFailures + 1;
	return { failures, stop: failures > BRIEF_REFRESH_POLL_FAILURES_TOLERATED };
}

/** "just now" / "5 min ago" / "3 h ago" / "2 d ago"; null for an unparsable time. */
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

export function updatedLabel(refresh: BriefOverviewRefresh | null, now: Date): string {
	const completedAt = refresh?.lastSuccess?.completedAt;
	const ago = completedAt ? formatTimeAgoShort(completedAt, now) : null;
	return ago ? `Updated ${ago}` : BRIEF_NOT_REFRESHED;
}

export function nextRefreshLabel(
	nextAt: string | null | undefined,
	now: Date,
	formatTime: (date: Date) => string = (date) =>
		date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
): string | null {
	if (!nextAt) return null;
	const at = Date.parse(nextAt);
	if (Number.isNaN(at)) return null;
	if (at <= now.getTime()) return 'Next refresh due now';
	return `Next refresh ${formatTime(new Date(at))}`;
}

export function summaryErrorCopy(code: string | undefined): string {
	if (code === 'rate_limited') return BRIEF_SUMMARY_RATE_LIMITED;
	if (code === 'not_in_brief') return BRIEF_SUMMARY_NOT_IN_BRIEF;
	return BRIEF_SUMMARY_ERROR;
}

function isOverview(body: unknown): body is BriefOverview {
	if (!body || typeof body !== 'object') return false;
	const b = body as Partial<BriefOverview>;
	return (
		b.ok === true &&
		typeof b.fixture === 'boolean' &&
		Array.isArray(b.sections) &&
		Array.isArray(b.quiet) &&
		Array.isArray(b.notices) &&
		!!b.refresh &&
		typeof b.refresh === 'object'
	);
}

/** Public overview; null on any failure (callers fall back to the plain list). */
export async function fetchBriefOverview(
	fetchFn: typeof fetch = fetch,
): Promise<BriefOverview | null> {
	try {
		const response = await fetchFn('/api/brief/overview', { credentials: 'include' });
		if (!response.ok) return null;
		const body: unknown = await response.json().catch(() => null);
		return isOverview(body) ? body : null;
	} catch {
		return null;
	}
}

export type BriefPostResult =
	| { ok: true }
	| { ok: false; status: number; error?: string; unauthenticated?: boolean };

async function postJson(
	fetchFn: typeof fetch,
	url: string,
	payload: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
	try {
		const response = await fetchFn(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(payload),
		});
		const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
		return { status: response.status, body };
	} catch {
		return null;
	}
}

export async function postBriefSeen(
	articleIds: string[],
	fetchFn: typeof fetch = fetch,
): Promise<BriefPostResult> {
	const res = await postJson(fetchFn, '/api/brief/seen', { articleIds });
	if (!res) return { ok: false, status: 0 };
	if (res.status === 401) return { ok: false, status: 401, unauthenticated: true };
	if (res.status >= 400 || res.body?.ok !== true) return { ok: false, status: res.status };
	return { ok: true };
}

export type StorySummaryResult =
	| { ok: true; status: 'ok'; text: string }
	| { ok: true; status: 'unavailable' }
	| { ok: false; status: number; error?: string; unauthenticated?: boolean };

export type FullStoryStatus = 'ok' | 'unavailable' | 'error';

export type FullStoryPayload = Partial<
	Pick<
		Story,
		| 'talking_points'
		| 'timeline'
		| 'suggested_qna'
		| 'business_angle_text'
		| 'business_angle_points'
		| 'technical_details'
		| 'user_action_items'
		| 'historical_background'
		| 'perspectives'
		| 'quote'
		| 'quote_author'
		| 'quote_attribution'
		| 'quote_source_url'
		| 'quote_source_domain'
	>
> & {
	status: FullStoryStatus;
	changeSummary?: string;
};

export type StoryFullStoryResult =
	| { ok: true; fullStory: FullStoryPayload }
	| { ok: false; status: number; error?: string; unauthenticated?: boolean };

/** A Brief full story should be requested when no usable cached content exists. */
export function shouldRequestFullStory(story: Story): boolean {
	return (
		story.informed_full_story_status === 'missing' || story.informed_full_story_status === 'error'
	);
}

/** Mutates the existing Brief story so its mounted StorySectionManager sees the new sections. */
export function applyFullStory(story: Story, fullStory: FullStoryPayload): void {
	const fields: Array<keyof Omit<FullStoryPayload, 'status' | 'changeSummary'>> = [
		'talking_points',
		'timeline',
		'suggested_qna',
		'business_angle_text',
		'business_angle_points',
		'technical_details',
		'user_action_items',
		'historical_background',
		'perspectives',
		'quote',
		'quote_author',
		'quote_attribution',
		'quote_source_url',
		'quote_source_domain',
	];
	for (const field of fields) {
		const value = fullStory[field];
		if (value !== undefined) Object.assign(story, { [field]: value });
	}
	story.informed_full_story_status = fullStory.status;
	if (typeof fullStory.changeSummary === 'string' && fullStory.changeSummary.trim()) {
		story.informed_full_story_updated = fullStory.changeSummary.trim();
	}
}

export function fullStoryErrorCopy(code: string | undefined): string {
	if (code === 'rate_limited') return BRIEF_FULL_STORY_RATE_LIMITED;
	if (code === 'not_in_brief') return BRIEF_FULL_STORY_NOT_IN_BRIEF;
	return BRIEF_FULL_STORY_ERROR;
}

export async function postStorySummary(
	articleId: string,
	fetchFn: typeof fetch = fetch,
): Promise<StorySummaryResult> {
	const res = await postJson(
		fetchFn,
		`/api/brief/stories/${encodeURIComponent(articleId)}/summary`,
		{},
	);
	if (!res) return { ok: false, status: 0 };
	if (res.status === 401) return { ok: false, status: 401, unauthenticated: true };
	const error = typeof res.body?.error === 'string' ? res.body.error : undefined;
	if (res.status >= 400 || res.body?.ok !== true) return { ok: false, status: res.status, error };
	const summary = res.body.summary as { status?: unknown; text?: unknown } | undefined;
	if (summary?.status === 'ok' && typeof summary.text === 'string' && summary.text.trim()) {
		return { ok: true, status: 'ok', text: summary.text.trim() };
	}
	if (summary?.status === 'unavailable') return { ok: true, status: 'unavailable' };
	return { ok: false, status: res.status };
}

function isFullStoryStatus(status: unknown): status is FullStoryStatus {
	return status === 'ok' || status === 'unavailable' || status === 'error';
}

export async function postFullStory(
	articleId: string,
	fetchFn: typeof fetch = fetch,
): Promise<StoryFullStoryResult> {
	const res = await postJson(
		fetchFn,
		`/api/brief/stories/${encodeURIComponent(articleId)}/full`,
		{},
	);
	if (!res) return { ok: false, status: 0 };
	if (res.status === 401) return { ok: false, status: 401, unauthenticated: true };
	const error = typeof res.body?.error === 'string' ? res.body.error : undefined;
	if (res.status >= 400 || res.body?.ok !== true) return { ok: false, status: res.status, error };
	const fullStory = res.body.fullStory;
	if (
		!fullStory ||
		typeof fullStory !== 'object' ||
		!isFullStoryStatus((fullStory as { status?: unknown }).status)
	) {
		return { ok: false, status: res.status };
	}
	return { ok: true, fullStory: fullStory as FullStoryPayload };
}

/** Manual refresh (session); may take minutes. */
export async function postBriefRefresh(fetchFn: typeof fetch = fetch): Promise<BriefPostResult> {
	const res = await postJson(fetchFn, '/api/fetch', {});
	if (!res) return { ok: false, status: 0 };
	if (res.status === 401) return { ok: false, status: 401, unauthenticated: true };
	if (res.status >= 400 || res.body?.ok !== true) {
		const error = typeof res.body?.error === 'string' ? res.body.error : undefined;
		return { ok: false, status: res.status, error };
	}
	return { ok: true };
}

export type SeenBatcher = {
	add(ids: string[]): void;
	flush(): Promise<void>;
};

/**
 * Debounced, batched seen marks. Each id is posted at most once per batcher;
 * failures (including 401) are dropped silently.
 */
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
		for (let i = 0; i < ids.length; i += BRIEF_SEEN_MAX_IDS) {
			try {
				await options.post(ids.slice(i, i + BRIEF_SEEN_MAX_IDS));
			} catch {
				// Seen marks are best-effort.
			}
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
