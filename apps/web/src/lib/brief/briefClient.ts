/**
 * Browser fetches for the shell Brief. Same URLs and seed body as Kite
 * (`briefSeed.ts`); no Kite imports.
 */

import type {
	BriefOverviewSection,
	BriefRefreshClock,
	FullStoryPayload,
	Story,
	TopicBriefLevel,
} from './assemble';
import type { InformedCitationMark } from './citationMarks';

export type BriefStory = Story & {
	suggested_qna?: unknown[];
	informed_publisher_domain?: string | null;
	informed_reason_text?: string | null;
	informed_criteria_ref?: string | null;
	informed_citation_marks?: InformedCitationMark[] | null;
	/** Present (true) only when the server has this story as read and unchanged since. */
	informed_seen?: boolean;
	informed_seen_at?: string;
};

export type TopicOverview = {
	filteredOut: number | null;
	notices: string[];
	sections: BriefOverviewSection[];
	quiet: Array<{ id: string; name: string; level: TopicBriefLevel }>;
	refresh: BriefRefreshClock | null;
};

export type LoadedBrief = {
	categoryName: string;
	stories: BriefStory[];
	/** Null when the overview is missing, not ok, or the empty-store fixture. */
	overview: TopicOverview | null;
};

export type FilteredVerdictItem = {
	articleId: string;
	title: string | null;
	url: string | null;
	publisherDomain: string | null;
	reasonText: string | null;
	criteriaRef: string | null;
};

export type FilteredVerdictResult =
	| { ok: true; items: FilteredVerdictItem[] }
	| { ok: false; unauthenticated: boolean };

export type SeedTopic = { id: string; name: string; level: TopicBriefLevel };

export type SeedTopicsResult =
	| { ok: true; topics: SeedTopic[] }
	| { ok: false; unauthenticated: boolean; error: string };

export type SeedPayload = {
	title: string;
	topicId: string;
	urls: string[];
	note?: string;
};

export type SeedFormResult = { ok: true; payload: SeedPayload } | { ok: false; error: string };

export type SeedPostResult =
	| { ok: true }
	| { ok: false; unauthenticated: boolean; error: string };

export type SummaryPostResult =
	| { ok: true; status: 'ok'; text: string }
	| { ok: true; status: 'unavailable' }
	| { ok: false; unauthenticated: boolean };

export type FullStoryPostResult =
	| { ok: true; fullStory: FullStoryPayload }
	| { ok: false; status: number; error?: string; unauthenticated: boolean };

export const SEED_TITLE_REQUIRED = 'Title is required.';
export const SEED_TOPIC_REQUIRED = 'Choose a topic.';
export const SEED_URL_REQUIRED = 'Add at least one URL.';
export const SEED_ERROR = 'Could not create the story. Check the title and URLs, then try again.';
export const SEED_LOGIN = 'Log in to add stories.';
export const FILTERED_LOGIN = 'Log in on Topics to see filtered stories';
export const REFRESH_LABEL = 'Refresh';
export const REFRESHING_LABEL = 'Refreshing…';
export const REFRESH_LOGIN = 'Log in on Topics to refresh';
export const REFRESH_ERROR = 'Refresh failed. Try again.';

const STORY_COUNT_DEFAULT = 12;

export function readStoryCount(): number {
	if (typeof localStorage === 'undefined') return STORY_COUNT_DEFAULT;
	const raw = localStorage.getItem('storyCount');
	if (!raw) return STORY_COUNT_DEFAULT;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 1) return STORY_COUNT_DEFAULT;
	return Math.floor(parsed);
}

export function readSinglePage(): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem('singlePageMode') === 'sequential';
}

export function storyIndexFromPath(pathname: string): number | null {
	const match = /^\/latest\/[^/]+\/(\d+)$/.exec(pathname);
	if (!match?.[1]) return null;
	const index = Number(match[1]);
	return Number.isInteger(index) ? index : null;
}

