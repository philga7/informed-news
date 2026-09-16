export type EnrichmentTimelineEvent = {
  date: string;
  content: string;
  date_iso?: string;
};

export type EnrichmentQnA = {
  question: string;
  answer: string;
};

/** Cluster-level Story enrich fields (AI-assisted — not ground truth). */
export type ClusterEnrichmentPayload = {
  talking_points: string[];
  timeline: EnrichmentTimelineEvent[];
  suggested_qna: EnrichmentQnA[];
  /** Optional improved dig summary; adapter may prefer over framing summary. */
  short_summary?: string;
};

export type ClusterEnrichmentRecord = {
  /** Same key as adapter groups: clusterId or `solo:{articleId}` */
  key: string;
  enrichment: ClusterEnrichmentPayload | null;
  enrichedAt: string | null;
  enrichError: string | null;
  model: string | null;
};

