import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import {
  articlesAreRelated,
  assignClusterIdsInMemory,
  normalizeUrl,
  titleTokens,
} from './clusterArticles.js';

function article(overrides: Partial<Article> & Pick<Article, 'id' | 'title'>): Article {
  return {
    sourceKind: 'cfp',
    canonicalUrl: `https://citizenfreepress.com/${overrides.id}`,
    citations: [{ label: 'CFP', url: `https://citizenfreepress.com/${overrides.id}` }],
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

test('normalizeUrl strips www, trailing slash, and hash', () => {
  assert.equal(
    normalizeUrl('https://www.Example.com/Story/?utm=1#frag'),
    'https://example.com/story?utm=1',
  );
});

test('titleTokens drops stop words and short tokens', () => {
  const tokens = titleTokens('The Senate passes a big infrastructure bill');
  assert.ok(tokens.has('senate'));
  assert.ok(tokens.has('passes'));
  assert.ok(tokens.has('infrastructure'));
  assert.ok(tokens.has('bill'));
  assert.equal(tokens.has('the'), false);
  assert.equal(tokens.has('a'), false);
});

test('URL overlap clusters CFP publisher with linking tweet', () => {
  const cfp = article({
    id: 'cfp1',
    title: 'Senate passes bill',
    publisherUrl: 'https://example.com/story/senate-bill',
    publisherDomain: 'example.com',
  });
  const tweet = article({
    id: 'tw1',
    title: 'Check this out https://example.com/story/senate-bill',
    sourceKind: 'xcancel',
    canonicalUrl: 'https://x.com/user/status/1',
    citations: [
      { label: 'xcancel', url: 'https://xcancel.com/user/status/1' },
      { label: 'X', url: 'https://x.com/user/status/1' },
    ],
    snippet: 'Check this out https://example.com/story/senate-bill',
    bodyText: 'Check this out https://example.com/story/senate-bill',
    bodyStatus: 'not_applicable',
  });

  assert.equal(articlesAreRelated(cfp, tweet), true);

  const [a, b] = assignClusterIdsInMemory([cfp, tweet]);
  assert.ok(a.clusterId);
  assert.equal(a.clusterId, b.clusterId);
  assert.equal(a.clusterId, 'cfp1'); // min member id
});

test('same publisher domain + similar titles cluster', () => {
  const a = article({
    id: 'a1',
    title: 'Senate passes major infrastructure spending bill',
    publisherUrl: 'https://news.example.com/a',
    publisherDomain: 'news.example.com',
  });
  const b = article({
    id: 'b1',
    title: 'Senate passes infrastructure spending measure',
    publisherUrl: 'https://news.example.com/b',
    publisherDomain: 'news.example.com',
  });

  assert.equal(articlesAreRelated(a, b), true);
  const out = assignClusterIdsInMemory([a, b]);
  assert.equal(out[0].clusterId, out[1].clusterId);
  assert.ok(out[0].clusterId);
});

test('unrelated items stay ungrouped', () => {
  const a = article({
    id: 'a1',
    title: 'Local weather turns colder overnight',
    publisherUrl: 'https://weather.example.com/a',
    publisherDomain: 'weather.example.com',
  });
  const b = article({
    id: 'b1',
    title: 'Stock markets rally on earnings',
    publisherUrl: 'https://markets.example.com/b',
    publisherDomain: 'markets.example.com',
  });

  assert.equal(articlesAreRelated(a, b), false);
  const out = assignClusterIdsInMemory([a, b]);
  assert.equal(out[0].clusterId, null);
  assert.equal(out[1].clusterId, null);
});

test('same domain but dissimilar titles do not cluster', () => {
  const a = article({
    id: 'a1',
    title: 'City council debates parking fees',
    publisherUrl: 'https://local.example.com/parking',
    publisherDomain: 'local.example.com',
  });
  const b = article({
    id: 'b1',
    title: 'High school football team wins championship',
    publisherUrl: 'https://local.example.com/football',
    publisherDomain: 'local.example.com',
  });

  assert.equal(articlesAreRelated(a, b), false);
});
