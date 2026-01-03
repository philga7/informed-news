import type { OsintTopic, TopicSourceLink, TopicTimeline, RelatedTopic, NarrativeBucket, TopicStatus, QACompleteness, CollectionPlan } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface TopicWithCount extends OsintTopic {
  linked_records_count: number;
}

interface TopicDetail extends OsintTopic {
  topic_source_links: Array<TopicSourceLink & {
    source_records: any;
  }>;
  collection_plan?: CollectionPlan | null;
}

export const osintTopicsService = {
  /**
   * Get all topics for an organization
   */
  async getAll(organizationId: string): Promise<TopicWithCount[]> {
    const response = await fetch(
      `${API_BASE}/api/topics?organization_id=${organizationId}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch topics: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert string dates to Date objects
    return data.topics.map((topic: any) => ({
      ...topic,
      keywords: topic.keywords || [],
      relatedTopics: topic.related_topics || [],
      keyIndicators: topic.key_indicators || [],
      createdAt: new Date(topic.created_at),
      updatedAt: new Date(topic.updated_at),
    }));
  },

  /**
   * Get topic detail with linked source records
   */
  async getById(topicId: string): Promise<TopicDetail> {
    const response = await fetch(`${API_BASE}/api/topics/${topicId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Topic not found');
      }
      throw new Error(`Failed to fetch topic: ${response.statusText}`);
    }
    
    const data = await response.json();
    const topic = data.topic;
    
    // Convert dates
    return {
      ...topic,
      keywords: topic.keywords || [],
      relatedTopics: topic.related_topics || [],
      keyIndicators: topic.key_indicators || [],
      decisionQuestion: topic.decision_question || null,
      decisionContext: topic.decision_context || null,
      resolutionCriteria: topic.resolution_criteria || null,
      createdAt: new Date(topic.created_at),
      updatedAt: new Date(topic.updated_at),
      topic_source_links: (topic.topic_source_links || []).map((link: any) => ({
        ...link,
        linkedAt: new Date(link.linked_at),
        source_records: link.source_records ? {
          ...link.source_records,
          publishedAt: link.source_records.published_at 
            ? new Date(link.source_records.published_at) 
            : null,
          ingestedAt: new Date(link.source_records.ingested_at),
        } : null,
      })),
      collection_plan: topic.collection_plan ? {
        id: topic.collection_plan.id,
        topicId: topic.collection_plan.topic_id,
        sourceTypesNeeded: topic.collection_plan.source_types_needed || [],
        claimsToVerify: topic.collection_plan.claims_to_verify || [],
        coverageGaps: topic.collection_plan.coverage_gaps || [],
        sourcesToAvoid: topic.collection_plan.sources_to_avoid || [],
        notes: topic.collection_plan.notes || null,
        createdAt: new Date(topic.collection_plan.created_at),
        updatedAt: new Date(topic.collection_plan.updated_at),
      } : null,
    };
  },

  /**
   * Create a new topic
   */
  async create(
    organizationId: string,
    topic: {
      name: string;
      description?: string;
      keywords?: string[];
      relatedTopics?: string[];
      decisionQuestion?: string;
      decisionContext?: string;
      keyIndicators?: string[];
      resolutionCriteria?: string;
    }
  ): Promise<OsintTopic> {
    const response = await fetch(`${API_BASE}/api/topics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: organizationId,
        name: topic.name,
        description: topic.description,
        keywords: topic.keywords || [],
        related_topics: topic.relatedTopics || [],
        decision_question: topic.decisionQuestion,
        decision_context: topic.decisionContext,
        key_indicators: topic.keyIndicators || [],
        resolution_criteria: topic.resolutionCriteria,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create topic: ${response.statusText}`);
    }
    
    const data = await response.json();
    const newTopic = data.topic;
    
    return {
      ...newTopic,
      keywords: newTopic.keywords || [],
      relatedTopics: newTopic.related_topics || [],
      keyIndicators: newTopic.key_indicators || [],
      decisionQuestion: newTopic.decision_question || null,
      decisionContext: newTopic.decision_context || null,
      resolutionCriteria: newTopic.resolution_criteria || null,
      createdAt: new Date(newTopic.created_at),
      updatedAt: new Date(newTopic.updated_at),
    };
  },

  /**
   * Update a topic
   */
  async update(
    topicId: string,
    updates: {
      name?: string;
      description?: string;
      keywords?: string[];
      relatedTopics?: string[];
      decisionQuestion?: string;
      decisionContext?: string;
      keyIndicators?: string[];
      resolutionCriteria?: string;
      status?: TopicStatus;
    }
  ): Promise<OsintTopic> {
    const response = await fetch(`${API_BASE}/api/topics/${topicId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: updates.name,
        description: updates.description,
        keywords: updates.keywords,
        related_topics: updates.relatedTopics,
        decision_question: updates.decisionQuestion,
        decision_context: updates.decisionContext,
        key_indicators: updates.keyIndicators,
        resolution_criteria: updates.resolutionCriteria,
        status: updates.status,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update topic: ${response.statusText}`);
    }
    
    const data = await response.json();
    const topic = data.topic;
    
    return {
      ...topic,
      keywords: topic.keywords || [],
      relatedTopics: topic.related_topics || [],
      keyIndicators: topic.key_indicators || [],
      decisionQuestion: topic.decision_question || null,
      decisionContext: topic.decision_context || null,
      resolutionCriteria: topic.resolution_criteria || null,
      createdAt: new Date(topic.created_at),
      updatedAt: new Date(topic.updated_at),
    };
  },

  /**
   * Delete a topic
   */
  async delete(topicId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/topics/${topicId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete topic: ${response.statusText}`);
    }
  },

  /**
   * Link a source record to a topic
   */
  async linkRecord(
    topicId: string,
    sourceRecordId: string,
    metadata?: {
      relevanceScore?: number;
      confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
      assumptions?: string;
      analystNotes?: string;
      linkedByUserId?: string;
    }
  ): Promise<TopicSourceLink> {
    const response = await fetch(`${API_BASE}/api/topics/${topicId}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_record_id: sourceRecordId,
        relevance_score: metadata?.relevanceScore,
        confidence_level: metadata?.confidenceLevel,
        assumptions: metadata?.assumptions,
        analyst_notes: metadata?.analystNotes,
        linked_by_user_id: metadata?.linkedByUserId,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to link source record: ${response.statusText}`);
    }
    
    const data = await response.json();
    const link = data.link;
    
    return {
      ...link,
      linkedAt: new Date(link.linked_at),
    };
  },

  /**
   * Update a topic-source link metadata
   */
  async updateLink(
    topicId: string,
    linkId: string,
    updates: {
      relevanceScore?: number;
      confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
      assumptions?: string;
      analystNotes?: string;
    }
  ): Promise<TopicSourceLink> {
    const response = await fetch(
      `${API_BASE}/api/topics/${topicId}/links/${linkId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          relevance_score: updates.relevanceScore,
          confidence_level: updates.confidenceLevel,
          assumptions: updates.assumptions,
          analyst_notes: updates.analystNotes,
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update link: ${response.statusText}`);
    }
    
    const data = await response.json();
    const link = data.link;
    
    return {
      ...link,
      linkedAt: new Date(link.linked_at),
    };
  },

  /**
   * Unlink a source record from a topic
   */
  async unlinkRecord(topicId: string, linkId: string): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/topics/${topicId}/links/${linkId}`,
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
   * Get timeline data for a topic
   */
  async getTimeline(
    topicId: string,
    options?: {
      bucket?: 'day' | 'week' | 'month';
      startDate?: string;
      endDate?: string;
    }
  ): Promise<TopicTimeline> {
    const params = new URLSearchParams();
    if (options?.bucket) params.append('bucket', options.bucket);
    if (options?.startDate) params.append('start_date', options.startDate);
    if (options?.endDate) params.append('end_date', options.endDate);

    const queryString = params.toString();
    const url = `${API_BASE}/api/topics/${topicId}/timeline${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Topic not found');
      }
      throw new Error(`Failed to fetch topic timeline: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      topicId: data.topic_id,
      timeline: data.timeline || [],
      firstMention: data.first_mention ? new Date(data.first_mention) : null,
      totalRecords: data.total_records || 0,
      velocity: {
        last7Days: data.velocity?.last_7_days || 0,
        previous7Days: data.velocity?.previous_7_days || 0,
      },
    };
  },

  /**
   * Get related topics based on shared source records
   */
  async getRelatedTopics(topicId: string): Promise<RelatedTopic[]> {
    const response = await fetch(`${API_BASE}/api/topics/${topicId}/related`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Topic not found');
      }
      throw new Error(`Failed to fetch related topics: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.related_topics || [];
  },

  /**
   * Get narrative evolution timeline with key phrases
   */
  async getNarrativeTimeline(
    topicId: string,
    options?: {
      bucket?: 'day' | 'week' | 'month';
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{ topicId: string; buckets: NarrativeBucket[] }> {
    const params = new URLSearchParams();
    if (options?.bucket) params.append('bucket', options.bucket);
    if (options?.startDate) params.append('start_date', options.startDate);
    if (options?.endDate) params.append('end_date', options.endDate);

    const queryString = params.toString();
    const url = `${API_BASE}/api/topics/${topicId}/narrative-timeline${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Topic not found');
      }
      throw new Error(`Failed to fetch narrative timeline: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      topicId: data.topic_id,
      buckets: data.buckets || [],
    };
  },

  /**
   * Update topic workflow status
   */
  async updateStatus(topicId: string, status: TopicStatus): Promise<OsintTopic> {
    return this.update(topicId, { status });
  },

  /**
   * Create or update collection plan for a topic
   */
  async saveCollectionPlan(
    topicId: string,
    plan: {
      sourceTypesNeeded?: string[];
      claimsToVerify?: string[];
      coverageGaps?: string[];
      sourcesToAvoid?: string[];
      notes?: string | null;
    }
  ): Promise<CollectionPlan> {
    const response = await fetch(`${API_BASE}/api/topics/${topicId}/collection-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_types_needed: plan.sourceTypesNeeded || [],
        claims_to_verify: plan.claimsToVerify || [],
        coverage_gaps: plan.coverageGaps || [],
        sources_to_avoid: plan.sourcesToAvoid || [],
        notes: plan.notes,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to save collection plan: ${response.statusText}`);
    }
    
    const data = await response.json();
    const collectionPlan = data.collection_plan;
    
    return {
      id: collectionPlan.id,
      topicId: collectionPlan.topic_id,
      sourceTypesNeeded: collectionPlan.source_types_needed || [],
      claimsToVerify: collectionPlan.claims_to_verify || [],
      coverageGaps: collectionPlan.coverage_gaps || [],
      sourcesToAvoid: collectionPlan.sources_to_avoid || [],
      notes: collectionPlan.notes || null,
      createdAt: new Date(collectionPlan.created_at),
      updatedAt: new Date(collectionPlan.updated_at),
    };
  },

  /**
   * Get collection plan for a topic
   */
  async getCollectionPlan(topicId: string): Promise<CollectionPlan | null> {
    const response = await fetch(`${API_BASE}/api/topics/${topicId}/collection-plan`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch collection plan: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.collection_plan) {
      return null;
    }
    
    const collectionPlan = data.collection_plan;
    
    return {
      id: collectionPlan.id,
      topicId: collectionPlan.topic_id,
      sourceTypesNeeded: collectionPlan.source_types_needed || [],
      claimsToVerify: collectionPlan.claims_to_verify || [],
      coverageGaps: collectionPlan.coverage_gaps || [],
      sourcesToAvoid: collectionPlan.sources_to_avoid || [],
      notes: collectionPlan.notes || null,
      createdAt: new Date(collectionPlan.created_at),
      updatedAt: new Date(collectionPlan.updated_at),
    };
  },
};


