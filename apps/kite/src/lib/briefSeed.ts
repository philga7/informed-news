/** Copy + helpers for operator-seeded topic Brief stories (NEWS-66, NEWS-98). */

import { TOPICS_LOAD_ERROR, TOPICS_NETWORK_ERROR, type Topic, type TopicLevel } from '$lib/topics';

export const BRIEF_SEED_ADD_LABEL = 'Add story';

export const BRIEF_SEED_MODAL_TITLE = 'Add story to Brief';

export const BRIEF_SEED_TITLE_LABEL = 'Title';

export const BRIEF_SEED_TOPIC_LABEL = 'Topic';

export const BRIEF_SEED_TOPIC_PLACEHOLDER = 'Choose a topic';

export const BRIEF_SEED_NOTE_LABEL = 'Note (optional)';

export const BRIEF_SEED_URLS_LABEL = 'URLs (one per line, at least one)';

export const BRIEF_SEED_SUBMIT_LABEL = 'Add to Brief';

export const BRIEF_SEED_PENDING_LABEL = 'Saving…';

export const BRIEF_SEED_NO_TOPICS = 'Add a desired topic first.';

export const BRIEF_SEED_NO_TOPICS_LINK_LABEL = 'Go to Topics';

export const BRIEF_SEED_TITLE_REQUIRED = 'Title is required.';

export const BRIEF_SEED_TOPIC_REQUIRED = 'Choose a topic.';

export const BRIEF_SEED_URL_REQUIRED = 'Add at least one URL.';

export const BRIEF_SEED_ERROR_GENERIC =
	'Could not create the story. Check the title and URLs, then try again.';

export const BRIEF_SEED_NETWORK_ERROR =
	'Network error while creating the story. Check that the server is running.';

export const BRIEF_SEED_LOGIN_HINT = 'Log in to add stories.';

export const BRIEF_SEED_LOGIN_LINK_LABEL = 'Log in on Topics';

export const BRIEF_SEED_LOGIN_HREF = '/topics';

export type BriefSeedPayload = {
	title: string;
	topicId: string;
	note?: string;
	urls: string[];
};

export type BriefSeedResult =
	| { ok: true; clusterId: string }
	| { ok: false; status: number; error: string; unauthenticated?: boolean };

export type SeedTopicOption = { id: string; name: string; level: TopicLevel };

export type SeedTopicsResult =
	| { ok: true; topics: Topic[] }
	| { ok: false; unauthenticated: boolean; error: string };

export type SeedFormInput = {
	title: string;
	topicId: string;
	note: string;
	urlsText: string;
};

export type SeedFormResult = { ok: true; payload: BriefSeedPayload } | { ok: false; error: string };

/** Split a textarea into http(s) URL strings (blank lines ignored). */
export function parseUrlsFromTextarea(raw: string): string[] {
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/** Desired topics a seed can go under: Core (no level counts as Core) first, then Watch. */
export function seedTopicOptions(topics: readonly Topic[]): SeedTopicOption[] {
	const options = topics
		.filter((topic) => topic.kind === 'desired')
		.map((topic) => ({ id: topic.id, name: topic.name, level: topic.level ?? 'core' }));
	return [
		...options.filter((option) => option.level === 'core'),
		...options.filter((option) => option.level === 'watch'),
	];
}

/** Client-side checks before posting; the server re-validates everything. */
export function buildSeedPayload(input: SeedFormInput): SeedFormResult {
	const title = input.title.trim();
	if (!title) return { ok: false, error: BRIEF_SEED_TITLE_REQUIRED };
	const topicId = input.topicId.trim();
	if (!topicId) return { ok: false, error: BRIEF_SEED_TOPIC_REQUIRED };
	const urls = parseUrlsFromTextarea(input.urlsText);
	if (urls.length === 0) return { ok: false, error: BRIEF_SEED_URL_REQUIRED };
	const note = input.note.trim();
	return { ok: true, payload: { title, topicId, ...(note ? { note } : {}), urls } };
}

export async function fetchSeedTopics(fetchFn: typeof fetch = fetch): Promise<SeedTopicsResult> {
	try {
		const response = await fetchFn('/api/topics', { credentials: 'include' });
		if (response.status === 401) {
			return { ok: false, unauthenticated: true, error: BRIEF_SEED_LOGIN_HINT };
		}
		const body = (await response.json().catch(() => null)) as
			| { ok?: boolean; topics?: unknown }
			| null;
		if (!response.ok || body?.ok !== true || !Array.isArray(body.topics)) {
			return { ok: false, unauthenticated: false, error: TOPICS_LOAD_ERROR };
		}
		return { ok: true, topics: body.topics as Topic[] };
	} catch {
		return { ok: false, unauthenticated: false, error: TOPICS_NETWORK_ERROR };
	}
}

export async function postBriefSeed(
	payload: BriefSeedPayload,
	fetchFn: typeof fetch = fetch,
): Promise<BriefSeedResult> {
	try {
		const response = await fetchFn('/api/brief/seed', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(payload),
		});

		const body = (await response.json().catch(() => null)) as
			| { ok?: boolean; clusterId?: string; error?: string }
			| null;

		if (response.status === 401) {
			return {
				ok: false,
				status: 401,
				error: BRIEF_SEED_LOGIN_HINT,
				unauthenticated: true,
			};
		}

		if (!response.ok || !body || body.ok === false) {
			return {
				ok: false,
				status: response.status,
				error: (body && body.error) || BRIEF_SEED_ERROR_GENERIC,
			};
		}

		return { ok: true, clusterId: body.clusterId ?? '' };
	} catch {
		return { ok: false, status: 0, error: BRIEF_SEED_NETWORK_ERROR };
	}
}
