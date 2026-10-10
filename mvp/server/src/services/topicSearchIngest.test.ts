import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Article, StoreMeta } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import type { SearchCandidate } from '../types/topicSearch.js';
import {
  buildSeenKeys,
  mergeCandidates,
  runTopicSearch,
  selectNewForTopic,
  toArticleInput,
} from './topicSearchIngest.js';
import type { MergedCandidate, TopicSearchDeps } from './topicSearchIngest.js';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const ENV = { SEARXNG_URL: 'http://searx.test' } as NodeJS.ProcessEnv;

type UpsertInput = Array<Omit<Article, 'id'> & { id?: string }>;

function makeTopic(id: string, name: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    name,
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: name,
    sections: [],
    notes: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function googleCandidate(
  title: string,
  opts: { id?: string; domain?: string; name?: string; publishedAt?: string } = {},
): SearchCandidate {
  const articleId = opts.id ?? `CBMi${title.replace(/\W+/g, '')}`;
  return {
    provider: 'google_news',
    title,
    publisherUrl: null,
    publisherName: opts.name ?? 'Example News',
    publisherDomain: opts.domain ?? 'example.com',
    googleNewsUrl: `https://news.google.com/rss/articles/${articleId}`,
    googleArticleId: articleId,
    publishedAt: opts.publishedAt ?? hoursAgo(2),
    snippet: '',
  };
}

function searxCandidate(
  title: string,
  url: string,
  opts: { publishedAt?: string | null; snippet?: string } = {},
): SearchCandidate {
  return {
    provider: 'searxng',
    title,
    publisherUrl: url,
    publisherName: null,
    publisherDomain: new URL(url).hostname.replace(/^www\./, ''),
    googleNewsUrl: null,
    googleArticleId: null,
    publishedAt: opts.publishedAt === undefined ? hoursAgo(3) : opts.publishedAt,
    snippet: opts.snippet ?? `Snippet for ${title}`,
  };
}

type Harness = {
  deps: TopicSearchDeps;
  upserts: UpsertInput[];
  metaPatches: Array<Partial<StoreMeta>>;
  googleQueries: string[];
  searxQueries: string[];
  cacheLookups: string[];
};

function harness(
  opts: {
    topics?: Topic[];
    google?: (query: string) => Promise<SearchCandidate[]>;
    searx?: (query: string) => Promise<SearchCandidate[]>;
    cache?: Record<string, string>;
    articles?: Article[];
  } = {},
): Harness {
  const h: Harness = {
    deps: {},
    upserts: [],
    metaPatches: [],
    googleQueries: [],
    searxQueries: [],
    cacheLookups: [],
  };
  h.deps = {
    readTopics: async () => ({ topics: opts.topics ?? [] }),
    readArticles: async () => opts.articles ?? [],
    upsertArticles: async (incoming) => {
      h.upserts.push(incoming);
      return incoming.map((item, i) => ({ ...item, id: `id-${i}` }) as Article);
    },
    markArticlesSearchSeen: async () => {},
    updateMeta: async (patch) => {
      h.metaPatches.push(patch);
    },
    searchGoogleNews: async (query) => {
      h.googleQueries.push(query);
      return opts.google ? opts.google(query) : [];
    },
    searchSearxng: async (query) => {
      h.searxQueries.push(query);
      return opts.searx ? opts.searx(query) : [];
    },
    getCachedGoogleNewsUrl: async (articleId) => {
      h.cacheLookups.push(articleId);
      return opts.cache?.[articleId] ?? null;
    },
  };
  return h;
}

function mergedCandidate(overrides: Partial<MergedCandidate> = {}): MergedCandidate {
  return {
    canonicalUrl: 'https://example.com/story',
    publisherUrl: 'https://example.com/story',
    googleNewsUrl: null,
    title: 'Story',
    publisherName: null,
    publisherDomain: 'example.com',
    publishedAt: hoursAgo(1),
    snippet: '',
    providers: ['searxng'],
    ...overrides,
  };
}

test('runTopicSearch merges both providers for two topics into deduped search articles', async () => {
  const topics = [makeTopic('t-ai', 'AI chips'), makeTopic('t-grid', 'Power grid')];
  const h = harness({
    topics,
    google: async (query) =>
      query === 'AI chips'
        ? [
            googleCandidate('Chipmaker unveils new accelerator', { id: 'CBMiA' }),
            googleCandidate('Google-only chip story', { id: 'CBMiB', domain: 'other.com' }),
          ]
        : [googleCandidate('Grid operator warns of shortfall', { id: 'CBMiC', domain: 'grid.org' })],
    searx: async (query) =>
      query === 'AI chips'
        ? [
            searxCandidate(
              'Chipmaker Unveils New Accelerator!',
              'https://www.example.com/chips/accelerator',
              { snippet: 'The chipmaker announced…' },
            ),
          ]
        : [],
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(result.skipped, false);
  assert.equal(result.fetched, 4);
  assert.deepEqual(result.perTopic['t-ai'], { found: 3, merged: 2, skippedSeen: 0, new: 2 });
  assert.deepEqual(result.perTopic['t-grid'], { found: 1, merged: 1, skippedSeen: 0, new: 1 });
  assert.equal(h.upserts.length, 1);
  const inputs = h.upserts[0]!;
  assert.equal(inputs.length, 3);

  const both = inputs.find((a) => a.searchProviders?.length === 2);
  assert.ok(both);
  assert.deepEqual(both.searchProviders, ['google_news', 'searxng']);
  assert.equal(both.canonicalUrl, 'https://www.example.com/chips/accelerator');
  assert.equal(both.publisherUrl, 'https://www.example.com/chips/accelerator');
  assert.equal(both.googleNewsUrl, 'https://news.google.com/rss/articles/CBMiA');
  assert.equal(both.title, 'Chipmaker Unveils New Accelerator!');
  assert.equal(both.snippet, 'The chipmaker announced…');
  assert.equal(both.sourceKind, 'search');
  assert.equal(both.sourceTier, 'sensor');
  assert.equal(both.bodyStatus, 'pending');
  assert.deepEqual(both.topicIds, ['t-ai']);
  assert.deepEqual(both.citations, [
    { label: 'Example News', url: 'https://www.example.com/chips/accelerator' },
    { label: 'Google News', url: 'https://news.google.com/rss/articles/CBMiA' },
  ]);

  const googleOnly = inputs.find((a) => a.title === 'Google-only chip story');
  assert.ok(googleOnly);
  assert.equal(googleOnly.canonicalUrl, 'https://news.google.com/rss/articles/CBMiB');
  assert.equal(googleOnly.publisherUrl, null);
  assert.deepEqual(googleOnly.citations, [
    { label: 'Example News', url: 'https://news.google.com/rss/articles/CBMiB' },
  ]);
  assert.deepEqual(googleOnly.searchProviders, ['google_news']);
  assert.equal(result.upserted.length, 3);
});

test('mergeCandidates merges on same domain + normalized title; different domains stay apart', () => {
  const merged = mergeCandidates([
    googleCandidate('Senate passes budget bill', { domain: 'news.com' }),
    searxCandidate('Senate Passes Budget Bill', 'https://news.com/politics/budget'),
    searxCandidate('Senate passes budget bill', 'https://other.com/budget'),
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0]!.providers, ['google_news', 'searxng']);
  assert.equal(merged[0]!.canonicalUrl, 'https://news.com/politics/budget');
  assert.deepEqual(merged[1]!.providers, ['searxng']);
  assert.equal(merged[1]!.canonicalUrl, 'https://other.com/budget');
});

test('Google cache hit sets publisherUrl and enables URL merge; only the cache is consulted', async () => {
  const h = harness({
    topics: [makeTopic('t1', 'Topic one')],
    google: async () => [
      googleCandidate('Headline as Google shows it', { id: 'CBMiHit', domain: 'pub.com' }),
      googleCandidate('Unresolved story', { id: 'CBMiMiss', domain: 'pub.com' }),
    ],
    searx: async () => [
      searxCandidate('Completely different SearXNG title', 'https://pub.com/a/story'),
    ],
    cache: { CBMiHit: 'https://pub.com/a/story#frag' },
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.deepEqual(h.cacheLookups.sort(), ['CBMiHit', 'CBMiMiss']);
  assert.deepEqual(result.perTopic['t1'], { found: 3, merged: 2, skippedSeen: 0, new: 2 });
  const merged = h.upserts[0]!.find((a) => a.searchProviders?.length === 2);
  assert.ok(merged);
  assert.equal(merged.canonicalUrl, 'https://pub.com/a/story');
  assert.equal(merged.googleNewsUrl, 'https://news.google.com/rss/articles/CBMiHit');

  const source = await readFile(new URL('./topicSearchIngest.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /googleNewsResolve|resolveGoogleNewsUrl/);
});

test('a throwing Google cache lookup is treated as a miss', async () => {
  const h = harness({
    topics: [makeTopic('t1', 'Topic one')],
    google: async () => [googleCandidate('Cached story', { id: 'CBMiX' })],
  });
  h.deps.getCachedGoogleNewsUrl = async () => {
    throw new Error('google-news-url-cache.json must contain a JSON object');
  };

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(result.skipped, false);
  assert.equal(result.upserted.length, 1);
  assert.equal(h.upserts[0]![0]!.publisherUrl, null);
  assert.equal(h.upserts[0]![0]!.canonicalUrl, 'https://news.google.com/rss/articles/CBMiX');
});

test('the same story found by two topics is one upsert input with both topicIds', async () => {
  const shared = searxCandidate('Shared story', 'https://shared.com/story');
  const h = harness({
    topics: [makeTopic('t1', 'First'), makeTopic('t2', 'Second')],
    searx: async () => [shared],
  });

  await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(h.upserts[0]!.length, 1);
  assert.deepEqual(h.upserts[0]![0]!.topicIds, ['t1', 't2']);
});

for (const googleOnlyFirst of [false, true]) {
  test(`a story found via both providers and via Google only is one article (Google-only topic ${googleOnlyFirst ? 'first' : 'second'})`, async () => {
    const google = googleCandidate('Port strike expands', { id: 'CBMiS', domain: 'port.com' });
    const searx = searxCandidate('Port strike expands', 'https://port.com/strike');
    const bothTopic = googleOnlyFirst ? 't2' : 't1';
    const h = harness({
      topics: [makeTopic('t1', 'First'), makeTopic('t2', 'Second')],
      google: async () => [google],
      searx: async (query) => (query === (bothTopic === 't1' ? 'First' : 'Second') ? [searx] : []),
    });

    await runTopicSearch({ now: NOW, env: ENV }, h.deps);

    assert.equal(h.upserts[0]!.length, 1);
    const article = h.upserts[0]![0]!;
    assert.deepEqual(article.topicIds, ['t1', 't2']);
    assert.equal(article.canonicalUrl, 'https://port.com/strike');
    assert.equal(article.publisherUrl, 'https://port.com/strike');
    assert.equal(article.googleNewsUrl, 'https://news.google.com/rss/articles/CBMiS');
    assert.deepEqual(article.searchProviders, ['google_news', 'searxng']);
    assert.equal(article.title, 'Port strike expands');
  });
}

test('mergeCandidates takes the first non-null Google link among Google members', () => {
  const [merged] = mergeCandidates([
    { ...googleCandidate('Same story', { domain: 'd.com' }), googleNewsUrl: null },
    googleCandidate('Same story', { id: 'CBMiLater', domain: 'd.com' }),
  ]);
  assert.equal(merged!.googleNewsUrl, 'https://news.google.com/rss/articles/CBMiLater');
  assert.equal(merged!.canonicalUrl, 'https://news.google.com/rss/articles/CBMiLater');
});

test('selectNewForTopic sorts an unparsable publishedAt like undated (last)', () => {
  const { selected } = selectNewForTopic(
    [
      mergedCandidate({ canonicalUrl: 'https://x.com/bad', publishedAt: 'not a date' }),
      mergedCandidate({ canonicalUrl: 'https://x.com/old', publishedAt: hoursAgo(5) }),
      mergedCandidate({ canonicalUrl: 'https://x.com/new', publishedAt: hoursAgo(1) }),
    ],
    new Set(),
    20,
  );
  assert.deepEqual(
    selected.map((m) => m.canonicalUrl),
    ['https://x.com/new', 'https://x.com/old', 'https://x.com/bad'],
  );
});

test('already-seen canonical, publisher, and Google URLs are skipped and counted', async () => {
  const stored = [
    { canonicalUrl: 'https://seen.com/canonical', publisherUrl: null } as Article,
    {
      canonicalUrl: 'https://cfp.example/item',
      publisherUrl: 'https://seen.com/publisher?utm_medium=email',
    } as Article,
    {
      canonicalUrl: 'https://other.com/x',
      publisherUrl: null,
      googleNewsUrl: 'https://news.google.com/rss/articles/CBMiSeen',
    } as Article,
  ];
  const h = harness({
    topics: [makeTopic('t1', 'Topic')],
    articles: stored,
    google: async () => [googleCandidate('Seen via Google', { id: 'CBMiSeen', domain: 'g.com' })],
    searx: async () => [
      searxCandidate('Seen canonical', 'https://seen.com/canonical'),
      searxCandidate('Seen publisher', 'https://seen.com/publisher'),
      searxCandidate('Fresh', 'https://fresh.com/story'),
    ],
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.deepEqual(result.perTopic['t1'], { found: 4, merged: 4, skippedSeen: 3, new: 1 });
  assert.deepEqual(
    h.upserts[0]!.map((a) => a.canonicalUrl),
    ['https://fresh.com/story'],
  );
});

test('stored articles a provider returns again are marked search-seen at the run time', async () => {
  const stored = [
    { id: 'by-canonical', canonicalUrl: 'https://seen.com/canonical', publisherUrl: null } as Article,
    {
      id: 'by-publisher',
      canonicalUrl: 'https://cfp.example/item',
      publisherUrl: 'https://seen.com/publisher?utm_medium=email',
    } as Article,
    {
      id: 'by-google',
      canonicalUrl: 'https://other.com/x',
      publisherUrl: null,
      googleNewsUrl: 'https://news.google.com/rss/articles/CBMiSeen',
    } as Article,
    { id: 'not-returned', canonicalUrl: 'https://quiet.com/x', publisherUrl: null } as Article,
  ];
  const marks: Array<{ ids: string[]; at: string }> = [];
  const h = harness({
    topics: [makeTopic('t1', 'Topic'), makeTopic('t2', 'Other')],
    articles: stored,
    google: async () => [googleCandidate('Seen via Google', { id: 'CBMiSeen', domain: 'g.com' })],
    searx: async () => [
      searxCandidate('Seen canonical', 'https://seen.com/canonical'),
      searxCandidate('Seen publisher', 'https://seen.com/publisher'),
    ],
  });
  h.deps.markArticlesSearchSeen = async (ids, at) => {
    marks.push({ ids: [...ids].sort(), at });
  };

  await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.deepEqual(marks, [
    { ids: ['by-canonical', 'by-google', 'by-publisher'], at: NOW.toISOString() },
  ]);
  assert.deepEqual(h.upserts, []);
});

test('buildSeenKeys canonicalizes store URLs', () => {
  const seen = buildSeenKeys([
    {
      canonicalUrl: 'https://A.com/x#frag',
      publisherUrl: 'https://b.com/y?utm_source=z',
      googleNewsUrl: 'https://news.google.com/rss/articles/CBMi1?oc=5',
    } as Article,
  ]);
  assert.ok(seen.has('https://a.com/x'));
  assert.ok(seen.has('https://b.com/y'));
  assert.ok(seen.has('https://news.google.com/rss/articles/CBMi1'));
});

test('selectNewForTopic caps at 20, newest first, undated last', async () => {
  const merged: MergedCandidate[] = [];
  for (let i = 0; i < 22; i += 1) {
    merged.push(
      mergedCandidate({ canonicalUrl: `https://x.com/${i}`, publishedAt: hoursAgo(i + 1) }),
    );
  }
  merged.push(mergedCandidate({ canonicalUrl: 'https://x.com/undated-a', publishedAt: null }));
  merged.push(mergedCandidate({ canonicalUrl: 'https://x.com/undated-b', publishedAt: null }));
  merged.push(mergedCandidate({ canonicalUrl: 'https://x.com/newest', publishedAt: hoursAgo(0) }));

  const { selected, skippedSeen } = selectNewForTopic(merged.reverse(), new Set(), 20);

  assert.equal(skippedSeen, 0);
  assert.equal(selected.length, 20);
  assert.equal(selected[0]!.canonicalUrl, 'https://x.com/newest');
  assert.equal(selected[19]!.canonicalUrl, 'https://x.com/18');

  const all = selectNewForTopic(merged, new Set(), 100).selected;
  assert.deepEqual(
    all.slice(-2).map((m) => m.publishedAt),
    [null, null],
  );
});

test('runTopicSearch caps 25 fresh candidates for one topic at 20, undated last', async () => {
  const candidates: SearchCandidate[] = [];
  for (let i = 0; i < 23; i += 1) {
    candidates.push(
      searxCandidate(`Story ${i}`, `https://x.com/${i}`, { publishedAt: hoursAgo(i + 1) }),
    );
  }
  candidates.push(searxCandidate('Undated A', 'https://x.com/ua', { publishedAt: null }));
  candidates.push(searxCandidate('Undated B', 'https://x.com/ub', { publishedAt: null }));
  const h = harness({ topics: [makeTopic('t1', 'Topic')], searx: async () => candidates });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.deepEqual(result.perTopic['t1'], { found: 25, merged: 25, skippedSeen: 0, new: 20 });
  const urls = h.upserts[0]!.map((a) => a.canonicalUrl);
  assert.equal(urls[0], 'https://x.com/0');
  assert.equal(urls[19], 'https://x.com/19');
});

test('SearXNG down for every topic keeps Google results; refresh not skipped', async () => {
  const h = harness({
    topics: [makeTopic('t1', 'One'), makeTopic('t2', 'Two')],
    google: async (query) => [googleCandidate(`Google ${query}`)],
    searx: async () => {
      throw new Error('connect ECONNREFUSED');
    },
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(result.skipped, false);
  assert.deepEqual(result.providers.searxng, {
    state: 'down',
    topicsAttempted: 2,
    topicsFailed: 2,
    items: 0,
    errors: ['t1: connect ECONNREFUSED', 't2: connect ECONNREFUSED'],
  });
  assert.equal(result.providers.google_news.state, 'ok');
  assert.equal(result.providers.google_news.items, 2);
  assert.equal(result.upserted.length, 2);
});

test('Google down leaves SearXNG-only results; one failing topic is partial', async () => {
  const h = harness({
    topics: [makeTopic('t1', 'One'), makeTopic('t2', 'Two')],
    google: async () => {
      throw new Error('Google News RSS 503');
    },
    searx: async (query) => {
      if (query === 'Two') throw new Error('SearXNG 500');
      return [searxCandidate('Searx story', 'https://s.com/story')];
    },
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(result.providers.google_news.state, 'down');
  assert.equal(result.providers.google_news.topicsFailed, 2);
  assert.equal(result.providers.searxng.state, 'partial');
  assert.deepEqual(result.providers.searxng.errors, ['t2: SearXNG 500']);
  assert.deepEqual(
    h.upserts[0]!.map((a) => a.searchProviders),
    [['searxng']],
  );
});

test('TOPIC_SEARCH_ENABLED=off skips with both providers disabled and no provider calls', async () => {
  const h = harness({ topics: [makeTopic('t1', 'One')] });

  const result = await runTopicSearch(
    { now: NOW, env: { ...ENV, TOPIC_SEARCH_ENABLED: 'OFF' } },
    h.deps,
  );

  const disabled = { state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] };
  assert.equal(result.skipped, true);
  assert.deepEqual(result.providers, { google_news: disabled, searxng: disabled });
  assert.deepEqual(h.googleQueries, []);
  assert.deepEqual(h.searxQueries, []);
  assert.equal(h.upserts.length, 0);
  assert.equal(h.metaPatches.length, 1);
});

test('SEARXNG_URL empty disables SearXNG while Google runs', async () => {
  const h = harness({
    topics: [makeTopic('t1', 'One')],
    google: async () => [googleCandidate('Google story')],
  });

  const result = await runTopicSearch({ now: NOW, env: { SEARXNG_URL: '' } }, h.deps);

  assert.equal(result.skipped, false);
  assert.equal(result.providers.searxng.state, 'disabled');
  assert.equal(result.providers.google_news.state, 'ok');
  assert.deepEqual(h.searxQueries, []);
  assert.deepEqual(h.googleQueries, ['One']);
});

test('only desired topics are searched; empty searchQuery falls back to the name', async () => {
  const h = harness({
    topics: [
      makeTopic('t1', 'Quantum computing', { searchQuery: '  "quantum error correction"  ' }),
      makeTopic('t2', 'Fusion energy', { searchQuery: '   ' }),
      makeTopic('t3', 'Celebrity gossip', { kind: 'undesired' }),
    ],
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.deepEqual(h.googleQueries.sort(), ['"quantum error correction"', 'Fusion energy'].sort());
  assert.deepEqual(h.searxQueries.sort(), ['"quantum error correction"', 'Fusion energy'].sort());
  assert.deepEqual(Object.keys(result.perTopic).sort(), ['t1', 't2']);
  assert.equal(result.providers.google_news.topicsAttempted, 2);
});

test('zero desired topics → skipped with providers ok', async () => {
  const h = harness({ topics: [makeTopic('t1', 'Noise', { kind: 'undesired' })] });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(result.skipped, true);
  assert.equal(result.providers.google_news.state, 'ok');
  assert.equal(result.providers.searxng.state, 'ok');
  assert.deepEqual(h.googleQueries, []);
});

test('unreadable topics store → skipped, providers down, never throws', async () => {
  const h = harness();
  h.deps.readTopics = async () => {
    throw new Error('topics.json must contain a JSON object');
  };

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(result.skipped, true);
  assert.deepEqual(result.errors, ['topics.json must contain a JSON object']);
  assert.equal(result.providers.google_news.state, 'down');
  assert.deepEqual(result.providers.searxng.errors, ['topics.json must contain a JSON object']);
  assert.equal(h.metaPatches.length, 1);
});

test('updateMeta receives topicSearch provider statuses; a throwing updateMeta does not fail', async () => {
  const h = harness({
    topics: [makeTopic('t1', 'One')],
    google: async () => [googleCandidate('Story')],
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);
  assert.deepEqual(h.metaPatches, [
    { topicSearch: { at: NOW.toISOString(), providers: result.providers } },
  ]);

  const originalError = console.error;
  console.error = () => {};
  try {
    h.deps.updateMeta = async () => {
      throw new Error('disk full');
    };
    const second = await runTopicSearch({ now: NOW, env: ENV }, h.deps);
    assert.equal(second.skipped, false);
    assert.equal(second.upserted.length, 1);
  } finally {
    console.error = originalError;
  }
});

test('a failing article store is a run-level error, not a throw', async () => {
  const h = harness({
    topics: [makeTopic('t1', 'One')],
    google: async () => [googleCandidate('Story')],
  });
  h.deps.upsertArticles = async () => {
    throw new Error('articles.json must contain a JSON array');
  };

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.deepEqual(result.errors, ['articles.json must contain a JSON array']);
  assert.deepEqual(result.upserted, []);
  assert.equal(result.providers.google_news.state, 'ok');
  assert.equal(h.metaPatches.length, 1);
});

test('provider error lists are capped at 5', async () => {
  const topics = Array.from({ length: 7 }, (_, i) => makeTopic(`t${i}`, `Topic ${i}`));
  const h = harness({
    topics,
    google: async () => {
      throw new Error('boom');
    },
  });

  const result = await runTopicSearch({ now: NOW, env: ENV }, h.deps);

  assert.equal(result.providers.google_news.topicsFailed, 7);
  assert.equal(result.providers.google_news.errors.length, 5);
  assert.equal(result.providers.google_news.state, 'down');
});

test('toArticleInput omits the Google citation when it equals the first citation URL', () => {
  const googleUrl = 'https://news.google.com/rss/articles/CBMiQ';
  const input = toArticleInput(
    mergedCandidate({
      canonicalUrl: googleUrl,
      publisherUrl: null,
      googleNewsUrl: googleUrl,
      publisherName: null,
      publisherDomain: null,
      providers: ['google_news'],
    }),
    ['t1'],
    NOW.toISOString(),
  );
  assert.deepEqual(input.citations, [{ label: 'Publisher', url: googleUrl }]);
  assert.equal(input.handle, null);
  assert.equal(input.bodyText, null);
  assert.equal(input.clusterId, null);
  assert.equal(input.classification, null);
  assert.equal(input.fetchedAt, NOW.toISOString());
  assert.deepEqual(input.topicIds, ['t1']);
  assert.deepEqual(input.searchProviders, ['google_news']);
});
