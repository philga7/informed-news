import { describe, expect, it, vi } from 'vitest';
import type { Story } from '$lib/types';
import {
	BRIEF_ADDED_BY_YOU_LABEL,
	BRIEF_AI_SUMMARY_NOTE,
	BRIEF_REMOVE_ERROR,
	BRIEF_REMOVE_LABEL,
	BRIEF_REMOVE_LOGIN_HINT,
	BRIEF_REMOVE_PENDING,
	BRIEF_STORIES_SECTION_TITLE,
	BRIEF_FULL_STORY_ERROR,
	BRIEF_FULL_STORY_NOT_IN_BRIEF,
	BRIEF_FULL_STORY_RATE_LIMITED,
	BRIEF_NOT_REFRESHED,
	BRIEF_REFRESH_ERROR,
	BRIEF_REFRESH_POLL_FAILURES_TOLERATED,
	BRIEF_OTHER_SECTION_NAME,
	BRIEF_SEEN_MAX_IDS,
	BRIEF_SUMMARY_ERROR,
	BRIEF_SUMMARY_MISSING,
	BRIEF_SUMMARY_NOT_IN_BRIEF,
	BRIEF_SUMMARY_RATE_LIMITED,
	BRIEF_SUMMARY_UNAVAILABLE,
	LESS_LIKE_THIS_DESCRIPTION_MAX,
	LESS_LIKE_THIS_ERROR,
	LESS_LIKE_THIS_NAME_MAX,
	LESS_LIKE_THIS_NO_OUTLET,
	LESS_LIKE_THIS_NOT_STORED,
	applyFullStory,
	autoFullStoryRequestKeys,
	createSeenBatcher,
	fetchBriefOverview,
	formatTimeAgoShort,
	fullStoryErrorCopy,
	groupTopicBrief,
	isManualSeedStory,
	isOfficialStory,
	isRecoverableRefreshFailure,
	lastSuccessAt,
	lessLikeThisAddedCopy,
	lessLikeThisErrorCopy,
	lessLikeThisSubjectDefault,
	lessLikeThisSubjectRequest,
	moreLabel,
	newlyExpandedKeys,
	newlyReadIds,
	nextRefreshLabel,
	outletBadge,
	overviewPollFailure,
	postBriefRefresh,
	postBriefSeen,
	postFullStory,
	postLessLikeThis,
	postRemoveSeed,
	postStorySummary,
	quietLine,
	refreshPollOutcome,
	summaryAttemptCounts,
	summaryErrorCopy,
	summaryLine,
	shouldRequestFullStory,
	updatedLabel,
	type BriefOverview,
	type BriefOverviewRefresh,
} from '$lib/topicBrief';

function makeStory(id: string, overrides: Partial<Story> = {}): Story {
	return {
		id,
		membership_key: id,
		cluster_number: 1,
		category: 'world',
		title: `Story ${id}`,
		short_summary: '',
		articles: [],
		informed_article_id: id,
		informed_topic_id: 'core-1',
		informed_topic_name: 'Core one',
		informed_more: false,
		informed_outlet_count: 1,
		informed_labels: [],
		informed_summary_status: 'missing',
		...overrides,
	};
}

