import type { WatchItem, WatchItemCategory, WatchItemStatus, OsintTopic } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface WatchItemWithSignals extends WatchItem {
  signalCount: number;
}

interface WatchItemFilters {
  category?: WatchItemCategory;
  status?: WatchItemStatus;
}

export const watchItemsService = {
  /**
   * Get all watch items for an organization with optional filtering
   */
  async getAll(
    organizationId: string,
    filters?: WatchItemFilters
  ): Promise<WatchItemWithSignals[]> {
    const params = new URLSearchParams({ organization_id: organizationId });
    
    if (filters?.category) {
      params.append('category', filters.category);
    }
    if (filters?.status) {
      params.append('status', filters.status);
    }

    const response = await fetch(
      `${API_BASE}/api/watch-items?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch watch items: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert string dates to Date objects
    return data.watch_items.map((item: any) => ({
      id: item.id,
      organizationId: item.organization_id,
      title: item.title,
      category: item.category,
      notes: item.notes || null,
      indicatorTriggers: item.indicator_triggers || [],
      status: item.status,
      escalatedTopicId: item.escalated_topic_id || null,
      firstNotedAt: new Date(item.first_noted_at),
      lastReviewedAt: new Date(item.last_reviewed_at),
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      signalCount: item.signal_count || 0,
    }));
  },

  /**
   * Get a single watch item by ID
   */
  async getById(watchItemId: string): Promise<WatchItemWithSignals> {
    const response = await fetch(`${API_BASE}/api/watch-items/${watchItemId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Watch item not found');
      }
      throw new Error(`Failed to fetch watch item: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.watch_item;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      title: item.title,
      category: item.category,
      notes: item.notes || null,
      indicatorTriggers: item.indicator_triggers || [],
      status: item.status,
      escalatedTopicId: item.escalated_topic_id || null,
      firstNotedAt: new Date(item.first_noted_at),
      lastReviewedAt: new Date(item.last_reviewed_at),
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
      signalCount: item.signal_count || 0,
    };
  },

  /**
   * Create a new watch item
   */
  async create(watchItem: {
    organizationId: string;
    title: string;
    category: WatchItemCategory;
    notes?: string;
    indicatorTriggers?: string[];
  }): Promise<WatchItem> {
    const response = await fetch(`${API_BASE}/api/watch-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: watchItem.organizationId,
        title: watchItem.title,
        category: watchItem.category,
        notes: watchItem.notes,
        indicator_triggers: watchItem.indicatorTriggers || [],
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create watch item: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.watch_item;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      title: item.title,
      category: item.category,
      notes: item.notes || null,
      indicatorTriggers: item.indicator_triggers || [],
      status: item.status,
      escalatedTopicId: item.escalated_topic_id || null,
      firstNotedAt: new Date(item.first_noted_at),
      lastReviewedAt: new Date(item.last_reviewed_at),
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };
  },

  /**
   * Update a watch item
   */
  async update(
    watchItemId: string,
    updates: {
      title?: string;
      category?: WatchItemCategory;
      notes?: string;
      indicatorTriggers?: string[];
      status?: WatchItemStatus;
      lastReviewedAt?: Date;
    }
  ): Promise<WatchItem> {
    const response = await fetch(`${API_BASE}/api/watch-items/${watchItemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: updates.title,
        category: updates.category,
        notes: updates.notes,
        indicator_triggers: updates.indicatorTriggers,
        status: updates.status,
        last_reviewed_at: updates.lastReviewedAt?.toISOString(),
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update watch item: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.watch_item;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      title: item.title,
      category: item.category,
      notes: item.notes || null,
      indicatorTriggers: item.indicator_triggers || [],
      status: item.status,
      escalatedTopicId: item.escalated_topic_id || null,
      firstNotedAt: new Date(item.first_noted_at),
      lastReviewedAt: new Date(item.last_reviewed_at),
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };
  },

  /**
   * Archive a watch item (soft delete)
   */
  async archive(watchItemId: string): Promise<WatchItem> {
    return this.update(watchItemId, { status: 'archived' });
  },

  /**
   * Delete a watch item permanently
   */
  async delete(watchItemId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/watch-items/${watchItemId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete watch item: ${response.statusText}`);
    }
  },

  /**
   * Link a source record to a watch item
   */
  async linkRecord(
    watchItemId: string,
    sourceRecordId: string
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/watch-items/${watchItemId}/records`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_record_id: sourceRecordId,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to link source record: ${response.statusText}`);
    }
  },

  /**
   * Unlink a source record from a watch item
   */
  async unlinkRecord(
    watchItemId: string,
    sourceRecordId: string
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/watch-items/${watchItemId}/records/${sourceRecordId}`,
      {
        method: 'DELETE',
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to unlink source record: ${response.statusText}`);
    }
  },

  /**
   * Get signal count (number of linked source records) for a watch item
   */
  async getSignalCount(watchItemId: string): Promise<number> {
    const response = await fetch(
      `${API_BASE}/api/watch-items/${watchItemId}/signal-count`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get signal count: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.signal_count || 0;
  },

  /**
   * Escalate a watch item to a full topic
   * This creates a new topic and links all associated source records
   */
  async escalateToTopic(
    watchItemId: string,
    topicData: {
      name: string;
      description?: string;
      keywords?: string[];
      decisionQuestion?: string;
      decisionContext?: string;
      keyIndicators?: string[];
    }
  ): Promise<OsintTopic> {
    const response = await fetch(
      `${API_BASE}/api/watch-items/${watchItemId}/escalate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic_name: topicData.name,
          topic_description: topicData.description,
          topic_keywords: topicData.keywords || [],
          decision_question: topicData.decisionQuestion,
          decision_context: topicData.decisionContext,
          key_indicators: topicData.keyIndicators || [],
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to escalate watch item: ${response.statusText}`);
    }
    
    const data = await response.json();
    const topic = data.topic;
    
    return {
      id: topic.id,
      organizationId: topic.organization_id,
      name: topic.name,
      description: topic.description || null,
      keywords: topic.keywords || [],
      relatedTopics: topic.related_topics || [],
      status: topic.status,
      decisionQuestion: topic.decision_question || null,
      decisionContext: topic.decision_context || null,
      keyIndicators: topic.key_indicators || [],
      resolutionCriteria: topic.resolution_criteria || null,
      resolutionSummary: topic.resolution_summary || null,
      resolutionConfidence: topic.resolution_confidence || null,
      lessonsLearned: topic.lessons_learned || null,
      resolvedAt: topic.resolved_at ? new Date(topic.resolved_at) : null,
      createdAt: new Date(topic.created_at),
      updatedAt: new Date(topic.updated_at),
    };
  },

  /**
   * Mark watch item as reviewed (updates last_reviewed_at)
   */
  async markAsReviewed(watchItemId: string): Promise<WatchItem> {
    return this.update(watchItemId, { lastReviewedAt: new Date() });
  },

  /**
   * Get linked source records for a watch item
   */
  async getLinkedRecords(watchItemId: string): Promise<any[]> {
    const response = await fetch(
      `${API_BASE}/api/watch-items/${watchItemId}/records`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch linked records: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.records || [];
  },
};

