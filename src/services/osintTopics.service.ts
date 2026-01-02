import type { OsintTopic, TopicSourceLink, TopicTimeline } from '../types/osint';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface TopicWithCount extends OsintTopic {
  linked_records_count: number;
}

interface TopicDetail extends OsintTopic {
  topic_source_links: Array<TopicSourceLink & {
    source_records: any;
  }>;
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
};


