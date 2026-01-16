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
      throw new Error(`Failed to fetch X.com lists: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Transform database types to domain types
    return (data.lists || []).map((list: any) => ({
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
    }));
  },

  /**
   * Get a single list by ID
   */
  async getById(listId: string): Promise<XcomList> {
    const response = await fetch(`${API_BASE}/api/xcom-lists/${listId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('X.com list not found');
      }
      throw new Error(`Failed to fetch X.com list: ${response.statusText}`);
    }
    
    const data = await response.json();
    const list = data.list;
    
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
      const error = await response.json();
      throw new Error(error.error || `Failed to create X.com list: ${response.statusText}`);
    }
    
    const data = await response.json();
    const createdList = data.list;
    
    return {
      id: createdList.id,
      organizationId: createdList.organization_id,
      ownerScreenName: createdList.owner_screen_name,
      slug: createdList.slug,
      displayName: createdList.display_name || null,
      displayOrder: createdList.display_order || 0,
      settings: (createdList.settings || {}) as XcomList['settings'],
      enabled: createdList.enabled !== undefined ? createdList.enabled : true,
      createdAt: new Date(createdList.created_at),
      updatedAt: new Date(createdList.updated_at),
    };
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
      const error = await response.json();
      throw new Error(error.error || `Failed to update X.com list: ${response.statusText}`);
    }
    
    const data = await response.json();
    const list = data.list;
    
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
  },

  /**
   * Delete a list permanently
   */
  async delete(listId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/xcom-lists/${listId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to delete X.com list: ${response.statusText}`);
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
      const error = await response.json();
      throw new Error(error.error || `Failed to reorder lists: ${response.statusText}`);
    }
  },
};
