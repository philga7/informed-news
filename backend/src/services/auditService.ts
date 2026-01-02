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
  | 'source_updated'
  | 'source_rated';

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
// AUDIT SERVICE
// ============================================================================

export const auditService = {
  /**
   * Log an action to the audit trail
   */
  async logAction(params: AuditLogParams): Promise<void> {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        user_id: params.userId || null,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        before_state: params.beforeState || null,
        after_state: params.afterState || null,
        metadata: params.metadata || null,
      } as any);

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
  async logTopicCreated(topicId: string, topic: any, userId?: string): Promise<void> {
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
    before: any,
    after: any,
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
  async logTopicDeleted(topicId: string, topic: any, userId?: string): Promise<void> {
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
    metadata: any,
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
    before: any,
    after: any,
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
    link: any,
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
    artifact: any,
    userId?: string
  ): Promise<void> {
    await this.logAction({
      action: 'artifact_created',
      entityType: 'artifact',
      entityId: artifactId,
      userId: userId || artifact.created_by,
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
    artifact: any,
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
   * Convenience method: Log source update
   */
  async logSourceUpdated(
    sourceId: string,
    before: any,
    after: any,
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
};

