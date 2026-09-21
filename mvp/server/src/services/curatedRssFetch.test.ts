import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { RadarSource } from '../types/radarSource.js';
import { parseRssXml } from './rss.js';
import { fetchCuratedRss } from './curatedRssFetch.js';

const FIXTURE_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Fox Latest</title>
    <link>https://www.foxnews.com/</link>
    <description>Latest headlines</description>
    <item>
      <title>Story One</title>
      <link>https://www.foxnews.com/politics/story-one#some-fragment</link>
      <description>Story one description.</description>
      <pubDate>Sun, 20 Sep 2026 18:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Story Two</title>
      <link>https://www.foxnews.com/world/story-two</link>
      <description>Story two description.</description>
      <pubDate>Sun, 20 Sep 2026 19:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

async function fixtureItems() {
  return parseRssXml(FIXTURE_RSS_XML);
}

type UpsertInput = Array<Omit<Article, 'id'> & { id?: string }>;

function makeSources(): RadarSource[] {
  return [
    {
      id: 'fox-latest',
      name: 'Fox Latest',
      domain: 'foxnews.com',
      feedUrl: 'https://moxie.foxnews.com/google-publisher/latest.xml',
    },
  ];
}

test('fetchCuratedRss ingests RSS items as rss articles and strips fragments', async () => {
  const sources = makeSources();
  const items = await fixtureItems();

  const upsertBatches: UpsertInput[] = [];

  const result = await fetchCuratedRss(
    { sources, limit: 10 },
    {
      parseRssFeed: async () => items,
      scrapePublisherBody: async () => ({
        bodyText: 'Body text',
        bodyStatus: 'ok',
        publisherTitle: 'Publisher Story Title',
        imageUrl: null,
        imageCaption: null,
        imageCredit: null,
      }),
      upsertArticles: async (incoming) => {
        upsertBatches.push(incoming);
        // Simulate store assigning stable ids.
        return incoming.map((article, index) => ({
          ...article,
          id: `a-${index + 1}`,
        })) as Article[];
      },
    },
  );

  assert.equal(result.skipped, false);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.sources, ['fox-latest']);
  assert.ok(result.fetched >= 1);
  assert.ok(result.upserted.length >= 1);

  const first = result.upserted[0];
  assert.equal(first.sourceKind, 'rss');
  assert.equal(first.handle, null);
  assert.equal(first.publisherUrl, first.canonicalUrl);
  assert.ok(first.citations.length >= 1);
  assert.equal(first.citations[0].label, 'Fox Latest');
  assert.doesNotMatch(first.canonicalUrl, /#/);

  // Upsert input was article-shaped and used rss kind.
  assert.equal(upsertBatches.length, 1);
  const batch = upsertBatches[0];
  assert.ok(batch.length >= 1);
  assert.equal(batch[0].sourceKind, 'rss');
});

test('fetchCuratedRss returns skipped when sources are empty', async () => {
  const result = await fetchCuratedRss(
    { sources: [] },
    {
      // Should never be called, but provide no-op deps defensively.
      parseRssFeed: async () => {
        throw new Error('should not be called for empty sources');
      },
      scrapePublisherBody: async () => {
        throw new Error('should not be called for empty sources');
      },
      upsertArticles: async () => {
        throw new Error('should not be called for empty sources');
      },
    },
  );

  assert.equal(result.skipped, true);
  assert.equal(result.fetched, 0);
  assert.equal(result.upserted.length, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.sources.length, 0);
});

test('one failing source does not block another', async () => {
  const goodSources: RadarSource[] = [
    {
      id: 'good-source',
      name: 'Good Source',
      domain: 'example.com',
      feedUrl: 'https://example.com/rss.xml',
    },
    {
      id: 'failing-source',
      name: 'Failing Source',
      domain: 'example.org',
      feedUrl: 'https://example.org/fail.xml',
    },
  ];

  const items = await fixtureItems();
  let parseCalls = 0;

  const result = await fetchCuratedRss(
    { sources: goodSources, limit: 5 },
    {
      parseRssFeed: async (url: string) => {
        parseCalls += 1;
        if (url.includes('fail')) {
          throw new Error('boom');
        }
        return items;
      },
      scrapePublisherBody: async () => ({
        bodyText: 'Body text',
        bodyStatus: 'ok',
        publisherTitle: 'Title',
        imageUrl: null,
        imageCaption: null,
        imageCredit: null,
      }),
      upsertArticles: async (incoming) =>
        incoming.map((article, index) => ({
          ...article,
          id: `g-${index + 1}`,
        })) as Article[],
    },
  );

  assert.equal(parseCalls, 2);
  assert.equal(result.skipped, false);
  assert.ok(result.fetched >= 1);
  assert.ok(result.upserted.length >= 1);
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.includes('good-source'));
  assert.ok(result.sources.includes('failing-source'));
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /failing-source/);
});