function makeRefresh(overrides: Partial<BriefOverviewRefresh> = {}): BriefOverviewRefresh {
	return {
		last: null,
		lastSuccess: null,
		nextAt: null,
		intervalHours: 3,
		running: false,
		...overrides,
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('groupTopicBrief', () => {
	const overview: Pick<BriefOverview, 'sections'> = {
		sections: [
			{ topicId: 'core-1', name: 'Core one', level: 'core', storyIds: ['a', 'b'], moreIds: ['c'] },
			{ topicId: 'watch-1', name: 'Watch one', level: 'watch', storyIds: ['d'], moreIds: [] },
		],
	};

	it('follows overview section order and the top / More split', () => {
		const stories = ['d', 'c', 'b', 'a'].map((id) =>
			makeStory(id, id === 'd' ? { informed_topic_id: 'watch-1' } : {}),
		);
		const sections = groupTopicBrief(overview, stories);
		expect(sections.map((s) => s.topicId)).toEqual(['core-1', 'watch-1']);
		expect(sections[0].top.map((s) => s.id)).toEqual(['a', 'b']);
		expect(sections[0].more.map((s) => s.id)).toEqual(['c']);
		expect(sections[1].top.map((s) => s.id)).toEqual(['d']);
		expect(sections[1].level).toBe('watch');
	});

	it('returns the same story objects (in-place patches stay visible)', () => {
		const a = makeStory('a');
		const [section] = groupTopicBrief(overview, [a]);
		expect(section.top[0]).toBe(a);
	});

	it('drops ids missing from stories and sections left empty', () => {
		const sections = groupTopicBrief(overview, [makeStory('b')]);
		expect(sections).toHaveLength(1);
		expect(sections[0].top.map((s) => s.id)).toEqual(['b']);
		expect(sections[0].more).toEqual([]);
	});

	it('places a story only once even if listed twice', () => {
		const sections = groupTopicBrief(
			{ sections: [{ ...overview.sections[0], storyIds: ['a'], moreIds: ['a'] }] },
			[makeStory('a')],
		);
		expect(sections[0].top).toHaveLength(1);
		expect(sections[0].more).toHaveLength(0);
	});

	it('keeps stories the overview does not reference', () => {
		const stories = [
			makeStory('a'),
			makeStory('x', { informed_more: true }),
			makeStory('y', { informed_topic_id: 'new-topic', informed_topic_name: 'New topic' }),
			makeStory('z', { informed_topic_id: undefined, informed_topic_name: undefined }),
		];
		const sections = groupTopicBrief(overview, stories);
		expect(sections[0].more.map((s) => s.id)).toEqual(['x']);
		expect(sections.slice(1).map((s) => [s.name, s.top.map((t) => t.id)])).toEqual([
			['New topic', ['y']],
			[BRIEF_OTHER_SECTION_NAME, ['z']],
		]);
	});
});

describe('card copy helpers', () => {
	it('outletBadge counts other outlets', () => {
		expect(outletBadge(undefined)).toBeNull();
		expect(outletBadge(0)).toBeNull();
		expect(outletBadge(1)).toBeNull();
		expect(outletBadge(2)).toBe('+1 outlet');
		expect(outletBadge(5)).toBe('+4 outlets');
		expect(outletBadge(Number.NaN)).toBeNull();
	});

	it('isOfficialStory reads the official label', () => {
		expect(isOfficialStory(makeStory('a', { informed_labels: ['official'] }))).toBe(true);
		expect(isOfficialStory(makeStory('a'))).toBe(false);
		expect(isOfficialStory(makeStory('a', { informed_labels: undefined }))).toBe(false);
	});

	it('summaryLine maps each summary status', () => {
		expect(
			summaryLine(makeStory('a', { informed_summary_status: 'ok', short_summary: ' Text. ' })),
		).toEqual({ kind: 'ok', text: 'Text.', note: BRIEF_AI_SUMMARY_NOTE });
		expect(summaryLine(makeStory('a', { informed_summary_status: 'unavailable' }))).toEqual({
			kind: 'unavailable',
			text: BRIEF_SUMMARY_UNAVAILABLE,
		});
		expect(summaryLine(makeStory('a', { informed_summary_status: 'missing' }))).toEqual({
			kind: 'missing',
			text: BRIEF_SUMMARY_MISSING,
		});
	});

	it('summaryLine never shows a summary without text', () => {
		expect(
			summaryLine(makeStory('a', { informed_summary_status: 'ok', short_summary: '  ' })),
		).toBeNull();
		expect(summaryLine(makeStory('a', { informed_summary_status: undefined }))).toBeNull();
	});

	it('moreLabel and quietLine', () => {
		expect(moreLabel(4)).toBe('More (4)');
		expect(quietLine([])).toBeNull();
		expect(
			quietLine([
				{ id: '1', name: 'A', level: 'core' },
				{ id: '2', name: 'B', level: 'watch' },
			]),
		).toBe('Nothing new: A, B');
	});

	it('summaryErrorCopy maps server codes', () => {
		expect(summaryErrorCopy('rate_limited')).toBe(BRIEF_SUMMARY_RATE_LIMITED);
		expect(summaryErrorCopy('not_in_brief')).toBe(BRIEF_SUMMARY_NOT_IN_BRIEF);
		expect(summaryErrorCopy('error')).toBe(BRIEF_SUMMARY_ERROR);
		expect(summaryErrorCopy(undefined)).toBe(BRIEF_SUMMARY_ERROR);
	});
});

describe('newlyReadIds', () => {
	const candidates = new Set(['a', 'b', 'c']);

	it('returns ids that became read and are topic Brief stories', () => {
		expect(newlyReadIds({ a: true }, { a: true, b: true, z: true }, candidates)).toEqual(['b']);
	});

	it('ignores unread toggles and false entries', () => {
		expect(newlyReadIds({ a: true }, {}, candidates)).toEqual([]);
		expect(newlyReadIds({}, { c: false }, candidates)).toEqual([]);
	});
});

describe('refresh labels', () => {
	const now = new Date('2026-09-30T12:00:00.000Z');

	it('formatTimeAgoShort', () => {
		expect(formatTimeAgoShort('2026-09-30T11:59:40.000Z', now)).toBe('just now');
		expect(formatTimeAgoShort('2026-09-30T11:45:00.000Z', now)).toBe('15 min ago');
		expect(formatTimeAgoShort('2026-09-30T09:00:00.000Z', now)).toBe('3 h ago');
		expect(formatTimeAgoShort('2026-09-28T12:00:00.000Z', now)).toBe('2 d ago');
		expect(formatTimeAgoShort('nope', now)).toBeNull();
	});

	it('updatedLabel uses lastSuccess.completedAt', () => {
		expect(updatedLabel(makeRefresh(), now)).toBe(BRIEF_NOT_REFRESHED);
		expect(updatedLabel(null, now)).toBe(BRIEF_NOT_REFRESHED);
		expect(
			updatedLabel(
				makeRefresh({
					lastSuccess: {
						trigger: 'timer',
						startedAt: '2026-09-30T10:58:00.000Z',
						completedAt: '2026-09-30T11:00:00.000Z',
						ok: true,
						error: null,
					},
				}),
				now,
			),
		).toBe('Updated 1 h ago');
	});

	it('nextRefreshLabel', () => {
		const fmt = (d: Date) => d.toISOString();
		expect(nextRefreshLabel(null, now, fmt)).toBeNull();
		expect(nextRefreshLabel('bad', now, fmt)).toBeNull();
		expect(nextRefreshLabel('2026-09-30T11:00:00.000Z', now, fmt)).toBe('Next refresh due now');
		expect(nextRefreshLabel('2026-09-30T14:00:00.000Z', now, fmt)).toBe(
			'Next refresh 2026-09-30T14:00:00.000Z',
		);
	});
});

describe('newlyExpandedKeys', () => {
	it('returns keys opened since the previous snapshot', () => {
		expect(newlyExpandedKeys({ a: true }, { a: true, b: true, c: false })).toEqual(['b']);
		expect(newlyExpandedKeys({ a: true, b: true }, { b: true })).toEqual([]);
		expect(newlyExpandedKeys({}, { a: true })).toEqual(['a']);
	});
});

describe('autoFullStoryRequestKeys', () => {
	it('allows automatic full-story loading for exactly one newly expanded card', () => {
		expect(autoFullStoryRequestKeys(['a'])).toEqual(['a']);
	});

	it('does not fan out full-story loading for expand-all batches', () => {
		expect(autoFullStoryRequestKeys([])).toEqual([]);
		expect(autoFullStoryRequestKeys(['a', 'b'])).toEqual([]);
	});
});

describe('summaryAttemptCounts', () => {
	it('counts success, unavailable, not_in_brief and server errors', () => {
		expect(summaryAttemptCounts({ ok: true, status: 'ok', text: 'x' })).toBe(true);
		expect(summaryAttemptCounts({ ok: true, status: 'unavailable' })).toBe(true);
		expect(summaryAttemptCounts({ ok: false, status: 404, error: 'not_in_brief' })).toBe(true);
		expect(summaryAttemptCounts({ ok: false, status: 502, error: 'error' })).toBe(true);
	});

	it('keeps login, rate-limit and network failures retryable', () => {
		expect(summaryAttemptCounts({ ok: false, status: 401, unauthenticated: true })).toBe(false);
		expect(summaryAttemptCounts({ ok: false, status: 429, error: 'rate_limited' })).toBe(false);
		expect(summaryAttemptCounts({ ok: false, status: 0 })).toBe(false);
	});
});

describe('full-story helpers', () => {
	it('fullStoryErrorCopy maps server codes', () => {
		expect(fullStoryErrorCopy('rate_limited')).toBe(BRIEF_FULL_STORY_RATE_LIMITED);
		expect(fullStoryErrorCopy('not_in_brief')).toBe(BRIEF_FULL_STORY_NOT_IN_BRIEF);
		expect(fullStoryErrorCopy('error')).toBe(BRIEF_FULL_STORY_ERROR);
		expect(fullStoryErrorCopy(undefined)).toBe(BRIEF_FULL_STORY_ERROR);
	});

	it('requests only missing or failed rich stories', () => {
		expect(shouldRequestFullStory(makeStory('a', { informed_full_story_status: 'missing' }))).toBe(
			true,
		);
		expect(shouldRequestFullStory(makeStory('a', { informed_full_story_status: 'error' }))).toBe(
			true,
		);
		expect(shouldRequestFullStory(makeStory('a', { informed_full_story_status: 'ok' }))).toBe(
			false,
		);
		expect(
			shouldRequestFullStory(makeStory('a', { informed_full_story_status: 'unavailable' })),
		).toBe(false);
	});

	it('patches rich-story fields onto the existing story object', () => {
		const story = makeStory('a', { informed_full_story_status: 'missing' });
		applyFullStory(story, {
			status: 'ok',
			talking_points: ['Key point'],
			timeline: [{ date: 'Today', content: 'Event' }],
			suggested_qna: [{ question: 'What?', answer: 'Unknown.' }],
			technical_details: ['Detail'],
			changeSummary: '1 new outlet; timeline +1',
		});
		expect(story).toMatchObject({
			informed_full_story_status: 'ok',
			informed_full_story_updated: '1 new outlet; timeline +1',
			talking_points: ['Key point'],
			technical_details: ['Detail'],
		});
	});
});

describe('refresh polling decisions', () => {
	const run = (completedAt: string, ok = true, error: string | null = null) => ({
		trigger: 'manual' as const,
		startedAt: completedAt,
		completedAt,
		ok,
		error,
	});

	it('isRecoverableRefreshFailure: network, 5xx and proxy errors only', () => {
		expect(isRecoverableRefreshFailure({ ok: false, status: 0 })).toBe(true);
		expect(
			isRecoverableRefreshFailure({ ok: false, status: 500, error: 'Proxy request failed' }),
		).toBe(true);
		expect(isRecoverableRefreshFailure({ ok: false, status: 504 })).toBe(true);
		expect(isRecoverableRefreshFailure({ ok: false, status: 401, unauthenticated: true })).toBe(
			false,
		);
		expect(isRecoverableRefreshFailure({ ok: false, status: 400 })).toBe(false);
		expect(isRecoverableRefreshFailure({ ok: true })).toBe(false);
	});

	it('lastSuccessAt', () => {
		expect(lastSuccessAt(null)).toBeNull();
		expect(lastSuccessAt(makeRefresh())).toBeNull();
		expect(lastSuccessAt(makeRefresh({ lastSuccess: run('2026-09-30T10:00:00.000Z') }))).toBe(
			'2026-09-30T10:00:00.000Z',
		);
	});

	it('keeps polling while running', () => {
		expect(refreshPollOutcome(null, makeRefresh({ running: true }))).toEqual({ kind: 'running' });
	});

	it('reloads only when lastSuccess changed', () => {
		const before = '2026-09-30T10:00:00.000Z';
		const after = '2026-09-30T11:00:00.000Z';
		expect(
			refreshPollOutcome(before, makeRefresh({ last: run(after), lastSuccess: run(after) })),
		).toEqual({ kind: 'done', reload: true, error: null });
		expect(
			refreshPollOutcome(before, makeRefresh({ last: run(before), lastSuccess: run(before) })),
		).toEqual({ kind: 'done', reload: false, error: null });
		expect(refreshPollOutcome(null, makeRefresh({ lastSuccess: run(after) }))).toMatchObject({
			reload: true,
		});
	});

	it('reports the failed run error when the last refresh failed', () => {
		const before = '2026-09-30T10:00:00.000Z';
		expect(
			refreshPollOutcome(
				before,
				makeRefresh({
					last: run('2026-09-30T11:00:00.000Z', false, 'CFP down'),
					lastSuccess: run(before),
				}),
			),
		).toEqual({ kind: 'done', reload: false, error: 'Refresh failed: CFP down' });
		expect(
			refreshPollOutcome(before, makeRefresh({ last: run(before, false, null) })),
		).toMatchObject({ error: BRIEF_REFRESH_ERROR });
	});

	it('overviewPollFailure: tolerates 2 consecutive failed polls, the 3rd stops', () => {
		expect(BRIEF_REFRESH_POLL_FAILURES_TOLERATED).toBe(2);
		expect(overviewPollFailure(0)).toEqual({ failures: 1, stop: false });
		expect(overviewPollFailure(1)).toEqual({ failures: 2, stop: false });
		expect(overviewPollFailure(2)).toEqual({ failures: 3, stop: true });
	});
});

describe('Brief copy constants (NEWS-91)', () => {
	it('keeps BRIEF_STORIES_SECTION_TITLE', () => {
		expect(BRIEF_STORIES_SECTION_TITLE).toBe('Your topics');
	});
});

describe('createSeenBatcher', () => {
	it('debounces, dedupes and posts once per id', async () => {
		vi.useFakeTimers();
		try {
			const post = vi.fn(async () => ({ ok: true }));
			const batcher = createSeenBatcher({ post, delayMs: 1000 });
			batcher.add(['a', 'b']);
			vi.advanceTimersByTime(500);
			batcher.add(['b', 'c']);
			expect(post).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1000);
			expect(post).toHaveBeenCalledTimes(1);
			expect(post).toHaveBeenCalledWith(['a', 'b', 'c']);

			batcher.add(['a']);
			await vi.advanceTimersByTimeAsync(1000);
			expect(post).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('chunks to the server cap and swallows failures', async () => {
		const post = vi.fn(async () => {
			throw new Error('offline');
		});
		const batcher = createSeenBatcher({ post, setTimer: () => 1, clearTimer: () => {} });
		const ids = Array.from({ length: BRIEF_SEEN_MAX_IDS + 5 }, (_, i) => `id-${i}`);
		batcher.add(ids);
		await expect(batcher.flush()).resolves.toBeUndefined();
		expect(post).toHaveBeenCalledTimes(2);
		expect((post.mock.calls[0] as unknown as [string[]])[0]).toHaveLength(BRIEF_SEEN_MAX_IDS);
		expect((post.mock.calls[1] as unknown as [string[]])[0]).toHaveLength(5);
	});
});

describe('client fetch helpers', () => {
	const overviewBody: BriefOverview = {
		ok: true,
		fixture: false,
		refresh: makeRefresh(),
		notices: [],
		sections: [],
		quiet: [],
		filteredOut: 3,
	};

	it('fetchBriefOverview returns the body or null', async () => {
		const ok = vi.fn(async () => jsonResponse(200, overviewBody));
		expect(await fetchBriefOverview(ok as unknown as typeof fetch)).toEqual(overviewBody);
		const bad = vi.fn(async () => jsonResponse(500, { ok: false }));
		expect(await fetchBriefOverview(bad as unknown as typeof fetch)).toBeNull();
		const malformed = vi.fn(async () => jsonResponse(200, { ok: true }));
		expect(await fetchBriefOverview(malformed as unknown as typeof fetch)).toBeNull();
		const offline = vi.fn(async () => {
			throw new Error('offline');
		});
		expect(await fetchBriefOverview(offline as unknown as typeof fetch)).toBeNull();
	});

	it('postBriefSeen posts ids with credentials and flags 401', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(200, { ok: true, recorded: 1 }));
		expect(await postBriefSeen(['a'], fetchFn as unknown as typeof fetch)).toEqual({ ok: true });
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/brief/seen');
		expect(init.credentials).toBe('include');
		expect(JSON.parse(init.body as string)).toEqual({ articleIds: ['a'] });

		const unauth = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(await postBriefSeen(['a'], unauth as unknown as typeof fetch)).toEqual({
			ok: false,
			status: 401,
			unauthenticated: true,
		});
	});

	it('postStorySummary maps ok, unavailable and error codes', async () => {
		const ok = vi.fn(async () =>
			jsonResponse(200, { ok: true, summary: { status: 'ok', text: ' A summary. ' } }),
		);
		expect(await postStorySummary('a/b', ok as unknown as typeof fetch)).toEqual({
			ok: true,
			status: 'ok',
			text: 'A summary.',
		});
		expect((ok.mock.calls[0] as unknown as [string])[0]).toBe('/api/brief/stories/a%2Fb/summary');

		const unavailable = vi.fn(async () =>
			jsonResponse(200, { ok: true, summary: { status: 'unavailable', text: null } }),
		);
		expect(await postStorySummary('a', unavailable as unknown as typeof fetch)).toEqual({
			ok: true,
			status: 'unavailable',
		});

		const limited = vi.fn(async () =>
			jsonResponse(429, { ok: false, error: 'rate_limited', message: 'cap' }),
		);
		expect(await postStorySummary('a', limited as unknown as typeof fetch)).toEqual({
			ok: false,
			status: 429,
			error: 'rate_limited',
		});

		const unauth = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(await postStorySummary('a', unauth as unknown as typeof fetch)).toMatchObject({
			ok: false,
			unauthenticated: true,
		});
	});

	it('postFullStory encodes its id, posts an empty body, and returns the patch payload', async () => {
		const ok = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				fullStory: {
					status: 'ok',
					talking_points: ['Key point'],
					changeSummary: '1 new outlet',
				},
			}),
		);
		expect(await postFullStory('a/b', ok as unknown as typeof fetch)).toEqual({
			ok: true,
			fullStory: {
				status: 'ok',
				talking_points: ['Key point'],
				changeSummary: '1 new outlet',
			},
		});
		const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/brief/stories/a%2Fb/full');
		expect(JSON.parse(init.body as string)).toEqual({});

		const unauth = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(await postFullStory('a', unauth as unknown as typeof fetch)).toMatchObject({
			ok: false,
			unauthenticated: true,
		});
	});

	it('postBriefRefresh flags 401 and passes server errors through', async () => {
		const ok = vi.fn(async () => jsonResponse(200, { ok: true }));
		expect(await postBriefRefresh(ok as unknown as typeof fetch)).toEqual({ ok: true });
		expect((ok.mock.calls[0] as unknown as [string])[0]).toBe('/api/fetch');

		const unauth = vi.fn(async () => jsonResponse(401, {}));
		expect(await postBriefRefresh(unauth as unknown as typeof fetch)).toMatchObject({
			unauthenticated: true,
		});

		const failed = vi.fn(async () => jsonResponse(500, { ok: false, error: 'CFP down' }));
		expect(await postBriefRefresh(failed as unknown as typeof fetch)).toEqual({
			ok: false,
			status: 500,
			error: 'CFP down',
		});
	});
});

