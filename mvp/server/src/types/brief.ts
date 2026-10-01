/**
 * Topic Brief (NEWS-88): per-story AI summaries, read ("seen") snapshots, and
 * the refresh / brief run summaries stored in meta.json.
 * UI labels summaries: "AI summary — not ground truth."
 */

export type SummaryStatus = 'ok' | 'unavailable' | 'error';
export type SummaryTrigger = 'refresh' | 'on_demand';

export type BriefSummaryRecord = {
  /** Kept article id (store key) */
  articleId: string;
  status: SummaryStatus;
  /** ok only */
  text: string | null;
  /** Article whose text was summarised; null when no source text applied */
  sourceArticleId: string | null;
  /** sha256 of the source text, first 16 hex */
  sourceHash: string | null;
  model: string | null;
  /** error only */
  error: string | null;
  /** ISO */
  generatedAt: string;
  trigger: SummaryTrigger;
};

export type BriefSummariesStore = {
  summaries: Record<string, BriefSummaryRecord>;
  updatedAt: string | null;
};

/** Snapshot of the kept record when the story was read */
export type BriefSeenEntry = {
  /** ISO */
  seenAt: string;
  outletCount: number | null;
  significance: number | null;
};

export type BriefSeenStore = { seen: Record<string, BriefSeenEntry>; updatedAt: string | null };

export type RefreshTrigger = 'manual' | 'timer' | 'startup';

export type RefreshRun = {
  trigger: RefreshTrigger;
  /** ISO */
  startedAt: string;
  /** ISO */
  completedAt: string;
  ok: boolean;
  error: string | null;
};

export type RefreshMeta = { last: RefreshRun | null; lastSuccess: RefreshRun | null };

export type FullStoriesRunMeta = {
  budget: number;
  /** Full-story generation attempts made (including failures). */
  used: number;
  generated: number;
  reused: number;
  unavailable: number;
  errors: string[];
};

export type BriefRunMeta = {
  at: string;
  summaries: {
    budget: number;
    /** Ollama calls made (failed calls count) */
    used: number;
    generated: number;
    reused: number;
    unavailable: number;
    errors: string[];
  };
  /** Automatic full-story run after refresh-time summaries. */
  fullStories?: FullStoriesRunMeta;
};
