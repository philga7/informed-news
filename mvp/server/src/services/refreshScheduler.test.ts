import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StoreMeta } from '../types/article.js';
import type { RefreshRun, RefreshTrigger } from '../types/brief.js';
import { REFRESH_CHECK_MINUTES } from './briefConfig.js';
import type { RefreshResult } from './refreshRunner.js';
import { isRefreshDue, startRefreshScheduler, type RefreshSchedulerDeps } from './refreshScheduler.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const MINUTES_AGO = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const HOURS_AGO = (h: number) => MINUTES_AGO(h * 60);

function run(overrides: Partial<RefreshRun> = {}): RefreshRun {
  return {
    trigger: 'timer',
    startedAt: HOURS_AGO(1),
    completedAt: HOURS_AGO(1),
    ok: true,
    error: null,
    ...overrides,
  };
}

function meta(overrides: Partial<StoreMeta> = {}): StoreMeta {
  return { lastFetchAt: null, lastError: null, ...overrides };
}

test('isRefreshDue: no meta history → due', () => {
  assert.equal(isRefreshDue(meta(), 3, NOW), true);
  assert.equal(isRefreshDue(meta({ refresh: null }), 3, NOW), true);
  assert.equal(isRefreshDue(meta({ refresh: { last: null, lastSuccess: null } }), 3, NOW), true);
});

test('isRefreshDue: legacy lastFetchAt is used when there is no lastSuccess', () => {
  assert.equal(isRefreshDue(meta({ lastFetchAt: HOURS_AGO(1) }), 3, NOW), false);
  assert.equal(isRefreshDue(meta({ lastFetchAt: HOURS_AGO(3) }), 3, NOW), true);
});

test('isRefreshDue: fresh vs stale lastSuccess.completedAt', () => {
  const fresh = run({ completedAt: HOURS_AGO(2.9) });
  const stale = run({ completedAt: HOURS_AGO(3) });
  assert.equal(isRefreshDue(meta({ refresh: { last: fresh, lastSuccess: fresh } }), 3, NOW), false);
  assert.equal(isRefreshDue(meta({ refresh: { last: stale, lastSuccess: stale } }), 3, NOW), true);
  // lastSuccess wins over an older legacy lastFetchAt
  assert.equal(
    isRefreshDue(meta({ lastFetchAt: HOURS_AGO(10), refresh: { last: fresh, lastSuccess: fresh } }), 3, NOW),
    false,
  );
  // decimal intervals
  const quarter = run({ completedAt: MINUTES_AGO(15) });
  assert.equal(isRefreshDue(meta({ refresh: { last: quarter, lastSuccess: quarter } }), 0.25, NOW), true);
});

test('isRefreshDue: failed attempt within the retry window → not due; after → due', () => {
  const stale = run({ completedAt: HOURS_AGO(5) });
  const recentFail = run({ ok: false, error: 'CFP down', startedAt: MINUTES_AGO(29) });
  const oldFail = run({ ok: false, error: 'CFP down', startedAt: MINUTES_AGO(30) });
  assert.equal(isRefreshDue(meta({ refresh: { last: recentFail, lastSuccess: stale } }), 3, NOW), false);
  assert.equal(isRefreshDue(meta({ refresh: { last: oldFail, lastSuccess: stale } }), 3, NOW), true);
  assert.equal(isRefreshDue(meta({ refresh: { last: recentFail, lastSuccess: null } }), 3, NOW), false);
  assert.equal(isRefreshDue(meta({ refresh: { last: oldFail, lastSuccess: null } }), 3, NOW), true);
});

test('isRefreshDue: future or invalid last-success timestamps count as missing → due', () => {
  const future = run({ completedAt: MINUTES_AGO(-60) });
  assert.equal(isRefreshDue(meta({ refresh: { last: future, lastSuccess: future } }), 3, NOW), true);
  const invalid = run({ completedAt: 'not-a-date' });
  assert.equal(isRefreshDue(meta({ refresh: { last: invalid, lastSuccess: invalid } }), 3, NOW), true);
  assert.equal(isRefreshDue(meta({ lastFetchAt: MINUTES_AGO(-60) }), 3, NOW), true);
  assert.equal(isRefreshDue(meta({ lastFetchAt: 'garbage' }), 3, NOW), true);
});

test('isRefreshDue: future or invalid failed-attempt startedAt skips the retry gate', () => {
  const stale = run({ completedAt: HOURS_AGO(5) });
  const futureFail = run({ ok: false, error: 'CFP down', startedAt: MINUTES_AGO(-10) });
  const invalidFail = run({ ok: false, error: 'CFP down', startedAt: 'nope' });
  assert.equal(isRefreshDue(meta({ refresh: { last: futureFail, lastSuccess: stale } }), 3, NOW), true);
  assert.equal(isRefreshDue(meta({ refresh: { last: invalidFail, lastSuccess: stale } }), 3, NOW), true);
  assert.equal(isRefreshDue(meta({ refresh: { last: futureFail, lastSuccess: null } }), 3, NOW), true);
});

function okResult(trigger: RefreshTrigger): RefreshResult {
  return {
    trigger,
    joined: false,
    startedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    fetch: { fetched: 2 } as RefreshResult['fetch'],
    brief: {
      at: NOW.toISOString(),
      summaries: { budget: 60, used: 0, generated: 0, reused: 0, unavailable: 0, errors: [] },
    },
  };
}

