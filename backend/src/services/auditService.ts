/**
 * Audit Service
 * 
 * Centralized service for logging all analyst actions and system changes.
 * Provides comprehensive audit trail for intelligence tradecraft compliance.
 */

import { supabase } from '../utils/supabase.js';

// ============================================================================
// TYPES
// ============================================================================

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
  | 'source_created'
  | 'source_updated'
  | 'source_deleted'
  | 'source_rated'
  | 'source_record_created'
  | 'source_record_optimized'
  | 'retention_policy_updated'
  | 'record_archived'
  | 'record_deleted'
  | 'record_restored';

export type EntityType = 'topic' | 'source_record' | 'link' | 'artifact' | 'source';

export interface AuditLogParams {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  userId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

// ============================================================================
// AUDIT DATA TYPES
// ============================================================================

interface TopicData {
  name: string;
  description?: string | null;
  keywords?: string[] | null;
  status?: string | null;
}

interface LinkMetadata {
  confidence_level?: string | null;
  relevance_score?: number | null;
  assumptions?: string | null;
  analyst_notes?: string | null;
  review_status?: string | null;
}

interface LinkData {
  topic_id: string;
  source_record_id: string;
  confidence_level?: string | null;
  relevance_score?: number | null;
  assumptions?: string | null;
  analyst_notes?: string | null;
  review_status?: string | null;
}

interface ArtifactData {
  type: string;
  model_name: string;
  source_record_id?: string | null;
  topic_id?: string | null;
  created_by?: string;
}

interface SourceData {
  name: string;
  source_type: string;
  reliability_rating?: string | null;
  value_rating?: number | null;
  domain?: string | null;
  record_count?: number;
  retention_max_items?: number | null;
  retention_days?: number | null;
  retention_action?: 'delete' | 'archive';
}

interface SourceRecordData {
  title: string;
  source_id: string;
  media_type?: string;
  content_type?: string;
  content_length?: number | null;
  content_compressed?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates if a string is a valid UUID format
 */
function isValidUUID(str: string | null | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Normalizes userId to either a valid UUID or null
 * System identifiers like 'system:ollama' will be converted to null
 */
function normalizeUserId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return isValidUUID(userId) ? userId : null;
}

// ============================================================================
// AUDIT SERVICE
// ============================================================================

export const auditService = {
  /**
   * Log an action to the audit trail
   */
  async logAction(params: AuditLogParams): Promise<void> {
    try {
      // Normalize userId - only valid UUIDs are allowed, system identifiers become null
      const normalizedUserId = normalizeUserId(params.userId);

      // @ts-expect-error - Supabase types don't include audit_logs table
      const { error } = await supabase.from('audit_logs').insert({
        user_id: normalizedUserId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        before_state: params.beforeState || null,
        after_state: params.afterState || null,
        metadata: params.metadata || null,
      });

      if (error) {
        console.error('[AuditService] Failed to log action:', error);
        // Don't throw - audit failures shouldn't break main operations
        // but log to console for monitoring
      }
    } catch (err) {
      console.error('[AuditService] Exception logging action:', err);
    }
  },

  /**
   * Convenience method: Log topic creation
   */
  async logTopicCreated(topicId: string, topic: TopicData, userId?: string): Promise<void> {
    await this.logAction({
      action: 'topic_created',
      entityType: 'topic',
      entityId: topicId,
      userId,
      afterState: {
        name: topic.name,
        description: topic.description,
        keywords: topic.keywords,
      },
    });
  },

  /**
   * Convenience method: Log topic update
   */
  async logTopicUpdated(
    topicId: string,
    before: TopicData,
    after: TopicData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'topic_updated',
      entityType: 'topic',
      entityId: topicId,
      userId,
      beforeState: {
        name: before.name,
        description: before.description,
        keywords: before.keywords,
        status: before.status,
      },
      afterState: {
        name: after.name,
        description: after.description,
        keywords: after.keywords,
        status: after.status,
      },
    });
  },

  /**
   * Convenience method: Log topic deletion
   */
  async logTopicDeleted(topicId: string, topic: TopicData, userId?: string): Promise<void> {
    await this.logAction({
      action: 'topic_deleted',
      entityType: 'topic',
      entityId: topicId,
      userId,
      beforeState: {
        name: topic.name,
        description: topic.description,
      },
    });
  },

