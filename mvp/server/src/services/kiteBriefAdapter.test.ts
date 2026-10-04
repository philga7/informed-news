import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { MuteRule } from '../store/muteRulesStore.js';
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
  buildBriefOverview,
  buildTopicBriefBatchInfo,
  buildTopicBriefCategoriesResponse,
  buildTopicBriefStoriesResponse,
  topicBriefToKiteStories,
} from './kiteBriefAdapter.js';
import type { StoreMeta } from '../types/article.js';
import type { RefreshRun } from '../types/brief.js';
import type { TriageRunMeta } from '../types/triage.js';
import type { BriefStory, TopicBrief } from './topicBrief.js';
import type { BriefFullStoryRecord } from '../types/briefFullStory.js';

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
  assert.equal(stories[0]!.id, 'a1');
  assert.equal(stories[0]!.membership_key, 'solo:a1');
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
  const solo = stories.find((s) => s.id === 'solo')!;
  assert.equal(solo.membership_key, 'solo:solo');
  assert.equal(solo.title, 'Standalone');
});

test('articlesToKiteStories uses membership key for manual seeds with clusterId=id', () => {
  const stories = articlesToKiteStories([
    article({
      id: 'manual-abc',
      title: 'Manual headline',
      clusterId: 'manual-abc',
      sourceKind: 'manual',
      canonicalUrl: 'manual://seed/abc',
      snippet: 'Note',
      publisherUrl: null,
      publisherDomain: null,
      bodyStatus: 'not_applicable',
    }),
  ]);

  assert.equal(stories.length, 1);
  assert.equal(stories[0]!.id, 'manual-abc');
  assert.equal(stories[0]!.membership_key, 'manual-abc');
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

test('resolveOwnedBriefArticles excludes muted clusters even when accepted', () => {
  const rules: MuteRule[] = [
    {
      id: 'mute-1',
      keyword: 'alpha',
      source: null,
      createdAt: '2026-09-22T00:00:00.000Z',
    },
  ];
  const result = resolveOwnedBriefArticles(
    [
      article({ id: 'a1', title: 'Alpha keyword here', clusterId: 'c1' }),
      article({ id: 'a2', title: 'Second member', clusterId: 'c1' }),
      article({ id: 'a3', title: 'Beta story', clusterId: 'c2' }),
    ],
    ['c1', 'c2'],
    new Date('2026-09-22T00:00:00.000Z'),
    rules,
  );
  assert.equal(result.fromFixture, false);
  assert.deepEqual(
    result.articles.map((a) => a.id),
    ['a3'],
  );
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

function briefStory(
  articleId: string,
  overrides: Partial<BriefStory> = {},
): BriefStory {
  return {
    articleId,
    topicId: 't1',
    rank: 1,
    more: false,
    title: `Headline ${articleId}`,
    link: `https://${articleId}.example.com/story`,
    domain: `${articleId}.example.com`,
    publisherDomain: `${articleId}.example.com`,
    publishedAt: '2026-09-30T10:00:00.000Z',
    fetchedAt: '2026-09-30T10:05:00.000Z',
    outletCount: 1,
    labels: [],
    significance: 1,
    links: [
      {
        title: `Headline ${articleId}`,
        url: `https://${articleId}.example.com/story`,
        domain: `${articleId}.example.com`,
        publishedAt: '2026-09-30T10:00:00.000Z',
        fetchedAt: '2026-09-30T10:05:00.000Z',
      },
    ],
    summary: { status: 'missing', text: null },
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    ...overrides,
  };
}

const CORE = { id: 't1', name: 'Iran', level: 'core' as const };
const WATCH = { id: 't2', name: 'Gas prices', level: 'watch' as const };

function topicBrief(): TopicBrief {
  return {
    boundaryAt: null,
    sections: [
      {
        topic: CORE,
        stories: [
          briefStory('a1', {
            outletCount: 3,
            labels: ['official'],
            summary: { status: 'ok', text: 'Officials said talks resumed.' },
            imageUrl: ' https://img.example/a1.jpg ',
            imageCaption: null,
            imageCredit: null,
            links: [
              {
                title: 'Headline a1',
                url: 'https://a1.example.com/story',
                domain: 'a1.example.com',
                publishedAt: '2026-09-30T10:00:00.000Z',
                fetchedAt: '2026-09-30T10:05:00.000Z',
              },
              {
                title: 'Dup with no date or domain',
                url: 'https://www.dup.example/x',
                domain: null,
                publishedAt: null,
                fetchedAt: '2026-09-30T09:00:00.000Z',
              },
            ],
          }),
          briefStory('a2', { rank: 2, summary: { status: 'unavailable', text: null } }),
          briefStory('a3', { rank: 3 }),
          briefStory('a4', { rank: 4, more: true }),
        ],
      },
      {
        topic: WATCH,
        stories: [briefStory('b1', { topicId: 't2' })],
      },
    ],
    quiet: [{ id: 't3', name: 'Palantir', level: 'watch' }],
  };
}

function refreshRun(completedAt: string, ok = true): RefreshRun {
  return { trigger: 'timer', startedAt: completedAt, completedAt, ok, error: ok ? null : 'CFP down' };
}

test('owned category is named Brief (slug stays world)', () => {
  assert.equal(OWNED_CATEGORY_SLUG, 'world');
  assert.equal(OWNED_CATEGORY_NAME, 'Brief');
});

test('topicBriefToKiteStories maps Brief order, cluster numbers, fields and glue', () => {
  const stories = topicBriefToKiteStories(topicBrief());
  assert.deepEqual(
    stories.map((s) => [s.id, s.cluster_number, s.informed_topic_id]),
    [
      ['a1', 1, 't1'],
      ['a2', 2, 't1'],
      ['a3', 3, 't1'],
      ['a4', 4, 't1'],
      ['b1', 5, 't2'],
    ],
  );

  const a1 = stories[0]!;
  assert.equal(a1.membership_key, 'a1');
  assert.equal(a1.category, 'world');
  assert.equal(a1.title, 'Headline a1');
  assert.equal(a1.short_summary, 'Officials said talks resumed.');
  assert.deepEqual(a1.articles, [
    {
      title: 'Headline a1',
      link: 'https://a1.example.com/story',
      domain: 'a1.example.com',
      date: '2026-09-30T10:00:00.000Z',
    },
    {
      title: 'Dup with no date or domain',
      link: 'https://www.dup.example/x',
      domain: 'dup.example',
      date: '2026-09-30T09:00:00.000Z',
    },
  ]);
  assert.deepEqual(a1.domains, [{ name: 'a1.example.com' }, { name: 'dup.example' }]);
  assert.deepEqual(a1.primary_image, {
    url: 'https://img.example/a1.jpg',
    caption: 'Headline a1',
    credit: 'a1.example.com',
    link: 'https://a1.example.com/story',
  });
  assert.equal(a1.informed_article_id, 'a1');
  assert.equal(a1.informed_topic_name, 'Iran');
  assert.equal(a1.informed_more, false);
  assert.equal(a1.informed_outlet_count, 3);
  assert.deepEqual(a1.informed_labels, ['official']);
  assert.equal(a1.informed_summary_status, 'ok');
  assert.equal(a1.informed_publisher_domain, 'a1.example.com');

  const [, a2, a3, a4, b1] = stories;
  assert.equal(a2!.short_summary, '');
  assert.equal(a2!.informed_summary_status, 'unavailable');
  assert.equal(a3!.short_summary, '');
  assert.equal(a3!.informed_summary_status, 'missing');
  assert.equal(a3!.primary_image, undefined);
  assert.equal(a4!.informed_more, true);
  assert.equal(b1!.informed_topic_name, 'Gas prices');
  for (const story of stories) {
    assert.equal(story.talking_points, undefined);
    assert.equal(story.timeline, undefined);
    assert.equal(story.perspectives, undefined);
    assert.equal(story.quote, undefined);
  }
});

test('topicBriefToKiteStories omits informed_publisher_domain when the story has none', () => {
  const brief: TopicBrief = {
    boundaryAt: null,
    sections: [{ topic: CORE, stories: [briefStory('nodomain', { publisherDomain: null })] }],
    quiet: [],
  };
  const [story] = topicBriefToKiteStories(brief);
  assert.ok(story);
  assert.equal('informed_publisher_domain' in story, false);
});

test('topicBriefToKiteStories hydrates cached full stories and reports cache states', () => {
  const record: BriefFullStoryRecord = {
    articleId: 'a1',
    status: 'ok',
    enrichment: {
      talking_points: ['Talks resumed.'],
      timeline: [{ date: 'Sep. 30', content: 'Officials met.' }],
      suggested_qna: [{ question: 'What remains unknown?', answer: 'The next meeting date.' }],
      technical_details: ['A technical detail.'],
    },
    deterministic: {
      perspectives: [{ text: 'Officials described renewed talks.', sources: [] }],
      quote: {
        quote: 'We will continue.',
        quote_author: 'A spokesperson',
        quote_attribution: 'Example',
        quote_source_url: 'https://a1.example.com/story',
        quote_source_domain: 'a1.example.com',
      },
    },
    sourceHash: 'abc',
    topicSections: [],
    model: 'test',
    error: null,
    generatedAt: '2026-09-30T12:00:00.000Z',
    trigger: 'on_demand',
    changeSummary: '1 new outlet; timeline +1',
  };
  const stories = topicBriefToKiteStories(topicBrief(), {
    a1: record,
    a2: { ...record, articleId: 'a2', status: 'unavailable', enrichment: null },
  });

  assert.equal(stories[0]!.informed_full_story_status, 'ok');
  assert.equal(stories[0]!.informed_full_story_updated, '1 new outlet; timeline +1');
  assert.deepEqual(stories[0]!.talking_points, ['Talks resumed.']);
  assert.deepEqual(stories[0]!.technical_details, ['A technical detail.']);
  assert.equal(stories[0]!.quote, 'We will continue.');
  assert.equal(stories[1]!.informed_full_story_status, 'unavailable');
  assert.equal(stories[2]!.informed_full_story_status, 'missing');
});

test('topic Brief categories/stories/batch responses: one world "Brief" category, all stories', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  const lastSuccess = refreshRun('2026-09-30T11:00:00.000Z');
  const brief = topicBrief();

  const categories = buildTopicBriefCategoriesResponse(brief, { now, lastSuccess });
  assert.equal(categories.batchId, OWNED_BATCH_ID);
  assert.equal(categories.categories.length, 1);
  assert.equal(categories.categories[0]!.id, OWNED_CATEGORY_UUID);
  assert.equal(categories.categories[0]!.categoryId, 'world');
  assert.equal(categories.categories[0]!.categoryName, 'Brief');
  assert.equal(categories.categories[0]!.clusterCount, 5);
  assert.equal(categories.categories[0]!.timestamp, Date.parse(lastSuccess.completedAt) / 1000);

  const stories = buildTopicBriefStoriesResponse(brief, 'world', { now, lastSuccess });
  assert.ok(stories);
  assert.equal(stories!.categoryId, OWNED_CATEGORY_UUID);
  assert.equal(stories!.categoryName, 'Brief');
  assert.equal(stories!.stories.length, 5);
  assert.equal(stories!.totalStories, 5);
  assert.equal(stories!.timestamp, Date.parse(lastSuccess.completedAt) / 1000);
  assert.ok(stories!.domains.some((d) => d.name === 'dup.example'));
  assert.ok(buildTopicBriefStoriesResponse(brief, OWNED_CATEGORY_UUID, { now }));
  assert.ok(buildTopicBriefStoriesResponse(brief, 'latest', { now }));
  assert.equal(buildTopicBriefStoriesResponse(brief, 'sports', { now }), null);

  const noRefresh = buildTopicBriefStoriesResponse(brief, 'world', { now, lastSuccess: null });
  assert.equal(noRefresh!.timestamp, now.getTime() / 1000);

  const batch = buildTopicBriefBatchInfo(brief, now);
  assert.equal(batch.id, OWNED_BATCH_ID);
  assert.equal(batch.totalReadCount, 5);
});

test('topic Brief with no stories → zero stories, category still world / Brief', () => {
  const empty: TopicBrief = { boundaryAt: null, sections: [], quiet: [] };
  const categories = buildTopicBriefCategoriesResponse(empty);
  assert.equal(categories.categories[0]!.categoryId, 'world');
  assert.equal(categories.categories[0]!.categoryName, 'Brief');
  assert.equal(categories.categories[0]!.clusterCount, 0);
  assert.deepEqual(buildTopicBriefStoriesResponse(empty, 'world')!.stories, []);
});

test('buildBriefOverview: sections with More split, quiet, notices, nextAt, running', () => {
  const lastSuccess = refreshRun('2026-09-30T09:00:00.000Z');
  const last = refreshRun('2026-09-30T11:00:00.000Z', false);
  const meta: StoreMeta = {
    lastFetchAt: null,
    lastError: null,
    refresh: { last, lastSuccess },
    topicSearch: {
      providers: { searxng: { state: 'down' }, google_news: { state: 'ok' } },
    } as unknown as StoreMeta['topicSearch'],
  };

  const overview = buildBriefOverview({ brief: topicBrief(), meta, intervalHours: 2.5, running: true });
  assert.deepEqual(overview, {
    ok: true,
    fixture: false,
    refresh: {
      last,
      lastSuccess,
      nextAt: '2026-09-30T11:30:00.000Z',
      intervalHours: 2.5,
      running: true,
    },
    notices: ['SearXNG unavailable', 'Last refresh failed: CFP down'],
    sections: [
      { topicId: 't1', name: 'Iran', level: 'core', storyIds: ['a1', 'a2', 'a3'], moreIds: ['a4'] },
      { topicId: 't2', name: 'Gas prices', level: 'watch', storyIds: ['b1'], moreIds: [] },
    ],
    quiet: [{ id: 't3', name: 'Palantir', level: 'watch' }],
    filteredOut: null,
  });

  const disabled = buildBriefOverview({ brief: topicBrief(), meta, intervalHours: null, running: false });
  assert.equal(disabled.refresh.nextAt, null);
  assert.equal(disabled.refresh.intervalHours, null);
  assert.equal(disabled.refresh.running, false);

  const never = buildBriefOverview({
    brief: topicBrief(),
    meta: { lastFetchAt: null, lastError: null },
    intervalHours: 3,
    running: false,
  });
  assert.equal(never.refresh.nextAt, null);
  assert.equal(never.refresh.last, null);
  assert.equal(never.refresh.lastSuccess, null);
  assert.deepEqual(never.notices, []);

  const degraded = buildBriefOverview({
    brief: topicBrief(),
    meta,
    intervalHours: 3,
    running: false,
    degraded: ['seen', 'summaries'],
  });
  assert.deepEqual(degraded.notices, [
    'SearXNG unavailable',
    'Last refresh failed: CFP down',
    'Read history unavailable (brief-seen.json unreadable)',
    'Saved summaries unavailable (brief-summaries.json unreadable)',
  ]);
});

test('buildBriefOverview: filteredOut from the last triage run; null when skipped or none', () => {
  const triage: TriageRunMeta = {
    at: '2026-09-30T11:00:00.000Z',
    skipped: false,
    candidates: 9,
    kept: 2,
    dropped: 7,
    byReason: { off_topic: 7 },
    jev: { budget: 300, used: 0, errors: 0 },
    summaryBudget: 60,
    errors: [],
  };
  const overview = (meta: StoreMeta) =>
    buildBriefOverview({ brief: topicBrief(), meta, intervalHours: 3, running: false });
  const base = { lastFetchAt: null, lastError: null };
  assert.equal(overview({ ...base, triage }).filteredOut, 7);
  assert.equal(overview({ ...base, triage: { ...triage, dropped: 0 } }).filteredOut, 0);
  assert.equal(overview({ ...base, triage: { ...triage, skipped: true } }).filteredOut, null);
  assert.equal(overview({ ...base, triage: null }).filteredOut, null);
  assert.equal(overview(base).filteredOut, null);
});

test('buildBriefOverview: fixture (brief null) → no sections or quiet line', () => {
  const overview = buildBriefOverview({
    brief: null,
    meta: { lastFetchAt: null, lastError: null },
    intervalHours: 3,
    running: false,
  });
  assert.equal(overview.fixture, true);
  assert.deepEqual(overview.sections, []);
  assert.deepEqual(overview.quiet, []);
});