type FakeTimers = {
  deps: Pick<RefreshSchedulerDeps, 'setInterval' | 'clearInterval'>;
  intervals: Array<{ fn: () => void; ms: number; unrefCalled: boolean; cleared: boolean }>;
};

function fakeTimers(): FakeTimers {
  const intervals: FakeTimers['intervals'] = [];
  return {
    intervals,
    deps: {
      setInterval: (fn, ms) => {
        const entry = { fn, ms, unrefCalled: false, cleared: false };
        intervals.push(entry);
        return {
          entry,
          unref: () => {
            entry.unrefCalled = true;
          },
        } as { unref: () => void };
      },
      clearInterval: (handle) => {
        (handle as unknown as { entry: { cleared: boolean } }).entry.cleared = true;
      },
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

test('scheduler disabled (REFRESH_INTERVAL_HOURS=off) → no timers, no checks', async () => {
  const timers = fakeTimers();
  let reads = 0;
  const scheduler = startRefreshScheduler(
    { env: { REFRESH_INTERVAL_HOURS: 'off' } },
    {
      ...timers.deps,
      readMeta: async () => {
        reads += 1;
        return meta();
      },
      runner: { isRunning: () => false, run: async (t) => okResult(t) },
    },
  );
  await scheduler.startupCheck;
  assert.equal(scheduler.enabled, false);
  assert.equal(scheduler.intervalHours, null);
  assert.equal(timers.intervals.length, 0);
  assert.equal(reads, 0);
  scheduler.stop();
});

test('scheduler: startup check runs immediately with trigger startup; then ticks use timer', async () => {
  const timers = fakeTimers();
  const triggers: RefreshTrigger[] = [];
  const logs: string[] = [];
  const scheduler = startRefreshScheduler(
    { env: { REFRESH_INTERVAL_HOURS: '2' } },
    {
      ...timers.deps,
      now: () => NOW,
      readMeta: async () => meta(),
      runner: {
        isRunning: () => false,
        run: async (trigger) => {
          triggers.push(trigger);
          return okResult(trigger);
        },
      },
      log: (m) => logs.push(m),
    },
  );
  assert.equal(scheduler.enabled, true);
  assert.equal(scheduler.intervalHours, 2);
  await scheduler.startupCheck;
  assert.deepEqual(triggers, ['startup']);

  assert.equal(timers.intervals.length, 1);
  const interval = timers.intervals[0]!;
  assert.equal(interval.ms, REFRESH_CHECK_MINUTES * 60_000);
  assert.equal(interval.unrefCalled, true);

  interval.fn();
  await flush();
  assert.deepEqual(triggers, ['startup', 'timer']);

  scheduler.stop();
  assert.equal(interval.cleared, true);
});

test('scheduler: not due → no run', async () => {
  const timers = fakeTimers();
  let runs = 0;
  const fresh = run({ completedAt: HOURS_AGO(1) });
  const scheduler = startRefreshScheduler(
    { env: {} },
    {
      ...timers.deps,
      now: () => NOW,
      readMeta: async () => meta({ refresh: { last: fresh, lastSuccess: fresh } }),
      runner: {
        isRunning: () => false,
        run: async (t) => {
          runs += 1;
          return okResult(t);
        },
      },
      log: () => {},
    },
  );
  await scheduler.startupCheck;
  assert.equal(runs, 0);
  scheduler.stop();
});

test('scheduler: tick while a refresh is running skips (no meta read, no run)', async () => {
  const timers = fakeTimers();
  let reads = 0;
  let runs = 0;
  let running = true;
  const scheduler = startRefreshScheduler(
    { env: {} },
    {
      ...timers.deps,
      now: () => NOW,
      readMeta: async () => {
        reads += 1;
        return meta();
      },
      runner: {
        isRunning: () => running,
        run: async (t) => {
          runs += 1;
          return okResult(t);
        },
      },
      log: () => {},
    },
  );
  await scheduler.startupCheck;
  timers.intervals[0]!.fn();
  await flush();
  assert.equal(reads, 0);
  assert.equal(runs, 0);

  running = false;
  timers.intervals[0]!.fn();
  await flush();
  assert.equal(reads, 1);
  assert.equal(runs, 1);
  scheduler.stop();
});

test('scheduler: run errors and meta read errors are logged, never thrown', async () => {
  const timers = fakeTimers();
  const logs: string[] = [];
  let readFails = false;
  const scheduler = startRefreshScheduler(
    { env: {} },
    {
      ...timers.deps,
      now: () => NOW,
      readMeta: async () => {
        if (readFails) throw new Error('meta unreadable');
        return meta();
      },
      runner: {
        isRunning: () => false,
        run: async () => {
          throw new Error('CFP down');
        },
      },
      log: (m) => logs.push(m),
    },
  );
  await scheduler.startupCheck;
  assert.ok(logs.some((l) => l.includes('startup') && l.includes('CFP down')));

  timers.intervals[0]!.fn();
  await flush();
  assert.ok(logs.some((l) => l.includes('timer') && l.includes('CFP down')));

  readFails = true;
  timers.intervals[0]!.fn();
  await flush();
  assert.ok(logs.some((l) => l.includes('meta unreadable')));
  scheduler.stop();
});
