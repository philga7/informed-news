/**
 * Auto-refresh scheduler (NEWS-88): one check at startup, then one every
 * REFRESH_CHECK_MINUTES. A check is one meta read; it starts a refresh when
 * the last success is older than the interval. A laptop that slept catches up
 * on the next tick after wake. Never throws.
 */
import { readMeta } from '../store/index.js';
import type { StoreMeta } from '../types/article.js';
import type { RefreshTrigger } from '../types/brief.js';
import {
  REFRESH_CHECK_MINUTES,
  REFRESH_RETRY_MINUTES,
  resolveRefreshIntervalHours,
} from './briefConfig.js';
import { getRefreshRunner, type RefreshRunner } from './refreshRunner.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export type IntervalHandle = { unref?: () => unknown };

export type RefreshSchedulerDeps = {
  runner?: Pick<RefreshRunner, 'run' | 'isRunning'>;
  readMeta?: () => Promise<StoreMeta>;
  setInterval?: (fn: () => void, ms: number) => IntervalHandle;
  clearInterval?: (handle: IntervalHandle) => void;
  now?: () => Date;
  log?: (message: string) => void;
};

export type RefreshScheduler = {
  enabled: boolean;
  /** null when disabled */
  intervalHours: number | null;
  /** Resolves when the startup check (and any refresh it started) settles */
  startupCheck: Promise<void>;
  stop(): void;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Due when the last success (legacy: `meta.lastFetchAt`) is missing or at
 * least `intervalHours` old — unless the last attempt failed less than
 * REFRESH_RETRY_MINUTES ago.
 */
export function isRefreshDue(meta: StoreMeta, intervalHours: number, now: Date): boolean {
  const last = meta.refresh?.last ?? null;
  if (last && last.ok === false) {
    const failedAt = parseTime(last.startedAt);
    if (failedAt !== null && now.getTime() - failedAt < REFRESH_RETRY_MINUTES * MINUTE_MS) {
      return false;
    }
  }
  const lastDoneAt = parseTime(meta.refresh?.lastSuccess?.completedAt ?? meta.lastFetchAt);
  if (lastDoneAt === null) return true;
  return now.getTime() - lastDoneAt >= intervalHours * HOUR_MS;
}

export function startRefreshScheduler(
  options: { env?: NodeJS.ProcessEnv } = {},
  deps: RefreshSchedulerDeps = {},
): RefreshScheduler {
  const intervalHours = resolveRefreshIntervalHours(options.env ?? process.env);
  if (intervalHours === null) {
    return { enabled: false, intervalHours: null, startupCheck: Promise.resolve(), stop() {} };
  }

  const runner = deps.runner ?? getRefreshRunner();
  const readServerMeta = deps.readMeta ?? (() => readMeta());
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string) => console.log(message));
  const setIntervalFn = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearIntervalFn =
    deps.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));

  const check = async (trigger: RefreshTrigger): Promise<void> => {
    try {
      if (runner.isRunning()) return;
      let meta: StoreMeta;
      try {
        meta = await readServerMeta();
      } catch (err) {
        log(`Auto-refresh check skipped (meta read failed): ${errorMessage(err)}`);
        return;
      }
      if (!isRefreshDue(meta, intervalHours, now())) return;

      log(`Auto-refresh (${trigger}) starting`);
      const result = await runner.run(trigger);
      log(
        `Auto-refresh (${trigger}) ${result.joined ? 'joined running refresh' : 'done'}: ` +
          `${result.fetch.fetched} fetched, ${result.brief.summaries.generated} summaries`,
      );
    } catch (err) {
      log(`Auto-refresh (${trigger}) failed: ${errorMessage(err)}`);
    }
  };

  const safeCheck = (trigger: RefreshTrigger): Promise<void> =>
    check(trigger).catch(() => undefined);

  const startupCheck = safeCheck('startup');
  const handle = setIntervalFn(() => {
    void safeCheck('timer');
  }, REFRESH_CHECK_MINUTES * MINUTE_MS);
  handle.unref?.();

  return {
    enabled: true,
    intervalHours,
    startupCheck,
    stop() {
      clearIntervalFn(handle);
    },
  };
}