describe('Less like this', () => {
	const topic = { id: 't9', kind: 'undesired', name: 'example.com', keywords: ['example.com'] };

	it('postLessLikeThis posts the body to the encoded story route and maps 201 created', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(201, { ok: true, created: true, topic: { ...topic, name: 'Tariff talk' }, topics: [] }),
		);
		const body = { kind: 'subject' as const, name: 'Tariff talk', keywords: ['tariffs'] };
		expect(await postLessLikeThis('a/b', body, fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			created: true,
			topicName: 'Tariff talk',
		});
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/brief/stories/a%2Fb/less-like-this');
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect(JSON.parse(init.body as string)).toEqual(body);
	});

	it('postLessLikeThis maps 200 already blocked to created false', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(200, { ok: true, created: false, topic, topics: [topic] }),
		);
		expect(
			await postLessLikeThis('a', { kind: 'outlet' }, fetchFn as unknown as typeof fetch),
		).toEqual({ ok: true, created: false, topicName: 'example.com' });
	});

	it('postLessLikeThis passes 400 / 404 / 409 error codes through', async () => {
		for (const [status, error] of [
			[400, 'no_outlet'],
			[404, 'story_not_found'],
			[409, 'A topic named "x" already exists'],
		] as const) {
			const fetchFn = vi.fn(async () => jsonResponse(status, { ok: false, error }));
			expect(
				await postLessLikeThis('a', { kind: 'outlet' }, fetchFn as unknown as typeof fetch),
			).toEqual({ ok: false, unauthenticated: false, error });
		}
	});

	it('postLessLikeThis flags 401 and maps network failure and malformed bodies to a blank error', async () => {
		const unauth = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(
			await postLessLikeThis('a', { kind: 'outlet' }, unauth as unknown as typeof fetch),
		).toMatchObject({ ok: false, unauthenticated: true });

		const offline = vi.fn(async () => {
			throw new Error('offline');
		});
		expect(
			await postLessLikeThis('a', { kind: 'outlet' }, offline as unknown as typeof fetch),
		).toEqual({ ok: false, unauthenticated: false, error: '' });

		const malformed = vi.fn(async () => jsonResponse(201, { ok: true }));
		expect(
			await postLessLikeThis('a', { kind: 'outlet' }, malformed as unknown as typeof fetch),
		).toEqual({ ok: false, unauthenticated: false, error: '' });
	});

	it('lessLikeThisErrorCopy maps known codes, else the server message, else a generic retry', () => {
		expect(lessLikeThisErrorCopy('no_outlet')).toBe(LESS_LIKE_THIS_NO_OUTLET);
		expect(lessLikeThisErrorCopy('story_not_found')).toBe(LESS_LIKE_THIS_NOT_STORED);
		expect(lessLikeThisErrorCopy('name must be at most 80 characters')).toBe(
			'name must be at most 80 characters',
		);
		expect(lessLikeThisErrorCopy('')).toBe(LESS_LIKE_THIS_ERROR);
		expect(lessLikeThisErrorCopy(undefined)).toBe(LESS_LIKE_THIS_ERROR);
	});

	it('lessLikeThisSubjectDefault trims and keeps titles up to the name cap', () => {
		expect(lessLikeThisSubjectDefault({ title: '  Short headline  ' })).toBe('Short headline');
		const exact = 'x'.repeat(LESS_LIKE_THIS_NAME_MAX);
		expect(lessLikeThisSubjectDefault({ title: exact })).toBe(exact);
	});

	it('lessLikeThisSubjectDefault cuts long titles on a word boundary, or hard-cuts without one', () => {
		const words = `${'word '.repeat(15)}tail end here`;
		const cut = lessLikeThisSubjectDefault({ title: words });
		expect(cut.length).toBeLessThanOrEqual(LESS_LIKE_THIS_NAME_MAX);
		expect(cut).toBe(`${'word '.repeat(15)}tail`);

		const spaceAtCap = `${'a'.repeat(LESS_LIKE_THIS_NAME_MAX)} next`;
		expect(lessLikeThisSubjectDefault({ title: spaceAtCap })).toBe('a'.repeat(LESS_LIKE_THIS_NAME_MAX));

		const noSpace = 'y'.repeat(LESS_LIKE_THIS_NAME_MAX + 20);
		expect(lessLikeThisSubjectDefault({ title: noSpace })).toBe('y'.repeat(LESS_LIKE_THIS_NAME_MAX));
	});

	it('lessLikeThisSubjectRequest sends the title as description and omits blank fields', () => {
		expect(lessLikeThisSubjectRequest(' Tariffs ', 'tariffs, Tariffs, steel', ' A headline ')).toEqual({
			kind: 'subject',
			name: 'Tariffs',
			keywords: ['tariffs', 'steel'],
			description: 'A headline',
		});
		expect(lessLikeThisSubjectRequest('Tariffs', ' , ', '  ')).toEqual({
			kind: 'subject',
			name: 'Tariffs',
		});
	});

	it('lessLikeThisSubjectRequest cuts the description to the server cap', () => {
		const request = lessLikeThisSubjectRequest('Tariffs', '', ` ${'z'.repeat(600)} `);
		expect(LESS_LIKE_THIS_DESCRIPTION_MAX).toBe(500);
		expect(request).toEqual({
			kind: 'subject',
			name: 'Tariffs',
			description: 'z'.repeat(LESS_LIKE_THIS_DESCRIPTION_MAX),
		});
	});

	it('lessLikeThisAddedCopy says when matching stories disappear', () => {
		expect(lessLikeThisAddedCopy('Tariffs')).toBe(
			'Added "Tariffs" to undesired topics. Matching stories are hidden the next time the Brief loads, and filtered out from the next refresh.',
		);
	});
});

