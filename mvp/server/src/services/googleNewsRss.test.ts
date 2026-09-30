import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGoogleNewsSearchUrl,
  googleArticleIdFromUrl,
  parseGoogleNewsRss,
  searchGoogleNews,
} from './googleNewsRss.js';
import { GOOGLE_NEWS_TIMEOUT_MS } from './topicSearchConfig.js';

const NOW = new Date('2026-09-29T12:00:00Z');

const FIXTURE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>"iran nuclear when:2d" - Google News</title>
<link>https://news.google.com/search?q=iran+nuclear+when:2d&amp;hl=en-US&amp;gl=US&amp;ceid=US:en</link>
<item>
<title>Iran nuclear talks resume in Vienna - Reuters</title>
<link>https://news.google.com/rss/articles/CBMiAbc123_def?oc=5</link>
<guid isPermaLink="false">CBMiAbc123_def</guid>
<pubDate>Tue, 29 Sep 2026 11:00:00 GMT</pubDate>
<description>&lt;a href="https://news.google.com/rss/articles/CBMiAbc123_def?oc=5"&gt;Iran nuclear talks resume&lt;/a&gt;</description>
<source url="https://www.reuters.com">Reuters</source>
</item>
<item>
<title>Oil - markets - what traders expect next - Bloomberg</title>
<link>https://news.google.com/rss/articles/CBMiXyz789?oc=5</link>
<guid isPermaLink="false">CBMiXyz789</guid>
<pubDate>Mon, 28 Sep 2026 20:30:00 GMT</pubDate>
<description>ignored</description>
<source url="https://www.bloomberg.com">Bloomberg</source>
</item>
<item>
<title>Sanctions update - Some Blog</title>
<link>https://news.google.com/rss/articles/CBMiQqq456?oc=5</link>
<guid isPermaLink="false">CBMiQqq456</guid>
<pubDate>Tue, 29 Sep 2026 09:15:00 GMT</pubDate>
<source url="https://apnews.com">Associated Press</source>
</item>
<item>
<title>Old story from last week - The Guardian</title>
<link>https://news.google.com/rss/articles/CBMiOld000?oc=5</link>
<guid isPermaLink="false">CBMiOld000</guid>
<pubDate>Sat, 26 Sep 2026 12:00:00 GMT</pubDate>
<source url="https://www.theguardian.com">The Guardian</source>
</item>
</channel>
</rss>`;

function okFetch(body: string) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test('buildGoogleNewsSearchUrl encodes query with when:2d and fixed locale params', () => {
  assert.equal(
    buildGoogleNewsSearchUrl('iran nuclear & sanctions'),
    'https://news.google.com/rss/search?q=iran%20nuclear%20%26%20sanctions%20when%3A2d&hl=en-US&gl=US&ceid=US:en',
  );
});

test('googleArticleIdFromUrl extracts the token after /articles/ without query', () => {
  assert.equal(
    googleArticleIdFromUrl('https://news.google.com/rss/articles/CBMiAbc123_def?oc=5'),
    'CBMiAbc123_def',
  );
  assert.equal(
    googleArticleIdFromUrl('https://news.google.com/articles/CBMiAbc123_def'),
    'CBMiAbc123_def',
  );
  assert.equal(googleArticleIdFromUrl('https://news.google.com/rss/search?q=x'), null);
  assert.equal(googleArticleIdFromUrl('https://www.reuters.com/articles/abc'), null);
  assert.equal(googleArticleIdFromUrl('not a url'), null);
});

test('parseGoogleNewsRss maps items to google_news candidates', async () => {
  const candidates = await parseGoogleNewsRss(FIXTURE);
  assert.equal(candidates.length, 4);

  assert.deepEqual(candidates[0], {
    provider: 'google_news',
    title: 'Iran nuclear talks resume in Vienna',
    publisherUrl: null,
    publisherName: 'Reuters',
    publisherDomain: 'reuters.com',
    googleNewsUrl: 'https://news.google.com/rss/articles/CBMiAbc123_def',
    googleArticleId: 'CBMiAbc123_def',
    publishedAt: '2026-09-29T11:00:00.000Z',
    snippet: '',
  });
});

test('parseGoogleNewsRss strips only a trailing suffix matching the source name', async () => {
  const candidates = await parseGoogleNewsRss(FIXTURE);
  assert.equal(candidates[1]?.title, 'Oil - markets - what traders expect next');
  assert.equal(candidates[1]?.publisherName, 'Bloomberg');
  assert.equal(candidates[1]?.publisherDomain, 'bloomberg.com');
  assert.equal(candidates[2]?.title, 'Sanctions update - Some Blog');
  assert.equal(candidates[2]?.publisherName, 'Associated Press');
  assert.equal(candidates[2]?.publisherDomain, 'apnews.com');
});

test('parseGoogleNewsRss skips items missing a title or link', async () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>No link - Reuters</title><source url="https://www.reuters.com">Reuters</source></item>
<item><link>https://news.google.com/rss/articles/CBMiNoTitle</link></item>
</channel></rss>`;
  assert.deepEqual(await parseGoogleNewsRss(xml), []);
});

test('searchGoogleNews keeps only items within 48h of now', async () => {
  const { fetchImpl } = okFetch(FIXTURE);
  const candidates = await searchGoogleNews('iran nuclear', { now: NOW }, { fetch: fetchImpl });
  assert.deepEqual(
    candidates.map((c) => c.googleArticleId),
    ['CBMiAbc123_def', 'CBMiXyz789', 'CBMiQqq456'],
  );
});

test('searchGoogleNews sends UA header and the timeout signal', async (t) => {
  const timeoutMock = t.mock.method(AbortSignal, 'timeout');
  const { calls, fetchImpl } = okFetch(FIXTURE);
  await searchGoogleNews('iran nuclear', { now: NOW }, { fetch: fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, buildGoogleNewsSearchUrl('iran nuclear'));
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get('user-agent'), 'Mozilla/5.0 (compatible; InformedNews/1.0)');
  assert.ok(calls[0]?.init?.signal instanceof AbortSignal);
  assert.equal(timeoutMock.mock.callCount(), 1);
  assert.deepEqual(timeoutMock.mock.calls[0]?.arguments, [GOOGLE_NEWS_TIMEOUT_MS]);
  assert.equal(calls[0]?.init?.signal, timeoutMock.mock.calls[0]?.result);
});

test('searchGoogleNews throws on non-2xx', async () => {
  const fetchImpl = (async () => new Response('nope', { status: 503 })) as typeof fetch;
  await assert.rejects(
    searchGoogleNews('iran', { now: NOW }, { fetch: fetchImpl }),
    { message: 'Google News RSS 503' },
  );
});
