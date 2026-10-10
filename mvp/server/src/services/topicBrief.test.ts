import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article, StoreMeta } from '../types/article.js';
import type {
  BriefSeenStore,
  BriefSummariesStore,
  BriefSummaryRecord,
  RefreshMeta,
  RefreshRun,
} from '../types/brief.js';
import type { BriefFullStoryAutoSnapshot } from '../types/briefFullStory.js';
import type { Topic } from '../types/topic.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import { BRIEF_MAX_LINKS, SUMMARY_SOURCE_MAX_CHARS } from './briefConfig.js';
import {
  buildRefreshNotices,
  composeTopicBrief,
  isSignificantlyUpdated,
  markBriefSeen,
  summarySourceFor,
  type ComposeTopicBriefInput,
} from './topicBrief.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const HOURS_AGO = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const BOUNDARY = HOURS_AGO(2);

function makeTopic(id: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: id,
    sections: [],
    notes: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeArticle(id: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'rss',
    canonicalUrl: `https://cfp.example/${id}`,
    citations: [],
    publisherUrl: `https://${id}.example.com/story`,
    publisherDomain: `${id}.example.com`,
    handle: null,
    publishedAt: HOURS_AGO(1),
    snippet: '',
    bodyText: null,
    bodyStatus: 'unavailable',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: HOURS_AGO(1),
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

function kept(id: string, topicIds: string[], overrides: Partial<TriageRecord> = {}): TriageRecord {
  return {
    articleId: id,
    status: 'kept',
    reason: null,
    stage: 'headline',
    final: true,
    topicIds,
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: 1,
    significance: 1,
    bodyChecked: false,
    jevCalls: 1,
    triagedAt: HOURS_AGO(1),
    ...overrides,
  };
}

function duplicate(id: string, of: string): TriageRecord {
  return kept(id, [], {
    status: 'dropped',
    reason: 'duplicate',
    stage: 'dedupe',
    duplicateOf: of,
    outletCount: null,
    significance: null,
  });
}

function triageOf(...records: TriageRecord[]): TriageStore {
  return { records: Object.fromEntries(records.map((r) => [r.articleId, r])), updatedAt: null };
}

function run(startedAt: string): RefreshRun {
  return { trigger: 'manual', startedAt, completedAt: startedAt, ok: true, error: null };
}

const EMPTY_SEEN: BriefSeenStore = { seen: {}, updatedAt: null };
const EMPTY_SUMMARIES: BriefSummariesStore = { summaries: {}, updatedAt: null };
const REFRESH: RefreshMeta = { last: run(BOUNDARY), lastSuccess: run(BOUNDARY) };

function compose(overrides: Partial<ComposeTopicBriefInput>) {
  return composeTopicBrief({
    topics: [],
    muteRules: [],
    articles: [],
    triage: triageOf(),
    seen: EMPTY_SEEN,
    summaries: EMPTY_SUMMARIES,
    refresh: REFRESH,
    now: NOW,
    ...overrides,
  });
}

function sectionIds(brief: ReturnType<typeof compose>): Record<string, string[]> {
  return Object.fromEntries(
    brief.sections.map((s) => [s.topic.id, s.stories.map((story) => story.articleId)]),
  );
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function summaryRecord(articleId: string, overrides: Partial<BriefSummaryRecord> = {}) {
  return {
    articleId,
    status: 'ok',
    text: 'A neutral summary of the story.',
    sourceArticleId: articleId,
    sourceHash: null,
    model: 'm',
    error: null,
    generatedAt: HOURS_AGO(1),
    trigger: 'refresh',
    ...overrides,
  } satisfies BriefSummaryRecord;
}

test('sections: Core before Watch in topics-store order; undesired topics never form sections', () => {
  const topics = [
    makeTopic('w1', { level: 'watch' }),
    makeTopic('c1'),
    makeTopic('u1', { kind: 'undesired', level: null }),
    makeTopic('w2', { level: 'watch' }),
    makeTopic('c2'),
  ];
  const ids = ['w1', 'c1', 'w2', 'c2', 'u1'];
  const brief = compose({
    topics,
    articles: ids.map((id) => makeArticle(`a-${id}`)),
    triage: triageOf(...ids.map((id) => kept(`a-${id}`, [id]))),
  });
  assert.deepEqual(
    brief.sections.map((s) => [s.topic.id, s.topic.level]),
    [
      ['c1', 'core'],
      ['c2', 'core'],
      ['w1', 'watch'],
      ['w2', 'watch'],
    ],
  );
  assert.equal(brief.sections[0]!.topic.name, 'C1');
});

test('a story appears once, under its first desired topic in section order', () => {
  const topics = [makeTopic('w1', { level: 'watch' }), makeTopic('c1'), makeTopic('c2')];
  const brief = compose({
    topics,
    articles: [makeArticle('a1')],
    triage: triageOf(kept('a1', ['w1', 'c2', 'c1'])),
  });
  assert.deepEqual(sectionIds(brief), { c1: ['a1'] });
  assert.equal(brief.sections[0]!.stories[0]!.topicId, 'c1');
});

test('deleted or undesired topics are ignored; records with no desired topic are not shown', () => {
  const topics = [makeTopic('c1'), makeTopic('u1', { kind: 'undesired' })];
  const brief = compose({
    topics,
    articles: [makeArticle('a1'), makeArticle('a2'), makeArticle('a3')],
    triage: triageOf(
      kept('a1', ['gone', 'c1']),
      kept('a2', ['gone']),
      kept('a3', ['u1']),
    ),
  });
  assert.deepEqual(sectionIds(brief), { c1: ['a1'] });
});

test('only kept records with an in-window article are shown', () => {
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: [
      makeArticle('fresh'),
      makeArticle('old', { publishedAt: HOURS_AGO(49) }),
      makeArticle('fetched', { publishedAt: null, fetchedAt: HOURS_AGO(3) }),
      makeArticle('dropped'),
    ],
    triage: triageOf(
      kept('fresh', ['c1']),
      kept('old', ['c1']),
      kept('fetched', ['c1']),
      kept('missing', ['c1']),
      duplicate('dropped', 'fresh'),
    ),
  });
  assert.deepEqual(sectionIds(brief), { c1: ['fresh', 'fetched'] });
});

test('newly muted stories are hidden (mute rule and undesired keyword)', () => {
  const muteRules: MuteRule[] = [
    { id: 'm1', keyword: 'celebrity', source: null, createdAt: '2026-09-01T00:00:00.000Z' },
  ];
  const topics = [
    makeTopic('c1'),
    makeTopic('u1', { kind: 'undesired', level: null, name: 'Sports', keywords: ['football'] }),
  ];
  const brief = compose({
    topics,
    muteRules,
    articles: [
      makeArticle('a1', { title: 'Celebrity attends summit' }),
      makeArticle('a2', { title: 'Football match postponed' }),
      makeArticle('a3', { title: 'Council passes budget' }),
    ],
    triage: triageOf(kept('a1', ['c1']), kept('a2', ['c1']), kept('a3', ['c1'])),
  });
  assert.deepEqual(sectionIds(brief), { c1: ['a3'] });
});

test('seen hiding: before boundary hidden, after boundary visible, significant update re-shows', () => {
  const seen: BriefSeenStore = {
    seen: {
      before: { seenAt: HOURS_AGO(3), outletCount: 1, significance: 1 },
      after: { seenAt: HOURS_AGO(1), outletCount: 1, significance: 1 },
      outlets: { seenAt: HOURS_AGO(3), outletCount: 2, significance: 1 },
      sig: { seenAt: HOURS_AGO(3), outletCount: 1, significance: 1.3 },
      small: { seenAt: HOURS_AGO(3), outletCount: 2, significance: 1.3 },
    },
    updatedAt: null,
  };
  const ids = ['before', 'after', 'outlets', 'sig', 'small'];
  const brief = compose({
    topics: [makeTopic('c1')],
    seen,
    articles: ids.map((id) => makeArticle(id)),
    triage: triageOf(
      kept('before', ['c1']),
      kept('after', ['c1']),
      kept('outlets', ['c1'], { outletCount: 4 }),
      kept('sig', ['c1'], { significance: 1.8 }),
      kept('small', ['c1'], { outletCount: 3, significance: 1.7 }),
    ),
  });
  assert.equal(brief.boundaryAt, BOUNDARY);
  assert.deepEqual(new Set(sectionIds(brief).c1), new Set(['after', 'outlets', 'sig']));
});

test('no successful refresh (or boundaryAt: null) → nothing hidden as seen', () => {
  const seen: BriefSeenStore = {
    seen: { a1: { seenAt: HOURS_AGO(30), outletCount: 1, significance: 1 } },
    updatedAt: null,
  };
  const base = {
    topics: [makeTopic('c1')],
    seen,
    articles: [makeArticle('a1')],
    triage: triageOf(kept('a1', ['c1'])),
  };
  const noSuccess = compose({ ...base, refresh: { last: null, lastSuccess: null } });
  assert.equal(noSuccess.boundaryAt, null);
  assert.deepEqual(sectionIds(noSuccess), { c1: ['a1'] });
  assert.deepEqual(sectionIds(compose({ ...base, refresh: null })), { c1: ['a1'] });
  assert.deepEqual(sectionIds(compose({ ...base, boundaryAt: null })), { c1: ['a1'] });
  assert.deepEqual(sectionIds(compose(base)), {});
  assert.deepEqual(sectionIds(compose({ ...base, boundaryAt: HOURS_AGO(40) })), { c1: ['a1'] });
});

test('isSignificantlyUpdated thresholds', () => {
  const entry = { seenAt: HOURS_AGO(3), outletCount: 2, significance: 1.2 };
  assert.equal(isSignificantlyUpdated(kept('a', [], { outletCount: 4, significance: 1.2 }), entry), true);
  assert.equal(isSignificantlyUpdated(kept('a', [], { outletCount: 3, significance: 1.7 }), entry), true);
  assert.equal(isSignificantlyUpdated(kept('a', [], { outletCount: 3, significance: 1.6 }), entry), false);
  assert.equal(
    isSignificantlyUpdated(kept('a', [], { outletCount: 3, significance: null }), entry),
    false,
  );
  assert.equal(
    isSignificantlyUpdated(kept('a', [], { outletCount: 3, significance: 1 }), {
      ...entry,
      outletCount: null,
    }),
    true,
  );
});

test('isSignificantlyUpdated accepts a Brief story against a full-story auto snapshot', () => {
  const snapshot: BriefFullStoryAutoSnapshot = { outletCount: 3, significance: 1.2 };
  const story = (outletCount: number, significance: number) => {
    const brief = compose({
      topics: [makeTopic('c1')],
      articles: [makeArticle('a')],
      triage: triageOf(kept('a', ['c1'], { outletCount, significance })),
    });
    return brief.sections[0]!.stories[0]!;
  };
  assert.equal(isSignificantlyUpdated(story(5, 1.2), snapshot), true);
  assert.equal(isSignificantlyUpdated(story(4, 1.2), snapshot), false);
});

test('ranking: significance desc (null last), outlets desc (null as 1), newer, then id', () => {
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: [
      makeArticle('nullsig'),
      makeArticle('top', { publishedAt: HOURS_AGO(10) }),
      makeArticle('wide'),
      makeArticle('older', { publishedAt: HOURS_AGO(5) }),
      makeArticle('b-newer', { publishedAt: HOURS_AGO(2) }),
      makeArticle('a-newer', { publishedAt: HOURS_AGO(2) }),
      makeArticle('nullout', { publishedAt: HOURS_AGO(1) }),
    ],
    triage: triageOf(
      kept('nullsig', ['c1'], { significance: null, outletCount: 9 }),
      kept('top', ['c1'], { significance: 1.9 }),
      kept('wide', ['c1'], { significance: 1.5, outletCount: 3 }),
      kept('older', ['c1'], { significance: 1.5, outletCount: 1 }),
      kept('b-newer', ['c1'], { significance: 1.5, outletCount: 1 }),
      kept('a-newer', ['c1'], { significance: 1.5, outletCount: 1 }),
      kept('nullout', ['c1'], { significance: 1.5, outletCount: null }),
    ),
  });
  assert.deepEqual(sectionIds(brief).c1, [
    'top',
    'wide',
    'nullout',
    'a-newer',
    'b-newer',
    'older',
    'nullsig',
  ]);
  const nullout = brief.sections[0]!.stories.find((s) => s.articleId === 'nullout')!;
  assert.equal(nullout.outletCount, 1);
});

