import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article, StoreMeta } from '../types/article.js';
import type { BriefRunMeta, FullStoriesRunMeta, RefreshRun } from '../types/brief.js';
import type { FetchAllResult } from './fetchAllSources.js';
import {
  countByClusterIdFromArticles,
  createRefreshRunner,
  createTrackedStoriesSync,
  type RefreshRunnerDeps,
} from './refreshRunner.js';

const T0 = Date.parse('2026-09-30T12:00:00.000Z');

const BRIEF: BriefRunMeta = {
  at: '2026-09-30T12:00:03.000Z',
  summaries: { budget: 60, used: 1, generated: 1, reused: 0, unavailable: 0, errors: [] },
};
const FULL_STORIES: FullStoriesRunMeta = {
  budget: 5, used: 1, generated: 1, reused: 0, unavailable: 0, errors: [],
};

function fetchResult(fetched = 1): FetchAllResult {
  return { fetched, cfp: { feedUrl: 'x', limit: 1, fetched, upserted: [] } } as unknown as FetchAllResult;
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Clock that advances one second per read. */
function tickingClock(): () => Date {
  let n = 0;
  return () => new Date(T0 + 1000 * n++);
}

type Harness = {
  deps: RefreshRunnerDeps;
  patches: Array<Partial<StoreMeta>>;
  meta: StoreMeta;
  logs: string[];
  summaryCalls: Array<{ now?: Date; boundaryAt?: string | null }>;
  fullStoryCalls: Array<{ now?: Date; boundaryAt?: string | null }>;
};

function harness(overrides: Partial<RefreshRunnerDeps> = {}, meta?: StoreMeta): Harness {
  const h: Harness = {
    patches: [],
    meta: meta ?? { lastFetchAt: null, lastError: null },
    logs: [],
    summaryCalls: [],
    fullStoryCalls: [],
    deps: {},
  };
  h.deps = {
    fetchAll: async () => fetchResult(),
    syncTracked: async () => {},
    generateSummaries: async (options) => {
      h.summaryCalls.push(options);
      return BRIEF;
    },
    generateFullStories: async (options) => {
      h.fullStoryCalls.push(options);
      return FULL_STORIES;
    },
    readMeta: async () => h.meta,
    updateMeta: async (patch) => {
      h.patches.push(patch);
      h.meta = { ...h.meta, ...patch };
      return h.meta;
    },
    now: tickingClock(),
    log: (message) => h.logs.push(message),
    ...overrides,
  };
  return h;
}

test('run: success → fetch, sync, summaries with boundaryAt = startedAt, meta last + lastSuccess', async () => {
  const order: string[] = [];
  const h = harness({
    fetchAll: async (options) => {
      order.push(`fetch:${JSON.stringify(options)}`);
      return fetchResult(4);
    },
    syncTracked: async () => {
      order.push('sync');
    },
  });
  const baseSummaries = h.deps.generateSummaries!;
  h.deps.generateSummaries = async (options) => {
    order.push('summaries');
    return baseSummaries(options);
  };
  const baseFullStories = h.deps.generateFullStories!;
  h.deps.generateFullStories = async (options) => {
    order.push('full-stories');
    return baseFullStories(options);
  };
  const runner = createRefreshRunner(h.deps);

  const result = await runner.run('manual', { limit: 4 });

  assert.deepEqual(order, ['fetch:{"limit":4}', 'sync', 'summaries', 'full-stories']);
  assert.equal(result.trigger, 'manual');
  assert.equal(result.joined, false);
  assert.equal(result.fetch.fetched, 4);
  assert.deepEqual(result.brief, { ...BRIEF, fullStories: FULL_STORIES });
  assert.equal(result.startedAt, '2026-09-30T12:00:00.000Z');
  assert.equal(h.summaryCalls.length, 1);
  assert.equal(h.summaryCalls[0]!.boundaryAt, result.startedAt);
  assert.ok(result.completedAt > result.startedAt);

  const expected: RefreshRun = {
    trigger: 'manual',
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    ok: true,
    error: null,
  };
  assert.deepEqual(h.patches, [
    { brief: { ...BRIEF, fullStories: FULL_STORIES } },
    { refresh: { last: expected, lastSuccess: expected } },
  ]);
  assert.equal(runner.isRunning(), false);
});

test('run: two concurrent calls → one fetch; second joins with joined: true', async () => {
  const gate = deferred<FetchAllResult>();
  let fetchCalls = 0;
  const h = harness({
    fetchAll: async () => {
      fetchCalls += 1;
      return gate.promise;
    },
  });
  const runner = createRefreshRunner(h.deps);

  const first = runner.run('timer');
  assert.equal(runner.isRunning(), true);
  const second = runner.run('manual', { limit: 99, feedUrl: 'https://other.example/rss' });
  gate.resolve(fetchResult(2));
  const [a, b] = await Promise.all([first, second]);

  assert.equal(fetchCalls, 1);
  assert.equal(a.joined, false);
  assert.equal(b.joined, true);
  assert.equal(b.trigger, 'timer');
  assert.equal(b.startedAt, a.startedAt);
  assert.equal(b.fetch, a.fetch);
  assert.equal(h.patches.length, 2);
  assert.equal(runner.isRunning(), false);
});

test('run: fetch rejection → meta last.ok=false (lastSuccess kept), rethrows, next run allowed', async () => {
  const previous: RefreshRun = {
    trigger: 'timer',
    startedAt: '2026-09-30T08:00:00.000Z',
    completedAt: '2026-09-30T08:01:00.000Z',
    ok: true,
    error: null,
  };
  let fail = true;
  const h = harness(
    {
      fetchAll: async () => {
        if (fail) throw new Error('CFP down');
        return fetchResult();
      },
    },
    { lastFetchAt: null, lastError: null, refresh: { last: previous, lastSuccess: previous } },
  );
  const runner = createRefreshRunner(h.deps);

  await Promise.all([
    assert.rejects(runner.run('manual'), /CFP down/),
    assert.rejects(runner.run('startup'), /CFP down/),
  ]);

  assert.equal(h.summaryCalls.length, 0);
  assert.equal(h.patches.length, 1);
  const refresh = h.patches[0]!.refresh!;
  assert.equal(refresh.last!.ok, false);
  assert.equal(refresh.last!.trigger, 'manual');
  assert.equal(refresh.last!.error, 'CFP down');
  assert.equal(refresh.last!.startedAt, '2026-09-30T12:00:00.000Z');
  assert.deepEqual(refresh.lastSuccess, previous);
  assert.equal(runner.isRunning(), false);

  fail = false;
  const ok = await runner.run('timer');
  assert.equal(ok.joined, false);
  assert.equal(h.meta.refresh!.last!.ok, true);
  assert.deepEqual(h.meta.refresh!.lastSuccess, h.meta.refresh!.last);
});

test('run: lastSuccess only moves on success', async () => {
  let fail = false;
  const h = harness({
    fetchAll: async () => {
      if (fail) throw new Error('nope');
      return fetchResult();
    },
  });
  const runner = createRefreshRunner(h.deps);

  const first = await runner.run('timer');
  const success = h.meta.refresh!.lastSuccess!;
  assert.equal(success.startedAt, first.startedAt);

  fail = true;
  await assert.rejects(runner.run('timer'));
  assert.deepEqual(h.meta.refresh!.lastSuccess, success);
  assert.equal(h.meta.refresh!.last!.ok, false);
});

test('run: syncTracked failure is logged and does not fail the run', async () => {
  const h = harness({
    syncTracked: async () => {
      throw new Error('tracked boom');
    },
  });
  const runner = createRefreshRunner(h.deps);

  const result = await runner.run('manual');
  assert.equal(result.joined, false);
  assert.equal(h.summaryCalls.length, 1);
  assert.equal(h.meta.refresh!.last!.ok, true);
  assert.ok(h.logs.some((l) => l.includes('tracked boom')));
});

test('run: meta write failure is logged and does not fail a successful run', async () => {
  const h = harness({
    updateMeta: async () => {
      throw new Error('disk full');
    },
  });
  const runner = createRefreshRunner(h.deps);

  const result = await runner.run('manual');
  assert.deepEqual(result.brief, { ...BRIEF, fullStories: FULL_STORIES });
  assert.ok(h.logs.some((l) => l.includes('disk full')));
});

test('run: meta read/write failure after a failed fetch still rethrows the fetch error', async () => {
  const h = harness({
    fetchAll: async () => {
      throw new Error('CFP down');
    },
    readMeta: async () => {
      throw new Error('meta unreadable');
    },
  });
  const runner = createRefreshRunner(h.deps);

  await assert.rejects(runner.run('timer'), /CFP down/);
  assert.ok(h.logs.some((l) => l.includes('meta unreadable')));
});

test('run: a throwing summaries dep does not fail the run', async () => {
  const h = harness({
    generateSummaries: async () => {
      throw new Error('unexpected');
    },
  });
  const runner = createRefreshRunner(h.deps);

  const result = await runner.run('manual');
  assert.deepEqual(result.brief.summaries.errors, ['unexpected']);
  assert.equal(h.meta.refresh!.last!.ok, true);
});

test('run: a throwing full-story generator is captured after summaries', async () => {
  const h = harness({
    generateFullStories: async () => {
      throw new Error('full story boom');
    },
  });
  const runner = createRefreshRunner(h.deps);

  const result = await runner.run('manual');
  assert.equal(h.summaryCalls.length, 1);
  assert.deepEqual(result.brief.fullStories, {
    budget: 0,
    used: 0,
    generated: 0,
    reused: 0,
    unavailable: 0,
    errors: ['full story boom'],
  });
  assert.deepEqual(h.meta.brief, result.brief);
  assert.equal(h.meta.refresh!.last!.ok, true);
});

test('createTrackedStoriesSync counts the full store by briefClusterKey', async () => {
  const articles = [
    { id: 'a1', clusterId: 'c1' },
    { id: 'a2', clusterId: 'c1' },
    { id: 'solo-1', clusterId: null },
  ] as Article[];
  let seen: Readonly<Record<string, number>> | null = null;
  const sync = createTrackedStoriesSync({
    readArticles: async () => articles,
    syncTrackedAfterFetch: async (counts) => {
      seen = counts;
    },
  });
  await sync();
  assert.deepEqual(seen, { c1: 2, 'solo:solo-1': 1 });
  assert.deepEqual(countByClusterIdFromArticles(articles), seen);
});