/**
 * What to do with one shared href. `replaceState` drops `?shared=1` from the
 * address bar without updating `page.url`, so a missing story must clear the
 * latch in that same turn. Otherwise the next in-app visit of the same href
 * looks already handled.
 */
export type SharedHrefVisit =
	| { action: 'skip' }
	| { action: 'found'; latch: string }
	| { action: 'missing'; latch: '' };

export function sharedHrefVisit(href: string, latch: string, storyFound: boolean): SharedHrefVisit {
	if (latch === href) return { action: 'skip' };
	if (!storyFound) return { action: 'missing', latch: '' };
	return { action: 'found', latch: href };
}

export function filteredOutLinkLabel(filteredOut: number | null): string {
	return filteredOut !== null && filteredOut > 0 ? `${filteredOut} filtered out` : 'Filtered out';
}

/** Same body as Kite `buildSeedPayload`: trimmed title, topic id, URLs, note only when set. */
export function buildSeedPayload(input: {
	title: string;
	topicId: string;
	note: string;
	urlsText: string;
}): SeedFormResult {
	const title = input.title.trim();
	if (!title) return { ok: false, error: SEED_TITLE_REQUIRED };
	const topicId = input.topicId.trim();
	if (!topicId) return { ok: false, error: SEED_TOPIC_REQUIRED };
	const urls = input.urlsText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	if (urls.length === 0) return { ok: false, error: SEED_URL_REQUIRED };
	const note = input.note.trim();
	return { ok: true, payload: { title, topicId, ...(note ? { note } : {}), urls } };
}

export function talkingPoints(story: BriefStory): string[] {
	if (!Array.isArray(story.talking_points)) return [];
	return story.talking_points.filter((point): point is string => typeof point === 'string' && point.length > 0);
}