describe('Added by you (manual seeds)', () => {
	it('labels seeds and their Remove control', () => {
		expect(BRIEF_ADDED_BY_YOU_LABEL).toBe('Added by you');
		expect(BRIEF_REMOVE_LABEL).toBe('Remove');
		expect(BRIEF_REMOVE_PENDING).toBe('Removing…');
		expect(BRIEF_REMOVE_ERROR).toBe('Could not remove this story. Try again.');
		expect(BRIEF_REMOVE_LOGIN_HINT).toBe('Log in on Topics to remove stories');
	});

	it('isManualSeedStory is true only for stories flagged added by you', () => {
		expect(isManualSeedStory(makeStory('a', { informed_added_by_you: true }))).toBe(true);
		expect(isManualSeedStory(makeStory('a', { informed_added_by_you: false }))).toBe(false);
		expect(isManualSeedStory(makeStory('a'))).toBe(false);
	});

	it('postRemoveSeed posts to the encoded story remove route and maps 200', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(200, { ok: true }));
		expect(await postRemoveSeed('a/b', fetchFn as unknown as typeof fetch)).toEqual({ ok: true });
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/brief/stories/a%2Fb/remove');
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
	});

	it('postRemoveSeed maps 401 to the login hint', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(await postRemoveSeed('a', fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: true,
			error: 'Log in on Topics to remove stories',
		});
	});

	it('postRemoveSeed maps 404 / 409 / network failures to the retry copy', async () => {
		const notFound = vi.fn(async () => jsonResponse(404, { ok: false, error: 'story_not_found' }));
		const notSeed = vi.fn(async () => jsonResponse(409, { ok: false, error: 'not_a_seed' }));
		const offline = vi.fn(async () => {
			throw new Error('offline');
		});
		for (const fetchFn of [notFound, notSeed, offline]) {
			expect(await postRemoveSeed('a', fetchFn as unknown as typeof fetch)).toEqual({
				ok: false,
				unauthenticated: false,
				error: 'Could not remove this story. Try again.',
			});
		}
	});
});
