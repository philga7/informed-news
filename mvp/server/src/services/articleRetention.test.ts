import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { EvidenceLink } from '../types/claim.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import { pruneArticleStore, type ArticleRetentionDeps } from './articleRetention.js';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const HOURS_AGO = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const DAYS_AGO = (d: number) => HOURS_AGO(d * 24);

function article(
  id: string,
  times: { publishedAt?: string | null; fetchedAt: string },
): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'search',
    sourceTier: 'sensor',
    canonicalUrl: `https://example.com/${id}`,
    citations: [],
    publisherUrl: null,
    publisherDomain: null,
    handle: null,
    publishedAt: times.publishedAt ?? null,
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: times.fetchedAt,
    classification: null,
    classifiedAt: null,
    classifyError: null,
  };
}

function triageRecord(articleId: string, overrides: Partial<TriageRecord> = {}): TriageRecord {
  return {
    articleId,
    status: 'kept',
    reason: null,
    stage: 'headline',
    final: true,
    topicIds: ['t1'],
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: 1,
    significance: 1,
    bodyChecked: true,
    jevCalls: 1,
    triagedAt: DAYS_AGO(1),
    ...overrides,
  };
}

type Harness = { deps: ArticleRetentionDeps; articles: Article[] };

function harness(
  articles: Article[],
  records: TriageRecord[] = [],
  links: Array<Pick<EvidenceLink, 'articleId'>> = [],
  overrides: Partial<ArticleRetentionDeps> = {},
): Harness {
  const triage: TriageStore = {
    records: Object.fromEntries(records.map((r) => [r.articleId, r])),
    updatedAt: null,
  };
  const h: Harness = { deps: {}, articles };
  h.deps = {
    readTriage: async () => triage,
    readEvidenceLinks: async () => links as EvidenceLink[],
    pruneArticles: async (selectKept) => {
      const before = h.articles.length;
      h.articles = selectKept(h.articles);
      return before - h.articles.length;
    },
    ...overrides,
  };
  return h;
}

const ids = (articles: Article[]) => articles.map((a) => a.id).sort();

test('an article with no triage record is pruned once it is past the 48-hour window', async () => {
  const h = harness([
    article('fresh', { fetchedAt: HOURS_AGO(47) }),
    article('edge', { fetchedAt: HOURS_AGO(48) }),
    article('old', { fetchedAt: HOURS_AGO(49) }),
  ]);

  const result = await pruneArticleStore({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.articles), ['edge', 'fresh']);
  assert.deepEqual(result, { articles: 1, errors: [] });
});

test('a triaged article (seed or not) is kept for 14 days after it was last published or fetched', async () => {
  const h = harness(
    [
      article('recent', { fetchedAt: DAYS_AGO(13) }),
      article('edge', { fetchedAt: DAYS_AGO(14) }),
      article('old', { fetchedAt: DAYS_AGO(14.01) }),
      article('seedOld', { fetchedAt: DAYS_AGO(15) }),
      article('dropped', { fetchedAt: DAYS_AGO(3) }),
    ],
    [
      triageRecord('recent'),
      triageRecord('edge'),
      triageRecord('old'),
      triageRecord('seedOld', { stage: 'manual' }),
      triageRecord('dropped', { status: 'dropped', reason: 'off_topic' }),
    ],
  );

  const result = await pruneArticleStore({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.articles), ['dropped', 'edge', 'recent']);
  assert.deepEqual(result, { articles: 2, errors: [] });
});

