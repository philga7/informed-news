import type { SourceRecord } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface SourceRecordWithDetails extends SourceRecord {
  sources: any;
  topic_source_links?: Array<{
    id: string;
    topicId: string;
    relevanceScore: number | null;
    confidenceLevel: string | null;
    osint_topics: {
      id: string;
      name: string;
    };
  }>;
}

interface SourceRecordsFilters {
  organizationId: string;
  sourceId?: string;
  linkedStatus?: 'linked' | 'unlinked' | 'all';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface PaginatedResponse {
  records: SourceRecordWithDetails[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export const sourceRecordsService = {
  /**
   * Get all source records with filters
   */
  async getAll(filters: SourceRecordsFilters): Promise<PaginatedResponse> {
    const params = new URLSearchParams({
      organization_id: filters.organizationId,
      limit: String(filters.limit || 50),
      offset: String(filters.offset || 0),
    });

    if (filters.sourceId) params.append('source_id', filters.sourceId);
    if (filters.linkedStatus) params.append('linked_status', filters.linkedStatus);
    if (filters.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters.dateTo) params.append('date_to', filters.dateTo);
    if (filters.search) params.append('search', filters.search);

    const response = await fetch(
      `${API_BASE}/api/source-records?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch source records: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert dates
    const records = data.records.map((record: any) => ({
      ...record,
      publishedAt: record.published_at ? new Date(record.published_at) : null,
      ingestedAt: new Date(record.ingested_at),
      topic_source_links: (record.topic_source_links || []).map((link: any) => ({
        id: link.id,
        topicId: link.topic_id,
        relevanceScore: link.relevance_score,
        confidenceLevel: link.confidence_level,
        osint_topics: link.osint_topics,
      })),
    }));
    
    return {
      records,
      pagination: data.pagination,
    };
  },

  /**
   * Get a single source record by ID with linked topics
   */
  async getById(recordId: string): Promise<SourceRecordWithDetails> {
    const response = await fetch(`${API_BASE}/api/source-records/${recordId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Source record not found');
      }
      throw new Error(`Failed to fetch source record: ${response.statusText}`);
    }
    
    const data = await response.json();
    const record = data.record;
    
    return {
      ...record,
      publishedAt: record.published_at ? new Date(record.published_at) : null,
      ingestedAt: new Date(record.ingested_at),
      topic_source_links: (record.topic_source_links || []).map((link: any) => ({
        id: link.id,
        topicId: link.topic_id,
        relevanceScore: link.relevance_score,
        confidenceLevel: link.confidence_level,
        assumptions: link.assumptions,
        analystNotes: link.analyst_notes,
        linkedByUserId: link.linked_by_user_id,
        linkedAt: new Date(link.linked_at),
        osint_topics: link.osint_topics,
      })),
    };
  },

  /**
   * Search source records (convenience method)
   */
  async search(organizationId: string, query: string): Promise<SourceRecordWithDetails[]> {
    const result = await this.getAll({
      organizationId,
      search: query,
      limit: 20,
    });
    return result.records;
  },
};


