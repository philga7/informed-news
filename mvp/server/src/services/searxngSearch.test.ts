import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSearxngSearchUrl,
  parseSearxngPublishedDate,
  parseSearxngResults,
  resolveSearxngBaseUrl,
  searchSearxng,
} from './searxngSearch.js';
import { SEARXNG_TIMEOUT_MS } from './topicSearchConfig.js';

const NOW = new Date('2026-09-29T12:00:00Z');

const FIXTURE = {
  query: 'iran nuclear',
  results: [
    {
      url: 'https://www.reuters.com/world/iran-talks?utm_source=searx&id=7#top',
      title: 'Iran nuclear talks resume in Vienna',
      content: '  Negotiators met on Tuesday.  ',
      publishedDate: '2026-09-29T10:30:00Z',
    },
    {
      url: 'https://apnews.com/article/sanctions',
      title: 'Sanctions update',
      content: '3 hours ago ... Treasury announced new measures.',
      publishedDate: null,
    },
    {
      url: 'https://www.bbc.com/news/oil',
      title: 'Oil markets react',
      content: 'Prices rose.',
      pubdate: '2 days ago',
    },
    {
      url: 'https://www.theguardian.com/old',
      title: 'Old story',
      content: '4 days ago - Background piece.',
    },
    {
      url: 'https://example.org/undated',
      title: 'Undated explainer',
    },
    {
      url: 'https://www.reuters.com/world/iran-talks?id=7&fbclid=abc',
      title: 'Duplicate of the Reuters story',
      content: 'dupe',
      publishedDate: '2026-09-29T11:00:00Z',
    },
    { url: 'ftp://example.org/file', title: 'Not http' },
    { url: 'https://example.org/no-title', title: '   ' },
    { title: 'No url' },
  ],
};

function okFetch(body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test('resolveSearxngBaseUrl: unset → local default, empty → disabled, trailing slash trimmed', () => {
  assert.equal(resolveSearxngBaseUrl({}), 'http://127.0.0.1:8888');
  assert.equal(resolveSearxngBaseUrl({ SEARXNG_URL: '' }), null);
  assert.equal(resolveSearxngBaseUrl({ SEARXNG_URL: 'http://searx.local:8080/' }), 'http://searx.local:8080');
  assert.equal(resolveSearxngBaseUrl({ SEARXNG_URL: 'https://searx.example/sub//' }), 'https://searx.example/sub');
});

test('buildSearxngSearchUrl sets news/json/en-US params and never time_range', () => {
  const url = new URL(buildSearxngSearchUrl('http://127.0.0.1:8888', 'iran nuclear & sanctions'));
  assert.equal(url.origin + url.pathname, 'http://127.0.0.1:8888/search');
  assert.equal(url.searchParams.get('q'), 'iran nuclear & sanctions');
  assert.equal(url.searchParams.get('categories'), 'news');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('language'), 'en-US');
  assert.equal(url.searchParams.has('time_range'), false);
  assert.equal(url.search.includes('time_range'), false);
});

test('parseSearxngPublishedDate handles ISO, RFC, relative, yesterday, and junk', () => {
  assert.equal(parseSearxngPublishedDate('2026-09-29T10:30:00Z', NOW), '2026-09-29T10:30:00.000Z');
  assert.equal(parseSearxngPublishedDate('2026-09-29T10:30:00', NOW), '2026-09-29T10:30:00.000Z');
  assert.equal(parseSearxngPublishedDate('2026-09-29 10:30:00', NOW), '2026-09-29T10:30:00.000Z');
  assert.equal(
    parseSearxngPublishedDate('Tue, 29 Sep 2026 09:15:00 GMT', NOW),
    '2026-09-29T09:15:00.000Z',
  );
  assert.equal(parseSearxngPublishedDate('3 hours ago', NOW), '2026-09-29T09:00:00.000Z');
  assert.equal(parseSearxngPublishedDate('Updated 45 mins ago by staff', NOW), '2026-09-29T11:15:00.000Z');
  assert.equal(parseSearxngPublishedDate('2 days ago', NOW), '2026-09-27T12:00:00.000Z');
  assert.equal(parseSearxngPublishedDate('Yesterday', NOW), '2026-09-28T12:00:00.000Z');
  assert.equal(parseSearxngPublishedDate('Iran talks 2', NOW), null);
  assert.equal(parseSearxngPublishedDate('', NOW), null);
  assert.equal(parseSearxngPublishedDate(null, NOW), null);
  assert.equal(parseSearxngPublishedDate(1727600000, NOW), null);
});

