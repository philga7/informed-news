/**
 * X.com Profiles Service
 * 
 * Frontend service layer for managing X.com profile timelines.
 * Follows existing service patterns (watchItems, indicators).
 */

import type { XcomProfile, XcomProfileInsert, XcomProfileUpdate } from '../types/xcom';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

// ============================================================================
// ERROR TYPES
// ============================================================================

export class XcomApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly errors?: string[]
  ) {
    super(message);
    this.name = 'XcomApiError';
  }

  static isValidationError(error: unknown): error is XcomApiError {
    return error instanceof XcomApiError && error.status === 400;
  }

  static isDuplicateError(error: unknown): error is XcomApiError {
    return error instanceof XcomApiError && error.status === 409;
  }

  static isNotFoundError(error: unknown): error is XcomApiError {
    return error instanceof XcomApiError && error.status === 404;
  }
}

/**
 * Parse API error response and throw appropriate XcomApiError
 */
async function handleApiError(response: Response, defaultMessage: string): Promise<never> {
  let errorData: { error?: string; message?: string; errors?: string[] } = {};
  
  try {
    errorData = await response.json();
  } catch {
    // If JSON parsing fails, use status text
  }

  const message = errorData.message || errorData.error || response.statusText || defaultMessage;
  
  throw new XcomApiError(
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
function transformProfile(profile: any): XcomProfile {
  return {
    id: profile.id,
    organizationId: profile.organization_id,
    username: profile.username,
    displayName: profile.display_name || null,
    displayOrder: profile.display_order || 0,
    settings: (profile.settings || {}) as XcomProfile['settings'],
    enabled: profile.enabled !== undefined ? profile.enabled : true,
    createdAt: new Date(profile.created_at),
    updatedAt: new Date(profile.updated_at),
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export const xcomProfilesService = {
  /**
   * Get all profiles for an organization (ordered by display_order)
   */
  async getAll(organizationId: string): Promise<XcomProfile[]> {
    const params = new URLSearchParams({ organization_id: organizationId });

    const response = await fetch(
      `${API_BASE}/api/xcom-profiles?${params.toString()}`
    );
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to fetch X.com profiles');
    }
    
    const data = await response.json();
    return (data.profiles || []).map(transformProfile);
  },

  /**
   * Get a single profile by ID
   */
  async getById(profileId: string): Promise<XcomProfile> {
    const response = await fetch(`${API_BASE}/api/xcom-profiles/${profileId}`);
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to fetch X.com profile');
    }
    
    const data = await response.json();
    return transformProfile(data.profile);
  },

  /**
   * Create a new profile
   */
  async create(profile: XcomProfileInsert): Promise<XcomProfile> {
    const response = await fetch(`${API_BASE}/api/xcom-profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: profile.organizationId,
        username: profile.username,
        display_name: profile.displayName,
        display_order: profile.displayOrder,
        settings: profile.settings || {},
        enabled: profile.enabled !== undefined ? profile.enabled : true,
      }),
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to create X.com profile');
    }
    
    const data = await response.json();
    return transformProfile(data.profile);
  },

  /**
   * Update a profile
   */
  async update(
    profileId: string,
    updates: XcomProfileUpdate
  ): Promise<XcomProfile> {
    const response = await fetch(`${API_BASE}/api/xcom-profiles/${profileId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: updates.username,
        display_name: updates.displayName,
        display_order: updates.displayOrder,
        settings: updates.settings,
        enabled: updates.enabled,
      }),
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to update X.com profile');
    }
    
    const data = await response.json();
    return transformProfile(data.profile);
  },

  /**
   * Delete a profile permanently
   */
  async delete(profileId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/xcom-profiles/${profileId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to delete X.com profile');
    }
  },

  /**
   * Reorder profiles (batch update display_order)
   */
  async reorder(
    organizationId: string,
    profileIds: string[]
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/api/xcom-profiles/reorder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: organizationId,
        profileIds,
      }),
    });
    
    if (!response.ok) {
      await handleApiError(response, 'Failed to reorder profiles');
    }
  },
};
