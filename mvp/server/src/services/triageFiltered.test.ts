import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import type { TriageRecord, TriageRunMeta, TriageStore } from '../types/triage.js';
import {
  buildFilteredOut,
  FILTERED_REASON_GROUPS,
  parseFilteredOutScope,
  REMOVED_MUTE_LABEL,
} from './triageFiltered.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const RUN_AT = hoursAgo(1);

function run(over: Partial<TriageRunMeta> = {}): TriageRunMeta {
  return {
    at: RUN_AT,
    skipped: false,
    candidates: 3,
    kept: 1,
    dropped: 2,
    byReason: { off_topic: 2 },
    jev: { budget: 300, used: 0, errors: 0 },
    summaryBudget: 60,
    errors: [],
    ...over,
  };
}

function topic(id: string, over: Partial<Topic> = {}): Topic {
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
    createdAt: hoursAgo(100),
    updatedAt: hoursAgo(100),
    ...over,
  };
}

function article(id: string, over: Partial<Article> = {}): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'rss',
    canonicalUrl: `https://cfp.example/${id}`,
    citations: [],
    publisherUrl: `https://${id}.example.com/story`,
    publisherDomain: `${id}.example.com`,
    handle: null,
    publishedAt: hoursAgo(2),
    snippet: '',
    bodyText: null,
    bodyStatus: 'unavailable',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: hoursAgo(2),
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...over,
  };
}

function dropped(articleId: string, over: Partial<TriageRecord> = {}): TriageRecord {
  return {
    articleId,
    status: 'dropped',
    reason: 'off_topic',
    stage: 'keyword',
    final: true,
    topicIds: [],
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: null,
    significance: null,
    bodyChecked: false,
    jevCalls: 0,
    triagedAt: RUN_AT,
    ...over,
  };
}

function storeOf(records: TriageRecord[]): TriageStore {
  return { records: Object.fromEntries(records.map((r) => [r.articleId, r])), updatedAt: null };
}

function build(opts: {
  records: TriageRecord[];
  articles?: Article[];
  topics?: Topic[];
  muteRules?: MuteRule[];
  run?: TriageRunMeta | null;
  scope?: 'last' | 'window';
}) {
  const records = opts.records;
  return buildFilteredOut({
    store: storeOf(records),
    articles: opts.articles ?? records.map((r) => article(r.articleId)),
    topics: opts.topics ?? [],
    muteRules: opts.muteRules ?? [],
    run: opts.run === undefined ? run() : opts.run,
    scope: opts.scope ?? 'last',
    now: NOW,
  });
}

const ids = (out: ReturnType<typeof buildFilteredOut>) => out.items.map((i) => i.articleId);

test('scope last: only dropped records from the last run; kept and older records excluded', () => {
  const out = build({
    records: [
      dropped('now1'),
      dropped('now2', { reason: 'clickbait', stage: 'headline' }),
      { ...dropped('kept'), status: 'kept', reason: null },
      dropped('older', { triagedAt: hoursAgo(5) }),
    ],
  });
  assert.equal(out.scope, 'last');
  assert.deepEqual(out.run, run());
  assert.deepEqual(ids(out), ['now1', 'now2']);
  assert.deepEqual(out.counts, { off_topic: 1, clickbait: 1 });
});

test('scope window: dropped records within 48h (boundary inclusive), any run', () => {
  const out = build({
    scope: 'window',
    records: [
      dropped('now'),
      dropped('older', { triagedAt: hoursAgo(5) }),
      dropped('edge', { triagedAt: hoursAgo(48) }),
      dropped('stale', { triagedAt: new Date(NOW.getTime() - 48 * 3_600_000 - 1).toISOString() }),
      dropped('bad', { triagedAt: 'not a date' }),
    ],
  });
  assert.equal(out.scope, 'window');
  assert.deepEqual(ids(out).sort(), ['edge', 'now', 'older']);
  assert.deepEqual(out.counts, { off_topic: 3 });
});

