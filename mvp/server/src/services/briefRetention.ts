/**
 * Brief cache retention (NEWS-99, NEWS-100): after each successful refresh,
 * drop saved summaries and full stories that the Brief can no longer show.
 * NEWS-172: also prune citation sources + check logs older than 7 days.
 */
import {
  pruneBriefFullStories,
  pruneBriefSummaries,
  pruneCitationCheckLogsOlderThan,
  pruneCitationSourcesOlderThan,
  readTriage,
} from '../store/index.js';
import type { BriefSummaryRecord } from '../types/brief.js';
import type { BriefFullStoryRecord } from '../types/briefFullStory.js';
import type { TriageStore } from '../types/triage.js';
import { BRIEF_CACHE_RETENTION_DAYS } from './briefConfig.js';

export type BriefRetentionDeps = {
  readTriage?: () => Promise<TriageStore>;
  pruneBriefSummaries?: (keep: (record: BriefSummaryRecord) => boolean) => Promise<number>;
  pruneBriefFullStories?: (keep: (record: BriefFullStoryRecord) => boolean) => Promise<number>;
  pruneCitationSourcesOlderThan?: (now: Date, retentionDays?: number) => Promise<number>;
  pruneCitationCheckLogsOlderThan?: (now: Date, retentionDays?: number) => Promise<number>;
};

export type BriefRetentionResult = {
  /** Records removed from each store */
  summaries: number;
  fullStories: number;
  citationSources: number;
  citationCheckLogs: number;
  errors: string[];
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Keep a record only while its article is a kept triage record and it was
 * generated within BRIEF_CACHE_RETENTION_DAYS. Unreadable triage → nothing is
 * pruned. Never throws; failures are returned in `errors`.
 * Citation sources / check logs use the same 7-day window by fetchedAt / updatedAt.
 */
export async function pruneBriefStores(
  options: { now: Date },
  deps: BriefRetentionDeps = {},
): Promise<BriefRetentionResult> {
  const result: BriefRetentionResult = {
    summaries: 0,
    fullStories: 0,
    citationSources: 0,
    citationCheckLogs: 0,
    errors: [],
  };
  let triage: TriageStore;
  try {
    triage = await (deps.readTriage ?? (() => readTriage()))();
  } catch (err) {
    result.errors.push(`triage: ${errorMessage(err)}`);
    return result;
  }
  const cutoff = options.now.getTime() - BRIEF_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const keep = (record: { articleId: string; generatedAt: string }) => {
    const time = Date.parse(record.generatedAt);
    return (
      triage.records[record.articleId]?.status === 'kept' && !Number.isNaN(time) && time >= cutoff
    );
  };

  try {
    result.summaries = await (deps.pruneBriefSummaries ?? ((k) => pruneBriefSummaries(k)))(keep);
  } catch (err) {
    result.errors.push(`summaries prune: ${errorMessage(err)}`);
  }
  try {
    result.fullStories = await (deps.pruneBriefFullStories ?? ((k) => pruneBriefFullStories(k)))(keep);
  } catch (err) {
    result.errors.push(`full stories prune: ${errorMessage(err)}`);
  }
  try {
    result.citationSources = await (
      deps.pruneCitationSourcesOlderThan ??
      ((now, days) => pruneCitationSourcesOlderThan(now, days))
    )(options.now, BRIEF_CACHE_RETENTION_DAYS);
  } catch (err) {
    result.errors.push(`citation sources prune: ${errorMessage(err)}`);
  }
  try {
    result.citationCheckLogs = await (
      deps.pruneCitationCheckLogsOlderThan ??
      ((now, days) => pruneCitationCheckLogsOlderThan(now, days))
    )(options.now, BRIEF_CACHE_RETENTION_DAYS);
  } catch (err) {
    result.errors.push(`citation check logs prune: ${errorMessage(err)}`);
  }
  return result;
}
