import type { 
  Indicator, 
  WatchItemCategory, 
  IndicatorCheckFrequency,
  OsintTopic 
} from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface IndicatorFilters {
  domain?: WatchItemCategory;
  isTriggered?: boolean;
}

interface DueIndicator {
  id: string;
  name: string;
  checkFrequency: IndicatorCheckFrequency;
  lastCheckedAt: Date | null;
  daysSinceCheck: number;
}

export const indicatorsService = {
  /**
   * Get all indicators for an organization with optional filtering
   */
  async getAll(
    organizationId: string,
    filters?: IndicatorFilters
  ): Promise<Indicator[]> {
    const params = new URLSearchParams({ organization_id: organizationId });
    
    if (filters?.domain) {
      params.append('domain', filters.domain);
    }
    if (filters?.isTriggered !== undefined) {
      params.append('is_triggered', filters.isTriggered.toString());
    }

    const response = await fetch(
      `${API_BASE}/api/indicators?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch indicators: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert string dates to Date objects
    return data.indicators.map((item: any) => ({
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    }));
  },

  /**
   * Get a single indicator by ID
   */
  async getById(indicatorId: string): Promise<Indicator> {
    const response = await fetch(`${API_BASE}/api/indicators/${indicatorId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Indicator not found');
      }
      throw new Error(`Failed to fetch indicator: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.indicator;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };
  },

  /**
   * Create a new indicator
   */
  async create(indicator: {
    organizationId: string;
    domain: WatchItemCategory;
    name: string;
    description?: string;
    sourceUrl?: string;
    checkFrequency?: IndicatorCheckFrequency;
    actionOnTrigger?: string;
  }): Promise<Indicator> {
    const response = await fetch(`${API_BASE}/api/indicators`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: indicator.organizationId,
        domain: indicator.domain,
        name: indicator.name,
        description: indicator.description,
        source_url: indicator.sourceUrl,
        check_frequency: indicator.checkFrequency || 'weekly',
        action_on_trigger: indicator.actionOnTrigger,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create indicator: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.indicator;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };
  },

  /**
   * Update an indicator
   */
  async update(
    indicatorId: string,
    updates: {
      name?: string;
      domain?: WatchItemCategory;
      description?: string;
      sourceUrl?: string;
      checkFrequency?: IndicatorCheckFrequency;
      actionOnTrigger?: string;
    }
  ): Promise<Indicator> {
    const response = await fetch(`${API_BASE}/api/indicators/${indicatorId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: updates.name,
        domain: updates.domain,
        description: updates.description,
        source_url: updates.sourceUrl,
        check_frequency: updates.checkFrequency,
        action_on_trigger: updates.actionOnTrigger,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update indicator: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.indicator;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };
  },

  /**
   * Delete an indicator permanently
   */
  async delete(indicatorId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/indicators/${indicatorId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete indicator: ${response.statusText}`);
    }
  },

  /**
   * Mark indicator as checked (updates last_checked_at)
   */
  async markAsChecked(indicatorId: string): Promise<Indicator> {
    const response = await fetch(
      `${API_BASE}/api/indicators/${indicatorId}/check`,
      {
        method: 'POST',
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to mark indicator as checked: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.indicator;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };
  },

  /**
   * Trigger an indicator and optionally create a topic from it
   */
  async trigger(
    indicatorId: string,
    topicData?: {
      name: string;
      description?: string;
      keywords?: string[];
    }
  ): Promise<{ indicator: Indicator; topic: OsintTopic | null }> {
    const response = await fetch(
      `${API_BASE}/api/indicators/${indicatorId}/trigger`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic_name: topicData?.name,
          topic_description: topicData?.description,
          topic_keywords: topicData?.keywords || [],
        }),
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to trigger indicator: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.indicator;
    
    const indicator: Indicator = {
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };

    let topic: OsintTopic | null = null;
    if (data.topic) {
      const t = data.topic;
      topic = {
        id: t.id,
        organizationId: t.organization_id,
        name: t.name,
        description: t.description || null,
        keywords: t.keywords || [],
        relatedTopics: t.related_topics || [],
        status: t.status,
        decisionQuestion: t.decision_question || null,
        decisionContext: t.decision_context || null,
        keyIndicators: t.key_indicators || [],
        resolutionCriteria: t.resolution_criteria || null,
        resolutionSummary: t.resolution_summary || null,
        resolutionConfidence: t.resolution_confidence || null,
        lessonsLearned: t.lessons_learned || null,
        resolvedAt: t.resolved_at ? new Date(t.resolved_at) : null,
        createdAt: new Date(t.created_at),
        updatedAt: new Date(t.updated_at),
      };
    }

    return { indicator, topic };
  },

  /**
   * Reset a triggered indicator back to active monitoring
   */
  async reset(indicatorId: string): Promise<Indicator> {
    const response = await fetch(
      `${API_BASE}/api/indicators/${indicatorId}/reset`,
      {
        method: 'POST',
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to reset indicator: ${response.statusText}`);
    }
    
    const data = await response.json();
    const item = data.indicator;
    
    return {
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    };
  },

  /**
   * Get indicators that are due for checking
   */
  async getDueForCheck(organizationId: string): Promise<DueIndicator[]> {
    const response = await fetch(
      `${API_BASE}/api/indicators/due-for-check/${organizationId}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch due indicators: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return data.indicators.map((item: any) => ({
      id: item.id,
      name: item.name,
      checkFrequency: item.check_frequency,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      daysSinceCheck: item.days_since_check,
    }));
  },

  /**
   * Get all triggered indicators for an organization
   */
  async getTriggered(organizationId: string): Promise<Indicator[]> {
    const response = await fetch(
      `${API_BASE}/api/indicators/triggered/${organizationId}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch triggered indicators: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return data.indicators.map((item: any) => ({
      id: item.id,
      organizationId: item.organization_id,
      domain: item.domain,
      name: item.name,
      description: item.description || null,
      sourceUrl: item.source_url || null,
      checkFrequency: item.check_frequency,
      isTriggered: item.is_triggered,
      triggeredAt: item.triggered_at ? new Date(item.triggered_at) : null,
      actionOnTrigger: item.action_on_trigger || null,
      lastCheckedAt: item.last_checked_at ? new Date(item.last_checked_at) : null,
      triggeredTopicId: item.triggered_topic_id || null,
      createdAt: new Date(item.created_at),
      updatedAt: new Date(item.updated_at),
    }));
  },
};

