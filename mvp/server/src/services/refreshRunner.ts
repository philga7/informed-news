/**
 * Refresh runner (NEWS-88): one pipeline for manual, timer and startup
 * refreshes — fetch all sources (ingest + topic search + triage) →
 * refresh-time Brief summaries → full stories → prune saved summaries and
 * full stories (NEWS-99, NEWS-100) → prune articles (NEWS-117) →
 * `meta.refresh`. Single-flight per process: a call while a refresh is
 * running joins it.
 */
import { readMeta, updateMeta } from '../store/index.js';
import type { StoreMeta } from '../types/article.js';
import type { BriefRunMeta, FullStoriesRunMeta, RefreshRun, RefreshTrigger } from '../types/brief.js';
import { pruneArticleStore, type ArticleRetentionResult } from './articleRetention.js';
import { generateRefreshFullStories } from './briefFullStories.js';
import { pruneBriefStores, type BriefRetentionResult } from './briefRetention.js';
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
  generateSummaries?: (
    options: { now?: Date; boundaryAt?: string | null },
  ) => Promise<BriefRunMeta>;
  generateFullStories?: (
    options: { now?: Date; boundaryAt?: string | null },
  ) => Promise<FullStoriesRunMeta>;
  pruneBriefStores?: (options: { now: Date }) => Promise<BriefRetentionResult>;
  pruneArticleStore?: (options: { now: Date }) => Promise<ArticleRetentionResult>;
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

function emptyBriefRun(at: string, error: string): BriefRunMeta {
  return {
    at,
    summaries: { budget: 0, used: 0, generated: 0, reused: 0, unavailable: 0, errors: [error] },
  };
}

export function createRefreshRunner(deps: RefreshRunnerDeps = {}): RefreshRunner {
  const fetchAll = deps.fetchAll ?? ((options?: FetchAllOptions) => fetchAllSources(options));
  const generateSummaries =
    deps.generateSummaries ?? ((options) => generateRefreshSummaries(options));
  const generateFullStories =
    deps.generateFullStories ?? ((options) => generateRefreshFullStories(options));
  const pruneStores = deps.pruneBriefStores ?? ((options) => pruneBriefStores(options));
  const pruneOldArticles = deps.pruneArticleStore ?? ((options) => pruneArticleStore(options));
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

    try {
      const pruned = await pruneStores({ now: now() });
      for (const error of pruned.errors) log(`Brief store prune failed: ${error}`);
    } catch (err) {
      log(`Brief store prune failed: ${errorMessage(err)}`);
    }
    try {
      const pruned = await pruneOldArticles({ now: now() });
      for (const error of pruned.errors) log(`Article store prune failed: ${error}`);
    } catch (err) {
      log(`Article store prune failed: ${errorMessage(err)}`);
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
