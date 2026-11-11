import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BRIEF_ADDED_BY_YOU_LABEL,
	BRIEF_AI_SUMMARY_NOTE,
	BRIEF_ALL_FILTERED,
	BRIEF_FULL_STORY_ERROR,
	BRIEF_FULL_STORY_LOADING,
	BRIEF_FULL_STORY_PARSE_ERROR,
	BRIEF_FULL_STORY_UNAVAILABLE,
	fullStoryErrorCopy,
	BRIEF_LESS_LABEL,
	BRIEF_LEVEL_LABEL,
	BRIEF_OFFICIAL_LABEL,
	BRIEF_OTHER_SECTION_NAME,
	BRIEF_QUIET_PREFIX,
	BRIEF_STORIES_SECTION_TITLE,
	BRIEF_SUMMARY_ERROR,
	BRIEF_SUMMARY_LOADING,
	BRIEF_SUMMARY_LOGIN_HINT,
	BRIEF_SUMMARY_MISSING,
	BRIEF_SUMMARY_UNAVAILABLE,
	CONTENT_FILTER_STORAGE_KEY,
	SHARED_STORY_NOT_FOUND,
	TOPIC_BRIEF_CATEGORY_ID,
	decideTopicBriefFilterMatches,
	filteredCountLabel,
	fullStoryLine,
	applyFullStory,
	articleLinks,
	autoFullStoryRequestKeys,
	createSeenBatcher,
	nextRefreshLabel,
	shouldRequestFullStory,
	updatedLabel,
	groupTopicBrief,
	hideFilteredStories,
	isManualSeedStory,
	isOfficialStory,
	isTopicBriefStory,
	loadContentFilter,
	moreLabel,
	openKeysForFilterDecision,
	outletBadge,
	quietLine,
	sharedStoryInList,
	shouldFilterStory,
	storyKey,
	storyKeys,
	summaryLine,
	survivingExpandedStories,
	toggleExpandAllKeys,
	type BriefOverviewSection,
	type Story,
} from './assemble';