test('`more` is set after the top 3; ranks are 1-based', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: ids.map((id) => makeArticle(id)),
    triage: triageOf(...ids.map((id, i) => kept(id, ['c1'], { significance: 2 - i * 0.1 }))),
  });
  const stories = brief.sections[0]!.stories;
  assert.deepEqual(
    stories.map((s) => [s.articleId, s.rank, s.more]),
    [
      ['a', 1, false],
      ['b', 2, false],
      ['c', 3, false],
      ['d', 4, true],
      ['e', 5, true],
    ],
  );
});

function seed(id: string, savedHoursAgo: number): Article {
  return makeArticle(id, {
    sourceKind: 'manual',
    publishedAt: null,
    fetchedAt: HOURS_AGO(savedHoursAgo),
  });
}

const seedRecord = (id: string, topicIds: string[]) =>
  kept(id, topicIds, { stage: 'manual', significance: null, jevCalls: 0 });

test('seeds pin first in their section, newest first; only seeds are manualSeed', () => {
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: [makeArticle('top'), seed('seed-old', 5), seed('seed-new', 2)],
    triage: triageOf(
      kept('top', ['c1'], { significance: 2.0, outletCount: 5 }),
      seedRecord('seed-old', ['c1']),
      seedRecord('seed-new', ['c1']),
    ),
  });
  const stories = brief.sections[0]!.stories;
  assert.deepEqual(
    stories.map((s) => [s.articleId, s.manualSeed]),
    [
      ['seed-new', true],
      ['seed-old', true],
      ['top', false],
    ],
  );
});

