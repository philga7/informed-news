import type {
  EnrichmentQnA,
  EnrichmentTimelineEvent,
} from './clusterEnrichment.js';
import type { TopicSection } from './topic.js';

export type FullStoryStatus = 'ok' | 'unavailable' | 'error';
export type FullStoryTrigger = 'on_demand' | 'refresh';

/** Ollama enrich payload for Brief full stories (extends Accept-path core sections). */
export type BriefFullStoryEnrichment = {
  talking_points: string[];
  timeline: EnrichmentTimelineEvent[];
  suggested_qna: EnrichmentQnA[];
  business_angle_text?: string;
  business_angle_points?: string[];
  technical_details?: string[];
  user_action_items?: string[];
  historical_background?: string;
};

export type BriefFullStoryPerspective = {
  text: string;
  sources: Array<{ name: string; url: string }>;
};

export type BriefFullStoryQuote = {
  quote: string;
  quote_author: string | null;
  quote_attribution: string | null;
  quote_source_url: string | null;
  quote_source_domain: string | null;
};

/** Non-AI snapshot persisted with each full-story record. */
export type BriefFullStoryDeterministic = {
  perspectives?: BriefFullStoryPerspective[];
  quote?: BriefFullStoryQuote | null;
};

/** Triage values captured when the full story was last successfully generated. */
export type BriefFullStoryAutoSnapshot = {
  outletCount: number;
  significance: number | null;
};

export type BriefFullStoryRecord = {
  /** Kept article id (store key) */
  articleId: string;
  status: FullStoryStatus;
  enrichment: BriefFullStoryEnrichment | null;
  deterministic: BriefFullStoryDeterministic;
  /** sha256 of member source texts + sorted requested section keys, first 16 hex */
  sourceHash: string | null;
  topicSections: TopicSection[];
  model: string | null;
  error: string | null;
  /** ISO */
  generatedAt: string;
  trigger: FullStoryTrigger;
  /** ISO — set when a living update regenerates an existing ok record */
  updatedAt?: string;
  changeSummary?: string | null;
  /** Prior timeline events retained across living merges (optional archive) */
  priorTimeline?: EnrichmentTimelineEvent[];
  /** Used only by refresh-time automatic selection. */
  autoSnapshot?: BriefFullStoryAutoSnapshot;
};

export type BriefFullStoriesStore = {
  fullStories: Record<string, BriefFullStoryRecord>;
  updatedAt: string | null;
};
