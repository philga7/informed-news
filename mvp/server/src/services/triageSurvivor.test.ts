import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { articleIdFromCanonicalUrl, readArticles, updateArticles } from '../store/index.js';
import type { Article, FramingAnalysis } from '../types/article.js';
import { classifyUnclassifiedArticles } from './classifyArticles.js';
import type { PublisherBodyResult } from './publisherBodyScrape.js';
import {
  prepareSurvivor,
  withSurvivorFields,
  writeBackSurvivors,
  type SurvivorDeps,
} from './triageSurvivor.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const GOOGLE_URL = 'https://news.google.com/rss/articles/CBMiAbc';
const PUBLISHER_URL = 'https://www.reuters.com/world/port-strike';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'Port strike enters second week',
    sourceKind: 'search',
    sourceTier: 'sensor',
    canonicalUrl: GOOGLE_URL,
    citations: [{ label: 'Reuters', url: GOOGLE_URL }],
    publisherUrl: null,
    publisherDomain: 'reuters.com',
    handle: null,
    publishedAt: null,
    snippet: 'Dockworkers stayed off the job.',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-09-30T11:00:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    topicIds: ['t-ports'],
    googleNewsUrl: GOOGLE_URL,
    ...overrides,
  };
}

function okBody(overrides: Partial<PublisherBodyResult> = {}): PublisherBodyResult {
  return {
    bodyText: 'Full body text of the story.',
    bodyStatus: 'ok',
    publisherTitle: 'Port strike enters second week | Reuters',
    imageUrl: 'https://cdn.reuters.com/hero.jpg',
    imageCaption: 'Dockworkers',
    imageCredit: 'reuters.com',
    publishedAt: null,
    ...overrides,
  };
}

type Recorder = { resolved: string[]; scraped: Array<string | null> };

function fakeDeps(
  options: { resolveTo?: string | null; body?: PublisherBodyResult } = {},
): { deps: SurvivorDeps; calls: Recorder } {
  const calls: Recorder = { resolved: [], scraped: [] };
  return {
    calls,
    deps: {
      resolveGoogleNewsUrl: async (googleUrl) => {
        calls.resolved.push(googleUrl);
        return options.resolveTo === undefined ? PUBLISHER_URL : options.resolveTo;
      },
      scrapePublisherBody: async (url) => {
        calls.scraped.push(url);
        return options.body ?? okBody();
      },
    },
  };
}

test('Google-only row resolves, then scrapes the publisher URL', async () => {
  const article = makeArticle({ publishedAt: '2026-09-30T10:00:00.000Z' });
  const { deps, calls } = fakeDeps();

  const result = await prepareSurvivor(article, NOW, deps);

  assert.deepEqual(calls.resolved, [GOOGLE_URL]);
  assert.deepEqual(calls.scraped, [PUBLISHER_URL]);
  assert.equal(result.changed, true);
  assert.equal(result.dateIssue, null);
  assert.equal(result.article.publisherUrl, PUBLISHER_URL);
  assert.equal(result.article.publisherDomain, 'reuters.com');
  assert.equal(result.article.bodyStatus, 'ok');
  assert.equal(result.article.bodyText, 'Full body text of the story.');
  assert.equal(result.article.publisherTitle, 'Port strike enters second week | Reuters');
  assert.equal(result.article.imageUrl, 'https://cdn.reuters.com/hero.jpg');
  assert.equal(result.article.imageCaption, 'Dockworkers');
  assert.equal(result.article.imageCredit, 'reuters.com');
  assert.deepEqual(result.article.citations, [
    { label: 'Reuters', url: GOOGLE_URL },
    { label: 'Reuters', url: PUBLISHER_URL },
  ]);
  assert.equal(result.article.id, 'a1');
  assert.equal(result.article.canonicalUrl, GOOGLE_URL);
  assert.equal(article.bodyStatus, 'pending', 'input article is not mutated');
});

