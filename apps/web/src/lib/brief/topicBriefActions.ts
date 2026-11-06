/**
 * Less like this (NEWS-90) and Seed remove (NEWS-98) copy + POST helpers, ported from
 * apps/kite `topicBrief.ts`. Same API shapes; URLs come from `$lib/brief/fixtures`.
 */
import { lessLikeThisUrl, removeSeedUrl, type LessLikeThisBody } from '$lib/brief/fixtures';

export type StoryForLessLikeThis = {
	title: string;
	informed_publisher_domain?: string | null;
};

export const BRIEF_REMOVE_LABEL = 'Remove';
export const BRIEF_REMOVE_PENDING = 'Removing…';
export const BRIEF_REMOVE_ERROR = 'Could not remove this story. Try again.';
export const BRIEF_REMOVE_LOGIN_HINT = 'Log in on Topics to remove stories';
/** Login happens on the Topics page. */
export const BRIEF_SEED_LOGIN_HREF = '/topics';

export const LESS_LIKE_THIS_LABEL = 'Less like this';
export const LESS_LIKE_THIS_SUBJECT_HEADING = 'Not interested in this subject';
export const LESS_LIKE_THIS_OUTLET_HEADING = 'Block this outlet';
export const LESS_LIKE_THIS_NAME_LABEL = 'Undesired topic name';
export const LESS_LIKE_THIS_KEYWORDS_LABEL = 'Keywords (optional, comma separated)';
export const LESS_LIKE_THIS_SUBJECT_SUBMIT = 'Add undesired topic';
export const LESS_LIKE_THIS_CANCEL = 'Cancel';
export const LESS_LIKE_THIS_TOPICS_LINK = 'View Topics';
export const LESS_LIKE_THIS_LOGIN_HINT = 'Log in on Topics to use Less like this';
export const LESS_LIKE_THIS_NO_OUTLET = 'This story has no outlet to block.';
export const LESS_LIKE_THIS_NOT_STORED = 'This story is no longer stored.';
export const LESS_LIKE_THIS_ERROR = 'Could not save. Try again.';
/** Server topic name cap (`TOPIC_NAME_MAX` in mvp/server `topicInput.ts`). */
export const LESS_LIKE_THIS_NAME_MAX = 80;
/** Server topic description cap (`TOPIC_TEXT_MAX` in mvp/server `topicInput.ts`). */
export const LESS_LIKE_THIS_DESCRIPTION_MAX = 500;

export type LessLikeThisRequest = LessLikeThisBody;

/** `status` 0 = request failed. `error` is the raw server text; show it via `lessLikeThisOutcome`. */
export type LessLikeThisResult =
	| { ok: true; created: boolean; topicName: string }
	| { ok: false; status: number; unauthenticated: boolean; error: string };

export type LessLikeThisOutcome =
	| { ok: true; message: string }
	| { ok: false; message: string; link: 'login' | 'topics' | null };

export type RemoveSeedResult = { ok: true } | { ok: false; unauthenticated: boolean; error: string };

/** Server `error` text is user-facing only for 400 (validation) and 409 (conflict). */
function shownServerError(status: number, error: unknown, fallback: string): string {
	if ((status === 400 || status === 409) && typeof error === 'string' && error.trim()) {
		return error.trim();
	}
	return fallback;
}

/** Comma or newline separated, trimmed, case-insensitively de-duplicated. */
export function parseKeywordsInput(text: string): string[] {
	const seen = new Set<string>();
	const keywords: string[] = [];
	for (const part of text.split(/[,\r\n]+/)) {
		const keyword = part.trim();
		if (!keyword) continue;
		const key = keyword.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		keywords.push(keyword);
	}
	return keywords;
}

export function lessLikeThisOutletButton(domain: string): string {
	return `Block ${domain}`;
}

export function lessLikeThisAddedCopy(name: string): string {
	return `Added "${name}" to undesired topics. Matching stories are hidden the next time the Brief loads, and filtered out from the next refresh.`;
}

export function lessLikeThisAlreadyBlockedCopy(domain: string): string {
	return `${domain} is already blocked.`;
}

