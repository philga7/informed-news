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

// ============================================================================
// TWEET DATA TYPES (For Phase 10: Tweet Selection & Topic Creation)
// ============================================================================

/**
 * Parsed tweet data from embedded timeline DOM
 */
export interface TweetData {
  /** Tweet text content */
  text: string;
  /** Author username (without @) */
  authorUsername: string;
  /** Full tweet URL (e.g., https://twitter.com/username/status/123456) */
  tweetUrl: string;
  /** Tweet timestamp if available */
  timestamp?: Date;
  /** Array of video URLs if present */
  videoLinks?: string[];
  /** Array of image/media URLs if present */
  mediaUrls?: string[];
  /** Additional tweet metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Selected tweet with checkbox state
 */
export interface SelectedTweet extends TweetData {
  /** Unique identifier for the selection (tweet URL as ID) */
  id: string;
  /** Whether this tweet should be combined with others into a single Source Record */
  combineWithOthers: boolean;
}

/**
 * Request body for creating Source Records from tweets
 */
export interface CreateSourceRecordsFromTweetsRequest {
  /** Organization ID */
  organizationId: string;
  /** User ID for audit logging */
  userId?: string;
  /** Array of tweet data to create Source Records from */
  tweets: TweetData[];
  /** Whether to combine all tweets into a single Source Record */
  combineIntoSingle?: boolean;
  /** Topic IDs to link the created Source Records to */
  topicIds?: string[];
}

/**
 * Response from creating Source Records from tweets
 */
export interface CreateSourceRecordsFromTweetsResponse {
  success: boolean;
  /** Created Source Record IDs */
  recordIds: string[];
  /** Number of records created */
  created: number;
  /** Any errors encountered */
  errors?: string[];
}