test('resolved citation is appended only once', async () => {
  const article = makeArticle({
    citations: [
      { label: 'Reuters', url: GOOGLE_URL },
      { label: 'Reuters', url: PUBLISHER_URL },
    ],
  });
  const { deps } = fakeDeps();

  const result = await prepareSurvivor(article, NOW, deps);

  assert.equal(result.article.citations.length, 2);
  assert.equal(
    result.article.citations.filter((c) => c.url === PUBLISHER_URL).length,
    1,
  );
});

test('resolved citation label falls back to the publisher domain', async () => {
  const article = makeArticle({ citations: [] });
  const { deps } = fakeDeps();

  const result = await prepareSurvivor(article, NOW, deps);

  assert.deepEqual(result.article.citations, [{ label: 'reuters.com', url: PUBLISHER_URL }]);
});

test('resolved URL with no parseable host keeps the existing publisherDomain', async () => {
  const article = makeArticle({ publishedAt: '2026-09-30T10:00:00.000Z' });
  const { deps } = fakeDeps({ resolveTo: 'not a url' });

  const result = await prepareSurvivor(article, NOW, deps);

  assert.equal(result.article.publisherUrl, 'not a url');
  assert.equal(result.article.publisherDomain, 'reuters.com');
});

test('null scrape fields keep the article publisherTitle and image fields', async () => {
  const article = makeArticle({
    publishedAt: '2026-09-30T10:00:00.000Z',
    publisherTitle: 'Feed headline | Reuters',
    imageUrl: 'https://cdn.reuters.com/feed.jpg',
    imageCaption: 'Feed caption',
    imageCredit: 'Feed credit',
  });
  const { deps } = fakeDeps({
    body: okBody({ publisherTitle: null, imageUrl: null, imageCaption: null, imageCredit: null }),
  });

  const result = await prepareSurvivor(article, NOW, deps);

  assert.equal(result.article.bodyStatus, 'ok');
  assert.equal(result.article.publisherTitle, 'Feed headline | Reuters');
  assert.equal(result.article.imageUrl, 'https://cdn.reuters.com/feed.jpg');
  assert.equal(result.article.imageCaption, 'Feed caption');
  assert.equal(result.article.imageCredit, 'Feed credit');

  const unresolved = await prepareSurvivor(article, NOW, fakeDeps({ resolveTo: null }).deps);
  assert.equal(unresolved.article.bodyStatus, 'unavailable');
  assert.equal(unresolved.article.publisherTitle, 'Feed headline | Reuters');
  assert.equal(unresolved.article.imageUrl, 'https://cdn.reuters.com/feed.jpg');
});

test('resolve failure skips the scrape, marks unavailable, and flags undated search rows', async () => {
  const article = makeArticle();
  const { deps, calls } = fakeDeps({ resolveTo: null });

  const result = await prepareSurvivor(article, NOW, deps);

  assert.deepEqual(calls.resolved, [GOOGLE_URL]);
  assert.deepEqual(calls.scraped, []);
  assert.equal(result.changed, true);
  assert.equal(result.article.bodyStatus, 'unavailable');
  assert.equal(result.article.bodyText, null);
  assert.equal(result.article.publisherUrl, null);
  assert.deepEqual(result.article.citations, article.citations);
  assert.equal(result.dateIssue, 'undated');
});

test('row with a publisherUrl scrapes without resolving', async () => {
  const article = makeArticle({
    publisherUrl: PUBLISHER_URL,
    citations: [{ label: 'Reuters', url: PUBLISHER_URL }],
    publishedAt: '2026-09-30T09:00:00.000Z',
  });
  const { deps, calls } = fakeDeps();

  const result = await prepareSurvivor(article, NOW, deps);

  assert.deepEqual(calls.resolved, []);
  assert.deepEqual(calls.scraped, [PUBLISHER_URL]);
  assert.equal(result.article.bodyStatus, 'ok');
  assert.equal(result.article.citations.length, 1);
});

