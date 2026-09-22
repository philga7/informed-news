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
  filterArticlesForBrief,
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

test('articlesToKiteStories uses operator note for manual seeds', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'manual-note',
      title: 'Manual headline',
      sourceKind: 'manual',
      canonicalUrl: 'manual://seed/test-uuid',
      snippet: 'Operator context note',
      publisherUrl: null,
      publisherDomain: null,
      bodyStatus: 'not_applicable',
    }),
  ]);

  assert.equal(stories.length, 1);
  assert.equal(stories[0]!.short_summary, 'Operator context note');
});

test('articlesToKiteStories uses honest copy for manual seeds without note', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'manual-empty',
      title: 'Manual headline only',
      sourceKind: 'manual',
      canonicalUrl: 'manual://seed/empty-uuid',
      snippet: '',
      publisherUrl: null,
      publisherDomain: null,
      bodyStatus: 'not_applicable',
    }),
  ]);

  assert.equal(stories.length, 1);
  assert.equal(
    stories[0]!.short_summary,
    'Operator-seeded story — no publisher body yet.',
  );
  assert.notEqual(stories[0]!.short_summary, 'Manual headline only');
});

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
  assert.equal(stories[0]!.category, OWNED_CATEGORY_NAME);
  assert.equal(stories[0]!.articles[0]!.domain, 'example.com');
  assert.equal(stories[0]!.articles[0]!.link, 'https://example.com/a1');
  assert.deepEqual(stories[0]!.domains, [{ name: 'example.com' }]);
  assert.equal(stories[0]!.perspectives, undefined);
  assert.equal(stories[0]!.quote, undefined);
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

test('articlesToKiteStories maps primary_image and per-article image when present', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'img-new',
      title: 'Newer member without image',
      clusterId: 'img-cluster',
      publishedAt: '2026-09-12T15:00:00.000Z',
      imageUrl: null,
    }),
    article({
      id: 'img-old',
      title: 'Older member with image',
      clusterId: 'img-cluster',
      publishedAt: '2026-09-12T10:00:00.000Z',
      imageUrl: 'https://img.example/one.jpg',
      imageCaption: 'Caption text',
      imageCredit: 'Credit text',
      publisherUrl: 'https://example.com/img-old',
      canonicalUrl: 'https://citizenfreepress.com/img-old',
      publisherDomain: 'example.com',
    }),
  ]);

  const story = stories.find((s) => s.id === 'img-cluster')!;
  assert.deepEqual(story.primary_image, {
    url: 'https://img.example/one.jpg',
    caption: 'Caption text',
    credit: 'Credit text',
    link: 'https://example.com/img-old',
  });

  const old = story.articles.find((a) => a.link === 'https://example.com/img-old')!;
  assert.equal(old.image, 'https://img.example/one.jpg');
  const newer = story.articles.find((a) => a.link === 'https://example.com/img-new')!;
  assert.equal(newer.image, undefined);
});

test('articlesToKiteStories omits primary_image when no members have imageUrl', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'noimg-1',
      title: 'No image here',
      clusterId: 'noimg-cluster',
      imageUrl: null,
    }),
    article({
      id: 'noimg-2',
      title: 'Also no image',
      clusterId: 'noimg-cluster',
      imageUrl: null,
    }),
  ]);

  const story = stories.find((s) => s.id === 'noimg-cluster')!;
  assert.equal(story.primary_image, undefined);
  assert.ok(story.articles.every((a) => a.image === undefined));
});

test('articlesToKiteStories maps enrichment onto stories when provided', () => {
  const stories = articlesToKiteStories(
    [
      article({
        id: 'e1',
        title: 'Enriched cluster',
        clusterId: 'enriched-1',
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
          framingSummary: 'Fallback framing summary',
          evidenceQuotes: [],
          openQuestions: [],
          confidence: 0.8,
        },
      }),
    ],
    {
      enrichments: new Map([
        [
          'enriched-1',
          {
            talking_points: ['Point A', 'Point B'],
            timeline: [{ date: '2026-09-12', content: 'Timeline entry' }],
            suggested_qna: [{ question: 'Q?', answer: 'A.' }],
            short_summary: 'Enrichment short summary wins',
          },
        ],
      ]),
    },
  );

  assert.equal(stories.length, 1);
  const story = stories[0]!;
  assert.equal(story.short_summary, 'Enrichment short summary wins');
  assert.deepEqual(story.talking_points, ['Point A', 'Point B']);
  assert.deepEqual(story.timeline, [
    { date: '2026-09-12', content: 'Timeline entry' },
  ]);
  assert.deepEqual(story.suggested_qna, [{ question: 'Q?', answer: 'A.' }]);
});

test('articlesToKiteStories omits enrichment fields when missing or empty', () => {
  const missing = articlesToKiteStories([
    article({ id: 'm1', title: 'Missing enrichment', clusterId: 'm-cluster' }),
  ]);
  assert.equal(missing[0]!.talking_points, undefined);
  assert.equal(missing[0]!.timeline, undefined);
  assert.equal(missing[0]!.suggested_qna, undefined);

  const empty = articlesToKiteStories(
    [
      article({
        id: 'm2',
        title: 'Empty enrichment arrays',
        clusterId: 'empty-cluster',
      }),
    ],
    {
      enrichments: {
        'empty-cluster': {
          talking_points: [],
          timeline: [],
          suggested_qna: [],
        },
      },
    },
  );
  assert.equal(empty[0]!.talking_points, undefined);
  assert.equal(empty[0]!.timeline, undefined);
  assert.equal(empty[0]!.suggested_qna, undefined);
});

