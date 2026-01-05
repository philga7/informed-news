/**
 * OSINT (Open-Source Intelligence) Type Definitions
 * 
 * These types correspond to the OSINT database schema created in Plan 1.
 * The schema uses organization-based multi-tenancy for team collaboration.
 */

// ============================================================================
// ENUM TYPES
// ============================================================================

export type OsintSourceType = 'rss' | 'api' | 'email' | 'manual';
export type ReliabilityRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ArtifactType =
  | 'summary'
  | 'entity_extraction'
  | 'tone_analysis'
  | 'sentiment'
  | 'key_facts'
  | 'timeline'
  | 'network_graph';
export type OrgMemberRole = 'owner' | 'admin' | 'analyst' | 'member';

// Watch Items (Tier 1 Situational Awareness)
export type WatchItemStatus = 'watching' | 'escalated' | 'archived';
export type WatchItemCategory = 'politics' | 'finance' | 'technology' | 
  'local' | 'international' | 'health' | 'security' | 'other';

// Environmental Scan View (Phase 6)
export type ScanStatus = 'pending' | 'reviewed' | 'linked' | 'dismissed';

// Indicators & Warnings (Phase 7)
export type IndicatorCheckFrequency = 'daily' | 'weekly' | 'monthly';

// Workflow & QA types
export type TopicStatus = 'active' | 'monitoring' | 'suspended' | 'resolved' | 'archived';
export type LinkReviewStatus = 'pending' | 'reviewed' | 'disputed';
export type ResolutionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type AuditAction =
  | 'topic_created'
  | 'topic_updated'
  | 'topic_deleted'
  | 'link_added'
  | 'link_updated'
  | 'link_removed'
  | 'confidence_changed'
  | 'artifact_created'
  | 'artifact_reviewed'
  | 'artifact_deleted'
  | 'source_updated'
  | 'source_rated';
export type EntityType = 'topic' | 'source_record' | 'link' | 'artifact' | 'source';

// ============================================================================
// ORGANIZATION TYPES
// ============================================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgMemberRole;
  joinedAt: Date;
}

// ============================================================================
// SOURCE TYPES
// ============================================================================

export interface Source {
  id: string;
  organizationId: string;
  sourceType: OsintSourceType;
  name: string;
  url: string | null;
  reliabilityRating: ReliabilityRating;
  valueRating: number | null; // 1-5 star rating for analyst usefulness
  notes: string | null;
  domain: WatchItemCategory | null; // Phase 6: Domain categorization for scan view
  scrapeExternalUrl: boolean; // Enable scraping of original URLs from aggregator sites
  createdAt: Date;
  updatedAt: Date;
  // Phase 1: Retention policy configuration
  retentionMaxItems: number | null;
  retentionDays: number | null;
  retentionAction: 'delete' | 'archive';
}

export type MediaType = 'article' | 'video' | 'podcast' | 'audio' | 'other';
export type ContentType = 'full_text' | 'summary' | 'structured' | 'minimal';

export interface SourceRecord {
  id: string;
  sourceId: string;
  title: string;
  url: string | null;
  content: string | null;
  publishedAt: Date | null;
  ingestedAt: Date;
  language: string | null;
  geographicIndicators: Record<string, unknown> | null;
  rawMetadata: Record<string, unknown> | null;
  initialConfidenceFlags: Record<string, unknown> | null;
  // Phase 6: Environmental Scan View fields
  scanStatus: ScanStatus;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  // Phase 1: Content optimization and media types
  mediaType: MediaType;
  contentType: ContentType;
  contentCompressed: boolean;
  contentLength: number | null;
  storageOptimizedAt: Date | null;
}

// Phase 6: Extended view with source domain information
export interface SourceRecordWithDomain extends SourceRecord {
  sourceDomain: WatchItemCategory | null;
  sourceName: string;
}

// ============================================================================
// WATCH ITEM TYPES (Phase 5: Two-Tier Intelligence Model)
// ============================================================================

export interface WatchItem {
  id: string;
  organizationId: string;
  title: string;
  category: WatchItemCategory;
  notes: string | null;
  indicatorTriggers: string[];
  status: WatchItemStatus;
  escalatedTopicId: string | null;
  firstNotedAt: Date;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  // Computed fields (not in database)
  signalCount?: number;
}

export interface WatchItemRecord {
  id: string;
  watchItemId: string;
  sourceRecordId: string;
  linkedAt: Date;
}

// ============================================================================
// INDICATOR TYPES (Phase 7: Two-Tier Intelligence Model)
// ============================================================================