/** The taken name may belong to a desired topic or a non-blocking one, so this is not a success. */
export function lessLikeThisNameTakenCopy(name: string): string {
	return `A topic named "${name}" already exists, so nothing was saved.`;
}

export function lessLikeThisErrorCopy(status: number, code: string): string {
	if (code === 'no_outlet') return LESS_LIKE_THIS_NO_OUTLET;
	if (code === 'story_not_found') return LESS_LIKE_THIS_NOT_STORED;
	return shownServerError(status, code, LESS_LIKE_THIS_ERROR);
}

export function lessLikeThisOutcome(
	body: LessLikeThisRequest,
	result: LessLikeThisResult,
	domain: string | null,
): LessLikeThisOutcome {
	if (result.ok) {
		const message =
			body.kind === 'outlet' && !result.created && domain
				? lessLikeThisAlreadyBlockedCopy(domain)
				: lessLikeThisAddedCopy(result.topicName);
		return { ok: true, message };
	}
	if (result.unauthenticated) return { ok: false, message: LESS_LIKE_THIS_LOGIN_HINT, link: 'login' };
	const name = body.kind === 'subject' ? body.name : domain;
	if (result.status === 409 && name) {
		return { ok: false, message: lessLikeThisNameTakenCopy(name), link: 'topics' };
	}
	return { ok: false, message: lessLikeThisErrorCopy(result.status, result.error), link: null };
}

/** Story title as an undesired topic name, cut on a word boundary to fit the name cap. */
export function lessLikeThisSubjectDefault(story: Pick<StoryForLessLikeThis, 'title'>): string {
	const title = story.title?.trim() ?? '';
	if (title.length <= LESS_LIKE_THIS_NAME_MAX) return title;
	const space = title.lastIndexOf(' ', LESS_LIKE_THIS_NAME_MAX);
	if (space > 0) return title.slice(0, space).trimEnd();
	return title.slice(0, LESS_LIKE_THIS_NAME_MAX);
}

/** Subject request body; description = title cut to the server cap; blank keywords / description are omitted. */
export function lessLikeThisSubjectRequest(
	name: string,
	keywordsText: string,
	title: string | null | undefined,
): LessLikeThisRequest {
	const keywords = parseKeywordsInput(keywordsText);
	const description = (title?.trim() ?? '').slice(0, LESS_LIKE_THIS_DESCRIPTION_MAX);
	return {
		kind: 'subject',
		name: name.trim(),
		...(keywords.length > 0 ? { keywords } : {}),
		...(description ? { description } : {}),
	};
}

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

export async function postLessLikeThis(
	articleId: string,
	body: LessLikeThisRequest,
	fetchFn: typeof fetch = fetch,
): Promise<LessLikeThisResult> {
	const res = await postJson(fetchFn, lessLikeThisUrl(articleId), body);
	if (!res) return { ok: false, status: 0, unauthenticated: false, error: '' };
	const { status } = res;
	const error = typeof res.body?.error === 'string' ? res.body.error : '';
	if (status === 401) return { ok: false, status, unauthenticated: true, error };
	if (status >= 400 || res.body?.ok !== true) {
		return { ok: false, status, unauthenticated: false, error };
	}
	const topic = res.body.topic as { name?: unknown } | undefined;
	if (typeof res.body.created !== 'boolean' || typeof topic?.name !== 'string') {
		return { ok: false, status, unauthenticated: false, error: '' };
	}
	return { ok: true, created: res.body.created, topicName: topic.name };
}

export async function postRemoveSeed(
	articleId: string,
	fetchFn: typeof fetch = fetch,
): Promise<RemoveSeedResult> {
	const res = await postJson(fetchFn, removeSeedUrl(articleId), {});
	if (res?.status === 401) {
		return { ok: false, unauthenticated: true, error: BRIEF_REMOVE_LOGIN_HINT };
	}
	if (!res || res.status >= 400 || res.body?.ok !== true) {
		return { ok: false, unauthenticated: false, error: BRIEF_REMOVE_ERROR };
	}
	return { ok: true };
}