test('seeds count toward BRIEF_TOP_N: `more` shifts down', () => {
  const ids = ['a', 'b', 'c'];
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: [...ids.map((id) => makeArticle(id)), seed('s', 1)],
    triage: triageOf(
      ...ids.map((id, i) => kept(id, ['c1'], { significance: 2 - i * 0.1 })),
      seedRecord('s', ['c1']),
    ),
  });
  assert.deepEqual(
    brief.sections[0]!.stories.map((s) => [s.articleId, s.rank, s.more]),
    [
      ['s', 1, false],
      ['a', 2, false],
      ['b', 3, false],
      ['c', 4, true],
    ],
  );
});

test('quiet line: desired topics with no visible story, Core first then Watch', () => {
  const topics = [
    makeTopic('w1', { level: 'watch' }),
    makeTopic('c1'),
    makeTopic('c2'),
    makeTopic('w2', { level: 'watch' }),
    makeTopic('u1', { kind: 'undesired' }),
  ];
  const brief = compose({
    topics,
    articles: [makeArticle('a1')],
    triage: triageOf(kept('a1', ['c2'])),
  });
  assert.deepEqual(
    brief.quiet.map((t) => [t.id, t.level]),
    [
      ['c1', 'core'],
      ['w1', 'watch'],
      ['w2', 'watch'],
    ],
  );
});

