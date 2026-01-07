/**
 * Retention Service
 * 
 * Frontend service for managing content retention policies and archival.
 */

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

export interface RetentionPolicy {
  maxItems?: number | null;
  retentionDays?: number | null;
  action: 'delete' | 'archive';
}

export interface RetentionPreview {
  eligible: number;
  protected: number;
  sample: Array<{
    id: string;
    published_at: string | null;
    ingested_at: string;
  }>;
}

export interface RetentionResult {
  processed: number;
  archived: number;
  deleted: number;
  protected: number;
  errors: string[];
}

export interface ArchivedRecord {
  id: string;
  source_id: string;
  title: string;
  url: string | null;
  published_at: string | null;
  ingested_at: string;
  archived_at: string;
  archive_reason: string;
  sources: {
    id: string;
    name: string;
  };
}

export const retentionService = {
  /**
   * Get retention policy for a source
   */
  async getPolicy(sourceId: string): Promise<RetentionPolicy> {
    const response = await fetch(`${API_BASE}/api/retention/sources/${sourceId}/policy`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch retention policy: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.policy;
  },

  /**
   * Update retention policy for a source
   */
  async updatePolicy(sourceId: string, policy: RetentionPolicy): Promise<RetentionPolicy> {
    const response = await fetch(`${API_BASE}/api/retention/sources/${sourceId}/policy`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxItems: policy.maxItems || null,
        retentionDays: policy.retentionDays || null,
        action: policy.action,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update retention policy: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.policy;
  },

  /**
   * Preview what would be archived/deleted
   */
  async preview(sourceId: string): Promise<RetentionPreview> {
    const response = await fetch(`${API_BASE}/api/retention/sources/${sourceId}/preview`);
    
    if (!response.ok) {
      throw new Error(`Failed to preview retention: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  },

  /**
   * Manually trigger retention for a source
   */
  async applyForSource(sourceId: string): Promise<RetentionResult> {
    const response = await fetch(`${API_BASE}/api/retention/sources/${sourceId}/apply`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to apply retention: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.result;
  },

  /**
   * List archived records
   */
  async getArchived(filters: {
    organizationId: string;
    sourceId?: string;
    archiveReason?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    records: ArchivedRecord[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
    };
  }> {
    const params = new URLSearchParams({
      organization_id: filters.organizationId,
      limit: String(filters.limit || 50),
      offset: String(filters.offset || 0),
    });

    if (filters.sourceId) params.append('source_id', filters.sourceId);
    if (filters.archiveReason) params.append('archive_reason', filters.archiveReason);
    if (filters.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters.dateTo) params.append('date_to', filters.dateTo);

    const response = await fetch(`${API_BASE}/api/retention/archived?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch archived records: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      records: data.records,
      pagination: data.pagination,
    };
  },

  /**
   * Restore an archived record
   */
  async restore(recordId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/retention/archived/${recordId}/restore`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to restore record: ${response.statusText}`);
    }
  },

  /**
   * Restore an archived record (alias for restore, for consistency)
   */
  async undoArchive(recordId: string): Promise<void> {
    return this.restore(recordId);
  },
};

