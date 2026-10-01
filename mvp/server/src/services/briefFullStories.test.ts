import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article, StoreMeta } from '../types/article.js';
import type { BriefFullStoryRecord, BriefFullStoriesStore } from '../types/briefFullStory.js';
import type { BriefSeenStore, BriefSummariesStore, RefreshRun } from '../types/brief.js';
import type { Topic } from '../types/topic.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import {
  createFullStoryOnDemandLimiter,
  generateFullStory,
  mergeLivingFullStory,
  sourceHashForMembers,
  type BriefFullStoryDeps,
} from './briefFullStories.js';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const ISO = '2026-10-01T11:00:00.000Z';

function article(id: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'rss',
    canonicalUrl: `https://example.com/${id}`,
    citations: [],
    publisherUrl: `https://${id}.example.com/story`,
    publisherDomain: `${id}.example.com`,
    handle: null,
    publishedAt: ISO,
    snippet: 'A sufficiently long snippet is available when the publisher body is unavailable for this story.',
    bodyText: `Publisher body for ${id}.`,
    bodyStatus: 'ok',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: ISO,
    classification: { framingSummary: 'Framing context.' } as Article['classification'],
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

function kept(id: string, memberIds: string[] = []): TriageRecord {
  return {
    articleId: id,
    status: 'kept',
    reason: null,
    stage: 'headline',
    final: true,
    topicIds: ['topic'],
    labels: [],
    duplicateOf: null,
    memberIds,
    outletCount: 2,
    significance: 1.5,
    bodyChecked: true,
    jevCalls: 1,
    triagedAt: ISO,
  };
}

function duplicate(id: string): TriageRecord {
  return {
    ...kept(id),
    status: 'dropped',
    reason: 'duplicate',
    topicIds: [],
    duplicateOf: 'main',
    memberIds: [],
  };
}

function topic(sections: Topic['sections'] = ['business', 'map']): Topic {
  return {
    id: 'topic',
    name: 'Topic',
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: 'topic',
    sections,
    notes: '',
    createdAt: ISO,
    updatedAt: ISO,
  };
}

function refresh(): RefreshRun {
  return { trigger: 'manual', startedAt: ISO, completedAt: ISO, ok: true, error: null };
}

type Harness = {
  deps: BriefFullStoryDeps;
  calls: number;
  puts: BriefFullStoryRecord[];
  store: BriefFullStoriesStore;
};

function harness(
  articles: Article[] = [article('main'), article('duplicate')],
  records: TriageRecord[] = [kept('main', ['duplicate']), duplicate('duplicate')],
  override: Partial<BriefFullStoryDeps> = {},
): Harness {
  const store: BriefFullStoriesStore = { fullStories: {}, updatedAt: null };
  const puts: BriefFullStoryRecord[] = [];
  let calls = 0;
  const triage: TriageStore = {
    records: Object.fromEntries(records.map((record) => [record.articleId, record])),
    updatedAt: null,
  };
  const deps: BriefFullStoryDeps = {
    readTopics: async () => ({ topics: [topic()] }),
    readMuteRules: async () => ({ rules: [] }),
    readArticles: async () => articles,
    readTriage: async () => triage,
    readBriefSeen: async (): Promise<BriefSeenStore> => ({ seen: {}, updatedAt: null }),
    readBriefSummaries: async (): Promise<BriefSummariesStore> => ({ summaries: {}, updatedAt: null }),
    readMeta: async (): Promise<StoreMeta> => ({
      lastFetchAt: null,
      lastError: null,
      refresh: { last: refresh(), lastSuccess: refresh() },
    }),
    readBriefFullStories: async () => store,
    putBriefFullStories: async (next) => {
      for (const record of next) {
        puts.push(record);
        store.fullStories[record.articleId] = record;
      }
    },
    ollamaAvailable: () => true,
    modelName: () => 'test-model',
    enrich: async () => {
      calls += 1;
      return {
        talking_points: ['Point'],
        timeline: [{ date: 'Today', content: 'Event' }],
        suggested_qna: [{ question: 'What to verify?', answer: 'Check sources.' }],
      };
    },
    ...override,
  };
  return {
    deps,
    get calls() { return calls; },
    puts,
    store,
  };
}

test('not in Brief returns not_in_brief without enrichment', async () => {
  const h = harness();
  const result = await generateFullStory('absent', { now: NOW }, h.deps);
  assert.deepEqual(result, {
    ok: false,
    code: 'not_in_brief',
    error: 'Story is not in the current Brief',
  });
  assert.equal(h.calls, 0);
});

test('no usable member text persists unavailable without Ollama', async () => {
  const h = harness([article('main', { bodyStatus: 'unavailable', bodyText: null, snippet: 'short' })], [kept('main')]);
  const result = await generateFullStory('main', { now: NOW }, h.deps);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.record.status, 'unavailable');
  assert.equal(h.calls, 0);
  assert.equal(h.puts[0]!.topicSections.includes('map'), false);
});

