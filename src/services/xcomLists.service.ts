/**
 * X.com Lists Service
 * 
 * Frontend service layer for managing X.com list timelines.
 * Follows same patterns as profiles service.
 */

import type { XcomList, XcomListInsert, XcomListUpdate } from '../types/xcom';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

// ============================================================================
// ERROR TYPES
// ============================================================================

export class XcomListApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly errors?: string[]
  ) {
    super(message);
    this.name = 'XcomListApiError';
  }

  static isValidationError(error: unknown): error is XcomListApiError {
    return error instanceof XcomListApiError && error.status === 400;
  }

  static isDuplicateError(error: unknown): error is XcomListApiError {
    return error instanceof XcomListApiError && error.status === 409;
  }

  static isNotFoundError(error: unknown): error is XcomListApiError {
    return error instanceof XcomListApiError && error.status === 404;
  }
}

/**
 * Parse API error response and throw appropriate XcomListApiError
 */
async function handleApiError(response: Response, defaultMessage: string): Promise<never> {
  let errorData: { error?: string; message?: string; errors?: string[] } = {};
  
  try {
    errorData = await response.json();
  } catch {
    // If JSON parsing fails, use status text
  }

  const message = errorData.message || errorData.error || response.statusText || defaultMessage;
  
  throw new XcomListApiError(
    message,
    response.status,
    errorData.error,
    errorData.errors
  );
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

/**
 * Transform API response to domain type
 */
function transformList(list: any): XcomList {
  return {
    id: list.id,
    organizationId: list.organization_id,
    ownerScreenName: list.owner_screen_name,
    slug: list.slug,
    displayName: list.display_name || null,
    displayOrder: list.display_order || 0,
    settings: (list.settings || {}) as XcomList['settings'],
    enabled: list.enabled !== undefined ? list.enabled : true,
    createdAt: new Date(list.created_at),
    updatedAt: new Date(list.updated_at),
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export const xcomListsService = {
  /**
   * Get all lists for an organization (ordered by display_order)
   */
  async getAll(organizationId: string): Promise<XcomList[]> {
    const params = new URLSearchParams({ organization_id: organizationId });

    const response = await fetch(
      `${API_BASE}/api/xcom-lists?${params.toString()}`
    );
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to fetch X.com lists');
    }
    
    const data = await response.json();
    return (data.lists || []).map(transformList);
  },

  /**
   * Get a single list by ID
   */
  async getById(listId: string): Promise<XcomList> {
    const response = await fetch(`${API_BASE}/api/xcom-lists/${listId}`);
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to fetch X.com list');
    }
    
    const data = await response.json();
    return transformList(data.list);
  },

  /**
   * Create a new list
   */
  async create(list: XcomListInsert): Promise<XcomList> {
    const response = await fetch(`${API_BASE}/api/xcom-lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: list.organizationId,
        owner_screen_name: list.ownerScreenName,
        slug: list.slug,
        display_name: list.displayName,
        display_order: list.displayOrder,
        settings: list.settings || {},
        enabled: list.enabled !== undefined ? list.enabled : true,
      }),
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to create X.com list');
    }
    
    const data = await response.json();
    return transformList(data.list);
  },

  /**
   * Update a list
   */
  async update(
    listId: string,
    updates: XcomListUpdate
  ): Promise<XcomList> {
    const response = await fetch(`${API_BASE}/api/xcom-lists/${listId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner_screen_name: updates.ownerScreenName,
        slug: updates.slug,
        display_name: updates.displayName,
        display_order: updates.displayOrder,
        settings: updates.settings,
        enabled: updates.enabled,
      }),
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to update X.com list');
    }
    
    const data = await response.json();
    return transformList(data.list);
  },

  /**
   * Delete a list permanently
   */
  async delete(listId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/xcom-lists/${listId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to delete X.com list');
    }
  },

  /**
   * Reorder lists (batch update display_order)
   */
  async reorder(
    organizationId: string,
    listIds: string[]
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/api/xcom-lists/reorder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: organizationId,
        listIds,
      }),
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to reorder lists');
    }
  },
};