test('story fields: link, domain, labels, image, outletCount', () => {
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: [
      makeArticle('a1', {
        publisherUrl: null,
        publisherDomain: null,
        canonicalUrl: 'https://www.cfp.example/item/1',
        imageUrl: 'https://img.example/1.jpg',
        imageCaption: 'cap',
        imageCredit: 'credit',
      }),
    ],
    triage: triageOf(kept('a1', ['c1'], { labels: ['official'], outletCount: 3 })),
  });
  const story = brief.sections[0]!.stories[0]!;
  assert.equal(story.link, 'https://www.cfp.example/item/1');
  assert.equal(story.domain, 'cfp.example');
  assert.equal(story.publisherDomain, null);
  assert.deepEqual(story.labels, ['official']);
  assert.equal(story.outletCount, 3);
  assert.equal(story.title, 'Headline a1');
  assert.deepEqual(
    [story.imageUrl, story.imageCaption, story.imageCredit],
    ['https://img.example/1.jpg', 'cap', 'credit'],
  );
});

test('story publisherDomain: kept article publisherDomain, normalized', () => {
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: [makeArticle('a1', { publisherDomain: ' WWW.News.Example.com ' })],
    triage: triageOf(kept('a1', ['c1'])),
  });
  assert.equal(brief.sections[0]!.stories[0]!.publisherDomain, 'news.example.com');
});

