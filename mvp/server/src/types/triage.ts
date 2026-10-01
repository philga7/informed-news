/**
 * Triage pipeline (NEWS-87): per-article keep/drop records and the per-refresh
 * run summary stored in meta.json.
 */

export const TRIAGE_STATIC_REASONS = [
  'off_topic',
  'duplicate',
  'clickbait',
  'opinion',
  'rewrite',
  'sponsored',
  'not_significant',
  'undated',
  'stale',
  'not_scored_budget',
  'not_scored_error',
] as const;
export type TriageStaticReason = (typeof TRIAGE_STATIC_REASONS)[number];
export type TriageReason = TriageStaticReason | `muted:${string}`;
export const NON_FINAL_REASONS: ReadonlySet<TriageReason> = new Set<TriageReason>([
  'not_scored_budget',
  'not_scored_error',
]);

export type TriageStatus = 'kept' | 'dropped';
export type TriageStage = 'keyword' | 'dedupe' | 'headline' | 'survivor' | 'body' | 'budget';
export type TriageLabel = 'official';

export type TriageRecord = {
  articleId: string;
  status: TriageStatus;
  /** null iff kept */
  reason: TriageReason | null;
  /** Where the decision was made */
  stage: TriageStage;
  /** false iff reason is non-final */
  final: boolean;
  /** kept: Jev-confirmed topics; dropped: candidate topics considered */
  topicIds: string[];
  labels: TriageLabel[];
  /** reason 'duplicate' only */
  duplicateOf: string | null;
  /** kept only: duplicate article ids in its group */
  memberIds: string[];
  /** kept only */
  outletCount: number | null;
  /** Headline significance score when asked */
  significance: number | null;
  bodyChecked: boolean;
  /** Jev calls spent on this article */
  jevCalls: number;
  /** ISO */
  triagedAt: string;
};

export type TriageStore = { records: Record<string, TriageRecord>; updatedAt: string | null };

export type TriageRunMeta = {
  at: string;
  /** Disabled, or topics/articles unreadable */
  skipped: boolean;
  candidates: number;
  kept: number;
  dropped: number;
  /** 'muted:<id>' counted under 'muted' */
  byReason: Record<string, number>;
  jev: { budget: number; used: number; errors: number };
  summaryBudget: number;
  /** At most 5 */
  errors: string[];
};