export function hasAssistedBody(story: BriefStory): boolean {
	return (
		talkingPoints(story).length > 0 ||
		(story.timeline?.length ?? 0) > 0 ||
		(story.suggested_qna?.length ?? 0) > 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLevel(value: unknown): value is TopicBriefLevel {
	return value === 'core' || value === 'watch';
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === 'string');
}

async function getJson(url: string): Promise<unknown> {
	try {
		const response = await fetch(url, { credentials: 'include' });
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

function parseStories(body: unknown): BriefStory[] {
	if (!isRecord(body) || !Array.isArray(body.stories)) return [];
	const stories: BriefStory[] = [];
	for (const item of body.stories) {
		if (!isRecord(item) || typeof item.title !== 'string') continue;
		stories.push(item as BriefStory);
	}
	return stories;
}

function parseRefresh(value: unknown): BriefRefreshClock | null {
	if (!isRecord(value)) return null;
	const lastSuccess = isRecord(value.lastSuccess) ? value.lastSuccess : null;
	const completedAt =
		lastSuccess && typeof lastSuccess.completedAt === 'string' ? lastSuccess.completedAt : null;
	const nextAt = typeof value.nextAt === 'string' ? value.nextAt : null;
	if (!completedAt && !nextAt) return null;
	return { lastSuccess: completedAt ? { completedAt } : null, nextAt };
}

function parseOverview(body: unknown): TopicOverview | null {
	if (!isRecord(body) || body.ok !== true || body.fixture === true) return null;
	if (!Array.isArray(body.sections) || !Array.isArray(body.quiet)) return null;
	const sections: BriefOverviewSection[] = [];
	for (const section of body.sections) {
		if (!isRecord(section) || typeof section.topicId !== 'string' || typeof section.name !== 'string') {
			continue;
		}
		sections.push({
			topicId: section.topicId,
			name: section.name,
			level: isLevel(section.level) ? section.level : 'watch',
			storyIds: stringList(section.storyIds),
			moreIds: stringList(section.moreIds),
		});
	}
	const quiet: TopicOverview['quiet'] = [];
	for (const topic of body.quiet) {
		if (!isRecord(topic) || typeof topic.id !== 'string' || typeof topic.name !== 'string') continue;
		quiet.push({
			id: topic.id,
			name: topic.name,
			level: isLevel(topic.level) ? topic.level : 'watch',
		});
	}
	const filteredOut =
		typeof body.filteredOut === 'number' && Number.isFinite(body.filteredOut) ? body.filteredOut : null;
	return {
		filteredOut,
		notices: stringList(body.notices),
		sections,
		quiet,
		refresh: parseRefresh(body.refresh),
	};
}

function categoryNameFrom(body: unknown): { id: string; name: string } | null {
	if (!isRecord(body) || !Array.isArray(body.categories)) return null;
	const first = body.categories[0];
	if (!isRecord(first) || typeof first.id !== 'string') return null;
	const name = typeof first.categoryName === 'string' && first.categoryName.trim() ? first.categoryName : 'Brief';
	return { id: first.id, name };
}

/** Latest batch, its Brief category, stories (`limit=12`), and overview. */
export async function loadBrief(): Promise<LoadedBrief> {
	const latest = await getJson('/api/batches/latest');
	const batchId = isRecord(latest) && typeof latest.id === 'string' ? latest.id : '';
	const categories = batchId
		? await getJson(`/api/batches/${encodeURIComponent(batchId)}/categories`)
		: null;
	const category = categoryNameFrom(categories);
	const storiesBody = category
		? await getJson(
				`/api/batches/${encodeURIComponent(batchId)}/categories/${encodeURIComponent(category.id)}/stories?limit=12`,
			)
		: null;
	let overview: TopicOverview | null = null;
	try {
		const response = await fetch('/api/brief/overview', {
			credentials: 'include',
			// The provider status line must reflect the server now, never a cached copy.
			cache: 'no-store',
		});
		if (response.ok) overview = parseOverview(await response.json());
	} catch {
		overview = null;
	}
	return {
		categoryName: category?.name ?? 'Brief',
		stories: parseStories(storiesBody),
		overview,
	};
}

export async function postRefresh(): Promise<{ ok: true } | { ok: false; unauthenticated: boolean }> {
	try {
		const response = await fetch('/api/fetch', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		});
		if (response.status === 401) return { ok: false, unauthenticated: true };
		const body = (await response.json().catch(() => null)) as { ok?: unknown } | null;
		if (!response.ok || body?.ok === false) return { ok: false, unauthenticated: false };
		return { ok: true };
	} catch {
		return { ok: false, unauthenticated: false };
	}
}

export async function postSummary(articleId: string): Promise<SummaryPostResult> {
	try {
		const response = await fetch(`/api/brief/stories/${encodeURIComponent(articleId)}/summary`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		});
		if (response.status === 401) return { ok: false, unauthenticated: true };
		const body = (await response.json().catch(() => null)) as {
			ok?: unknown;
			summary?: { status?: unknown; text?: unknown };
		} | null;
		const summary = body?.summary;
		if (response.ok && body?.ok === true && summary?.status === 'ok' && typeof summary.text === 'string') {
			const text = summary.text.trim();
			if (text) return { ok: true, status: 'ok', text };
		}
		if (response.ok && body?.ok === true && summary?.status === 'unavailable') {
			return { ok: true, status: 'unavailable' };
		}
		return { ok: false, unauthenticated: false };
	} catch {
		return { ok: false, unauthenticated: false };
	}
}

export async function postFullStory(articleId: string): Promise<FullStoryPostResult> {
	try {
		const response = await fetch(`/api/brief/stories/${encodeURIComponent(articleId)}/full`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		});
		const body = (await response.json().catch(() => null)) as {
			ok?: unknown;
			error?: unknown;
			fullStory?: FullStoryPayload;
		} | null;
		if (response.status === 401) return { ok: false, status: 401, unauthenticated: true };
		const error = typeof body?.error === 'string' ? body.error : undefined;
		const fullStory = body?.fullStory;
		if (
			response.ok &&
			body?.ok === true &&
			fullStory &&
			(fullStory.status === 'ok' || fullStory.status === 'unavailable' || fullStory.status === 'error')
		) {
			return { ok: true, fullStory };
		}
		return { ok: false, status: response.status, error, unauthenticated: false };
	} catch {
		return { ok: false, status: 0, unauthenticated: false };
	}
}