test('links: kept article first, duplicate members in memberIds order, distinct domains, capped', () => {
  const memberIds = ['m-same', 'm-notdup', 'm-gone', ...Array.from({ length: 10 }, (_, i) => `m${i}`)];
  const articles = [
    makeArticle('k'),
    makeArticle('m-same', { publisherDomain: 'k.example.com' }),
    makeArticle('m-notdup'),
    ...Array.from({ length: 10 }, (_, i) => makeArticle(`m${i}`)),
  ];
  const brief = compose({
    topics: [makeTopic('c1')],
    articles,
    triage: triageOf(
      kept('k', ['c1'], { memberIds }),
      duplicate('m-same', 'k'),
      kept('m-notdup', []),
      ...Array.from({ length: 10 }, (_, i) => duplicate(`m${i}`, 'k')),
    ),
  });
  const links = brief.sections[0]!.stories[0]!.links;
  assert.equal(links.length, BRIEF_MAX_LINKS);
  assert.deepEqual(
    links.map((l) => l.domain),
    ['k.example.com', ...Array.from({ length: BRIEF_MAX_LINKS - 1 }, (_, i) => `m${i}.example.com`)],
  );
  assert.deepEqual(links[0], {
    title: 'Headline k',
    url: 'https://k.example.com/story',
    domain: 'k.example.com',
    publishedAt: HOURS_AGO(1),
    fetchedAt: HOURS_AGO(1),
  });
});

test('links: a leading www. on publisherDomain is stripped, so www.x.com and x.com dedupe', () => {
  const brief = compose({
    topics: [makeTopic('c1')],
    articles: [
      makeArticle('k', { publisherDomain: 'www.outlet.example' }),
      makeArticle('m1', { publisherDomain: 'outlet.example' }),
      makeArticle('m2', { publisherDomain: 'www.other.example' }),
    ],
    triage: triageOf(
      kept('k', ['c1'], { memberIds: ['m1', 'm2'] }),
      duplicate('m1', 'k'),
      duplicate('m2', 'k'),
    ),
  });
  const story = brief.sections[0]!.stories[0]!;
  assert.equal(story.domain, 'outlet.example');
  assert.deepEqual(
    story.links.map((l) => [l.domain, l.url]),
    [
      ['outlet.example', 'https://k.example.com/story'],
      ['other.example', 'https://m2.example.com/story'],
    ],
  );
});

