import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  citationsFromRss,
  migrateArticle,
} from './migrateArticle.js';

test('citationsFromRss returns one citation with source label', () => {
  const citations = citationsFromRss(
    'Georgia Recorder',
    'https://example.com/a',
  );
  assert.equal(citations.length, 1);
  assert.deepEqual(citations, [
    { label: 'Georgia Recorder', url: 'https://example.com/a' },
  ]);
});

test('migrateArticle accepts sourceKind rss', () => {
  const article = migrateArticle({
    title: 'State budget passes',
    sourceKind: 'rss',
    canonicalUrl: 'https://example.com/a',
    citations: [{ label: 'Georgia Recorder', url: 'https://example.com/a' }],
    snippet: 'The legislature approved the budget.',
    fetchedAt: '2026-08-16T12:05:00.000Z',
  });
  assert.equal(article.sourceKind, 'rss');
  assert.equal(article.canonicalUrl, 'https://example.com/a');
});
