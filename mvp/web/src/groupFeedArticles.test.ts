import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from './types.ts';
import { groupFeedArticles, pickClusterLead } from './groupFeedArticles.ts';

function article(
  overrides: Partial<Article> & Pick<Article, 'id' | 'title'>,
): Article {
  return {
    sourceKind: 'cfp',
    canonicalUrl: `https://example.com/${overrides.id}`,
    citations: [],
    publisherUrl: null,
    publisherDomain: null,
    handle: null,
    publishedAt: '2026-08-16T12:00:00.000Z',
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    clusterId: null,
    fetchedAt: '2026-08-16T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('ungrouped items stay single entries in order', () => {
  const a = article({ id: 'a', title: 'A', publishedAt: '2026-08-16T14:00:00Z' });
  const b = article({ id: 'b', title: 'B', publishedAt: '2026-08-16T13:00:00Z' });
  const entries = groupFeedArticles([a, b]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, 'single');
  assert.equal(entries[1].kind, 'single');
  if (entries[0].kind === 'single' && entries[1].kind === 'single') {
    assert.equal(entries[0].article.id, 'a');
    assert.equal(entries[1].article.id, 'b');
  }
});

test('related items form one expandable cluster with CFP lead', () => {
  const tweet = article({
    id: 'tw',
    title: 'Tweet about bill',
    sourceKind: 'xcancel',
    clusterId: 'cluster-1',
    publishedAt: '2026-08-16T15:00:00Z',
  });
  const cfp = article({
    id: 'cfp',
    title: 'Senate passes bill',
    sourceKind: 'cfp',
    clusterId: 'cluster-1',
    publishedAt: '2026-08-16T14:00:00Z',
  });
  const other = article({
    id: 'other',
    title: 'Unrelated',
    clusterId: null,
    publishedAt: '2026-08-16T13:00:00Z',
  });

  // Newest-first: tweet, cfp, other
  const entries = groupFeedArticles([tweet, cfp, other]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, 'cluster');
  assert.equal(entries[1].kind, 'single');
  if (entries[0].kind === 'cluster') {
    assert.equal(entries[0].lead.id, 'cfp');
    assert.deepEqual(
      entries[0].related.map((r) => r.id),
      ['tw'],
    );
  }
});

test('pickClusterLead prefers CFP over newer tweet', () => {
  const tweet = article({
    id: 'tw',
    title: 'Tweet',
    sourceKind: 'xcancel',
    publishedAt: '2026-08-16T16:00:00Z',
  });
  const cfp = article({
    id: 'cfp',
    title: 'CFP',
    sourceKind: 'cfp',
    publishedAt: '2026-08-16T10:00:00Z',
  });
  assert.equal(pickClusterLead([tweet, cfp]).id, 'cfp');
});
