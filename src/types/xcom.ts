/**
 * X.com Embedded Timelines Type Definitions
 * 
 * Types for X.com profile and list timeline management.
 * Shared settings interface for both profiles and lists.
 */

// ============================================================================
// TIMELINE SETTINGS (Shared by profiles and lists)
// ============================================================================

export interface XcomTimelineSettings {
  theme?: 'dark' | 'light'; // Timeline theme (default: 'dark' for app)
  tweetLimit?: number; // 1-20, null for unlimited
  width?: number; // pixels, null for auto (180-520px)
  height?: number; // pixels, null for auto
  chrome?: {
    noheader?: boolean;
    nofooter?: boolean;
    noborders?: boolean;
    noscrollbar?: boolean;
    transparent?: boolean;
  };
}

// ============================================================================
// PROFILE TYPES
// ============================================================================

export interface XcomProfile {
  id: string;
  organizationId: string;
  username: string; // X.com username (without @)
  displayName: string | null; // Optional custom display name
  displayOrder: number; // For drag-and-drop ordering
  settings: XcomTimelineSettings; // Timeline configuration
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface XcomProfileInsert {
  organizationId: string;
  username: string; // X.com username (without @)
  displayName?: string | null;
  displayOrder?: number;
  settings?: XcomTimelineSettings;
  enabled?: boolean;
}

export interface XcomProfileUpdate {
  username?: string;
  displayName?: string | null;
  displayOrder?: number;
  settings?: XcomTimelineSettings;
  enabled?: boolean;
}

// ============================================================================
// LIST TYPES
// ============================================================================

export interface XcomList {
  id: string;
  organizationId: string;
  ownerScreenName: string; // List owner's X.com username (without @)
  slug: string; // List slug/identifier
  displayName: string | null; // Optional custom display name
  displayOrder: number; // For drag-and-drop ordering
  settings: XcomTimelineSettings; // Timeline configuration (same as profiles)
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface XcomListInsert {
  organizationId: string;
  ownerScreenName: string; // List owner's X.com username (without @)
  slug: string; // List slug/identifier
  displayName?: string | null;
  displayOrder?: number;
  settings?: XcomTimelineSettings;
  enabled?: boolean;
}

export interface XcomListUpdate {
  ownerScreenName?: string;
  slug?: string;
  displayName?: string | null;
  displayOrder?: number;
  settings?: XcomTimelineSettings;
  enabled?: boolean;
}

// ============================================================================
// REORDER TYPES
// ============================================================================

export interface XcomReorderRequest {
  profileIds?: string[]; // For profiles reordering
  listIds?: string[]; // For lists reordering
}
