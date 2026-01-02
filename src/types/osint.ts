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
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
  linkedByUserId: string | null;
  linkedAt: Date;
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

