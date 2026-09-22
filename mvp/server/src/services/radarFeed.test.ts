import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import { buildRadarFeed } from './radarFeed.js';

function article(
  overrides: Partial<Article> & Pick<Article, 'id' | 'title'>,
): Article {
  return {
    sourceKind: 'cfp',
    canonicalUrl: `https://example.com/${overrides.id}`,
    citations: [
      {
        label: 'Primary',
        url: `https://example.com/${overrides.id}`,
      },
    ],
    publisherUrl: `https://publisher.com/${overrides.id}`,
    publisherDomain: 'publisher.com',
    handle: null,
    publishedAt: '2026-09-10T12:00:00.000Z',
    snippet: 'Snippet',
    bodyText: null,
    bodyStatus: 'ok',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-09-10T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('buildRadarFeed filters to CFP + RSS only', () => {
  const a1 = article({ id: 'a1', title: 'CFP 1', sourceKind: 'cfp' });
  const a2 = article({ id: 'a2', title: 'RSS 1', sourceKind: 'rss' });
  const a3 = article({ id: 'a3', title: 'Xcancel 1', sourceKind: 'xcancel' });

  const clusters = buildRadarFeed([a1, a2, a3]);

  const ids = clusters.flatMap((c) => c.headlines.map((h) => h.id));
  assert.deepEqual(ids.sort(), ['a1', 'a2']);
});

test('buildRadarFeed groups by clusterId or solo key', () => {
  const a1 = article({
    id: 'a1',
    title: 'Cluster member old',
    sourceKind: 'cfp',
    clusterId: 'c1',
    publishedAt: '2026-09-10T12:00:00.000Z',
  });
  const a2 = article({
    id: 'a2',
    title: 'Cluster member new',
    sourceKind: 'cfp',
    clusterId: 'c1',
    publishedAt: '2026-09-11T12:00:00.000Z',
  });
  const a3 = article({
    id: 'a3',
    title: 'Solo article',
    sourceKind: 'rss',
    clusterId: null,
    publishedAt: '2026-09-12T12:00:00.000Z',
  });

  const clusters = buildRadarFeed([a1, a2, a3]);

  assert.equal(clusters.length, 2);

  const byId = new Map(clusters.map((c) => [c.clusterId, c]));
  const c1 = byId.get('c1');
  assert.ok(c1);
  assert.equal(c1!.headlines.length, 2);
  // Newest headline first within cluster
  assert.equal(c1!.headlines[0]!.id, 'a2');

  const solo = byId.get('solo:a3');
  assert.ok(solo);
  assert.equal(solo!.headlines.length, 1);
  assert.equal(solo!.headlines[0]!.id, 'a3');
});

test('buildRadarFeed sorts clusters by newestAt desc and maps fields', () => {
  const olderClusterArticle = article({
    id: 'a1',
    title: 'Older cluster',
    sourceKind: 'cfp',
    clusterId: 'c1',
    publishedAt: '2026-09-10T12:00:00.000Z',
  });
  const newerClusterArticle = article({
    id: 'a2',
    title: 'Newer cluster',
    sourceKind: 'rss',
    clusterId: 'c2',
    publishedAt: '2026-09-13T12:00:00.000Z',
    citations: [
      { label: 'CFP', url: 'https://citizenfreepress.com/a2' },
      { label: 'Original', url: 'https://publisher.com/a2' },
    ],
    publisherDomain: 'example.com',
  });

  const clusters = buildRadarFeed([olderClusterArticle, newerClusterArticle]);

  // Cluster with newer article should come first.
  assert.equal(clusters[0]!.clusterId, 'c2');
  assert.equal(clusters[0]!.newestAt, '2026-09-13T12:00:00.000Z');

  const headline = clusters[0]!.headlines[0]!;
  assert.equal(headline.id, 'a2');
  assert.equal(headline.title, 'Newer cluster');
  assert.equal(headline.sourceKind, 'rss');
  assert.equal(headline.publisherDomain, 'example.com');
  assert.equal(headline.publishedAt, '2026-09-13T12:00:00.000Z');
  assert.equal(headline.canonicalUrl, newerClusterArticle.canonicalUrl);
  assert.equal(headline.citationLabel, 'CFP');
});

