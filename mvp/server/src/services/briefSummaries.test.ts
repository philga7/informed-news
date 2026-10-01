import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { Article, StoreMeta } from '../types/article.js';
import type {
  BriefRunMeta,
  BriefSeenStore,
  BriefSummariesStore,
  BriefSummaryRecord,
  RefreshRun,
} from '../types/brief.js';
import type { Topic } from '../types/topic.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import {
  createOnDemandLimiter,
  generateRefreshSummaries,
  summarizeBriefStory,
  type BriefSummaryDeps,
} from './briefSummaries.js';
import type { summarizeSource } from './briefSummary.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const HOURS_AGO = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const BOUNDARY = HOURS_AGO(2);

function makeTopic(id: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: id,
    sections: [],
    notes: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeArticle(id: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'rss',
    canonicalUrl: `https://cfp.example/${id}`,
    citations: [],
    publisherUrl: `https://${id}.example.com/story`,
    publisherDomain: `${id}.example.com`,
    handle: null,
    publishedAt: HOURS_AGO(1),
    snippet: '',
    bodyText: `Body text for ${id}.`,
    bodyStatus: 'ok',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: HOURS_AGO(1),
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

function kept(id: string, topicIds: string[], significance: number): TriageRecord {
  return {
    articleId: id,
    status: 'kept',
    reason: null,
    stage: 'headline',
    final: true,
    topicIds,
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: 1,
    significance,
    bodyChecked: false,
    jevCalls: 1,
    triagedAt: HOURS_AGO(1),
  };
}

function run(startedAt: string): RefreshRun {
  return { trigger: 'manual', startedAt, completedAt: startedAt, ok: true, error: null };
}

/** Same source text topicBrief builds for a kept article with an ok body. */
function sourceHash(article: Article): string {
  const text = `${article.title}\n\n${article.bodyText}`;
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function okRecord(articleId: string, overrides: Partial<BriefSummaryRecord> = {}): BriefSummaryRecord {
  return {
    articleId,
    status: 'ok',
    text: 'A cached neutral summary of the story.',
    sourceArticleId: articleId,
    sourceHash: null,
    model: 'm',
    error: null,
    generatedAt: HOURS_AGO(3),
    trigger: 'refresh',
    ...overrides,
  };
}

type World = {
  topics: Topic[];
  articles: Article[];
  records: TriageRecord[];
  seen?: BriefSeenStore;
  summaries?: Record<string, BriefSummaryRecord>;
  meta?: StoreMeta;
};

type Harness = {
  deps: BriefSummaryDeps;
  calls: string[];
  puts: BriefSummaryRecord[][];
  metaPatches: Partial<StoreMeta>[];
};

const SUMMARY_TEXT = 'A neutral generated summary of the story.';

/** The summarize spy records which story (by `Headline <id>`) it was asked about. */
function harness(
  world: World,
  overrides: BriefSummaryDeps = {},
  respond: (id: string) => Promise<Awaited<ReturnType<typeof summarizeSource>>> = async () => ({
    ok: true,
    text: SUMMARY_TEXT,
    model: 'test-model',
  }),
): Harness {
  const calls: string[] = [];
  const puts: BriefSummaryRecord[][] = [];
  const metaPatches: Partial<StoreMeta>[] = [];
  const triage: TriageStore = {
    records: Object.fromEntries(world.records.map((r) => [r.articleId, r])),
    updatedAt: null,
  };
  const deps: BriefSummaryDeps = {
    readTopics: async () => ({ topics: world.topics }),
    readMuteRules: async () => ({ rules: [] }),
    readArticles: async () => world.articles,
    readTriage: async () => triage,
    readBriefSeen: async () => world.seen ?? { seen: {}, updatedAt: null },
    readBriefSummaries: async (): Promise<BriefSummariesStore> => ({
      summaries: world.summaries ?? {},
      updatedAt: null,
    }),
    putBriefSummaries: async (records) => {
      puts.push(records);
    },
    readMeta: async () =>
      world.meta ?? {
        lastFetchAt: null,
        lastError: null,
        refresh: { last: run(BOUNDARY), lastSuccess: run(BOUNDARY) },
      },
    updateMeta: async (patch) => {
      metaPatches.push(patch);
    },
    summarize: async (source) => {
      const id = source.title.replace(/^Headline /, '');
      calls.push(id);
      return respond(id);
    },
    ollamaAvailable: () => true,
    ...overrides,
  };
  return { deps, calls, puts, metaPatches };
}

/** Topic a (core): a1..a5 ranked by significance; topic b (watch): b1, b2. */
function standardWorld(): World {
  const aIds = ['a1', 'a2', 'a3', 'a4', 'a5'];
  return {
    topics: [makeTopic('b', { level: 'watch' }), makeTopic('a')],
    articles: [...aIds, 'b1', 'b2'].map((id) => makeArticle(id)),
    records: [
      ...aIds.map((id, i) => kept(id, ['a'], 2 - i * 0.1)),
      kept('b1', ['b'], 1.5),
      kept('b2', ['b'], 1.4),
    ],
  };
}

const ENV_BUDGET = (n: number): NodeJS.ProcessEnv => ({ TRIAGE_SUMMARY_BUDGET: String(n) });

test('acceptance: refresh summarises only the top 3 visible stories per section, in section order', async () => {
  const world = standardWorld();
  world.articles.push(
    makeArticle('seen1'),
    makeArticle('old1', { publishedAt: HOURS_AGO(72), fetchedAt: HOURS_AGO(72) }),
  );
  world.records.push(kept('seen1', ['a'], 2), kept('old1', ['a'], 2));
  world.seen = {
    seen: { seen1: { seenAt: HOURS_AGO(3), outletCount: 1, significance: 2 } },
    updatedAt: null,
  };
  const h = harness(world);

  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(60), boundaryAt: BOUNDARY },
    h.deps,
  );

  assert.deepEqual(h.calls, ['a1', 'a2', 'a3', 'b1', 'b2']);
  for (const id of ['a4', 'a5', 'seen1', 'old1']) assert.ok(!h.calls.includes(id), id);
  assert.equal(brief.summaries.used, 5);
  assert.equal(brief.summaries.generated, 5);
  assert.deepEqual(brief.summaries.errors, []);
  assert.equal(h.puts.length, 1);
  assert.deepEqual(
    h.puts[0]!.map((r) => r.articleId).sort(),
    ['a1', 'a2', 'a3', 'b1', 'b2'],
  );
  for (const r of h.puts[0]!) {
    assert.equal(r.status, 'ok');
    assert.equal(r.text, SUMMARY_TEXT);
    assert.equal(r.trigger, 'refresh');
    assert.equal(r.model, 'test-model');
    assert.equal(r.sourceHash, sourceHash(makeArticle(r.articleId)));
  }
  assert.deepEqual(h.metaPatches, [{ brief }]);
});

test('refresh falls back to meta.refresh.lastSuccess.startedAt when boundaryAt is omitted', async () => {
  const world = standardWorld();
  world.articles.push(makeArticle('seen1'));
  world.records.push(kept('seen1', ['a'], 2));
  world.seen = {
    seen: { seen1: { seenAt: HOURS_AGO(3), outletCount: 1, significance: 2 } },
    updatedAt: null,
  };
  const h = harness(world);
  await generateRefreshSummaries({ now: NOW, env: ENV_BUDGET(60) }, h.deps);
  assert.ok(!h.calls.includes('seen1'));
  assert.deepEqual(h.calls.slice(0, 3), ['a1', 'a2', 'a3']);
});

test('budget 2 with 5 targets: 2 calls, the rest left without a record', async () => {
  const h = harness(standardWorld());
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(2), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.deepEqual(h.calls, ['a1', 'a2']);
  assert.equal(brief.summaries.budget, 2);
  assert.equal(brief.summaries.used, 2);
  assert.ok(brief.summaries.used <= brief.summaries.budget);
  assert.deepEqual(h.puts[0]!.map((r) => r.articleId).sort(), ['a1', 'a2']);
});

test('failed calls count toward the budget and become error records', async () => {
  const h = harness(standardWorld(), {}, async (id) =>
    id === 'a1' ? { ok: false, error: 'model exploded' } : { ok: true, text: SUMMARY_TEXT, model: 'm' },
  );
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(2), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.deepEqual(h.calls, ['a1', 'a2']);
  assert.equal(brief.summaries.used, 2);
  assert.equal(brief.summaries.generated, 1);
  assert.deepEqual(brief.summaries.errors, ['Ollama: model exploded']);
  const a1 = h.puts[0]!.find((r) => r.articleId === 'a1')!;
  assert.equal(a1.status, 'error');
  assert.equal(a1.error, 'model exploded');
  assert.equal(a1.text, null);
});

test('a thrown summarize is caught and counted', async () => {
  const h = harness(standardWorld(), {}, async () => {
    throw new Error('socket hang up');
  });
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(1), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.equal(brief.summaries.used, 1);
  assert.deepEqual(brief.summaries.errors, ['Ollama: socket hang up']);
});

test('cached ok summary with a matching hash is reused without a call', async () => {
  const world = standardWorld();
  const a1 = world.articles.find((a) => a.id === 'a1')!;
  world.summaries = {
    a1: okRecord('a1', { sourceHash: sourceHash(a1) }),
    a2: okRecord('a2', { sourceHash: 'stale' }),
    a3: okRecord('a3', { sourceHash: sourceHash(world.articles.find((a) => a.id === 'a3')!), text: null }),
  };
  const h = harness(world);
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(60), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.deepEqual(h.calls, ['a2', 'a3', 'b1', 'b2']);
  assert.equal(brief.summaries.reused, 1);
  assert.equal(brief.summaries.generated, 4);
});

test('story without source text gets an unavailable record and no call', async () => {
  const world = standardWorld();
  world.articles = world.articles.map((a) =>
    a.id === 'a2' ? { ...a, bodyStatus: 'unavailable', bodyText: null } : a,
  );
  const h = harness(world);
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(60), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.ok(!h.calls.includes('a2'));
  assert.equal(brief.summaries.unavailable, 1);
  const a2 = h.puts[0]!.find((r) => r.articleId === 'a2')!;
  assert.equal(a2.status, 'unavailable');
  assert.equal(a2.sourceHash, null);
  assert.equal(a2.trigger, 'refresh');
});

test('Ollama unavailable: no calls and run error "Ollama not configured"', async () => {
  const h = harness(standardWorld(), { ollamaAvailable: () => false });
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(60), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.deepEqual(h.calls, []);
  assert.equal(brief.summaries.used, 0);
  assert.deepEqual(brief.summaries.errors, ['Ollama not configured']);
  assert.deepEqual(h.puts, []);
  assert.equal(h.metaPatches.length, 1);
});

test('summaries write failure is caught and recorded', async () => {
  const h = harness(standardWorld(), {
    putBriefSummaries: async () => {
      throw new Error('disk full');
    },
  });
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(60), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.deepEqual(brief.summaries.errors, ['summaries write: disk full']);
  assert.equal(h.metaPatches.length, 1);
});

test('meta write failure is caught and returned in errors', async () => {
  const h = harness(standardWorld(), {
    updateMeta: async () => {
      throw new Error('meta locked');
    },
  });
  const brief: BriefRunMeta = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(60), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.deepEqual(brief.summaries.errors, ['meta write: meta locked']);
});

test('a failed store read makes no calls and records the error', async () => {
  const h = harness(standardWorld(), {
    readBriefSeen: async () => {
      throw new Error('corrupt seen');
    },
  });
  const brief = await generateRefreshSummaries(
    { now: NOW, env: ENV_BUDGET(60), boundaryAt: BOUNDARY },
    h.deps,
  );
  assert.deepEqual(h.calls, []);
  assert.deepEqual(brief.summaries.errors, ['seen: corrupt seen']);
  assert.equal(h.metaPatches.length, 1);
});

test('on-demand: story not visible in the Brief → not_in_brief, no call', async () => {
  const world = standardWorld();
  world.articles.push(makeArticle('old1', { publishedAt: HOURS_AGO(72), fetchedAt: HOURS_AGO(72) }));
  world.records.push(kept('old1', ['a'], 2));
  const h = harness(world);
  for (const id of ['old1', 'nope']) {
    const result = await summarizeBriefStory(id, { now: NOW }, h.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'not_in_brief');
  }
  assert.deepEqual(h.calls, []);
});

test('on-demand: a "More" story gets one call and an on_demand record', async () => {
  const h = harness(standardWorld());
  const result = await summarizeBriefStory('a5', { now: NOW }, h.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(h.calls, ['a5']);
  assert.equal(result.summary.status, 'ok');
  assert.equal(result.summary.text, SUMMARY_TEXT);
  assert.equal(result.summary.trigger, 'on_demand');
  assert.deepEqual(h.puts, [[result.summary]]);
});

test('on-demand: cached ok summary is returned with no call', async () => {
  const world = standardWorld();
  world.summaries = {
    a5: okRecord('a5', { sourceHash: sourceHash(world.articles.find((a) => a.id === 'a5')!) }),
  };
  const h = harness(world);
  const result = await summarizeBriefStory('a5', { now: NOW }, h.deps);
  assert.deepEqual(result, { ok: true, summary: world.summaries.a5 });
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.puts, []);
});

test('on-demand: no source text → unavailable record written, no call', async () => {
  const world = standardWorld();
  world.articles = world.articles.map((a) =>
    a.id === 'a4' ? { ...a, bodyStatus: 'unavailable', bodyText: null } : a,
  );
  const h = harness(world);
  const result = await summarizeBriefStory('a4', { now: NOW }, h.deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.status, 'unavailable');
  assert.equal(result.summary.trigger, 'on_demand');
  assert.deepEqual(h.calls, []);
  assert.equal(h.puts.length, 1);
});

test('on-demand: limiter refusal → rate_limited, no call', async () => {
  const h = harness(standardWorld());
  const result = await summarizeBriefStory('a4', { now: NOW }, {
    ...h.deps,
    rateLimiter: { tryAcquire: () => false },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'rate_limited');
  assert.deepEqual(h.calls, []);
});

test('on-demand: Ollama unavailable → error without consuming the limiter', async () => {
  let acquired = 0;
  const h = harness(standardWorld(), { ollamaAvailable: () => false });
  const result = await summarizeBriefStory('a4', { now: NOW }, {
    ...h.deps,
    rateLimiter: {
      tryAcquire: () => {
        acquired += 1;
        return true;
      },
    },
  });
  assert.deepEqual(result, { ok: false, code: 'error', error: 'Ollama not configured' });
  assert.equal(acquired, 0);
  assert.deepEqual(h.calls, []);
});

test('on-demand: failed call → error code and an error record', async () => {
  const h = harness(standardWorld(), {}, async () => ({ ok: false, error: 'bad output' }));
  const result = await summarizeBriefStory('a4', { now: NOW }, h.deps);
  assert.deepEqual(result, { ok: false, code: 'error', error: 'bad output' });
  assert.equal(h.puts[0]![0]!.status, 'error');
  assert.equal(h.puts[0]![0]!.trigger, 'on_demand');
});

test('on-demand: concurrent calls for the same id share one call', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = harness(standardWorld(), {}, async () => {
    await gate;
    return { ok: true, text: SUMMARY_TEXT, model: 'm' };
  });
  const first = summarizeBriefStory('a4', { now: NOW }, h.deps);
  const second = summarizeBriefStory('a4', { now: NOW }, h.deps);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [r1, r2] = await Promise.all([first, second]);
  assert.deepEqual(h.calls, ['a4']);
  assert.deepEqual(r1, r2);

  const after = await summarizeBriefStory('a4', { now: NOW }, h.deps);
  assert.equal(after.ok, true);
  assert.equal(h.calls.length, 2, 'in-flight entry cleared after settling');
});

test('on-demand: a failed read returns error, never throws', async () => {
  const h = harness(standardWorld(), {
    readTriage: async () => {
      throw new Error('triage gone');
    },
  });
  const result = await summarizeBriefStory('a4', { now: NOW }, h.deps);
  assert.deepEqual(result, { ok: false, code: 'error', error: 'triage: triage gone' });
});

test('createOnDemandLimiter allows maxPerHour in a sliding hour', () => {
  let t = 0;
  const limiter = createOnDemandLimiter(2, () => t);
  assert.equal(limiter.tryAcquire(), true);
  t = 1000;
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
  t = 3_600_000;
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
  t = 3_601_000;
  assert.equal(limiter.tryAcquire(), true);
});