test('parseSearxngResults maps results to searxng candidates', () => {
  const candidates = parseSearxngResults(FIXTURE, NOW);
  assert.deepEqual(candidates[0], {
    provider: 'searxng',
    title: 'Iran nuclear talks resume in Vienna',
    publisherUrl: 'https://www.reuters.com/world/iran-talks?id=7',
    publisherName: null,
    publisherDomain: 'reuters.com',
    googleNewsUrl: null,
    googleArticleId: null,
    publishedAt: '2026-09-29T10:30:00.000Z',
    snippet: 'Negotiators met on Tuesday.',
  });
});

test('parseSearxngResults dates from publishedDate, pubdate, or content; drops >48h; keeps undated', () => {
  const candidates = parseSearxngResults(FIXTURE, NOW);
  assert.deepEqual(
    candidates.map((c) => [c.publisherUrl, c.publishedAt, c.snippet]),
    [
      ['https://www.reuters.com/world/iran-talks?id=7', '2026-09-29T10:30:00.000Z', 'Negotiators met on Tuesday.'],
      [
        'https://apnews.com/article/sanctions',
        '2026-09-29T09:00:00.000Z',
        '3 hours ago ... Treasury announced new measures.',
      ],
      ['https://www.bbc.com/news/oil', '2026-09-27T12:00:00.000Z', 'Prices rose.'],
      ['https://example.org/undated', null, ''],
    ],
  );
});

test('parseSearxngResults strips tracking params and collapses duplicate URLs (keeps first)', () => {
  const candidates = parseSearxngResults(FIXTURE, NOW);
  const reuters = candidates.filter((c) => c.publisherDomain === 'reuters.com');
  assert.equal(reuters.length, 1);
  assert.equal(reuters[0]?.title, 'Iran nuclear talks resume in Vienna');
});

test('parseSearxngResults throws when results is missing', () => {
  assert.throws(() => parseSearxngResults({}, NOW), { message: 'SearXNG response missing results' });
  assert.throws(() => parseSearxngResults(null, NOW), { message: 'SearXNG response missing results' });
  assert.throws(() => parseSearxngResults({ results: 'x' }, NOW), {
    message: 'SearXNG response missing results',
  });
});

test('searchSearxng sends Accept header and the timeout signal', async (t) => {
  const timeoutMock = t.mock.method(AbortSignal, 'timeout');
  const { calls, fetchImpl } = okFetch(FIXTURE);
  const candidates = await searchSearxng(
    'iran nuclear',
    { baseUrl: 'http://127.0.0.1:8888', now: NOW },
    { fetch: fetchImpl },
  );

  assert.equal(candidates.length, 4);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, buildSearxngSearchUrl('http://127.0.0.1:8888', 'iran nuclear'));
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get('accept'), 'application/json');
  assert.ok(calls[0]?.init?.signal instanceof AbortSignal);
  assert.equal(timeoutMock.mock.callCount(), 1);
  assert.deepEqual(timeoutMock.mock.calls[0]?.arguments, [SEARXNG_TIMEOUT_MS]);
  assert.equal(calls[0]?.init?.signal, timeoutMock.mock.calls[0]?.result);
});

test('searchSearxng throws on non-2xx', async () => {
  const fetchImpl = (async () => new Response('nope', { status: 429 })) as typeof fetch;
  await assert.rejects(
    searchSearxng('iran', { baseUrl: 'http://127.0.0.1:8888', now: NOW }, { fetch: fetchImpl }),
    { message: 'SearXNG 429' },
  );
});
