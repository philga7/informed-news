/**
 * Refresh runner (NEWS-88): one pipeline for manual, timer and startup
 * refreshes — fetch all sources → tracked-stories sync → refresh-time Brief
 * summaries → `meta.refresh`. Single-flight per process: a call while a
 * refresh is running joins it.
 */
import { readArticles, readMeta, syncTrackedAfterFetch, updateMeta } from '../store/index.js';
import type { Article, StoreMeta } from '../types/article.js';
import type { BriefRunMeta, FullStoriesRunMeta, RefreshRun, RefreshTrigger } from '../types/brief.js';
import { briefClusterKey } from './briefClusterKey.js';
import { generateRefreshFullStories } from './briefFullStories.js';
import { generateRefreshSummaries } from './briefSummaries.js';
import { fetchAllSources } from './fetchAllSources.js';
import type { FetchAllOptions, FetchAllResult } from './fetchAllSources.js';

export type RefreshResult = {
  trigger: RefreshTrigger;
  /** true when this call joined a refresh that was already running */
  joined: boolean;
  startedAt: string;
  completedAt: string;
  fetch: FetchAllResult;
  brief: BriefRunMeta;
};

export type RefreshRunnerDeps = {
  fetchAll?: (options?: FetchAllOptions) => Promise<FetchAllResult>;
  syncTracked?: () => Promise<void>;
  generateSummaries?: (
    options: { now?: Date; boundaryAt?: string | null },
  ) => Promise<BriefRunMeta>;
  generateFullStories?: (
    options: { now?: Date; boundaryAt?: string | null },
  ) => Promise<FullStoriesRunMeta>;
  readMeta?: () => Promise<StoreMeta>;
  updateMeta?: (patch: Partial<StoreMeta>) => Promise<unknown>;
  now?: () => Date;
  log?: (message: string) => void;
};

export type RefreshRunner = {
  /** Rejects only when fetching fails (e.g. CFP); joined calls share that outcome. */
  run(trigger: RefreshTrigger, options?: FetchAllOptions): Promise<RefreshResult>;
  isRunning(): boolean;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function countByClusterIdFromArticles(
  articles: ReadonlyArray<Pick<Article, 'id' | 'clusterId'>>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const article of articles) {
    const key = briefClusterKey(article);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Tracked developing-story sync after a fetch. Counts come from the full
 * rewritten store (same denominator as Accept), not just this fetch's upserts.
 */
export function createTrackedStoriesSync(
  deps: {
    readArticles?: () => Promise<ReadonlyArray<Pick<Article, 'id' | 'clusterId'>>>;
    syncTrackedAfterFetch?: (countByClusterId: Readonly<Record<string, number>>) => Promise<unknown>;
  } = {},
): () => Promise<void> {
  const readAll = deps.readArticles ?? (() => readArticles());
  const sync = deps.syncTrackedAfterFetch ?? ((counts) => syncTrackedAfterFetch(counts));
  return async () => {
    const allArticles = await readAll();
    await sync(countByClusterIdFromArticles(allArticles));
  };
}

function emptyBriefRun(at: string, error: string): BriefRunMeta {
  return {
    at,
    summaries: { budget: 0, used: 0, generated: 0, reused: 0, unavailable: 0, errors: [error] },
  };
}

export function createRefreshRunner(deps: RefreshRunnerDeps = {}): RefreshRunner {
  const fetchAll = deps.fetchAll ?? ((options?: FetchAllOptions) => fetchAllSources(options));
  const syncTracked = deps.syncTracked ?? createTrackedStoriesSync();
  const generateSummaries =
    deps.generateSummaries ?? ((options) => generateRefreshSummaries(options));
  const generateFullStories =
    deps.generateFullStories ?? ((options) => generateRefreshFullStories(options));
  const readServerMeta = deps.readMeta ?? (() => readMeta());
  const updateServerMeta = deps.updateMeta ?? ((patch: Partial<StoreMeta>) => updateMeta(patch));
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string) => console.error(message));

  let inFlight: Promise<RefreshResult> | null = null;

  /** Meta write failures are logged; they never fail a refresh. */
  const recordRun = async (run: RefreshRun): Promise<void> => {
    try {
      const lastSuccess = run.ok
        ? run
        : ((await readServerMeta()).refresh?.lastSuccess ?? null);
      await updateServerMeta({ refresh: { last: run, lastSuccess } });
    } catch (err) {
      log(`Refresh meta write failed: ${errorMessage(err)}`);
    }
  };

  const runOnce = async (
    trigger: RefreshTrigger,
    options: FetchAllOptions | undefined,
  ): Promise<RefreshResult> => {
    const startedAt = now().toISOString();

    let fetch: FetchAllResult;
    try {
      fetch = await fetchAll(options);
    } catch (err) {
      await recordRun({
        trigger,
        startedAt,
        completedAt: now().toISOString(),
        ok: false,
        error: errorMessage(err),
      });
      throw err;
    }

    try {
      await syncTracked();
    } catch (err) {
      log(`Tracked stories sync after fetch failed: ${errorMessage(err)}`);
    }

    let brief: BriefRunMeta;
    try {
      brief = await generateSummaries({ now: now(), boundaryAt: startedAt });
    } catch (err) {
      brief = emptyBriefRun(now().toISOString(), errorMessage(err));
    }
    let fullStories: FullStoriesRunMeta;
    try {
      fullStories = await generateFullStories({ now: now(), boundaryAt: startedAt });
    } catch (err) {
      fullStories = {
        budget: 0,
        used: 0,
        generated: 0,
        reused: 0,
        unavailable: 0,
        errors: [errorMessage(err)],
      };
    }
    brief = { ...brief, fullStories };
    try {
      await updateServerMeta({ brief });
    } catch (err) {
      log(`Brief full-story meta write failed: ${errorMessage(err)}`);
    }

    const completedAt = now().toISOString();
    await recordRun({ trigger, startedAt, completedAt, ok: true, error: null });
    return { trigger, joined: false, startedAt, completedAt, fetch, brief };
  };

  return {
    run(trigger, options) {
      if (inFlight) {
        return inFlight.then((result) => ({ ...result, joined: true }));
      }
      const promise = runOnce(trigger, options).finally(() => {
        inFlight = null;
      });
      inFlight = promise;
      return promise;
    },
    isRunning() {
      return inFlight !== null;
    },
  };
}

let processRunner: RefreshRunner | null = null;

/** Process singleton shared by `POST /api/fetch` and the scheduler. */
export function getRefreshRunner(): RefreshRunner {
  processRunner ??= createRefreshRunner();
  return processRunner;
}