test('articles a retained triage record names (duplicateOf, memberIds) are kept past their own age', async () => {
  const h = harness(
    [
      article('dup', { fetchedAt: HOURS_AGO(1) }),
      article('target', { fetchedAt: DAYS_AGO(20) }),
      article('keptRecent', { fetchedAt: DAYS_AGO(2) }),
      article('member', { fetchedAt: DAYS_AGO(20) }),
      article('staleKept', { fetchedAt: DAYS_AGO(20) }),
      article('staleMember', { fetchedAt: DAYS_AGO(20) }),
      article('staleTarget', { fetchedAt: DAYS_AGO(20) }),
    ],
    [
      triageRecord('dup', { status: 'dropped', reason: 'duplicate', duplicateOf: 'target' }),
      triageRecord('target'),
      triageRecord('keptRecent', { memberIds: ['member'] }),
      triageRecord('member', { status: 'dropped', reason: 'duplicate', duplicateOf: 'keptRecent' }),
      triageRecord('staleKept', { memberIds: ['staleMember'] }),
      triageRecord('staleMember', {
        status: 'dropped',
        reason: 'duplicate',
        duplicateOf: 'staleTarget',
      }),
      triageRecord('staleTarget'),
    ],
  );

  const result = await pruneArticleStore({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.articles), ['dup', 'keptRecent', 'member', 'target']);
  assert.deepEqual(result, { articles: 3, errors: [] });
});

test('articles a stored evidence link references are never pruned', async () => {
  const h = harness(
    [
      article('cited', { fetchedAt: DAYS_AGO(60) }),
      article('citedOrphan', { fetchedAt: DAYS_AGO(60) }),
      article('uncited', { fetchedAt: DAYS_AGO(60) }),
    ],
    [triageRecord('cited'), triageRecord('uncited')],
    [{ articleId: 'cited' }, { articleId: 'citedOrphan' }, { articleId: null }],
  );

  const result = await pruneArticleStore({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.articles), ['cited', 'citedOrphan']);
  assert.deepEqual(result, { articles: 1, errors: [] });
});

test('nothing is pruned when triage or evidence links are unreadable', async () => {
  const old = () => [article('old', { fetchedAt: DAYS_AGO(60) })];
  const badTriage = harness(old(), [], [], {
    readTriage: async () => {
      throw new Error('triage.json must contain a JSON object');
    },
  });
  const badLinks = harness(old(), [], [], {
    readEvidenceLinks: async () => {
      throw new Error('EACCES');
    },
  });

  assert.deepEqual(await pruneArticleStore({ now: NOW }, badTriage.deps), {
    articles: 0,
    errors: ['triage: triage.json must contain a JSON object'],
  });
  assert.deepEqual(await pruneArticleStore({ now: NOW }, badLinks.deps), {
    articles: 0,
    errors: ['evidence links: EACCES'],
  });
  assert.deepEqual(ids(badTriage.articles), ['old']);
  assert.deepEqual(ids(badLinks.articles), ['old']);
});

test('a failing article prune is reported, not thrown', async () => {
  const h = harness([], [], [], {
    pruneArticles: async () => {
      throw new Error('disk full');
    },
  });

  assert.deepEqual(await pruneArticleStore({ now: NOW }, h.deps), {
    articles: 0,
    errors: ['articles prune: disk full'],
  });
});

test('last seen is the latest of publishedAt, fetchedAt and searchSeenAt; none parsing means prune', async () => {
  const h = harness([
    article('refetched', { publishedAt: DAYS_AGO(30), fetchedAt: HOURS_AGO(1) }),
    article('futureDated', { publishedAt: HOURS_AGO(-24), fetchedAt: DAYS_AGO(5) }),
    article('undated', { publishedAt: null, fetchedAt: HOURS_AGO(1) }),
    { ...article('searchedAgain', { fetchedAt: DAYS_AGO(5) }), searchSeenAt: HOURS_AGO(2) },
    { ...article('searchedLongAgo', { fetchedAt: DAYS_AGO(5) }), searchSeenAt: DAYS_AGO(4) },
    article('garbage', { publishedAt: 'soon', fetchedAt: 'yesterday' }),
  ]);

  await pruneArticleStore({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.articles), ['futureDated', 'refetched', 'searchedAgain', 'undated']);
});
