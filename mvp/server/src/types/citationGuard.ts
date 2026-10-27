/**
 * Citation guard (NEWS-172): per-run fetched sources and (later) check results.
 * Source store keys are `${contentHash}:${runId}` so the same body text can
 * appear under multiple runs without colliding.
 */

/** One fetched source body registered for a refresh / on-demand generate run. */
export type CitationSourceRecord = {
  /** Stable store key: `${contentHash}:${runId}` */
  id: string;
  /** Publisher / member URL when known; null for text-only sources */
  url: string | null;
  text: string;
  /** ISO timestamp when this run registered the source */
  fetchedAt: string;
  runId: string;
  /** sha256 of `text`, first 16 hex (same style as Brief `sourceHash`) */
  contentHash: string;
  /** Article or cluster-member id when known */
  articleId: string | null;
};

export type CitationSourcesStore = {
  /** Keyed by `CitationSourceRecord.id` (`contentHash:runId`) */
  sources: Record<string, CitationSourceRecord>;
  updatedAt: string | null;
};

/** Citation item kinds (court reserved for NEWS-173). */
export type CitationKind = 'url' | 'quote' | 'claim' | 'court';

export type CitationScope = 'summary' | 'story';

/** Shared terminal check states. */
export type CitationCheckStatus = 'match' | 'mismatch' | 'missing-source';

export type CitationCheckItem = {
  kind: CitationKind;
  /** For kind url: the outbound href being checked */
  url?: string | null;
  /** For kind quote: the raw quote text being checked */
  quote?: string | null;
  /** For kind claim: URL of the source that supposedly refutes the claim */
  refutingUrl?: string | null;
  /** Optional claim text identity for later logging */
  claimText?: string | null;
  /** Optional stable id for logging later */
  id?: string;
  /** For kind court: normalized reporter cite, e.g. `598 U.S. 651` */
  citation?: string | null;
  volume?: string | null;
  reporter?: string | null;
  page?: string | null;
};

export type CitationCheckResult = {
  kind: CitationKind;
  status: CitationCheckStatus;
  /** Display hint for later UI: unverified for url/quote miss; unconfirmed for claim miss */
  display: 'ok' | 'unverified' | 'unconfirmed';
  url?: string | null;
  /** Echo of checked quote text (optional, for the check log) */
  quote?: string | null;
  /** For kind claim: URL of the source that supposedly refutes the claim */
  refutingUrl?: string | null;
  /** Optional claim text identity for later logging */
  claimText?: string | null;
  id?: string;
};

/** One checked citation item persisted for a story (NEWS-172). */
export type CitationCheckLogEntry = {
  kind: CitationKind;
  status: CitationCheckStatus;
  display: 'ok' | 'unverified' | 'unconfirmed';
  /** Stable identity: normalized url, quote hash, or claim id */
  itemId: string;
  url?: string | null;
  quote?: string | null;
  refutingUrl?: string | null;
  /** Which generate pass produced this mark; absent on old rows. */
  scope?: CitationScope;
  checkedAt: string; // ISO
  runId: string;
};

/** Per-article citation check log (keyed by articleId in the store). */
export type CitationCheckLogRecord = {
  articleId: string;
  entries: CitationCheckLogEntry[];
  updatedAt: string;
  runId: string;
};

export type CitationCheckLogStore = {
  logs: Record<string, CitationCheckLogRecord>; // key = articleId
  updatedAt: string | null;
};