test('summary source chain: kept body → duplicate member body → post snippet ≥120 → none', () => {
  const longPost = 'p'.repeat(120);
  const articles = new Map(
    [
      makeArticle('k-body', { bodyStatus: 'ok', bodyText: '  Kept body text.  ' }),
      makeArticle('k-nobody', { bodyStatus: 'blocked' }),
      makeArticle('m-skip', { bodyStatus: 'ok', bodyText: 'Not a duplicate.' }),
      makeArticle('m-empty', { bodyStatus: 'ok', bodyText: '   ' }),
      makeArticle('m-body', { bodyStatus: 'ok', bodyText: 'Member body.' }),
      makeArticle('m-later', { bodyStatus: 'ok', bodyText: 'Later member body.' }),
      makeArticle('post', { bodyStatus: 'not_applicable', snippet: longPost }),
      makeArticle('short-post', { bodyStatus: 'not_applicable', snippet: 'p'.repeat(119) }),
      makeArticle('scrape-fail', { bodyStatus: 'unavailable', snippet: longPost }),
    ].map((a) => [a.id, a]),
  );
  const triage = triageOf(
    kept('m-skip', []),
    duplicate('m-empty', 'k-nobody'),
    duplicate('m-body', 'k-nobody'),
    duplicate('m-later', 'k-nobody'),
  );

  const own = summarySourceFor(kept('k-body', [], { memberIds: ['m-body'] }), articles, triage);
  assert.deepEqual(own, {
    sourceArticleId: 'k-body',
    text: 'Headline k-body\n\nKept body text.',
    hash: hash('Headline k-body\n\nKept body text.'),
  });
  assert.match(own!.hash, /^[0-9a-f]{16}$/);

  const member = summarySourceFor(
    kept('k-nobody', [], { memberIds: ['m-skip', 'm-empty', 'm-body', 'm-later'] }),
    articles,
    triage,
  );
  assert.equal(member?.sourceArticleId, 'm-body');
  assert.equal(member?.text, 'Headline m-body\n\nMember body.');

  const post = summarySourceFor(kept('post', []), articles, triage);
  assert.equal(post?.sourceArticleId, 'post');
  assert.equal(post?.text, `Headline post\n\n${longPost}`);

  assert.equal(summarySourceFor(kept('short-post', []), articles, triage), null);
  assert.equal(summarySourceFor(kept('scrape-fail', []), articles, triage), null);
  assert.equal(summarySourceFor(kept('gone', []), articles, triage), null);
});

test('summary source text is truncated to SUMMARY_SOURCE_MAX_CHARS and prefixed by the title', () => {
  const articles = new Map([
    ['a1', makeArticle('a1', { bodyStatus: 'ok', bodyText: 'x'.repeat(5000) })],
  ]);
  const source = summarySourceFor(kept('a1', []), articles, triageOf());
  assert.equal(source?.text, `Headline a1\n\n${'x'.repeat(SUMMARY_SOURCE_MAX_CHARS)}`);
});

test('story summary: ok with matching hash, missing when stale / error / null text, unavailable without source', () => {
  const body = { bodyStatus: 'ok' as const, bodyText: 'Body.' };
  const ids = ['fresh', 'stale', 'errored', 'nulltext', 'none', 'nobody'];
  const articles = [
    ...ids.slice(0, 5).map((id) => makeArticle(id, body)),
    makeArticle('nobody'),
  ];
  const sourceHash = (id: string) => hash(`Headline ${id}\n\nBody.`);
  const summaries: BriefSummariesStore = {
    summaries: {
      fresh: summaryRecord('fresh', { sourceHash: sourceHash('fresh') }),
      stale: summaryRecord('stale', { sourceHash: 'deadbeefdeadbeef' }),
      errored: summaryRecord('errored', {
        status: 'error',
        text: null,
        error: 'boom',
        sourceHash: sourceHash('errored'),
      }),
      nulltext: summaryRecord('nulltext', { text: null, sourceHash: sourceHash('nulltext') }),
      nobody: summaryRecord('nobody', { sourceHash: 'deadbeefdeadbeef' }),
    },
    updatedAt: null,
  };
  const brief = compose({
    topics: [makeTopic('c1')],
    articles,
    summaries,
    triage: triageOf(...ids.map((id) => kept(id, ['c1']))),
  });
  const byId = Object.fromEntries(brief.sections[0]!.stories.map((s) => [s.articleId, s.summary]));
  assert.deepEqual(byId, {
    fresh: { status: 'ok', text: 'A neutral summary of the story.' },
    stale: { status: 'missing', text: null },
    errored: { status: 'missing', text: null },
    nulltext: { status: 'missing', text: null },
    none: { status: 'missing', text: null },
    nobody: { status: 'unavailable', text: null },
  });
});

function providerStatus(state: 'ok' | 'partial' | 'down' | 'disabled') {
  return { state, topicsAttempted: 1, topicsFailed: 0, items: 0, errors: [] };
}

