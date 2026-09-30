import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import { selectClassifyBatchCandidates } from './classifyArticles.js';

function article(overrides: Partial<Article> & Pick<Article, 'id'>): Article {
  return {
    sourceKind: 'cfp',
    title: `Title ${overrides.id}`,
    canonicalUrl: `https://citizenfreepress.com/${overrides.id}`,
    citations: [{ label: 'CFP', url: `https://citizenfreepress.com/${overrides.id}` }],
    publisherUrl: null,
    publisherDomain: null,
    handle: null,
    publishedAt: '2026-09-12T12:00:00.000Z',
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
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

test('selectClassifyBatchCandidates skips untriaged search and manual rows', () => {
  const search = article({
    id: 'search-1',
    sourceKind: 'search',
    sourceTier: 'sensor',
    publishedAt: '2026-09-13T12:00:00.000Z',
  });
  const manual = article({
    id: 'manual-1',
    sourceKind: 'manual',
    publishedAt: '2026-09-13T11:00:00.000Z',
  });
  const cfp = article({ id: 'cfp-1' });

  const selected = selectClassifyBatchCandidates([search, manual, cfp], 10);

  assert.deepEqual(
    selected.map((a) => a.id),
    ['cfp-1'],
  );
});