test('multi-member clusters map members to perspectives', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'p1',
      title: 'Perspective One',
      clusterId: 'p-cluster',
      publisherDomain: 'one.example',
      publisherUrl: 'https://one.example/story-1',
    }),
    article({
      id: 'p2',
      title: 'Perspective Two',
      clusterId: 'p-cluster',
      publisherDomain: 'two.example',
      publisherUrl: 'https://two.example/story-2',
    }),
  ]);

  const story = stories.find((s) => s.id === 'p-cluster')!;
  assert.ok(story.perspectives && story.perspectives.length >= 1);
  for (const perspective of story.perspectives!) {
    assert.ok(perspective.text && perspective.text.length > 0);
    assert.ok(
      perspective.sources[0]!.url &&
        perspective.sources[0]!.url.length > 0,
    );
  }
});

test('story domains are unique per cluster from publisher domains', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'd1',
      title: 'Domain one',
      clusterId: 'dom-1',
      publisherDomain: 'one.example',
    }),
    article({
      id: 'd2',
      title: 'Domain two',
      clusterId: 'dom-1',
      publisherDomain: 'two.example',
    }),
    article({
      id: 'd3',
      title: 'Duplicate',
      clusterId: 'dom-1',
      publisherDomain: 'two.example',
    }),
  ]);

  const story = stories.find((s) => s.id === 'dom-1')!;
  const storyDomains = story.domains?.map((d) => d.name).sort();
  assert.deepEqual(storyDomains, ['one.example', 'two.example']);
});

test('quote fields are populated from first usable evidenceQuotes entry', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'old',
      title: 'Older member with quote',
      clusterId: 'q-1',
      publishedAt: '2026-09-12T10:00:00.000Z',
      publisherDomain: 'old.example',
      publisherUrl: 'https://old.example/story',
      publisherTitle: 'Old Example',
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
        framingSummary: 'Old framing summary',
        evidenceQuotes: ['Old quote'],
        openQuestions: [],
        confidence: 0.8,
      },
    }),
    article({
      id: 'new',
      title: 'Newer member with quote',
      clusterId: 'q-1',
      publishedAt: '2026-09-12T15:00:00.000Z',
      publisherDomain: 'new.example',
      publisherUrl: 'https://new.example/story',
      publisherTitle: 'New Example',
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
        framingSummary: 'New framing summary',
        evidenceQuotes: ['Latest quote'],
        openQuestions: [],
        confidence: 0.8,
      },
    }),
  ]);

  const story = stories.find((s) => s.id === 'q-1')!;
  assert.equal(story.quote, 'Latest quote');
  assert.equal(story.quote_source_url, 'https://new.example/story');
  assert.equal(story.quote_source_domain, 'new.example');
  assert.equal(story.quote_attribution, 'New Example');
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

  const live = resolveOwnedBriefArticles(
    [article({ id: 'live', title: 'Live ingest' })],
    ['solo:live'],
  );
  assert.equal(live.fromFixture, false);
  assert.equal(live.articles[0]!.title, 'Live ingest');
});

test('resolveOwnedBriefArticles returns empty when store has articles but none accepted', () => {
  const result = resolveOwnedBriefArticles(
    [
      article({ id: 'a1', title: 'One' }),
      article({ id: 'a2', title: 'Two', clusterId: 'c1' }),
    ],
    [],
  );
  assert.equal(result.fromFixture, false);
  assert.deepEqual(result.articles, []);
});

test('filterArticlesForBrief keeps accepted cluster members including new ingest', () => {
  const articles = [
    article({ id: 'old', title: 'Old member', clusterId: 'c1' }),
    article({ id: 'new', title: 'New member', clusterId: 'c1' }),
    article({ id: 'other', title: 'Other cluster', clusterId: 'c2' }),
    article({ id: 'solo', title: 'Solo article', clusterId: null }),
  ];

  const filtered = filterArticlesForBrief(articles, ['c1', 'solo:solo']);
  assert.deepEqual(
    filtered.map((a) => a.id),
    ['old', 'new', 'solo'],
  );
});

test('resolveOwnedBriefArticles accepts solo cluster keys', () => {
  const result = resolveOwnedBriefArticles(
    [article({ id: 'solo-1', title: 'Solo story', clusterId: null })],
    ['solo:solo-1'],
  );
  assert.equal(result.fromFixture, false);
  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0]!.id, 'solo-1');
});

test('resolveOwnedBriefArticles still uses fixture when store empty regardless of membership', () => {
  const result = resolveOwnedBriefArticles([], ['c1', 'solo:x']);
  assert.equal(result.fromFixture, true);
  assert.equal(result.articles[0]!.title, OWNED_FIXTURE_TITLE);
});

test('fixture articles produce at least one story', () => {
  const fixture = ownedBriefFixtureArticles(
    new Date('2026-09-12T00:00:00.000Z'),
  );
  const stories = articlesToKiteStories(fixture);
  assert.ok(stories.length >= 1);
  assert.match(stories[0]!.title, /Owned brief fixture/);
  const domains = stories[0]!.domains?.map((d) => d.name);
  assert.ok(domains && domains.length >= 1);
  assert.ok(stories[0]!.quote);
  assert.ok(stories[0]!.perspectives);
  assert.ok(stories[0]!.perspectives!.length >= 1);
});