export async function postBriefSeen(articleIds: string[]): Promise<void> {
	if (articleIds.length === 0) return;
	const response = await fetch('/api/brief/seen', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ articleIds }),
	});
	// Throws on a network error or a non-2xx answer so the caller can say the write failed.
	if (!response.ok) throw new Error(`seen write failed: ${response.status}`);
}

/** Clears one seen mark. Throws on a network error or a non-2xx answer (401 when signed out). */
export async function deleteBriefSeen(articleId: string): Promise<void> {
	const response = await fetch(`/api/brief/seen/${encodeURIComponent(articleId)}`, {
		method: 'DELETE',
		credentials: 'include',
	});
	if (!response.ok) throw new Error(`unseen write failed: ${response.status}`);
}

export async function fetchFilteredVerdicts(): Promise<FilteredVerdictResult> {
	try {
		const response = await fetch('/api/triage/filtered?scope=last', { credentials: 'include' });
		if (response.status === 401) return { ok: false, unauthenticated: true };
		const body = (await response.json().catch(() => null)) as { items?: unknown } | null;
		if (!response.ok || !Array.isArray(body?.items)) return { ok: false, unauthenticated: false };
		const items: FilteredVerdictItem[] = [];
		for (const item of body.items) {
			if (!isRecord(item) || typeof item.articleId !== 'string') continue;
			items.push({
				articleId: item.articleId,
				title: typeof item.title === 'string' ? item.title : null,
				url: typeof item.url === 'string' ? item.url : null,
				publisherDomain: typeof item.publisherDomain === 'string' ? item.publisherDomain : null,
				reasonText: typeof item.reasonText === 'string' ? item.reasonText : null,
				criteriaRef: typeof item.criteriaRef === 'string' ? item.criteriaRef : null,
			});
		}
		return { ok: true, items };
	} catch {
		return { ok: false, unauthenticated: false };
	}
}

function seedTopics(body: unknown): SeedTopic[] {
	if (!isRecord(body) || !Array.isArray(body.topics)) return [];
	const topics: SeedTopic[] = [];
	for (const topic of body.topics) {
		if (!isRecord(topic) || topic.kind !== 'desired') continue;
		if (typeof topic.id !== 'string' || typeof topic.name !== 'string') continue;
		topics.push({
			id: topic.id,
			name: topic.name,
			level: topic.level === 'watch' ? 'watch' : 'core',
		});
	}
	return [
		...topics.filter((topic) => topic.level === 'core'),
		...topics.filter((topic) => topic.level === 'watch'),
	];
}

export async function fetchSeedTopics(): Promise<SeedTopicsResult> {
	try {
		const response = await fetch('/api/topics', { credentials: 'include' });
		if (response.status === 401) return { ok: false, unauthenticated: true, error: SEED_LOGIN };
		const body: unknown = await response.json().catch(() => null);
		if (!response.ok || !isRecord(body) || body.ok !== true) {
			return { ok: false, unauthenticated: false, error: 'Topics could not be loaded.' };
		}
		return { ok: true, topics: seedTopics(body) };
	} catch {
		return { ok: false, unauthenticated: false, error: 'Topics could not be loaded.' };
	}
}

export async function postSeed(payload: SeedPayload): Promise<SeedPostResult> {
	try {
		const response = await fetch('/api/brief/seed', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
		if (response.status === 401) return { ok: false, unauthenticated: true, error: SEED_LOGIN };
		const body = (await response.json().catch(() => null)) as { ok?: unknown; error?: unknown } | null;
		if (!response.ok || !body || body.ok === false) {
			const error =
				(response.status === 400 || response.status === 409) &&
				typeof body?.error === 'string' &&
				body.error.trim()
					? body.error.trim()
					: SEED_ERROR;
			return { ok: false, unauthenticated: false, error };
		}
		return { ok: true };
	} catch {
		return { ok: false, unauthenticated: false, error: SEED_ERROR };
	}
}
