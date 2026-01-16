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
      throw new Error(`Failed to fetch X.com profiles: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Transform database types to domain types
    return (data.profiles || []).map((profile: any) => ({
      id: profile.id,
      organizationId: profile.organization_id,
      username: profile.username,
      displayName: profile.display_name || null,
      displayOrder: profile.display_order || 0,
      settings: (profile.settings || {}) as XcomProfile['settings'],
      enabled: profile.enabled !== undefined ? profile.enabled : true,
      createdAt: new Date(profile.created_at),
      updatedAt: new Date(profile.updated_at),
    }));
  },

  /**
   * Get a single profile by ID
   */
  async getById(profileId: string): Promise<XcomProfile> {
    const response = await fetch(`${API_BASE}/api/xcom-profiles/${profileId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('X.com profile not found');
      }
      throw new Error(`Failed to fetch X.com profile: ${response.statusText}`);
    }
    
    const data = await response.json();
    const profile = data.profile;
    
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
      const error = await response.json();
      throw new Error(error.error || `Failed to create X.com profile: ${response.statusText}`);
    }
    
    const data = await response.json();
    const createdProfile = data.profile;
    
    return {
      id: createdProfile.id,
      organizationId: createdProfile.organization_id,
      username: createdProfile.username,
      displayName: createdProfile.display_name || null,
      displayOrder: createdProfile.display_order || 0,
      settings: (createdProfile.settings || {}) as XcomProfile['settings'],
      enabled: createdProfile.enabled !== undefined ? createdProfile.enabled : true,
      createdAt: new Date(createdProfile.created_at),
      updatedAt: new Date(createdProfile.updated_at),
    };
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
      const error = await response.json();
      throw new Error(error.error || `Failed to update X.com profile: ${response.statusText}`);
    }
    
    const data = await response.json();
    const profile = data.profile;
    
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
  },

  /**
   * Delete a profile permanently
   */
  async delete(profileId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/xcom-profiles/${profileId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete X.com profile: ${response.statusText}`);
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
      const error = await response.json();
      throw new Error(error.error || `Failed to reorder profiles: ${response.statusText}`);
    }
  },
};