test('run null: scope last returns no items; scope window still lists', () => {
  const records = [dropped('a', { triagedAt: hoursAgo(3) })];
  const last = build({ records, run: null });
  assert.equal(last.run, null);
  assert.deepEqual(last.items, []);
  assert.deepEqual(last.counts, {});
  assert.deepEqual(ids(build({ records, run: null, scope: 'window' })), ['a']);
});

test('skipped run: scope last shows only records written at that run (none from earlier runs)', () => {
  const skipped = run({ skipped: true, candidates: 0, kept: 0, dropped: 0, byReason: {} });
  const records = [dropped('earlier', { triagedAt: hoursAgo(4) })];
  const last = build({ records, run: skipped });
  assert.deepEqual(last.run, skipped);
  assert.deepEqual(last.items, []);
  assert.deepEqual(ids(build({ records, run: skipped, scope: 'window' })), ['earlier']);
});

test('every reason group appears in display order with matching counts', () => {
  const reasons = [
    'not_scored_error',
    'not_scored_budget',
    'stale',
    'undated',
    'duplicate',
    'not_significant',
    'sponsored',
    'rewrite',
    'opinion',
    'clickbait',
    'off_topic',
    'muted:r1',
  ] as const;
  const out = build({
    records: reasons.map((reason, i) => dropped(`a${i}`, { reason })),
    muteRules: [{ id: 'r1', keyword: 'celebrity', source: null, createdAt: hoursAgo(10) }],
  });
  assert.deepEqual(
    out.items.map((i) => i.group),
    [...FILTERED_REASON_GROUPS],
  );
  assert.deepEqual(
    out.items.map((i) => i.reason),
    [...reasons].reverse(),
  );
  assert.deepEqual(
    out.counts,
    Object.fromEntries(FILTERED_REASON_GROUPS.map((g) => [g, 1])),
  );
});

test('mutedBy: rule (with and without source), topic, and removed id', () => {
  const out = build({
    records: [
      dropped('rule', { reason: 'muted:r1' }),
      dropped('ruleSrc', { reason: 'muted:r2' }),
      dropped('topic', { reason: 'muted:u1', stage: 'headline' }),
      dropped('gone', { reason: 'muted:zzz' }),
      dropped('plain'),
    ],
    muteRules: [
      { id: 'r1', keyword: 'celebrity', source: null, createdAt: hoursAgo(10) },
      { id: 'r2', keyword: 'crypto', source: 'X', createdAt: hoursAgo(10) },
    ],
    topics: [topic('u1', { name: 'Sports', kind: 'undesired' })],
  });
  const byId = new Map(out.items.map((i) => [i.articleId, i]));
  assert.deepEqual(byId.get('rule')!.mutedBy, { kind: 'rule', id: 'r1', label: 'celebrity' });
  assert.deepEqual(byId.get('ruleSrc')!.mutedBy, { kind: 'rule', id: 'r2', label: 'crypto (X)' });
  assert.deepEqual(byId.get('topic')!.mutedBy, { kind: 'topic', id: 'u1', label: 'Sports' });
  assert.deepEqual(byId.get('gone')!.mutedBy, {
    kind: 'topic',
    id: 'zzz',
    label: REMOVED_MUTE_LABEL,
  });
  assert.equal(REMOVED_MUTE_LABEL, 'Removed rule or topic');
  assert.equal(byId.get('plain')!.mutedBy, null);
  assert.deepEqual(out.counts, { muted: 4, off_topic: 1 });
});

test('non-final records carry final false and their stage', () => {
  const out = build({
    records: [
      dropped('budget', { reason: 'not_scored_budget', stage: 'budget', final: false }),
      dropped('err', { reason: 'not_scored_error', stage: 'headline', final: false }),
    ],
  });
  assert.deepEqual(
    out.items.map((i) => [i.articleId, i.final, i.stage]),
    [
      ['budget', false, 'budget'],
      ['err', false, 'headline'],
    ],
  );
});

