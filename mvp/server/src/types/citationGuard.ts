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

/** Shared terminal check states. */
export type CitationCheckStatus = 'match' | 'mismatch' | 'missing-source';

export type CitationCheckItem = {
  kind: CitationKind;
  /** For kind url: the outbound href being checked */
  url?: string | null;
  /** Optional stable id for logging later */
  id?: string;
};

export type CitationCheckResult = {
  kind: CitationKind;
  status: CitationCheckStatus;
  /** Display hint for later UI: unverified for url miss; unused for match */
  display: 'ok' | 'unverified' | 'unconfirmed';
  url?: string | null;
  id?: string;
};