test('non-pending row makes no calls and is unchanged', async () => {
  const article = makeArticle({
    bodyStatus: 'ok',
    bodyText: 'Already scraped.',
    publishedAt: '2026-09-30T08:00:00.000Z',
  });
  const { deps, calls } = fakeDeps();

  const result = await prepareSurvivor(article, NOW, deps);

  assert.deepEqual(calls, { resolved: [], scraped: [] });
  assert.equal(result.changed, false);
  assert.equal(result.article, article);
  assert.equal(result.dateIssue, null);
});

test('non-pending row still reports its date issue', async () => {
  const undated = await prepareSurvivor(makeArticle({ bodyStatus: 'unavailable' }), NOW, fakeDeps().deps);
  assert.equal(undated.dateIssue, 'undated');

  const stale = await prepareSurvivor(
    makeArticle({ bodyStatus: 'ok', publishedAt: '2026-09-27T00:00:00.000Z' }),
    NOW,
    fakeDeps().deps,
  );
  assert.equal(stale.dateIssue, 'stale');
});

test('page date fills a null publishedAt', async () => {
  const { deps } = fakeDeps({ body: okBody({ publishedAt: '2026-09-30T07:00:00.000Z' }) });

  const result = await prepareSurvivor(makeArticle(), NOW, deps);

  assert.equal(result.article.publishedAt, '2026-09-30T07:00:00.000Z');
  assert.equal(result.dateIssue, null);
});

test('page date never overwrites an existing publishedAt', async () => {
  const { deps } = fakeDeps({ body: okBody({ publishedAt: '2026-01-01T00:00:00.000Z' }) });

  const result = await prepareSurvivor(
    makeArticle({ publishedAt: '2026-09-30T06:00:00.000Z' }),
    NOW,
    deps,
  );

  assert.equal(result.article.publishedAt, '2026-09-30T06:00:00.000Z');
  assert.equal(result.dateIssue, null);
});

test('page date older than the triage window is stale', async () => {
  const { deps } = fakeDeps({ body: okBody({ publishedAt: '2026-09-28T11:59:00.000Z' }) });

  const result = await prepareSurvivor(makeArticle(), NOW, deps);

  assert.equal(result.article.publishedAt, '2026-09-28T11:59:00.000Z');
  assert.equal(result.dateIssue, 'stale');
});

test('date exactly at the window edge is not stale', async () => {
  const result = await prepareSurvivor(
    makeArticle({ bodyStatus: 'ok', publishedAt: '2026-09-28T12:00:00.000Z' }),
    NOW,
    fakeDeps().deps,
  );
  assert.equal(result.dateIssue, null);
});

test('CFP row with null publishedAt uses fetchedAt and is never undated', async () => {
  const article = makeArticle({
    sourceKind: 'cfp',
    canonicalUrl: 'https://citizenfreepress.com/story',
    publisherUrl: PUBLISHER_URL,
    googleNewsUrl: undefined,
    publishedAt: null,
    fetchedAt: '2026-09-30T11:30:00.000Z',
  });
  const { deps } = fakeDeps();

  const result = await prepareSurvivor(article, NOW, deps);
  assert.equal(result.dateIssue, null);

  const staleCfp = await prepareSurvivor(
    { ...article, bodyStatus: 'ok', fetchedAt: '2026-09-25T00:00:00.000Z' },
    NOW,
    deps,
  );
  assert.equal(staleCfp.dateIssue, 'stale');
});

test('blocked scrape copies status and page date but no body', async () => {
  const { deps } = fakeDeps({
    body: okBody({
      bodyText: null,
      bodyStatus: 'blocked',
      imageUrl: null,
      imageCaption: null,
      imageCredit: null,
      publishedAt: '2026-09-30T05:00:00.000Z',
    }),
  });

  const result = await prepareSurvivor(makeArticle(), NOW, deps);

  assert.equal(result.article.bodyStatus, 'blocked');
  assert.equal(result.article.bodyText, null);
  assert.equal(result.article.publishedAt, '2026-09-30T05:00:00.000Z');
});

