/** Triage pipeline (NEWS-87) constants and env readers. */

export const TRIAGE_WINDOW_HOURS = 48;

export const DEFAULT_TRIAGE_JEV_BUDGET = 300;
export const DEFAULT_TRIAGE_SUMMARY_BUDGET = 60;

/** Story groups in flight */
export const TRIAGE_CONCURRENCY = 4;

export const TRIAGE_MAX_CANDIDATE_TOPICS = 6;
export const TRIAGE_MAX_UNDESIRED_TOPICS = 10;

/** Alternates tried after the representative is dropped for a quality/date reason */
export const TRIAGE_MAX_PROMOTIONS = 2;

/** Noul */
export const RELEVANCE_MIN = 0.5;
/** Noul */
export const UNDESIRED_MIN = 0.6;
/** Choice confidence */
export const QUALITY_CONFIDENCE_MIN = 0.6;
/** Expected score on a 0–2 rubric */
export const WATCH_SIGNIFICANCE_MIN = 1.4;

export const HEADLINE_SNIPPET_MAX_CHARS = 300;
export const BODY_EXCERPT_MAX_CHARS = 3000;

export const SIMILAR_TITLE_MIN_SHARED_TOKENS = 4;
export const SIMILAR_TITLE_JACCARD_MIN = 0.6;
/** Identical headlines shorter than this (e.g. "Live updates") are not syndication */
export const SYNDICATION_MIN_TITLE_TOKENS = 3;

const DISABLED_VALUES = new Set(['false', '0', 'off', 'no']);

export function isTriageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.TRIAGE_ENABLED?.trim().toLowerCase();
  return raw === undefined || !DISABLED_VALUES.has(raw);
}

function parseBudget(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  return trimmed !== undefined && /^\d+$/.test(trimmed) ? Number(trimmed) : fallback;
}

export function resolveTriageBudgets(env: NodeJS.ProcessEnv = process.env): {
  jevCalls: number;
  summaries: number;
} {
  return {
    jevCalls: parseBudget(env.TRIAGE_JEV_BUDGET, DEFAULT_TRIAGE_JEV_BUDGET),
    summaries: parseBudget(env.TRIAGE_SUMMARY_BUDGET, DEFAULT_TRIAGE_SUMMARY_BUDGET),
  };
}
