import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import {
  OWNED_BATCH_ID,
  OWNED_CATEGORY_NAME,
  OWNED_CATEGORY_SLUG,
  OWNED_CATEGORY_UUID,
  OWNED_FIXTURE_TITLE,
  articlesToKiteStories,
  buildOwnedBatchInfo,
  buildOwnedCategoriesResponse,
  buildOwnedStoriesResponse,
  ownedBriefFixtureArticles,
  resolveOwnedBriefArticles,
} from './kiteBriefAdapter.js';

function article(
  overrides: Partial<Article> & Pick<Article, 'id' | 'title'>,
): Article {
  return {
    sourceKind: 'cfp',
    canonicalUrl: `https://citizenfreepress.com/${overrides.id}`,
    citations: [
      { label: 'CFP', url: `https://citizenfreepress.com/${overrides.id}` },
    ],
    publisherUrl: `https://example.com/${overrides.id}`,
    publisherDomain: 'example.com',
    handle: null,
    publishedAt: '2026-09-12T12:00:00.000Z',
    snippet: 'Snippet text',
    bodyText: null,
    bodyStatus: 'ok',
    publisherTitle: null,
    clusterId: null,
    fetchedAt: '2026-09-12T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('articlesToKiteStories maps solo articles and prefers framing summary', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'a1',
      title: 'Headline A',
      classification: {
        genre: 'news_blurb',
        headlineDevices: [],
        dimensions: {
          loadedLanguage: 0.1,
          emotionalAppeal: 0.1,
          certaintyClaiming: 0.1,
          omissionOrSelectionRisk: 0.1,
          attributionClarity: 0.9,
        },
        framingSummary: 'AI framing summary for A',
        evidenceQuotes: [],
        openQuestions: [],
        confidence: 0.8,
      },
    }),
  ]);

  assert.equal(stories.length, 1);
  assert.equal(stories[0]!.title, 'Headline A');
  assert.equal(stories[0]!.short_summary, 'AI framing summary for A');
  assert.equal(stories[0]!.category, OWNED_CATEGORY_SLUG);
  assert.equal(stories[0]!.articles[0]!.domain, 'example.com');
  assert.equal(stories[0]!.articles[0]!.link, 'https://example.com/a1');
});

test('articlesToKiteStories groups by clusterId', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'c1',
      title: 'Cluster lead',
      clusterId: 'evt-1',
      publishedAt: '2026-09-12T14:00:00.000Z',
    }),
    article({
      id: 'c2',
      title: 'Cluster follow-up',
      clusterId: 'evt-1',
      publishedAt: '2026-09-12T13:00:00.000Z',
    }),
    article({ id: 'solo', title: 'Standalone' }),
  ]);

  assert.equal(stories.length, 2);
  const clustered = stories.find((s) => s.id === 'evt-1')!;
  assert.equal(clustered.articles.length, 2);
  assert.equal(clustered.title, 'Cluster lead');
});

test('owned batch/categories/stories responses match Kite cold-path shape', () => {
  const now = new Date('2026-09-12T18:00:00.000Z');
  const articles = [
    article({ id: 'x1', title: 'One' }),
    article({ id: 'x2', title: 'Two', clusterId: 'g' }),
  ];

  const batch = buildOwnedBatchInfo(articles, now);
  assert.equal(batch.id, OWNED_BATCH_ID);
  assert.equal(batch.dateSlug, '2026-09-12.1');
  assert.equal(batch.totalReadCount, 2);

  const categories = buildOwnedCategoriesResponse(articles, now);
  assert.equal(categories.batchId, OWNED_BATCH_ID);
  assert.equal(categories.hasOnThisDay, false);
  assert.equal(categories.categories.length, 1);
  assert.equal(categories.categories[0]!.id, OWNED_CATEGORY_UUID);
  assert.equal(categories.categories[0]!.categoryId, OWNED_CATEGORY_SLUG);
  assert.equal(categories.categories[0]!.categoryName, OWNED_CATEGORY_NAME);

  const stories = buildOwnedStoriesResponse(articles, OWNED_CATEGORY_UUID, {
    limit: 12,
    now,
  });
  assert.ok(stories);
  assert.equal(stories!.batchId, OWNED_BATCH_ID);
  assert.ok(stories!.stories.length >= 1);
  assert.equal(stories!.categoryName, OWNED_CATEGORY_NAME);
});

test('resolveOwnedBriefArticles uses fixture when store empty', () => {
  const empty = resolveOwnedBriefArticles([]);
  assert.equal(empty.fromFixture, true);
  assert.equal(empty.articles[0]!.title, OWNED_FIXTURE_TITLE);

  const live = resolveOwnedBriefArticles([
    article({ id: 'live', title: 'Live ingest' }),
  ]);
  assert.equal(live.fromFixture, false);
  assert.equal(live.articles[0]!.title, 'Live ingest');
});

test('fixture articles produce at least one story', () => {
  const fixture = ownedBriefFixtureArticles(
    new Date('2026-09-12T00:00:00.000Z'),
  );
  const stories = articlesToKiteStories(fixture);
  assert.equal(stories.length, 1);
  assert.match(stories[0]!.title, /Owned brief fixture/);
});