test('buildRefreshNotices: one notice per source', () => {
  assert.deepEqual(buildRefreshNotices({ lastFetchAt: null, lastError: null }), []);

  const meta: StoreMeta = {
    lastFetchAt: null,
    lastError: null,
    topicSearch: {
      at: NOW.toISOString(),
      providers: { searxng: providerStatus('down'), google_news: providerStatus('partial') },
    },
    triage: {
      at: NOW.toISOString(),
      skipped: false,
      candidates: 10,
      kept: 1,
      dropped: 9,
      byReason: { not_scored_budget: 4 },
      jev: { budget: 1, used: 1, errors: 0 },
      summaryBudget: 60,
      errors: ['TypeSafe not configured'],
    },
    brief: {
      at: NOW.toISOString(),
      summaries: {
        budget: 60,
        used: 0,
        generated: 0,
        reused: 0,
        unavailable: 0,
        errors: ['Ollama not configured'],
      },
    },
    refresh: {
      last: { ...run(BOUNDARY), ok: false, error: 'CFP feed 503' },
      lastSuccess: null,
    },
  };
  assert.deepEqual(buildRefreshNotices(meta), [
    'SearXNG unavailable',
    'Google News partly failed',
    'Story scoring unavailable (TypeSafe not configured)',
    '4 stories not scored (budget)',
    'Summaries unavailable (Ollama not configured)',
    'Last refresh failed: CFP feed 503',
  ]);

  const quiet: StoreMeta = {
    ...meta,
    topicSearch: {
      at: NOW.toISOString(),
      providers: { searxng: providerStatus('partial'), google_news: providerStatus('down') },
    },
    triage: { ...meta.triage!, byReason: { not_scored_budget: 1 }, errors: [] },
    brief: { ...meta.brief!, summaries: { ...meta.brief!.summaries, errors: [] } },
    refresh: { last: run(BOUNDARY), lastSuccess: run(BOUNDARY) },
  };
  assert.deepEqual(buildRefreshNotices(quiet), [
    'SearXNG partly failed',
    'Google News unavailable',
    '1 story not scored (budget)',
  ]);

  const disabled: StoreMeta = {
    lastFetchAt: null,
    lastError: null,
    topicSearch: {
      at: NOW.toISOString(),
      providers: { searxng: providerStatus('disabled'), google_news: providerStatus('ok') },
    },
  };
  assert.deepEqual(buildRefreshNotices(disabled), []);
});

test('markBriefSeen snapshots kept records, ignores unknown ids, prunes old and no-longer-kept entries', () => {
  const DAYS_AGO = (d: number) => HOURS_AGO(d * 24);
  const seen: BriefSeenStore = {
    seen: {
      recent: { seenAt: DAYS_AGO(6), outletCount: 1, significance: 1 },
      old: { seenAt: DAYS_AGO(8), outletCount: 1, significance: 1 },
      dropped: { seenAt: DAYS_AGO(1), outletCount: 1, significance: 1 },
      gone: { seenAt: DAYS_AGO(1), outletCount: 1, significance: 1 },
      reread: { seenAt: DAYS_AGO(3), outletCount: 1, significance: 0.5 },
    },
    updatedAt: DAYS_AGO(1),
  };
  const triage = triageOf(
    kept('recent', ['c1']),
    kept('old', ['c1']),
    duplicate('dropped', 'recent'),
    kept('reread', ['c1'], { outletCount: 4, significance: 1.5 }),
    kept('fresh', ['c1'], { outletCount: null, significance: null }),
  );

  const { store, recorded } = markBriefSeen({
    seen,
    triage,
    articleIds: ['fresh', 'reread', 'unknown', 'dropped', 'fresh'],
    now: NOW,
  });

  assert.equal(recorded, 2);
  assert.equal(store.updatedAt, NOW.toISOString());
  assert.deepEqual(store.seen, {
    recent: seen.seen.recent,
    reread: { seenAt: NOW.toISOString(), outletCount: 4, significance: 1.5 },
    fresh: { seenAt: NOW.toISOString(), outletCount: null, significance: null },
  });
  assert.equal(seen.seen.old !== undefined, true, 'input store is not mutated');
});
