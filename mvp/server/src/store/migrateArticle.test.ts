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

test('migrateArticle accepts sourceKind manual with not_applicable bodyStatus', () => {
  const article = migrateArticle({
    title: 'Operator seed headline',
    sourceKind: 'manual',
    canonicalUrl: 'manual://seed/abc123',
    citations: [],
    snippet: 'Optional note from the operator.',
    fetchedAt: '2026-09-21T12:00:00.000Z',
  });
  assert.equal(article.sourceKind, 'manual');
  assert.equal(article.bodyStatus, 'not_applicable');
  assert.equal(article.bodyText, null);
});

test('migrateArticle round-trips a topic search article', () => {
  const article = migrateArticle({
    title: 'Iran talks resume',
    sourceKind: 'search',
    canonicalUrl: 'https://news.google.com/rss/articles/CBMiXyz',
    citations: [],
    snippet: '',
    bodyStatus: 'pending',
    fetchedAt: '2026-09-29T12:00:00.000Z',
    topicIds: ['iran', 'nuclear'],
    searchProviders: ['google_news', 'searxng'],
    googleNewsUrl: 'https://news.google.com/rss/articles/CBMiXyz',
  });
  assert.equal(article.sourceKind, 'search');
  assert.equal(article.bodyStatus, 'pending');
  assert.deepEqual(article.topicIds, ['iran', 'nuclear']);
  assert.deepEqual(article.searchProviders, ['google_news', 'searxng']);
  assert.equal(article.googleNewsUrl, 'https://news.google.com/rss/articles/CBMiXyz');
});

test('migrateArticle filters junk topic search fields', () => {
  const article = migrateArticle({
    title: 'Iran talks resume',
    sourceKind: 'search',
    canonicalUrl: 'https://example.com/a',
    citations: [],
    fetchedAt: '2026-09-29T12:00:00.000Z',
    topicIds: [' iran ', '', 'iran', 42, null, 'nuclear', '   '],
    searchProviders: ['bing', 'searxng', 'searxng', 7],
    googleNewsUrl: null,
  });
  assert.deepEqual(article.topicIds, ['iran', 'nuclear']);
  assert.deepEqual(article.searchProviders, ['searxng']);
  assert.equal(article.googleNewsUrl, null);
  assert.ok('googleNewsUrl' in article);
});

test('migrateArticle omits topic search keys when not arrays / wrong types', () => {
  const article = migrateArticle({
    title: 'Iran talks resume',
    sourceKind: 'search',
    canonicalUrl: 'https://example.com/a',
    citations: [],
    fetchedAt: '2026-09-29T12:00:00.000Z',
    topicIds: 'iran',
    searchProviders: { google_news: true },
    googleNewsUrl: 5,
  });
  assert.equal('topicIds' in article, false);
  assert.equal('searchProviders' in article, false);
  assert.equal('googleNewsUrl' in article, false);
});

test('migrateArticle CFP article without topic search fields has no such keys', () => {
  const article = migrateArticle({
    title: 'Senate passes bill',
    sourceKind: 'cfp',
    canonicalUrl: 'https://citizenfreepress.com/item/1',
    publisherUrl: 'https://example.com/story',
    fetchedAt: '2026-09-29T12:00:00.000Z',
  });
  assert.equal('topicIds' in article, false);
  assert.equal('searchProviders' in article, false);
  assert.equal('googleNewsUrl' in article, false);
});