  /**
   * Convenience method: Log link addition
   */
  async logLinkAdded(
    linkId: string,
    topicId: string,
    sourceRecordId: string,
    metadata: LinkMetadata,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'link_added',
      entityType: 'link',
      entityId: linkId,
      userId,
      afterState: {
        topic_id: topicId,
        source_record_id: sourceRecordId,
        confidence_level: metadata.confidence_level,
        relevance_score: metadata.relevance_score,
        assumptions: metadata.assumptions,
      },
    });
  },

  /**
   * Convenience method: Log link update
   */
  async logLinkUpdated(
    linkId: string,
    before: LinkData,
    after: LinkData,
    userId?: string
  ): Promise<void> {
    // Check if confidence changed specifically
    const action =
      before.confidence_level !== after.confidence_level
        ? 'confidence_changed'
        : 'link_updated';

    await this.logAction({
      action,
      entityType: 'link',
      entityId: linkId,
      userId,
      beforeState: {
        confidence_level: before.confidence_level,
        relevance_score: before.relevance_score,
        assumptions: before.assumptions,
        analyst_notes: before.analyst_notes,
        review_status: before.review_status,
      },
      afterState: {
        confidence_level: after.confidence_level,
        relevance_score: after.relevance_score,
        assumptions: after.assumptions,
        analyst_notes: after.analyst_notes,
        review_status: after.review_status,
      },
    });
  },

  /**
   * Convenience method: Log link removal
   */
  async logLinkRemoved(
    linkId: string,
    link: LinkData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'link_removed',
      entityType: 'link',
      entityId: linkId,
      userId,
      beforeState: {
        topic_id: link.topic_id,
        source_record_id: link.source_record_id,
        confidence_level: link.confidence_level,
      },
    });
  },

  /**
   * Convenience method: Log artifact creation
   */
  async logArtifactCreated(
    artifactId: string,
    artifact: ArtifactData,
    userId?: string
  ): Promise<void> {
    // Only use artifact.created_by if it's a valid UUID, otherwise use provided userId or null
    const effectiveUserId = userId || (artifact.created_by && isValidUUID(artifact.created_by) ? artifact.created_by : null);
    
    await this.logAction({
      action: 'artifact_created',
      entityType: 'artifact',
      entityId: artifactId,
      userId: effectiveUserId,
      afterState: {
        type: artifact.type,
        model_name: artifact.model_name,
        source_record_id: artifact.source_record_id,
        topic_id: artifact.topic_id,
      },
    });
  },

  /**
   * Convenience method: Log artifact review
   */
  async logArtifactReviewed(
    artifactId: string,
    artifact: ArtifactData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'artifact_reviewed',
      entityType: 'artifact',
      entityId: artifactId,
      userId,
      beforeState: { reviewed: false },
      afterState: { reviewed: true },
      metadata: {
        artifact_type: artifact.type,
        model_name: artifact.model_name,
      },
    });
  },

  /**
   * Convenience method: Log source creation
   */
  async logSourceCreated(
    sourceId: string,
    source: SourceData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'source_created',
      entityType: 'source',
      entityId: sourceId,
      userId,
      afterState: {
        name: source.name,
        source_type: source.source_type,
        reliability_rating: source.reliability_rating,
        domain: source.domain,
      },
    });
  },

  /**
   * Convenience method: Log source update
   */
  async logSourceUpdated(
    sourceId: string,
    before: SourceData,
    after: SourceData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'source_updated',
      entityType: 'source',
      entityId: sourceId,
      userId,
      beforeState: {
        name: before.name,
        reliability_rating: before.reliability_rating,
        value_rating: before.value_rating,
      },
      afterState: {
        name: after.name,
        reliability_rating: after.reliability_rating,
        value_rating: after.value_rating,
      },
    });
  },

  /**
   * Convenience method: Log source deletion
   */
  async logSourceDeleted(
    sourceId: string,
    source: SourceData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'source_deleted',
      entityType: 'source',
      entityId: sourceId,
      userId,
      beforeState: {
        name: source.name,
        source_type: source.source_type,
        reliability_rating: source.reliability_rating,
        record_count: source.record_count || 0,
      },
    });
  },

  /**
   * Convenience method: Log source rating
   */
  async logSourceRated(
    sourceId: string,
    oldRating: number | null,
    newRating: number,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'source_rated',
      entityType: 'source',
      entityId: sourceId,
      userId,
      beforeState: { value_rating: oldRating },
      afterState: { value_rating: newRating },
    });
  },

  /**
   * Convenience method: Log source record creation (during ingestion)
   */
  async logSourceRecordCreated(
    recordId: string,
    record: SourceRecordData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'source_record_created',
      entityType: 'source_record',
      entityId: recordId,
      userId,
      afterState: {
        title: record.title,
        source_id: record.source_id,
        media_type: record.media_type || 'article',
        content_type: record.content_type || 'full_text',
        content_length: record.content_length,
        content_compressed: record.content_compressed || false,
      },
      metadata: {
        ingestion_method: 'system',
      },
    });
  },

  /**
   * Convenience method: Log source record optimization
   */
  async logSourceRecordOptimized(
    recordId: string,
    before: SourceRecordData,
    after: SourceRecordData,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'source_record_optimized',
      entityType: 'source_record',
      entityId: recordId,
      userId,
      beforeState: {
        content_type: before.content_type,
        content_length: before.content_length,
        content_compressed: before.content_compressed,
      },
      afterState: {
        content_type: after.content_type,
        content_length: after.content_length,
        content_compressed: after.content_compressed,
      },
    });
  },

  /**
   * Convenience method: Log retention policy update
   */
  async logRetentionPolicyUpdated(
    sourceId: string,
    before: Partial<SourceData>,
    after: Partial<SourceData>,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'retention_policy_updated',
      entityType: 'source',
      entityId: sourceId,
      userId,
      beforeState: {
        retention_max_items: before.retention_max_items,
        retention_days: before.retention_days,
        retention_action: before.retention_action,
      },
      afterState: {
        retention_max_items: after.retention_max_items,
        retention_days: after.retention_days,
        retention_action: after.retention_action,
      },
    });
  },

  /**
   * Convenience method: Log record archival
   */
  async logRecordArchived(
    recordId: string,
    reason: string,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'record_archived',
      entityType: 'source_record',
      entityId: recordId,
      userId,
      metadata: {
        archive_reason: reason,
      },
    });
  },

  /**
   * Convenience method: Log record deletion
   */
  async logRecordDeleted(
    recordId: string,
    reason: string,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'record_deleted',
      entityType: 'source_record',
      entityId: recordId,
      userId,
      metadata: {
        deletion_reason: reason,
      },
    });
  },

  /**
   * Convenience method: Log record restoration
   */
  async logRecordRestored(
    recordId: string,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'record_restored',
      entityType: 'source_record',
      entityId: recordId,
      userId,
      metadata: {
        restored_from: 'archived_source_records',
      },
    });
  },
};

