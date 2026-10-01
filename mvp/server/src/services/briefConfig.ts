/** Topic Brief (NEWS-88) constants and env readers. */

/** Cards shown per topic section before "More"; also the refresh-time summary set */
export const BRIEF_TOP_N = 3;
/** Article links per card: the kept article plus duplicate members, distinct domains */
export const BRIEF_MAX_LINKS = 8;

/** A seen story re-shows when its outlet count grows by at least this much */
export const SIGNIFICANT_UPDATE_OUTLET_DELTA = 2;
/** A seen story re-shows when its significance (0–2) grows by at least this much */
export const SIGNIFICANT_UPDATE_SIGNIFICANCE_DELTA = 0.5;
export const BRIEF_SEEN_RETENTION_DAYS = 7;

export const SUMMARY_SOURCE_MAX_CHARS = 3000;
export const SUMMARY_MIN_CHARS = 20;
export const SUMMARY_MAX_CHARS = 400;
/** Post text (e.g. xcancel snippet) used as summary source only at this length or longer */
export const SUMMARY_POST_MIN_CHARS = 120;
/** Ollama summary calls in flight */
export const SUMMARY_CONCURRENCY = 2;
export const ON_DEMAND_SUMMARY_MAX_PER_HOUR = 30;

/** Full Kite stories (NEWS-89) */
export const FULL_STORY_AUTO_MAX_PER_REFRESH = 5;
export const FULL_STORY_AUTO_MAX_PER_TOPIC = 1;
export const FULL_STORY_MIN_OUTLETS_AUTO = 3;
export const FULL_STORY_AUTO_MIN_SIGNIFICANCE = 1;
export const ON_DEMAND_FULL_STORY_MAX_PER_HOUR = 20;
export const FULL_STORY_BODY_MAX_CHARS = 4000;
export const FULL_STORY_MEMBER_MAX = 6;

export const DEFAULT_REFRESH_INTERVAL_HOURS = 3;
export const MIN_REFRESH_INTERVAL_HOURS = 0.25;
export const REFRESH_CHECK_MINUTES = 5;
/** Wait after a failed refresh attempt before the scheduler tries again */
export const REFRESH_RETRY_MINUTES = 30;

const DISABLED_VALUES = new Set(['false', '0', 'off', 'no']);
const DECIMAL = /^\d*\.?\d+$/;

/**
 * Auto-refresh interval from `REFRESH_INTERVAL_HOURS`.
 * null = timer and startup catch-up disabled; unset/invalid → default.
 */
export function resolveRefreshIntervalHours(
  env: NodeJS.ProcessEnv = process.env,
): number | null {
  const raw = env.REFRESH_INTERVAL_HOURS?.trim().toLowerCase();
  if (raw === undefined) return DEFAULT_REFRESH_INTERVAL_HOURS;
  if (DISABLED_VALUES.has(raw)) return null;
  const value = DECIMAL.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_REFRESH_INTERVAL_HOURS;
  return Math.max(value, MIN_REFRESH_INTERVAL_HOURS);
}