test('duplicateOf joins the kept article title and url; gone kept article → nulls', () => {
  const out = build({
    records: [
      dropped('dup1', { reason: 'duplicate', stage: 'dedupe', duplicateOf: 'keeper' }),
      dropped('dup2', { reason: 'duplicate', stage: 'dedupe', duplicateOf: 'vanished' }),
    ],
    articles: [
      article('dup1', { publishedAt: hoursAgo(1) }),
      article('dup2', { publishedAt: hoursAgo(2) }),
      article('keeper', { title: 'Original story', publisherUrl: null }),
    ],
  });
  assert.deepEqual(out.items[0]!.duplicateOf, {
    articleId: 'keeper',
    title: 'Original story',
    url: 'https://cfp.example/keeper',
  });
  assert.deepEqual(out.items[1]!.duplicateOf, { articleId: 'vanished', title: null, url: null });
});

test('article fields joined; url prefers publisherUrl; gone article → null fields', () => {
  const out = build({
    records: [dropped('here'), dropped('cfpOnly'), dropped('gone')],
    articles: [
      article('here', { sourceKind: 'search', publishedAt: hoursAgo(1) }),
      article('cfpOnly', { publisherUrl: null, publishedAt: hoursAgo(2) }),
    ],
  });
  const [here, cfpOnly, gone] = out.items;
  assert.deepEqual(here, {
    articleId: 'here',
    title: 'Headline here',
    url: 'https://here.example.com/story',
    publisherDomain: 'here.example.com',
    publishedAt: hoursAgo(1),
    sourceKind: 'search',
    reason: 'off_topic',
    group: 'off_topic',
    final: true,
    stage: 'keyword',
    mutedBy: null,
    topics: [],
    duplicateOf: null,
    triagedAt: RUN_AT,
  });
  assert.equal(cfpOnly!.url, 'https://cfp.example/cfpOnly');
  assert.equal(gone!.articleId, 'gone');
  assert.equal(gone!.title, null);
  assert.equal(gone!.url, null);
  assert.equal(gone!.publisherDomain, null);
  assert.equal(gone!.publishedAt, null);
  assert.equal(gone!.sourceKind, null);
});

test('sort: group order, then publishedAt newest first (null last), then articleId', () => {
  const out = build({
    records: [
      dropped('c-old'),
      dropped('b-null'),
      dropped('a-null'),
      dropped('d-new'),
      dropped('e-same'),
      dropped('f-same'),
      dropped('m', { reason: 'muted:r1' }),
    ],
    articles: [
      article('c-old', { publishedAt: hoursAgo(10) }),
      article('b-null', { publishedAt: null }),
      article('a-null', { publishedAt: null }),
      article('d-new', { publishedAt: hoursAgo(1) }),
      article('f-same', { publishedAt: hoursAgo(5) }),
      article('e-same', { publishedAt: hoursAgo(5) }),
      article('m', { publishedAt: hoursAgo(20) }),
    ],
  });
  assert.deepEqual(ids(out), ['m', 'd-new', 'e-same', 'f-same', 'c-old', 'a-null', 'b-null']);
});

test('topics: record topic ids that still exist, in topic store order', () => {
  const out = build({
    records: [dropped('a', { topicIds: ['t2', 'deleted', 't1'] })],
    topics: [topic('t1', { name: 'Iran' }), topic('t2', { name: 'Tariffs' }), topic('t3')],
  });
  assert.deepEqual(out.items[0]!.topics, [
    { id: 't1', name: 'Iran' },
    { id: 't2', name: 'Tariffs' },
  ]);
});

test('no cap: every matching record is returned', () => {
  const records = Array.from({ length: 750 }, (_, i) => dropped(`r${i}`));
  assert.equal(build({ records }).items.length, 750);
});

test('parseFilteredOutScope: window, else last', () => {
  assert.equal(parseFilteredOutScope('window'), 'window');
  assert.equal(parseFilteredOutScope('last'), 'last');
  assert.equal(parseFilteredOutScope(undefined), 'last');
  assert.equal(parseFilteredOutScope('bogus'), 'last');
  assert.equal(parseFilteredOutScope(['window']), 'last');
});
