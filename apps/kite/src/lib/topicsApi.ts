/** Topics page + mute fetch helpers (NEWS-116); server text only for 400/409. */

import { shownServerError } from '$lib/serverError';
import {
	MUTES_LOAD_ERROR,
	TOPICS_LOAD_ERROR,
	TOPICS_NETWORK_ERROR,
	type MuteRule,
	type Topic,
	type TopicPayload,
} from '$lib/topics';

export type TopicsApiBody = {
	ok?: boolean;
	error?: string;
	topics?: Topic[];
	rules?: MuteRule[];
} | null;

export type TopicsLoadResult =
	| {
			ok: true;
			topics: Topic[];
			muteRules: MuteRule[];
			loadError: string | null;
			muteLoadError: string | null;
	  }
	| { ok: false; unauthenticated: true }
	| {
			ok: false;
			unauthenticated: false;
			networkError: true;
			loadError: string;
	  };

export type TopicsMutationResult =
	| { ok: true; body: TopicsApiBody }
	| { ok: false; unauthenticated: true; error: null }
	| { ok: false; unauthenticated: false; error: string };

async function readBody(response: Response): Promise<TopicsApiBody> {
	return (await response.json().catch(() => null)) as TopicsApiBody;
}

/** Session `GET /api/topics` + `GET /api/brief/mutes` for the Topics page. */
export async function fetchTopicsPage(fetchFn: typeof fetch = fetch): Promise<TopicsLoadResult> {
	try {
		const [topicsResponse, mutesResponse] = await Promise.all([
			fetchFn('/api/topics', { credentials: 'include' }),
			fetchFn('/api/brief/mutes', { credentials: 'include' }),
		]);

		if (topicsResponse.status === 401 || mutesResponse.status === 401) {
			return { ok: false, unauthenticated: true };
		}

		const topicsBody = await readBody(topicsResponse);
		const mutesBody = await readBody(mutesResponse);

		let topics: Topic[] = [];
		let loadError: string | null = null;
		if (topicsResponse.ok && topicsBody?.ok && Array.isArray(topicsBody.topics)) {
			topics = topicsBody.topics;
		} else {
			loadError = shownServerError(topicsResponse.status, topicsBody?.error, TOPICS_LOAD_ERROR);
		}

		let muteRules: MuteRule[] = [];
		let muteLoadError: string | null = null;
		if (mutesResponse.ok && mutesBody?.ok && Array.isArray(mutesBody.rules)) {
			muteRules = mutesBody.rules;
		} else {
			muteLoadError = shownServerError(mutesResponse.status, mutesBody?.error, MUTES_LOAD_ERROR);
		}

		return { ok: true, topics, muteRules, loadError, muteLoadError };
	} catch {
		return {
			ok: false,
			unauthenticated: false,
			networkError: true,
			loadError: TOPICS_NETWORK_ERROR,
		};
	}
}

/** Session mutate for topics / mutes (POST / PATCH / DELETE). */
export async function mutateTopicsApi(
	path: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	fallbackError: string,
	payload?: unknown,
	fetchFn: typeof fetch = fetch,
): Promise<TopicsMutationResult> {
	try {
		const response = await fetchFn(path, {
			method,
			credentials: 'include',
			...(payload === undefined
				? {}
				: { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
		});

		if (response.status === 401) {
			return { ok: false, unauthenticated: true, error: null };
		}

		const body = await readBody(response);
		if (!response.ok || !body || body.ok === false) {
			return {
				ok: false,
				unauthenticated: false,
				error: shownServerError(response.status, body?.error, fallbackError),
			};
		}
		return { ok: true, body };
	} catch {
		return { ok: false, unauthenticated: false, error: TOPICS_NETWORK_ERROR };
	}
}

/** Convenience typed payload for topic create/update. */
export type { TopicPayload };
