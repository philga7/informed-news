import type { Source } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface SourceWithCount extends Source {
  record_count: number;
}

export const osintSourcesService = {
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
      reliabilityRating: source.reliability_rating,
      notes: source.notes,
      createdAt: new Date(source.created_at),
      updatedAt: new Date(source.updated_at),
      record_count: source.record_count || 0,
    }));
  },

  /**
   * Update a source (including reliability rating)
   */
  async update(
    sourceId: string,
    updates: {
      name?: string;
      url?: string;
      reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
      notes?: string;
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
        reliability_rating: updates.reliabilityRating,
        notes: updates.notes,
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
      reliabilityRating: source.reliability_rating,
      notes: source.notes,
      createdAt: new Date(source.created_at),
      updatedAt: new Date(source.updated_at),
    };
  },
};