test('matching cached full story is reused without enrichment or limiter', async () => {
  const h = harness();
  const hash = sourceHashForMembers([
    {
      title: 'Headline main',
      publisherDomain: 'main.example.com',
      publishedAt: ISO,
      bodyOrSnippet: 'Publisher body for main.',
      framingSummary: 'Framing context.',
    },
    {
      title: 'Headline duplicate',
      publisherDomain: 'duplicate.example.com',
      publishedAt: ISO,
      bodyOrSnippet: 'Publisher body for duplicate.',
      framingSummary: 'Framing context.',
    },
  ], ['business']);
  const cached: BriefFullStoryRecord = {
    articleId: 'main', status: 'ok', enrichment: { talking_points: ['Cached'], timeline: [], suggested_qna: [] },
    deterministic: {}, sourceHash: hash, topicSections: ['business'], model: 'm', error: null,
    generatedAt: ISO, trigger: 'refresh',
  };
  h.store.fullStories.main = cached;
  const result = await generateFullStory('main', { now: NOW }, {
    ...h.deps,
    rateLimiter: { tryAcquire: () => false },
  });
  assert.deepEqual(result, { ok: true, record: cached });
  assert.equal(h.calls, 0);
});

test('on-demand limiter rejects uncached stories', async () => {
  const h = harness();
  const result = await generateFullStory('main', { now: NOW }, {
    ...h.deps,
    rateLimiter: { tryAcquire: () => false },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'rate_limited');
  assert.equal(h.calls, 0);
});

test('an enrichment throw becomes a persisted error record', async () => {
  const h = harness(undefined, undefined, {
    enrich: async () => { throw new Error('bad model payload'); },
  });
  const result = await generateFullStory('main', { now: NOW }, h.deps);
  assert.deepEqual(result, { ok: false, code: 'error', error: 'bad model payload' });
  assert.equal(h.puts[0]!.status, 'error');
  assert.equal(h.puts[0]!.error, 'bad model payload');
});

test('concurrent calls for one article share one enrichment', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = harness(undefined, undefined, {
    enrich: async () => {
      await gate;
      return { talking_points: ['Point'], timeline: [], suggested_qna: [] };
    },
  });
  const first = generateFullStory('main', { now: NOW }, h.deps);
  const second = generateFullStory('main', { now: NOW }, h.deps);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [one, two] = await Promise.all([first, second]);
  assert.deepEqual(one, two);
  assert.equal(h.puts.length, 1);
});

test('living merge appends new timeline events and sets a change summary', () => {
  const prior: BriefFullStoryRecord = {
    articleId: 'main', status: 'ok',
    enrichment: { talking_points: ['Old'], timeline: [{ date: 'Yesterday', content: 'Old event' }], suggested_qna: [] },
    deterministic: {}, sourceHash: 'old', topicSections: [], model: 'm', error: null, generatedAt: ISO, trigger: 'refresh',
  };
  const next: BriefFullStoryRecord = {
    ...prior,
    enrichment: { talking_points: ['New'], timeline: [{ date: 'Today', content: 'New event' }], suggested_qna: [] },
    sourceHash: 'new',
    generatedAt: NOW.toISOString(),
  };
  const merged = mergeLivingFullStory(prior, next);
  assert.deepEqual(merged.enrichment!.timeline, [
    { date: 'Yesterday', content: 'Old event' },
    { date: 'Today', content: 'New event' },
  ]);
  assert.match(merged.changeSummary ?? '', /timeline \+1/);
  assert.equal(merged.updatedAt, NOW.toISOString());
});

test('map is not requested and official search rows remain eligible', async () => {
  const search = article('main', {
    sourceKind: 'search',
    bodyStatus: 'unavailable',
    bodyText: null,
    snippet: 'Search result text '.repeat(12),
  });
  const record = { ...kept('main'), labels: ['official'] as TriageRecord['labels'] };
  let requested: string[] = [];
  const h = harness([search], [record], {
    readTopics: async () => ({ topics: [topic(['business', 'map'])] }),
    enrich: async (request) => {
      requested = request.requestedSections;
      return { talking_points: ['Allowed'], timeline: [], suggested_qna: [] };
    },
  });
  const result = await generateFullStory('main', { now: NOW }, h.deps);
  assert.equal(result.ok, true);
  assert.deepEqual(requested, ['business']);
});

test('full story limiter uses a one-hour sliding window', () => {
  let now = 0;
  const limiter = createFullStoryOnDemandLimiter(1, () => now);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
  now = 3_600_000;
  assert.equal(limiter.tryAcquire(), true);
});
