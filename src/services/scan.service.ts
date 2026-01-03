import type { SourceRecordWithDomain, ScanStatus, WatchItemCategory } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface ScanFilters {
  organizationId: string;
  scanStatus?: ScanStatus | ScanStatus[];
  domain?: WatchItemCategory;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface ScanRecordWithDetails extends SourceRecordWithDomain {
  sources: {
    id: string;
    name: string;
    domain: WatchItemCategory | null;
  };
  topic_source_links?: Array<{
    id: string;
    topicId: string;
    osint_topics: {
      id: string;
      name: string;
    };
  }>;
}

interface PaginatedScanResponse {
  records: ScanRecordWithDetails[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  stats: {
    pendingCount: number;
    reviewedCount: number;
    linkedCount: number;
    dismissedCount: number;
  };
}

interface UpdateScanStatusPayload {
  scanStatus: ScanStatus;
  reviewedBy?: string;
}

interface DomainStats {
  domain: WatchItemCategory;
  pendingCount: number;
  totalCount: number;
}

export const scanService = {
  /**
   * Get source records for scan view with domain filtering
   */
  async getScanRecords(filters: ScanFilters): Promise<PaginatedScanResponse> {
    const params = new URLSearchParams({
      organization_id: filters.organizationId,
      limit: String(filters.limit || 50),
      offset: String(filters.offset || 0),
    });

    // Handle array of scan statuses
    if (filters.scanStatus) {
      const statuses = Array.isArray(filters.scanStatus) 
        ? filters.scanStatus 
        : [filters.scanStatus];
      statuses.forEach(status => params.append('scan_status', status));
    }
    
    if (filters.domain) params.append('domain', filters.domain);
    if (filters.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters.dateTo) params.append('date_to', filters.dateTo);
    if (filters.search) params.append('search', filters.search);

    const response = await fetch(
      `${API_BASE}/api/source-records/scan?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch scan records: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convert dates and map to proper types
    const records = data.records.map((record: any) => ({
      ...record,
      publishedAt: record.published_at ? new Date(record.published_at) : null,
      ingestedAt: new Date(record.ingested_at),
      reviewedAt: record.reviewed_at ? new Date(record.reviewed_at) : null,
      sourceDomain: record.source_domain,
      sourceName: record.source_name,
      scanStatus: record.scan_status,
      reviewedBy: record.reviewed_by,
    }));
    
    return {
      records,
      pagination: data.pagination,
      stats: data.stats || {
        pendingCount: 0,
        reviewedCount: 0,
        linkedCount: 0,
        dismissedCount: 0,
      },
    };
  },

  /**
   * Update scan status for a single record
   */
  async updateScanStatus(
    recordId: string, 
    payload: UpdateScanStatusPayload
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/source-records/${recordId}/scan-status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scan_status: payload.scanStatus,
          reviewed_by: payload.reviewedBy,
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to update scan status: ${response.statusText}`);
    }
  },

  /**
   * Batch update scan status for multiple records
   */
  async batchUpdateScanStatus(
    recordIds: string[], 
    payload: UpdateScanStatusPayload
  ): Promise<void> {
    const response = await fetch(
      `${API_BASE}/api/source-records/batch/scan-status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          record_ids: recordIds,
          scan_status: payload.scanStatus,
          reviewed_by: payload.reviewedBy,
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to batch update scan status: ${response.statusText}`);
    }
  },

  /**
   * Get domain statistics for sidebar filtering
   */
  async getDomainStats(organizationId: string): Promise<DomainStats[]> {
    const params = new URLSearchParams({
      organization_id: organizationId,
    });

    const response = await fetch(
      `${API_BASE}/api/source-records/scan/stats/domains?${params.toString()}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch domain stats: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.domainStats || [];
  },

  /**
   * Dismiss (mark as reviewed) a batch of records
   */
  async dismissRecords(recordIds: string[], userId?: string): Promise<void> {
    return this.batchUpdateScanStatus(recordIds, {
      scanStatus: 'dismissed',
      reviewedBy: userId,
    });
  },

  /**
   * Mark record as linked (called when linking to topic)
   */
  async markAsLinked(recordId: string, userId?: string): Promise<void> {
    return this.updateScanStatus(recordId, {
      scanStatus: 'linked',
      reviewedBy: userId,
    });
  },

  /**
   * Get pending records count for notification badge
   */
  async getPendingCount(organizationId: string): Promise<number> {
    const result = await this.getScanRecords({
      organizationId,
      scanStatus: 'pending',
      limit: 0,
    });
    return result.pagination.total;
  },
};