test('throwing deps never escape: resolver error skips scrape, scrape error is unavailable', async () => {
  const throwingResolve = await prepareSurvivor(makeArticle(), NOW, {
    resolveGoogleNewsUrl: async () => {
      throw new Error('resolver exploded');
    },
    scrapePublisherBody: async () => {
      throw new Error('should not be called');
    },
  });
  assert.equal(throwingResolve.article.bodyStatus, 'unavailable');
  assert.equal(throwingResolve.article.publisherUrl, null);
  assert.equal(throwingResolve.dateIssue, 'undated');

  const throwingScrape = await prepareSurvivor(
    makeArticle({ publisherUrl: PUBLISHER_URL, publishedAt: '2026-09-30T10:00:00.000Z' }),
    NOW,
    {
      scrapePublisherBody: async () => {
        throw new Error('scrape exploded');
      },
    },
  );
  assert.equal(throwingScrape.changed, true);
  assert.equal(throwingScrape.article.bodyStatus, 'unavailable');
  assert.equal(throwingScrape.dateIssue, null);
});

test('withSurvivorFields takes only the fields survivor prep owns; publishedAt only fills an empty one', () => {
  const stored = makeArticle({
    title: 'Port strike enters third week',
    clusterId: 'c-ports',
    classifiedAt: '2026-09-30T11:30:00.000Z',
    classifyError: 'model timeout',
    searchSeenAt: '2026-09-30T11:45:00.000Z',
    topicIds: ['t-ports', 't-labor'],
  });
  const prepared = makeArticle({
    publisherUrl: PUBLISHER_URL,
    publisherDomain: 'www.reuters.com',
    citations: [
      { label: 'Reuters', url: GOOGLE_URL },
      { label: 'Reuters', url: PUBLISHER_URL },
    ],
    bodyText: 'Dockworkers stayed off the job for a third week.',
    bodyStatus: 'ok',
    publisherTitle: 'Port strike drags on',
    imageUrl: 'https://www.reuters.com/port.jpg',
    imageCaption: 'Idle cranes',
    imageCredit: 'Reuters',
    publishedAt: '2026-09-30T09:00:00.000Z',
    fetchedAt: '2026-09-30T08:00:00.000Z',
  });

  assert.deepEqual(withSurvivorFields(stored, prepared), {
    ...stored,
    publisherUrl: PUBLISHER_URL,
    publisherDomain: 'www.reuters.com',
    citations: prepared.citations,
    bodyText: 'Dockworkers stayed off the job for a third week.',
    bodyStatus: 'ok',
    publisherTitle: 'Port strike drags on',
    imageUrl: 'https://www.reuters.com/port.jpg',
    imageCaption: 'Idle cranes',
    imageCredit: 'Reuters',
    publishedAt: '2026-09-30T09:00:00.000Z',
    classifiedAt: null,
    classifyError: null,
  });

  const failedScrape = { ...prepared, bodyText: null, bodyStatus: 'unavailable' as const };
  const keptClassify = withSurvivorFields(stored, failedScrape);
  assert.equal(keptClassify.classifiedAt, '2026-09-30T11:30:00.000Z');
  assert.equal(keptClassify.classifyError, 'model timeout');

  const dated = makeArticle({ publishedAt: '2026-09-30T10:00:00.000Z' });
  assert.equal(withSurvivorFields(dated, prepared).publishedAt, '2026-09-30T10:00:00.000Z');
});

function storedArticle(slug: string, overrides: Partial<Article> = {}): Article {
  const canonicalUrl = `${GOOGLE_URL}-${slug}`;
  return makeArticle({ id: articleIdFromCanonicalUrl(canonicalUrl), canonicalUrl, ...overrides });
}

