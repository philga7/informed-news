import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { ClusterEnrichmentRecord } from '../types/clusterEnrichment.js';
import { enrichUnenrichedClusters } from './enrichClusters.js';

function article(overrides: Partial<Article> & Pick<Article, 'id' | 'title'>): Article {
  return {
    sourceKind: 'cfp',
    canonicalUrl: `https://citizenfreepress.com/${overrides.id}`,
    citations: [{ label: 'CFP', url: `https://citizenfreepress.com/${overrides.id}` }],
    publisherUrl: `https://example.com/${overrides.id}`,
    publisherDomain: 'example.com',
    handle: null,
    publishedAt: '2026-09-12T12:00:00.000Z',
    snippet: 'Snippet text',
    bodyText: null,
    bodyStatus: 'ok',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-09-12T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('enrichUnenrichedClusters upserts unenriched and skips already enriched', async () => {
  const articles: Article[] = [
    article({ id: 'a1', title: 'Already enriched cluster member', clusterId: 'c1' }),
    article({ id: 'a2', title: 'Solo unenriched' }),
  ];

  const upserted: ClusterEnrichmentRecord[] = [];

  const result = await enrichUnenrichedClusters({
    limit: 10,
    readArticlesFn: async () => articles,
    getClusterEnrichmentFn: async (key: string) => {
      if (key === 'c1') {
        return {
          key,
          enrichment: {
            talking_points: ['existing'],
            timeline: [],
            suggested_qna: [],
          },
          enrichedAt: '2026-09-12T13:00:00.000Z',
          enrichError: null,
          model: 'glm-5.3-flash',
        };
      }
      return null;
    },
    enrichFn: async () => ({
      ok: true,
      enrichment: {
        talking_points: ['tp'],
        timeline: [{ date: 'Sep 12', content: 'event' }],
        suggested_qna: [{ question: 'Q', answer: 'A' }],
      },
      model: 'glm-5.3-flash',
      rawText: '{"talking_points":["tp"],"timeline":[],"suggested_qna":[]}',
    }),
    upsertClusterEnrichmentFn: async (record) => {
      upserted.push(record);
      return record;
    },
    nowIsoFn: () => '2026-09-12T20:00:00.000Z',
  });

  assert.equal(result.attempted, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.keys, ['solo:a2']);

  assert.equal(upserted.length, 1);
  assert.equal(upserted[0]!.key, 'solo:a2');
  assert.equal(upserted[0]!.enrichedAt, '2026-09-12T20:00:00.000Z');
  assert.equal(upserted[0]!.enrichError, null);
  assert.ok(upserted[0]!.enrichment);
});

test('enrichUnenrichedClusters treats all-empty enrichment as failure (not stored as success)', async () => {
  const articles: Article[] = [article({ id: 'a1', title: 'Solo unenriched' })];

  const upserted: ClusterEnrichmentRecord[] = [];

  const result = await enrichUnenrichedClusters({
    limit: 10,
    readArticlesFn: async () => articles,
    getClusterEnrichmentFn: async () => null,
    enrichFn: async () => ({
      ok: true,
      enrichment: { talking_points: [], timeline: [], suggested_qna: [] },
      model: 'glm-5.3-flash',
      rawText: '{"talking_points":[],"timeline":[],"suggested_qna":[]}',
    }),
    upsertClusterEnrichmentFn: async (record) => {
      upserted.push(record);
      return record;
    },
    nowIsoFn: () => '2026-09-12T20:00:00.000Z',
  });

  assert.equal(result.attempted, 1);
  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 1);

  assert.equal(upserted.length, 1);
  assert.equal(upserted[0]!.key, 'solo:a1');
  assert.equal(upserted[0]!.enrichedAt, null);
  assert.ok(upserted[0]!.enrichError);
  assert.match(upserted[0]!.enrichError!, /empty after validation/);
  assert.equal(upserted[0]!.enrichment, null);
});

test('enrichUnenrichedClusters force re-enriches existing key', async () => {
  const articles: Article[] = [
    article({ id: 'a1', title: 'Existing cluster member', clusterId: 'c1' }),
  ];

  const upserted: ClusterEnrichmentRecord[] = [];

  const result = await enrichUnenrichedClusters({
    limit: 10,
    force: true,
    readArticlesFn: async () => articles,
    getClusterEnrichmentFn: async (key: string) => ({
      key,
      enrichment: {
        talking_points: ['existing'],
        timeline: [],
        suggested_qna: [],
      },
      enrichedAt: '2026-09-12T13:00:00.000Z',
      enrichError: null,
      model: 'glm-5.3-flash',
    }),
    enrichFn: async () => ({
      ok: true,
      enrichment: {
        talking_points: ['new'],
        timeline: [{ date: 'Sep 12', content: 'event' }],
        suggested_qna: [{ question: 'Q', answer: 'A' }],
      },
      model: 'glm-5.3-flash',
      rawText: '{"talking_points":["new"],"timeline":[],"suggested_qna":[]}',
    }),
    upsertClusterEnrichmentFn: async (record) => {
      upserted.push(record);
      return record;
    },
    nowIsoFn: () => '2026-09-12T20:00:00.000Z',
  });

  assert.equal(result.attempted, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.keys, ['c1']);

  assert.equal(upserted.length, 1);
  assert.equal(upserted[0]!.key, 'c1');
  assert.ok(upserted[0]!.enrichment);
  assert.deepEqual(upserted[0]!.enrichment!.talking_points, ['new']);
});

