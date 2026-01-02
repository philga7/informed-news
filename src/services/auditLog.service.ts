/**
 * Audit Log Service
 * 
 * Frontend service for accessing audit trail and history data.
 */

import type { AuditLogEntry } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

interface AuditLogsResponse {
  success: boolean;
  logs: any[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

interface EntityHistoryResponse {
  success: boolean;
  entityType: string;
  entityId: string;
  logs: any[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export const auditLogService = {
  /**
   * Query audit logs with filters
   */
  async query(params: {
    entityType?: string;
    entityId?: string;
    action?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const searchParams = new URLSearchParams();
    
    if (params.entityType) searchParams.append('entity_type', params.entityType);
    if (params.entityId) searchParams.append('entity_id', params.entityId);
    if (params.action) searchParams.append('action', params.action);
    if (params.userId) searchParams.append('user_id', params.userId);
    if (params.startDate) searchParams.append('start_date', params.startDate);
    if (params.endDate) searchParams.append('end_date', params.endDate);
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.offset) searchParams.append('offset', params.offset.toString());

    const response = await fetch(`${API_BASE}/api/audit-logs?${searchParams.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch audit logs: ${response.statusText}`);
    }
    
    const data: AuditLogsResponse = await response.json();
    
    return {
      logs: data.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })),
      total: data.pagination.total,
    };
  },

  /**
   * Get audit history for a specific topic
   */
  async getTopicHistory(
    topicId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `${API_BASE}/api/audit-logs/topics/${topicId}/history${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch topic history: ${response.statusText}`);
    }
    
    const data: EntityHistoryResponse = await response.json();
    
    return {
      logs: data.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })),
      total: data.pagination.total,
    };
  },

  /**
   * Get audit history for a specific source record
   */
  async getSourceRecordHistory(
    sourceRecordId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `${API_BASE}/api/audit-logs/source-records/${sourceRecordId}/history${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch source record history: ${response.statusText}`);
    }
    
    const data: EntityHistoryResponse = await response.json();
    
    return {
      logs: data.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })),
      total: data.pagination.total,
    };
  },

  /**
   * Get audit history for a specific link
   */
  async getLinkHistory(
    linkId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `${API_BASE}/api/audit-logs/links/${linkId}/history${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch link history: ${response.statusText}`);
    }
    
    const data: EntityHistoryResponse = await response.json();
    
    return {
      logs: data.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })),
      total: data.pagination.total,
    };
  },

  /**
   * Get audit history for a specific source
   */
  async getSourceHistory(
    sourceId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `${API_BASE}/api/audit-logs/sources/${sourceId}/history${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch source history: ${response.statusText}`);
    }
    
    const data: EntityHistoryResponse = await response.json();
    
    return {
      logs: data.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })),
      total: data.pagination.total,
    };
  },
};