test('writeBackSurvivors patches rows still pending and leaves rows another writer prepared or pruned mid-run', async () => {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'survivor-write-back-')), 'articles.json');
  const pending = storedArticle('pending');
  const scrapedMeanwhile = storedArticle('scraped', {
    bodyText: 'Body another writer scraped.',
    bodyStatus: 'ok',
    publisherTitle: 'Their title',
    imageUrl: 'https://www.reuters.com/theirs.jpg',
  });
  await updateArticles(() => [pending, scrapedMeanwhile], articlesPath);

  const failedScrape = { bodyText: null, bodyStatus: 'unavailable' as const, publisherTitle: null, imageUrl: null };
  await writeBackSurvivors(
    [
      { ...pending, ...failedScrape, publisherUrl: PUBLISHER_URL },
      { ...storedArticle('scraped'), ...failedScrape },
      { ...storedArticle('pruned'), ...failedScrape },
    ],
    articlesPath,
  );

  const [patched, untouched, ...rest] = await readArticles(articlesPath);
  assert.equal(rest.length, 0);
  assert.equal(patched!.bodyStatus, 'unavailable');
  assert.equal(patched!.publisherUrl, PUBLISHER_URL);
  assert.deepEqual(untouched, scrapedMeanwhile);
});

function framing(framingSummary: string): FramingAnalysis {
  return {
    genre: 'news_blurb',
    headlineDevices: [],
    dimensions: {
      loadedLanguage: 0.1,
      emotionalAppeal: 0.1,
      certaintyClaiming: 0.1,
      omissionOrSelectionRisk: 0.1,
      attributionClarity: 0.9,
    },
    framingSummary,
    evidenceQuotes: [],
    openQuestions: [],
    confidence: 0.8,
  };
}

test('an article classified before triage scraped its body is classified again with the body', async () => {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'survivor-reclassify-')), 'articles.json');
  const headlineOnly = storedArticle('headline-only', {
    sourceKind: 'cfp',
    classification: framing('From the headline'),
    classifiedAt: '2026-09-30T11:30:00.000Z',
  });
  await updateArticles(() => [headlineOnly], articlesPath);

  await writeBackSurvivors(
    [{ ...headlineOnly, publisherUrl: PUBLISHER_URL, bodyText: 'Full body text.', bodyStatus: 'ok' }],
    articlesPath,
  );
  const bodies: Array<string | null | undefined> = [];
  await classifyUnclassifiedArticles(
    {},
    {
      articlesPath,
      classifyFraming: async (input) => {
        bodies.push(input.bodyText);
        return { ok: true, analysis: framing('From the body'), model: 'stub', rawText: '' };
      },
    },
  );

  const [stored] = await readArticles(articlesPath);
  assert.deepEqual(bodies, ['Full body text.']);
  assert.equal(stored!.classification?.framingSummary, 'From the body');
});

test('an article classified with its body keeps that classification through triage write-back', async () => {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'survivor-keep-classify-')), 'articles.json');
  const triageCopy = storedArticle('with-body', { sourceKind: 'cfp' });
  const classifiedWithBody: Article = {
    ...triageCopy,
    bodyText: 'Body another writer scraped.',
    bodyStatus: 'ok',
    classification: framing('From the body'),
    classifiedAt: '2026-09-30T11:30:00.000Z',
  };
  await updateArticles(() => [classifiedWithBody], articlesPath);

  await writeBackSurvivors(
    [{ ...triageCopy, publisherUrl: PUBLISHER_URL, bodyText: 'Full body text.', bodyStatus: 'ok' }],
    articlesPath,
  );
  let calls = 0;
  await classifyUnclassifiedArticles(
    {},
    {
      articlesPath,
      classifyFraming: async () => {
        calls += 1;
        return { ok: false, error: 'should not run', model: null, rawText: null };
      },
    },
  );

  assert.equal(calls, 0);
  assert.deepEqual(await readArticles(articlesPath), [classifiedWithBody]);
});
