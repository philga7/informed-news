import { describe, expect, it, vi } from 'vitest';
import {
	FILTERED_ARTICLE_GONE,
	FILTERED_DISCLAIMER,
	FILTERED_HEADING,
	FILTERED_INTRO,
	FILTERED_LINK_LABEL,
	FILTERED_LOAD_ERROR,
	FILTERED_LOGIN_HINT,
	FILTERED_NO_RUN,
	FILTERED_PAGE_TITLE,
	FILTERED_REASON_GROUPS,
	FILTERED_REASON_LABEL,
	FILTERED_SCOPE_LABEL,
	FILTERED_SKIPPED_RUN,
	duplicateOfTitle,
	fetchFilteredOut,
	filteredOutLinkLabel,
	groupFilteredItems,
	groupHeading,
	itemTitle,
	mutedByLine,
	reasonCounts,
	runSummaryLine,
	showAllLabel,
	type FilteredOut,
	type FilteredOutItem,
	type FilteredOutRun,
	type FilteredReasonGroup,
} from '$lib/filteredOut';

function makeItem(
	articleId: string,
	group: FilteredReasonGroup,
	overrides: Partial<FilteredOutItem> = {},
): FilteredOutItem {
	return {
		articleId,
		title: `Title ${articleId}`,
		url: `https://example.com/${articleId}`,
		publisherDomain: 'example.com',
		publishedAt: '2026-10-04T12:00:00.000Z',
		sourceKind: 'search',
		reason: group === 'muted' ? 'muted:rule-1' : group,
		group,
		final: group !== 'not_scored_budget' && group !== 'not_scored_error',
		stage: 'headline',
		mutedBy: null,
		topics: [],
		duplicateOf: null,
		triagedAt: '2026-10-04T15:40:00.000Z',
		...overrides,
	};
}