function makeStory(id: string, overrides: Partial<Story> = {}): Story {
	return {
		id,
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

describe('groupTopicBrief', () => {
	const overview: { sections: BriefOverviewSection[] } = {
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
		expect(sections.map((section) => section.topicId)).toEqual(['core-1', 'watch-1']);
		expect(sections[0].top.map((story) => story.id)).toEqual(['a', 'b']);
		expect(sections[0].more.map((story) => story.id)).toEqual(['c']);
		expect(sections[1].top.map((story) => story.id)).toEqual(['d']);
		expect(sections[1].level).toBe('watch');
	});

	it('returns the same story objects (in-place patches stay visible)', () => {
		const story = makeStory('a');
		const [section] = groupTopicBrief(overview, [story]);
		expect(section.top[0]).toBe(story);
	});

	it('drops ids missing from stories and sections left empty', () => {
		const sections = groupTopicBrief(overview, [makeStory('b')]);
		expect(sections).toHaveLength(1);
		expect(sections[0].top.map((story) => story.id)).toEqual(['b']);
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
		expect(sections[0].more.map((story) => story.id)).toEqual(['x']);
		expect(sections.slice(1).map((section) => [section.name, section.top.map((story) => story.id)])).toEqual([
			['New topic', ['y']],
			[BRIEF_OTHER_SECTION_NAME, ['z']],
		]);
	});
});

describe('hideFilteredStories (NEWS-141)', () => {
	const sections = groupTopicBrief(
		{
			sections: [
				{
					topicId: 'core-1',
					name: 'Core one',
					level: 'core',
					storyIds: ['a', 'b'],
					moreIds: ['c', 'd'],
				},
				{ topicId: 'watch-1', name: 'Watch one', level: 'watch', storyIds: ['e'], moreIds: [] },
			],
		},
		['a', 'b', 'c', 'd', 'e'].map((id) =>
			makeStory(id, id === 'e' ? { informed_topic_id: 'watch-1' } : {}),
		),
	);
	const ids = (stories: Story[]) => stories.map((story) => story.id);

	it('leaves the sections as they are when nothing is hidden', () => {
		expect(hideFilteredStories(sections, () => false)).toEqual({ sections, hiddenCount: 0 });
	});

	it('fills a hidden top story from More, so More shrinks by one', () => {
		const result = hideFilteredStories(sections, (story) => story.id === 'a');
		expect(ids(result.sections[0].top)).toEqual(['b', 'c']);
		expect(ids(result.sections[0].more)).toEqual(['d']);
		expect(result.hiddenCount).toBe(1);
	});

	it('takes hidden More stories out of More', () => {
		const result = hideFilteredStories(sections, (story) => story.id === 'd');
		expect(ids(result.sections[0].top)).toEqual(['a', 'b']);
		expect(ids(result.sections[0].more)).toEqual(['c']);
	});

	it('drops a topic whose stories are all hidden and counts them', () => {
		const result = hideFilteredStories(sections, (story) => story.id !== 'e');
		expect(result.sections.map((section) => section.topicId)).toEqual(['watch-1']);
		expect(result.hiddenCount).toBe(4);
	});
});

describe('decideTopicBriefFilterMatches (NEWS-150)', () => {
	const matchRatepayers = (story: Story) =>
		story.short_summary?.includes('ratepayers') ? ['ratepayers'] : [];

	it("carries an open card's decision across a reload (new story object) by story key", () => {
		const before = makeStory('a');
		const open = new Set(['a']);
		const first = decideTopicBriefFilterMatches([before], matchRatepayers, open, new Map());
		expect(first.matches.has(before)).toBe(false);
		expect(first.carry.get('a')).toEqual([]);

		const afterReload = makeStory('a', {
			short_summary: 'Overnight bills change for ratepayers.',
		});
		const second = decideTopicBriefFilterMatches(
			[afterReload],
			matchRatepayers,
			open,
			first.carry,
		);
		expect(second.matches.has(afterReload)).toBe(false);
		expect(second.carry.get('a')).toEqual([]);
	});

	it('re-decides a closed card after reload, and with an empty prior (filter settings)', () => {
		const openCard = makeStory('open');
		const closed = makeStory('closed');
		const first = decideTopicBriefFilterMatches(
			[openCard, closed],
			matchRatepayers,
			new Set(['open']),
			new Map(),
		);

		const reloadedOpen = makeStory('open', {
			short_summary: 'Overnight bills change for ratepayers.',
		});
		const reloadedClosed = makeStory('closed', {
			short_summary: 'Overnight bills change for ratepayers.',
		});
		const afterReload = decideTopicBriefFilterMatches(
			[reloadedOpen, reloadedClosed],
			matchRatepayers,
			new Set(['open']),
			first.carry,
		);
		expect(afterReload.matches.has(reloadedOpen)).toBe(false);
		expect(afterReload.matches.get(reloadedClosed)).toEqual(['ratepayers']);

		const afterSettings = decideTopicBriefFilterMatches(
			[reloadedOpen],
			matchRatepayers,
			new Set(['open']),
			new Map(),
		);
		expect(afterSettings.matches.get(reloadedOpen)).toEqual(['ratepayers']);
	});

	it('keys an open card by story id, not cluster number alone', () => {
		const story = makeStory('article-9', { cluster_number: 9, title: 'Headline' });
		const decided = decideTopicBriefFilterMatches(
			[story],
			() => ['ratepayers'],
			new Set(['article-9']),
			new Map(),
		);
		expect(decided.carry.has('article-9')).toBe(true);
		expect(decided.carry.has('9')).toBe(false);
		expect(storyKeys([story])).toEqual(['article-9']);
	});
});

describe('openKeysForFilterDecision (NEWS-154)', () => {
	const prior = new Map<string, string[]>([['a', []]]);
	const knownKeys = new Set(['a', 'b']);

	it('treats carried keys still in the list as open only before this session saw an open card (Brief remount)', () => {
		const remount = openKeysForFilterDecision(new Set(), prior, knownKeys, false);
		expect([...remount.effectiveOpen]).toEqual(['a']);
		expect(remount.sessionSawOpen).toBe(false);
	});

	it('returns empty open keys when this session already saw opens and every card is closed', () => {
		const closed = openKeysForFilterDecision(new Set(), prior, knownKeys, true);
		expect([...closed.effectiveOpen]).toEqual([]);
		expect(closed.sessionSawOpen).toBe(true);
	});

	it('marks sessionSawOpen when any card is open', () => {
		const open = openKeysForFilterDecision(new Set(['a']), prior, knownKeys, false);
		expect([...open.effectiveOpen]).toEqual(['a']);
		expect(open.sessionSawOpen).toBe(true);
	});

	it('re-decides a closed card after the last open card closes (carry no longer shields it)', () => {
		const matchRatepayers = (story: Story) =>
			story.short_summary?.includes('ratepayers') ? ['ratepayers'] : [];
		const story = makeStory('a');
		const first = decideTopicBriefFilterMatches(
			[story],
			matchRatepayers,
			new Set(['a']),
			new Map(),
		);
		expect(first.carry.get('a')).toEqual([]);

		story.short_summary = 'Overnight bills change for ratepayers.';
		const { effectiveOpen } = openKeysForFilterDecision(
			new Set(),
			first.carry,
			new Set(['a']),
			true,
		);
		const afterClose = decideTopicBriefFilterMatches(
			[story],
			matchRatepayers,
			effectiveOpen,
			first.carry,
		);
		expect(afterClose.matches.get(story)).toEqual(['ratepayers']);
		expect(afterClose.carry.size).toBe(0);
	});
});

describe('toggleExpandAllKeys (NEWS-149)', () => {
	it('skips blurred keys when expanding and collapses only expandable cards', () => {
		const blurred = new Set(['blurred']);
		const isBlurred = (key: string) => blurred.has(key);
		const expanded = toggleExpandAllKeys(['clear', 'blurred', 'other'], {}, isBlurred);
		expect(expanded).toEqual({ clear: true, other: true });
		expect(expanded.blurred).toBeUndefined();

		expect(toggleExpandAllKeys(['clear', 'blurred'], { blurred: true }, isBlurred)).toEqual({
			clear: true,
		});

		const collapsed = toggleExpandAllKeys(
			['clear', 'blurred', 'other'],
			{ clear: true, other: true, blurred: true },
			isBlurred,
		);
		expect(collapsed).toEqual({});
	});
});

describe('survivingExpandedStories (NEWS-150)', () => {
	it('keeps open keys that still exist after reload and drops the rest', () => {
		expect(
			survivingExpandedStories({ a: true, b: true, c: false, gone: true }, [
				makeStory('a'),
				makeStory('b'),
			]),
		).toEqual({ a: true, b: true });
	});
});

describe('storyKey', () => {
	it('uses id, then cluster number, then title', () => {
		expect(storyKey(makeStory('article-1', { cluster_number: 4, title: 'Headline' }))).toBe(
			'article-1',
		);
		expect(
			storyKey(makeStory('ignored', { id: undefined, cluster_number: 4, title: 'Headline' })),
		).toBe('4');
		expect(
			storyKey(makeStory('ignored', { id: '', cluster_number: undefined, title: 'Headline' })),
		).toBe('Headline');
		expect(storyKeys([makeStory('a', { cluster_number: 7 }), makeStory('b', { cluster_number: 8 })])).toEqual([
			'a',
			'b',
		]);
	});
});

describe('filteredCountLabel', () => {
	it('returns the English hidden and filtered lines', () => {
		expect(filteredCountLabel('hide', 1)).toBe('1 story hidden');
		expect(filteredCountLabel('hide', 2)).toBe('2 stories hidden');
		expect(filteredCountLabel('blur', 1)).toBe('1 story filtered');
		expect(filteredCountLabel('blur', 2)).toBe('2 stories filtered');
		expect(filteredCountLabel('blur', 3)).toBe('3 stories filtered');
	});
});

describe('shouldFilterStory', () => {
	const story: Story = {
		title: 'U.S. adults see a rate change',
		category: 'Economy',
		short_summary: 'Bills shift for ratepayers overnight.',
		perspectives: [{ text: 'Markets wobble', sources: [{ name: 'Reuters' }] }],
		domains: [{ name: 'example.com' }],
		articles: [{ link: 'https://news.example/c++', domain: 'news.example' }],
	};

	it('matches nothing when there are no keywords', () => {
		expect(shouldFilterStory(story, [], 'all')).toEqual({
			shouldFilter: false,
			matchedKeywords: [],
		});
	});

	it('matches title and category in title scope, not the summary', () => {
		expect(shouldFilterStory(story, ['economy'], 'title').shouldFilter).toBe(true);
		expect(shouldFilterStory(story, ['ratepayers'], 'title').matchedKeywords).toEqual([]);
	});

	it('matches the summary in summary scope, not the title', () => {
		expect(shouldFilterStory(story, ['ratepayers'], 'summary').matchedKeywords).toEqual([
			'ratepayers',
		]);
		expect(shouldFilterStory(story, ['economy'], 'summary').shouldFilter).toBe(false);
	});

	it('matches perspectives, domains, and article text in all scope', () => {
		expect(shouldFilterStory(story, ['reuters'], 'all').shouldFilter).toBe(true);
		expect(shouldFilterStory(story, ['example.com'], 'all').shouldFilter).toBe(true);
		expect(shouldFilterStory(story, ['c++'], 'all').matchedKeywords).toEqual(['c++']);
	});

	it('uses whole words, including a dotted token like u.s.', () => {
		expect(shouldFilterStory(story, ['see'], 'title').shouldFilter).toBe(true);
		expect(shouldFilterStory(story, ['adult'], 'title').shouldFilter).toBe(false);
		expect(shouldFilterStory(story, ['u.s.'], 'title').matchedKeywords).toEqual(['u.s.']);
	});
});

describe('loadContentFilter', () => {
	beforeEach(() => {
		vi.mocked(localStorage.getItem).mockReset();
		vi.mocked(localStorage.getItem).mockReturnValue(null);
	});

	it('defaults to no keywords and blur when nothing is stored', () => {
		expect(loadContentFilter()).toEqual({
			keywords: [],
			filterMode: 'blur',
			filterScope: 'all',
			version: 1,
		});
		expect(localStorage.getItem).toHaveBeenCalledWith(CONTENT_FILTER_STORAGE_KEY);
	});

	it('reads the stored keywords, mode, and scope', () => {
		vi.mocked(localStorage.getItem).mockReturnValue(
			JSON.stringify({
				keywords: ['ratepayers', 'u.s.'],
				filterMode: 'hide',
				filterScope: 'title',
				version: 1,
			}),
		);
		expect(loadContentFilter()).toEqual({
			keywords: ['ratepayers', 'u.s.'],
			filterMode: 'hide',
			filterScope: 'title',
			version: 1,
		});
	});

	it('falls back when the stored value is not readable', () => {
		vi.mocked(localStorage.getItem).mockReturnValue('{');
		expect(loadContentFilter().filterMode).toBe('blur');
		vi.mocked(localStorage.getItem).mockReturnValue(
			JSON.stringify({ keywords: ['tax'], filterMode: 'nope', filterScope: 'nope' }),
		);
		expect(loadContentFilter()).toEqual({
			keywords: ['tax'],
			filterMode: 'blur',
			filterScope: 'all',
			version: 1,
		});
	});

	it('defaults when window is missing', () => {
		vi.stubGlobal('window', undefined);
		try {
			expect(loadContentFilter()).toEqual({
				keywords: [],
				filterMode: 'blur',
				filterScope: 'all',
				version: 1,
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('sharedStoryInList', () => {
	const stories = [
		makeStory('first', { title: 'First', cluster_number: 7 }),
		makeStory('second', { title: 'Second', cluster_number: 3 }),
	];

	it('finds a story index inside the list and misses one past its end', () => {
		expect(sharedStoryInList(stories, { storyIndex: 1 })).toBe(true);
		expect(sharedStoryInList(stories, { storyIndex: 2 })).toBe(false);
		expect(sharedStoryInList([], { storyIndex: 0 })).toBe(false);
	});

	it('looks a cluster id up by cluster number, ahead of the index', () => {
		expect(sharedStoryInList(stories, { clusterId: 7 })).toBe(true);
		expect(sharedStoryInList(stories, { clusterId: 1 })).toBe(false);
		expect(sharedStoryInList(stories, { clusterId: 99, storyIndex: 0 })).toBe(false);
	});

	it('misses when the link names no story', () => {
		expect(sharedStoryInList(stories, { storyIndex: null, clusterId: null })).toBe(false);
		expect(SHARED_STORY_NOT_FOUND).toBe(
			"The shared story couldn't be found, so you're seeing the latest stories.",
		);
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
		expect(BRIEF_OFFICIAL_LABEL).toBe('Official statement');
	});

	it('isManualSeedStory and isTopicBriefStory', () => {
		expect(isManualSeedStory(makeStory('a', { informed_added_by_you: true }))).toBe(true);
		expect(isManualSeedStory(makeStory('a'))).toBe(false);
		expect(isTopicBriefStory(makeStory('a'))).toBe(true);
		expect(isTopicBriefStory(makeStory('a', { informed_article_id: '' }))).toBe(false);
		expect(isTopicBriefStory(makeStory('a', { informed_article_id: undefined }))).toBe(false);
		expect(BRIEF_ADDED_BY_YOU_LABEL).toBe('Added by you');
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
		expect(
			summaryLine(makeStory('a', { informed_summary_status: 'ok', short_summary: '  ' })),
		).toBeNull();
		expect(summaryLine(makeStory('a', { informed_summary_status: undefined }))).toBeNull();
	});

	it('fullStoryLine shows quiet copy for unavailable and nothing otherwise', () => {
		expect(fullStoryLine(makeStory('a', { informed_full_story_status: 'unavailable' }))).toEqual({
			kind: 'unavailable',
			text: BRIEF_FULL_STORY_UNAVAILABLE,
		});
		expect(fullStoryLine(makeStory('a', { informed_full_story_status: 'ok' }))).toBeNull();
		expect(fullStoryLine(makeStory('a', { informed_full_story_status: 'missing' }))).toBeNull();
		expect(fullStoryLine(makeStory('a', { informed_full_story_status: 'error' }))).toBeNull();
		expect(fullStoryLine(makeStory('a'))).toBeNull();
	});

	it('moreLabel and quietLine', () => {
		expect(moreLabel(4)).toBe('More (4)');
		expect(quietLine([])).toBeNull();
		expect(
			quietLine([
				{ id: '1', name: 'A', level: 'core' },
				{ id: '2', name: 'B', level: 'watch' },
			]),
		).toBe(`${BRIEF_QUIET_PREFIX} A, B`);
		expect(BRIEF_LESS_LABEL).toBe('Show fewer');
		expect(BRIEF_ALL_FILTERED).toBe('Your keyword filters hide every story in your Brief.');
		expect(BRIEF_STORIES_SECTION_TITLE).toBe('Your topics');
		expect(BRIEF_LEVEL_LABEL).toEqual({ core: 'Core', watch: 'Watch' });
		expect(TOPIC_BRIEF_CATEGORY_ID).toBe('world');
		expect(BRIEF_SUMMARY_LOADING).toBe('Loading summary…');
		expect(BRIEF_SUMMARY_LOGIN_HINT).toBe('Log in on Topics to load summaries');
		expect(BRIEF_SUMMARY_ERROR).toBe('Summary could not be loaded right now.');
		expect(BRIEF_FULL_STORY_LOADING).toBe('Loading full story…');
	});

	it('NEWS-215 shows an honest parse failure, not the generic or Ollama copy', () => {
		const copy = fullStoryErrorCopy(502, 'parse_failed');
		expect(copy).toBe(BRIEF_FULL_STORY_PARSE_ERROR);
		expect(copy).not.toBe(BRIEF_FULL_STORY_ERROR);
		expect(copy).not.toMatch(/ollama/i);
		expect(fullStoryErrorCopy(502, 'error')).toBe(BRIEF_FULL_STORY_ERROR);
	});

	it('keeps full story, source links, seen marks, and the refresh clock', async () => {
		const now = new Date('2026-11-07T15:00:00.000Z');
		expect(
			updatedLabel({ lastSuccess: { completedAt: '2026-11-07T14:55:00.000Z' }, nextAt: null }, now),
		).toBe('Updated 5 min ago');
		expect(updatedLabel(null, now)).toBe('Not refreshed yet');
		expect(nextRefreshLabel('2026-11-07T14:00:00.000Z', now)).toBe('Next refresh due now');
		expect(nextRefreshLabel(null, now)).toBeNull();

		expect(articleLinks(makeStory('a', { articles: [{ link: 'https://example.com/a', domain: 'example.com', title: 'Piece' }, { link: 'notaurl' }] }))).toEqual([
			{ href: 'https://example.com/a', label: 'example.com' },
		]);

		const story = makeStory('a', { informed_full_story_status: 'missing' });
		expect(shouldRequestFullStory(story)).toBe(true);
		expect(autoFullStoryRequestKeys(['only'], 1)).toEqual(['only']);
		expect(autoFullStoryRequestKeys(['a', 'b'], 2)).toEqual([]);
		// A second sequential open: one newly opened key, but another card is still open.
		expect(autoFullStoryRequestKeys(['b'], 2)).toEqual([]);
		const filled = applyFullStory(story, {
			status: 'ok',
			changeSummary: 'New outlets',
			timeline: [{ date: 'Monday', content: 'The vote' }],
			perspectives: [{ text: 'One view' }],
			quote: 'A line',
			quote_author: 'A person',
		});
		expect(filled.timeline?.[0]?.content).toBe('The vote');
		expect(filled.perspectives?.[0]?.text).toBe('One view');
		expect(filled.quote).toBe('A line');
		expect(filled.informed_full_story_updated).toBe('New outlets');
		expect(filled.informed_full_story_status).toBe('ok');

		const posted: string[][] = [];
		const pending: Array<() => void> = [];
		const batcher = createSeenBatcher({
			post: async (ids) => {
				posted.push(ids);
			},
			setTimer: (fn) => {
				pending.push(fn);
				return pending.length;
			},
			clearTimer: () => {},
		});
		batcher.add(['a', 'a']);
		batcher.add(['b']);
		expect(posted).toEqual([]);
		await batcher.flush();
		expect(posted).toEqual([['a', 'b']]);
		batcher.add(['a']);
		await batcher.flush();
		expect(posted).toEqual([['a', 'b']]);
	});

	it('reports a failed post through onError and does not retry those ids', async () => {
		const failed: string[][] = [];
		let calls = 0;
		const batcher = createSeenBatcher({
			post: async () => {
				calls += 1;
				throw new Error('500');
			},
			onError: (ids) => failed.push(ids),
			setTimer: () => 1,
			clearTimer: () => {},
		});
		batcher.add(['a']);
		await batcher.flush();
		batcher.add(['a']);
		await batcher.flush();
		expect(failed).toEqual([['a']]);
		expect(calls).toBe(1);
	});
});
