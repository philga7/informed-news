import type { Source } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface SourceWithCount extends Source {
  record_count: number;
  linked_count?: number;
  days_since_last_link?: number;
}

export const osintSourcesService = {
  /**
   * Create a new source
   */
  async create(
    organizationId: string,
    sourceData: {
      name: string;
      sourceType: 'rss' | 'api' | 'email' | 'manual';
      url?: string;
      domain?: string | null;
      reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
      notes?: string;
      scrapeExternalUrl?: boolean;
      enabled?: boolean;
    }
  ): Promise<Source> {
    const response = await fetch(`${API_BASE}/api/sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: organizationId,
        source_type: sourceData.sourceType,
        name: sourceData.name,
        url: sourceData.url,
        domain: sourceData.domain,
        reliability_rating: sourceData.reliabilityRating || 'UNKNOWN',
        notes: sourceData.notes,
        scrape_external_url: sourceData.scrapeExternalUrl || false,
        enabled: sourceData.enabled !== undefined ? sourceData.enabled : true,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to create source: ${response.statusText}`);
    }
    
    const data = await response.json();
    const source = data.source;
    
    return {
      id: source.id,
      organizationId: source.organization_id,
      sourceType: source.source_type,
      name: source.name,
      url: source.url,
      domain: source.domain || null,
      reliabilityRating: source.reliability_rating,
      valueRating: source.value_rating || null,
      notes: source.notes,
      scrapeExternalUrl: source.scrape_external_url || false,
      enabled: source.enabled !== undefined ? source.enabled : true,
      retentionMaxItems: source.retention_max_items || null,
      retentionDays: source.retention_days || null,
      retentionAction: source.retention_action || 'archive',
      createdAt: new Date(source.created_at),
      updatedAt: new Date(source.updated_at),
    };
  },

  /**
   * Get all sources for an organization
   */
  async getAll(organizationId: string): Promise<SourceWithCount[]> {
    const response = await fetch(
      `${API_BASE}/api/sources?organization_id=${organizationId}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sources: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert string dates to Date objects
    return data.sources.map((source: any) => ({
      id: source.id,
      organizationId: source.organization_id,
      sourceType: source.source_type,
      name: source.name,
      url: source.url,
      domain: source.domain || null,
      reliabilityRating: source.reliability_rating,
      valueRating: source.value_rating || null,
      notes: source.notes,
      scrapeExternalUrl: source.scrape_external_url || false,
      enabled: source.enabled !== undefined ? source.enabled : true,
      createdAt: new Date(source.created_at),
      updatedAt: new Date(source.updated_at),
      record_count: source.record_count || 0,
      linked_count: source.linked_count || 0,
      days_since_last_link: source.days_since_last_link,
    }));
  },

  /**
   * Update a source (including reliability rating and value rating)
   */
  async update(
    sourceId: string,
    updates: {
      name?: string;
      url?: string;
      domain?: string | null;
      reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
      valueRating?: number;
      notes?: string;
      scrapeExternalUrl?: boolean;
      enabled?: boolean;
    }
  ): Promise<Source> {
    const response = await fetch(`${API_BASE}/api/sources/${sourceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: updates.name,
        url: updates.url,
        domain: updates.domain,
        reliability_rating: updates.reliabilityRating,
        value_rating: updates.valueRating,
        notes: updates.notes,
        scrape_external_url: updates.scrapeExternalUrl,
        enabled: updates.enabled,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update source: ${response.statusText}`);
    }
    
    const data = await response.json();
    const source = data.source;
    
    return {
      id: source.id,
      organizationId: source.organization_id,
      sourceType: source.source_type,
      name: source.name,
      url: source.url,
      domain: source.domain || null,
      reliabilityRating: source.reliability_rating,
      valueRating: source.value_rating || null,
      notes: source.notes,
      scrapeExternalUrl: source.scrape_external_url || false,
      enabled: source.enabled !== undefined ? source.enabled : true,
      retentionMaxItems: source.retention_max_items || null,
      retentionDays: source.retention_days || null,
      retentionAction: source.retention_action || 'archive',
      createdAt: new Date(source.created_at),
      updatedAt: new Date(source.updated_at),
    };
  },

  /**
   * Delete a source (cascade deletes all associated source records and topic links)
   */
  async delete(sourceId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/sources/${sourceId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete source: ${response.statusText}`);
    }
  },
};