function makeRun(overrides: Partial<FilteredOutRun> = {}): FilteredOutRun {
	return {
		at: '2026-10-04T15:40:00.000Z',
		skipped: false,
		candidates: 120,
		kept: 18,
		dropped: 102,
		byReason: {},
		jev: { budget: 200, used: 150, errors: 0 },
		summaryBudget: 30,
		errors: [],
		...overrides,
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('filtered out copy', () => {
	it('uses the exact reason labels in display order', () => {
		expect(FILTERED_REASON_GROUPS.map((group) => FILTERED_REASON_LABEL[group])).toEqual([
			'Muted',
			'Off-topic',
			'Clickbait',
			'Opinion',
			'Rewrite / roundup',
			'Sponsored',
			'Not significant',
			'Duplicate',
			'Undated',
			'Too old',
			'Not scored (budget)',
			'Not scored (error)',
		]);
	});

	it('exports page copy', () => {
		expect(FILTERED_PAGE_TITLE).toBe('Filtered out — Informed News');
		expect(FILTERED_HEADING).toBe('Filtered out');
		expect(FILTERED_INTRO).toBe(
			'Stories the last refresh dropped, and why. For spot checks only — nothing here needs action.',
		);
		expect(FILTERED_DISCLAIMER).toContain('AI-assisted judgments, not ground truth');
		expect(FILTERED_SCOPE_LABEL).toEqual({ last: 'Last refresh', window: 'Last 48 hours' });
		expect(FILTERED_LOGIN_HINT).toBe('Log in on Topics to see filtered stories');
	});

	it('formats headings and toggles', () => {
		expect(groupHeading('Off-topic', 4)).toBe('Off-topic (4)');
		expect(showAllLabel(31)).toBe('Show all (31)');
	});
});

describe('groupFilteredItems', () => {
	it('orders groups by the display table and omits empty groups', () => {
		const items = [
			makeItem('a', 'stale'),
			makeItem('b', 'off_topic'),
			makeItem('c', 'muted'),
			makeItem('d', 'off_topic'),
			makeItem('e', 'not_scored_error'),
		];
		const groups = groupFilteredItems(items);
		expect(groups.map((g) => g.group)).toEqual(['muted', 'off_topic', 'stale', 'not_scored_error']);
		expect(groups.map((g) => g.label)).toEqual([
			'Muted',
			'Off-topic',
			'Too old',
			'Not scored (error)',
		]);
		expect(groups[1].items.map((i) => i.articleId)).toEqual(['b', 'd']);
	});

	it('returns no groups for no items', () => {
		expect(groupFilteredItems([])).toEqual([]);
	});
});

describe('reasonCounts', () => {
	it('lists non-empty groups in display order with labels', () => {
		expect(reasonCounts({ duplicate: 2, muted: 1, clickbait: 0, rewrite: 3 })).toEqual([
			{ group: 'muted', label: 'Muted', count: 1 },
			{ group: 'rewrite', label: 'Rewrite / roundup', count: 3 },
			{ group: 'duplicate', label: 'Duplicate', count: 2 },
		]);
		expect(reasonCounts({})).toEqual([]);
	});
});

describe('item lines', () => {
	it('mutedByLine shows the rule or topic label', () => {
		expect(
			mutedByLine(
				makeItem('a', 'muted', { mutedBy: { kind: 'rule', id: 'r1', label: 'crypto (x.com)' } }),
			),
		).toBe('Muted by: crypto (x.com)');
		expect(mutedByLine(makeItem('b', 'off_topic'))).toBeNull();
	});

	it('falls back when the article or duplicate target is gone', () => {
		expect(itemTitle({ title: 'Hello' })).toBe('Hello');
		expect(itemTitle({ title: null })).toBe(FILTERED_ARTICLE_GONE);
		expect(duplicateOfTitle({ articleId: 'x', title: 'Orig', url: null })).toBe('Orig');
		expect(duplicateOfTitle({ articleId: 'x', title: null, url: null })).toBe(
			'Article no longer stored',
		);
	});
});

describe('runSummaryLine', () => {
	const fixedTime = (date: Date) => `T${date.toISOString().slice(11, 16)}`;

	it('summarizes a triage run with its time', () => {
		expect(runSummaryLine(makeRun(), fixedTime)).toBe(
			'Last refresh T15:40: 120 candidates, 18 kept, 102 dropped',
		);
		expect(runSummaryLine(makeRun({ candidates: 1, kept: 0, dropped: 1 }), fixedTime)).toBe(
			'Last refresh T15:40: 1 candidate, 0 kept, 1 dropped',
		);
	});

	it('uses a short local time by default', () => {
		expect(runSummaryLine(makeRun())).toMatch(
			/^Last refresh \S.*\d.*: 120 candidates, 18 kept, 102 dropped$/,
		);
	});

	it('drops the time when run.at is unparsable', () => {
		expect(runSummaryLine(makeRun({ at: 'nope' }), fixedTime)).toBe(
			'Last refresh: 120 candidates, 18 kept, 102 dropped',
		);
	});

	it('handles no run and skipped runs', () => {
		expect(runSummaryLine(null)).toBe(FILTERED_NO_RUN);
		expect(FILTERED_NO_RUN).toBe('No refresh has triaged stories yet.');
		expect(runSummaryLine(makeRun({ skipped: true }))).toBe(FILTERED_SKIPPED_RUN);
		expect(
			runSummaryLine(makeRun({ skipped: true, errors: ['topics store unreadable', 'other'] })),
		).toBe('Last refresh did not triage stories: topics store unreadable');
	});
});

describe('filteredOutLinkLabel', () => {
	it('shows the count only when positive', () => {
		expect(filteredOutLinkLabel(7)).toBe('7 filtered out');
		expect(filteredOutLinkLabel(0)).toBe(FILTERED_LINK_LABEL);
		expect(filteredOutLinkLabel(null)).toBe('Filtered out');
		expect(filteredOutLinkLabel(undefined)).toBe('Filtered out');
	});
});

describe('fetchFilteredOut', () => {
	const data: FilteredOut = {
		scope: 'window',
		run: makeRun(),
		counts: { off_topic: 1 },
		items: [makeItem('a', 'off_topic')],
	};

	it('requests the scope with credentials and returns the data', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(200, { ok: true, ...data }));
		expect(await fetchFilteredOut('window', fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			data,
		});
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/triage/filtered?scope=window');
		expect(init.credentials).toBe('include');
	});

	it('accepts a null run', async () => {
		const body = { ok: true, scope: 'last', run: null, counts: {}, items: [] };
		const fetchFn = vi.fn(async () => jsonResponse(200, body));
		expect(await fetchFilteredOut('last', fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			data: { scope: 'last', run: null, counts: {}, items: [] },
		});
	});

	it('flags 401 as unauthenticated', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(401, { ok: false, error: 'Unauthorized' }));
		expect(await fetchFilteredOut('last', fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: true,
			error: FILTERED_LOGIN_HINT,
		});
	});

	it('shows generic copy for 5xx, never the raw server message', async () => {
		for (const status of [500, 502, 503]) {
			const withError = vi.fn(async () =>
				jsonResponse(status, { ok: false, error: 'ENOENT: /data/mute-rules.json' }),
			);
			expect(await fetchFilteredOut('last', withError as unknown as typeof fetch)).toEqual({
				ok: false,
				unauthenticated: false,
				error: FILTERED_LOAD_ERROR,
			});
		}
	});

	it('shows generic copy for 4xx other than 400 / 409', async () => {
		for (const status of [403, 404, 429]) {
			const withError = vi.fn(async () => jsonResponse(status, { ok: false, error: 'Forbidden' }));
			expect(await fetchFilteredOut('last', withError as unknown as typeof fetch)).toEqual({
				ok: false,
				unauthenticated: false,
				error: FILTERED_LOAD_ERROR,
			});
		}
	});

	it('returns the server error on 400, or the fallback', async () => {
		const withError = vi.fn(async () => jsonResponse(400, { ok: false, error: 'bad scope' }));
		expect(await fetchFilteredOut('last', withError as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: false,
			error: 'bad scope',
		});
		const bare = vi.fn(async () => new Response('oops', { status: 400 }));
		expect(await fetchFilteredOut('last', bare as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: false,
			error: FILTERED_LOAD_ERROR,
		});
	});

	it('rejects a malformed ok body', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(200, { ok: true, items: [] }));
		expect(await fetchFilteredOut('last', fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: false,
			error: FILTERED_LOAD_ERROR,
		});
	});

	it('handles network failures', async () => {
		const fetchFn = vi.fn(async () => {
			throw new Error('offline');
		});
		expect(await fetchFilteredOut('last', fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: false,
			error: FILTERED_LOAD_ERROR,
		});
	});
});
