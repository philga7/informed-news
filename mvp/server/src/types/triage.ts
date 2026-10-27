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
export type TriageStage =
  | 'keyword'
  | 'dedupe'
  | 'headline'
  | 'survivor'
  | 'body'
  | 'budget'
  /** Operator-added seed (NEWS-98); never re-triaged */
  | 'manual';
export type TriageLabel = 'official';

/** Advisory keep/drop for the Brief (NEWS-167). Mirrors machine status when present. */
export type TriageAdvisoryVerdict = 'approved' | 'filtered';

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
  /**
   * Advisory layer (NEWS-167). Absent on pre-NEWS-167 rows — no backfill.
   * Machine `status` / `reason` remain the live triage record.
   */
  verdict?: TriageAdvisoryVerdict;
  /** 0–1 when present */
  confidence?: number;
  /** Prose reason (≤300); never the machine drop code */
  reasonText?: string;
  /** One driving rule: `global` | `topic:<id>` | `source:<id>` | `rule:mute:<id>` | `rule:duplicate` | `rule:budget` */
  criteriaRef?: string;
};

export type TriageStore = { records: Record<string, TriageRecord>; updatedAt: string | null };

export type TriageRunMeta = {
  at: string;
  /** Disabled, topics/articles/triage store unreadable, or the run stopped on an unexpected error */
  skipped: boolean;
  candidates: number;
  kept: number;
  dropped: number;
  /** 'muted:<id>' counted under 'muted' */
  byReason: Record<string, number>;
  jev: { budget: number; used: number; errors: number };
  summaryBudget: number;
  /** At most 5, plus any store-write errors */
  errors: string[];
};