export interface Indicator {
  id: string;
  organizationId: string;
  domain: WatchItemCategory;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  checkFrequency: IndicatorCheckFrequency;
  isTriggered: boolean;
  triggeredAt: Date | null;
  actionOnTrigger: string | null;
  lastCheckedAt: Date | null;
  triggeredTopicId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// TOPIC TYPES
// ============================================================================

export interface OsintTopic {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  keywords: string[];
  relatedTopics: string[]; // Array of topic IDs
  status: TopicStatus; // Workflow status
  
  // Phase 1: Question-driven intelligence fields
  decisionQuestion: string | null; // The specific question this topic answers
  decisionContext: string | null; // Why this intelligence matters (decision dependency)
  keyIndicators: string[]; // Observable indicators that would confirm/refute
  resolutionCriteria: string | null; // When is the question answered?
  
  // Phase 2: Resolution metadata
  resolutionSummary: string | null; // Summary of what was decided/concluded
  resolutionConfidence: ResolutionConfidence | null; // Confidence in resolution
  lessonsLearned: string | null; // Optional lessons from investigation
  resolvedAt: Date | null; // When topic was marked resolved
  
  createdAt: Date;
  updatedAt: Date;
}

export interface TopicSourceLink {
  id: string;
  topicId: string;
  sourceRecordId: string;
  relevanceScore: number | null; // 0.000 to 1.000
  confidenceLevel: ConfidenceLevel | null;
  assumptions: string | null;
  analystNotes: string | null;
  reviewStatus: LinkReviewStatus; // QA review status
  linkedByUserId: string | null;
  linkedAt: Date;
}

// ============================================================================
// COLLECTION PLAN TYPES (Phase 1)
// ============================================================================

export interface CollectionPlan {
  id: string;
  topicId: string;
  sourceTypesNeeded: string[]; // e.g., ['government', 'academic', 'primary']
  claimsToVerify: string[]; // Specific claims needing corroboration
  coverageGaps: string[]; // Identified gaps in coverage
  sourcesToAvoid: string[]; // Bias/noise sources to skip
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CLAIMS TYPES (Phase 3)
// ============================================================================

export type ClaimType = 'factual' | 'assessment' | 'prediction';
export type CorroborationStatus = 
  | 'no_evidence'      // No evidence yet
  | 'single_source'    // Only one source supports
  | 'corroborated'     // Multiple sources support
  | 'disputed'         // Contradicting evidence exists
  | 'needs_review';    // Neutral or unclear

export interface Claim {
  id: string;
  topicId: string;
  claimText: string;
  claimType: ClaimType | null;
  isFalsifiable: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimEvidence {
  id: string;
  claimId: string;
  linkId: string;
  supports: boolean | null; // true = corroborates, false = contradicts, null = neutral
  evidenceExcerpt: string | null;
  analystNotes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimWithEvidence extends Claim {
  evidence: Array<ClaimEvidence & {
    link: TopicSourceLink & {
      source_records: {
        id: string;
        title: string;
        sources: {
          id: string;
          name: string;
        };
      };
    };
  }>;
  corroborationStatus: CorroborationStatus;
  evidenceCounts: {
    total: number;
    supporting: number;
    contradicting: number;
    neutral: number;
  };
}

export interface CorroborationMatrixCell {
  claimId: string;
  linkId: string | null;
  sourceRecordId: string | null;
  sourceName: string | null;
  supports: boolean | null;
  evidenceExcerpt: string | null;
}

export interface CorroborationMatrix {
  topicId: string;
  claims: Array<{
    id: string;
    claimText: string;
    claimType: ClaimType | null;
  }>;
  sources: Array<{
    linkId: string;
    sourceRecordId: string;
    sourceName: string;
  }>;
  matrix: CorroborationMatrixCell[];
}

// ============================================================================
// ANALYTIC ARTIFACT TYPES
// ============================================================================

export interface AnalyticArtifact {
  id: string;
  sourceRecordId: string | null;
  topicId: string | null;
  organizationId: string;
  type: ArtifactType;
  payload: Record<string, unknown>; // JSONB payload
  modelName: string;
  reviewed: boolean;
  createdBy: string; // e.g., 'system:ollama', 'user:john@example.com'
  createdAt: Date;
}

// ============================================================================
// INSERT TYPES (for creating new records)
// ============================================================================

export type OrganizationInsert = Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>;
export type OrgMemberInsert = Omit<OrgMember, 'id' | 'joinedAt'>;
export type SourceInsert = Omit<Source, 'id' | 'createdAt' | 'updatedAt'>;
export type SourceRecordInsert = Omit<SourceRecord, 'id' | 'ingestedAt'>;
export type OsintTopicInsert = Omit<OsintTopic, 'id' | 'createdAt' | 'updatedAt'>;
export type TopicSourceLinkInsert = Omit<TopicSourceLink, 'id' | 'linkedAt'>;
export type AnalyticArtifactInsert = Omit<AnalyticArtifact, 'id' | 'createdAt'>;
export type CollectionPlanInsert = Omit<CollectionPlan, 'id' | 'createdAt' | 'updatedAt'>;
export type ClaimInsert = Omit<Claim, 'id' | 'createdAt' | 'updatedAt'>;
export type ClaimEvidenceInsert = Omit<ClaimEvidence, 'id' | 'createdAt' | 'updatedAt'>;
export type WatchItemInsert = Omit<WatchItem, 'id' | 'createdAt' | 'updatedAt' | 'signalCount'>;
export type WatchItemRecordInsert = Omit<WatchItemRecord, 'id' | 'linkedAt'>;
export type IndicatorInsert = Omit<Indicator, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================================================
// UPDATE TYPES (for partial updates)
// ============================================================================

export type OrganizationUpdate = Partial<Omit<Organization, 'id' | 'createdAt'>>;
export type OrgMemberUpdate = Partial<Omit<OrgMember, 'id' | 'organizationId' | 'userId' | 'joinedAt'>>;
export type SourceUpdate = Partial<Omit<Source, 'id' | 'organizationId' | 'createdAt'>>;
export type SourceRecordUpdate = Partial<Omit<SourceRecord, 'id' | 'sourceId' | 'ingestedAt'>>;
export type OsintTopicUpdate = Partial<Omit<OsintTopic, 'id' | 'organizationId' | 'createdAt'>>;
export type TopicSourceLinkUpdate = Partial<Omit<TopicSourceLink, 'id' | 'topicId' | 'sourceRecordId' | 'linkedAt'>>;
export type AnalyticArtifactUpdate = Partial<Omit<AnalyticArtifact, 'id' | 'organizationId' | 'createdAt'>>;
export type CollectionPlanUpdate = Partial<Omit<CollectionPlan, 'id' | 'topicId' | 'createdAt'>>;
export type ClaimUpdate = Partial<Omit<Claim, 'id' | 'topicId' | 'createdAt'>>;
export type ClaimEvidenceUpdate = Partial<Omit<ClaimEvidence, 'id' | 'claimId' | 'linkId' | 'createdAt'>>;
export type WatchItemUpdate = Partial<Omit<WatchItem, 'id' | 'organizationId' | 'createdAt' | 'signalCount'>>;
export type IndicatorUpdate = Partial<Omit<Indicator, 'id' | 'organizationId' | 'createdAt'>>;

// ============================================================================
// TIMELINE TYPES
// ============================================================================

export interface TimelineBucket {
  date: string;
  count: number;
}

export interface TopicTimeline {
  topicId: string;
  timeline: TimelineBucket[];
  firstMention: Date | null;
  totalRecords: number;
  velocity: {
    last7Days: number;
    previous7Days: number;
  };
}

// ============================================================================
// CORRELATION & COORDINATION TYPES
// ============================================================================

export interface RelatedTopic {
  topic_id: string;
  name: string;
  shared_records: number;
  similarity_score: number;
}

export interface DuplicateRecord {
  id: string;
  title: string;
  source_name: string;
  source_id: string;
  published_at: string;
}

export interface DuplicateGroup {
  representative_id: string;
  group_hash: string;
  records: DuplicateRecord[];
  similarity: number;
  tight_window: boolean;
}

export interface NarrativeBucket {
  date: string;
  record_count: number;
  key_phrases: string[];
}

// ============================================================================
// AUDIT & QA TYPES
// ============================================================================

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
}

export interface QACompleteness {
  topicId: string;
  checks: {
    hasDescription: boolean;
    hasKeywords: boolean;
    allLinksHaveConfidence: boolean;
    allLinksReviewed: boolean;
    allArtifactsReviewed: boolean;
  };
  missingConfidenceLinks: string[];
  pendingReviewLinks: string[];
  unreviewedArtifacts: string[];
  completenessScore: number; // 0.0 to 1.0
  summary: {
    totalLinks: number;
    totalArtifacts: number;
    linksWithoutConfidence: number;
    linksPendingReview: number;
    artifactsUnreviewed: number;
  };
}

export interface SourceValueReport {
  organizationId: string;
  sources: Array<{
    id: string;
    name: string;
    sourceType: OsintSourceType;
    reliabilityRating: ReliabilityRating;
    valueRating: number;
    recordCount: number;
  }>;
  statistics: {
    totalRatedSources: number;
    averageRating: number;
    highestRated: {
      id: string;
      name: string;
      valueRating: number;
    } | null;
  };
}

