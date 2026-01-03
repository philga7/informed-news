// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

export interface ScanSession {
  id: string;
  organizationId: string;
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
  itemsReviewed: number;
  itemsLinkedToTopics: number;
  itemsCreatedWatch: number;
  itemsDismissed: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScanSessionStats {
  totalSessions: number;
  totalItemsReviewed: number;
  totalLinked: number;
  totalWatchItems: number;
  totalDismissed: number;
  avgItemsPerSession: number;
  avgSessionDurationMinutes: number;
}

export const scanSessionsService = {
  /**
   * Create a new scan session
   */
  async create(data: {
    organizationId: string;
    userId: string;
    notes?: string;
  }): Promise<ScanSession> {
    const response = await fetch(`${API_BASE}/api/scan-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: data.organizationId,
        user_id: data.userId,
        notes: data.notes,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create scan session: ${response.statusText}`);
    }
    
    const result = await response.json();
    return mapSessionFromApi(result.session);
  },

  /**
   * Update a scan session (typically to end it or update counters)
   */
  async update(
    sessionId: string,
    updates: {
      endedAt?: Date;
      itemsReviewed?: number;
      itemsLinkedToTopics?: number;
      itemsCreatedWatch?: number;
      itemsDismissed?: number;
      notes?: string;
    }
  ): Promise<ScanSession> {
    const response = await fetch(`${API_BASE}/api/scan-sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ended_at: updates.endedAt?.toISOString(),
        items_reviewed: updates.itemsReviewed,
        items_linked_to_topics: updates.itemsLinkedToTopics,
        items_created_watch: updates.itemsCreatedWatch,
        items_dismissed: updates.itemsDismissed,
        notes: updates.notes,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update scan session: ${response.statusText}`);
    }
    
    const result = await response.json();
    return mapSessionFromApi(result.session);
  },

  /**
   * Get a single scan session by ID
   */
  async getById(sessionId: string): Promise<ScanSession> {
    const response = await fetch(`${API_BASE}/api/scan-sessions/${sessionId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Scan session not found');
      }
      throw new Error(`Failed to fetch scan session: ${response.statusText}`);
    }
    
    const result = await response.json();
    return mapSessionFromApi(result.session);
  },

  /**
   * Get recent scan sessions for an organization
   */
  async getRecent(organizationId: string, limit = 10): Promise<ScanSession[]> {
    const params = new URLSearchParams({
      organization_id: organizationId,
      limit: String(limit),
    });

    const response = await fetch(`${API_BASE}/api/scan-sessions?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch scan sessions: ${response.statusText}`);
    }
    
    const result = await response.json();
    return (result.sessions || []).map(mapSessionFromApi);
  },

  /**
   * Get scan session statistics for an organization
   */
  async getStats(organizationId: string, days = 30): Promise<ScanSessionStats> {
    const params = new URLSearchParams({
      days: String(days),
    });

    const response = await fetch(
      `${API_BASE}/api/scan-sessions/stats/${organizationId}?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch scan session stats: ${response.statusText}`);
    }
    
    const result = await response.json();
    const stats = result.stats;
    
    return {
      totalSessions: parseInt(stats.total_sessions || '0', 10),
      totalItemsReviewed: parseInt(stats.total_items_reviewed || '0', 10),
      totalLinked: parseInt(stats.total_linked || '0', 10),
      totalWatchItems: parseInt(stats.total_watch_items || '0', 10),
      totalDismissed: parseInt(stats.total_dismissed || '0', 10),
      avgItemsPerSession: parseFloat(stats.avg_items_per_session || '0'),
      avgSessionDurationMinutes: parseFloat(stats.avg_session_duration_minutes || '0'),
    };
  },

  /**
   * End a scan session
   */
  async end(
    sessionId: string,
    counters: {
      itemsReviewed: number;
      itemsLinkedToTopics: number;
      itemsCreatedWatch: number;
      itemsDismissed: number;
    },
    notes?: string
  ): Promise<ScanSession> {
    return this.update(sessionId, {
      endedAt: new Date(),
      ...counters,
      notes,
    });
  },

  /**
   * Delete a scan session
   */
  async delete(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/scan-sessions/${sessionId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete scan session: ${response.statusText}`);
    }
  },
};

/**
 * Map API response to ScanSession type
 */
function mapSessionFromApi(session: any): ScanSession {
  return {
    id: session.id,
    organizationId: session.organization_id,
    userId: session.user_id,
    startedAt: new Date(session.started_at),
    endedAt: session.ended_at ? new Date(session.ended_at) : null,
    itemsReviewed: session.items_reviewed || 0,
    itemsLinkedToTopics: session.items_linked_to_topics || 0,
    itemsCreatedWatch: session.items_created_watch || 0,
    itemsDismissed: session.items_dismissed || 0,
    notes: session.notes || null,
    createdAt: new Date(session.created_at),
    updatedAt: new Date(session.updated_at),
  };
}

