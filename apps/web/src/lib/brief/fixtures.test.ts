import { expect, it } from 'vitest';
import {
	FEEDBACK_COMMENT_MAX,
	briefCard,
	feedbackEntry,
	feedbackListBody,
	feedbackSavedBody,
	installBriefFetchMock,
	jsonResponse,
	lessLikeThisSavedBody,
	lessLikeThisUrl,
	removeSeedSavedBody,
	removeSeedUrl,
	storyForLessLikeThis,
} from '$lib/brief';
import type { FeedbackEntry, RecordedBriefFetch } from '$lib/brief';

const FIXED_TS = '2026-09-01T00:00:00.000Z';

it('builds a feedback entry from the Brief defaults', () => {
	const entry: FeedbackEntry = feedbackEntry();
	expect(entry).toEqual({
		id: 'fb-story-1',
		itemId: 'story-1',
		signal: 'like',
		comment: '',
		ts: FIXED_TS,
		snapshot: {
			headline: 'Royal row deepens',
			source: 'dailymail.co.uk',
			url: 'https://dailymail.co.uk/story',
			topics: [{ id: 't1', name: 'Courts' }],
		},
	});
	expect(feedbackEntry({ signal: 'not_relevant' })).toMatchObject({
		id: 'fb-story-1',
		signal: 'not_relevant',
	});
	const stored = feedbackEntry({ comment: 'x'.repeat(600) });
	expect(stored.comment).toBe('x'.repeat(FEEDBACK_COMMENT_MAX));
	expect(stored.comment).toHaveLength(500);
});

it('builds the feedback list body', () => {
	const entries = [feedbackEntry()];
	expect(feedbackListBody(entries)).toEqual({ ok: true, entries, updatedAt: null });
});

it('builds the saved feedback, less-like-this, and remove-seed bodies', () => {
	const entry = feedbackEntry();
	expect(feedbackSavedBody(entry)).toEqual({
		ok: true,
		replaced: false,
		entry,
		entries: [entry],
	});
	expect(feedbackSavedBody(entry, true).replaced).toBe(true);
	expect(lessLikeThisSavedBody('Courts')).toEqual({
		ok: true,
		created: true,
		topic: { name: 'Courts' },
		topics: [],
	});
	expect(lessLikeThisSavedBody('Courts', false).created).toBe(false);
	expect(removeSeedSavedBody()).toEqual({ ok: true });
});

it('encodes a slash in less-like-this and remove-seed urls', () => {
	expect(lessLikeThisUrl('a/b')).toBe('/api/brief/stories/a%2Fb/less-like-this');
	expect(removeSeedUrl('a/b')).toBe('/api/brief/stories/a%2Fb/remove');
});

it('maps a brief card onto the less-like-this story shape', () => {
	expect(storyForLessLikeThis(briefCard())).toEqual({
		title: 'Royal row deepens',
		informed_publisher_domain: 'dailymail.co.uk',
	});
});

it('mocks fetch, records the call, and restores the original fetch', async () => {
	const { calls, restore } = installBriefFetchMock(() =>
		jsonResponse(200, feedbackListBody([])),
	);
	try {
		const response = await fetch('/api/feedback', { credentials: 'include' });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(await response.json()).toEqual({ ok: true, entries: [], updatedAt: null });
		expect(calls).toEqual([
			{
				url: '/api/feedback',
				method: 'GET',
				body: undefined,
				credentials: 'include',
			} satisfies RecordedBriefFetch,
		]);

		await fetch('/api/feedback', {
			method: 'POST',
			body: JSON.stringify({ signal: 'like' }),
		});
		expect(calls[1]).toEqual({
			url: '/api/feedback',
			method: 'POST',
			body: { signal: 'like' },
			credentials: undefined,
		});

		await fetch('/api/feedback', { method: 'POST', body: new URLSearchParams('a=1') });
		expect(calls[2]).toEqual({
			url: '/api/feedback',
			method: 'POST',
			body: undefined,
			credentials: undefined,
		});

		restore();
		await expect(fetch('/api/feedback')).rejects.toThrow();
	} finally {
		restore();
	}
});
