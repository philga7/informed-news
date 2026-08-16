import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article, FramingAnalysis } from '../types/article.js';
import { mergeArticleOnUpsert } from './mergeArticleOnUpsert.js';

const ANALYSIS: FramingAnalysis = {
  genre: 'news_blurb',
  headlineDevices: ['loaded adjective'],
  dimensions: {
    loadedLanguage: 0.4,
    emotionalAppeal: 0.2,
    certaintyClaiming: 0.1,
    omissionOrSelectionRisk: 0.3,
    attributionClarity: 0.8,
  },
  framingSummary: 'Headline emphasizes conflict.',
  evidenceQuotes: ['crisis'],
  openQuestions: ['Who is the source?'],
  confidence: 0.7,
};

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'abc123',
    title: 'Senate passes bill',
    sourceKind: 'cfp',
    canonicalUrl: 'https://citizenfreepress.com/item/1',
    citations: [{ label: 'CFP', url: 'https://citizenfreepress.com/item/1' }],
    publisherUrl: 'https://example.com/story',
    publisherDomain: 'example.com',
    handle: null,
    publishedAt: '2026-08-16T12:00:00.000Z',
    snippet: 'The Senate passed a bill today.',
    fetchedAt: '2026-08-16T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('new items stay unclassified', () => {
  const incoming = article({ fetchedAt: '2026-08-16T13:00:00.000Z' });
  const merged = mergeArticleOnUpsert(undefined, incoming, incoming.id);
  assert.equal(merged.classification, null);
  assert.equal(merged.classifiedAt, null);
  assert.equal(merged.classifyError, null);
  assert.equal(merged.fetchedAt, incoming.fetchedAt);
});

test('unchanged title, snippet, and canonical URL keep classification', () => {
  const existing = article({
    classification: ANALYSIS,
    classifiedAt: '2026-08-16T12:10:00.000Z',
  });
  const incoming = article({
    fetchedAt: '2026-08-16T13:00:00.000Z',
    publisherUrl: 'https://example.com/updated-scrape',
    publisherDomain: 'example.com',
  });
  const merged = mergeArticleOnUpsert(existing, incoming, existing.id);
  assert.deepEqual(merged.classification, ANALYSIS);
  assert.equal(merged.classifiedAt, existing.classifiedAt);
  assert.equal(merged.classifyError, null);
  assert.equal(merged.fetchedAt, incoming.fetchedAt);
  assert.equal(merged.publisherUrl, incoming.publisherUrl);
});

test('changed title clears classification', () => {
  const existing = article({
    classification: ANALYSIS,
    classifiedAt: '2026-08-16T12:10:00.000Z',
  });
  const incoming = article({ title: 'Senate fails bill' });
  const merged = mergeArticleOnUpsert(existing, incoming, existing.id);
  assert.equal(merged.classification, null);
  assert.equal(merged.classifiedAt, null);
  assert.equal(merged.title, 'Senate fails bill');
});

test('changed snippet clears classification', () => {
  const existing = article({
    classification: ANALYSIS,
    classifiedAt: '2026-08-16T12:10:00.000Z',
    classifyError: null,
  });
  const incoming = article({ snippet: 'Revised blurb from RSS.' });
  const merged = mergeArticleOnUpsert(existing, incoming, existing.id);
  assert.equal(merged.classification, null);
  assert.equal(merged.classifiedAt, null);
  assert.equal(merged.classifyError, null);
});

test('classify write applies incoming analysis even when content is unchanged', () => {
  const existing = article();
  const incoming = article({
    classification: ANALYSIS,
    classifiedAt: '2026-08-16T12:10:00.000Z',
    classifyError: null,
  });
  const merged = mergeArticleOnUpsert(existing, incoming, existing.id);
  assert.deepEqual(merged.classification, ANALYSIS);
  assert.equal(merged.classifiedAt, incoming.classifiedAt);
});

test('classify failure overwrites prior analysis', () => {
  const existing = article({
    classification: ANALYSIS,
    classifiedAt: '2026-08-16T12:10:00.000Z',
  });
  const incoming = article({
    classification: null,
    classifiedAt: null,
    classifyError: 'model timeout',
  });
  const merged = mergeArticleOnUpsert(existing, incoming, existing.id);
  assert.equal(merged.classification, null);
  assert.equal(merged.classifiedAt, null);
  assert.equal(merged.classifyError, 'model timeout');
});

test('unchanged refetch keeps a prior classifyError', () => {
  const existing = article({ classifyError: 'parse failed' });
  const incoming = article({ fetchedAt: '2026-08-16T13:00:00.000Z' });
  const merged = mergeArticleOnUpsert(existing, incoming, existing.id);
  assert.equal(merged.classifyError, 'parse failed');
  assert.equal(merged.fetchedAt, incoming.fetchedAt);
});
