/**
 * X.com Validation Utilities
 * 
 * Validation functions for X.com profiles, lists, and timeline settings.
 * These are used by the backend routes to validate incoming data.
 */

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

/**
 * X.com username constraints
 * - 1-15 characters
 * - Only letters, numbers, underscores
 */
export const XCOM_USERNAME_MIN_LENGTH = 1;
export const XCOM_USERNAME_MAX_LENGTH = 15;
export const XCOM_USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * X.com list slug constraints
 * - 1-25 characters (Twitter/X default limit)
 * - Only letters, numbers, hyphens, underscores
 */
export const XCOM_SLUG_MIN_LENGTH = 1;
export const XCOM_SLUG_MAX_LENGTH = 25;
export const XCOM_SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Timeline settings constraints
 */
export const TWEET_LIMIT_MIN = 1;
export const TWEET_LIMIT_MAX = 20;
export const WIDTH_MIN = 180;
export const WIDTH_MAX = 520;
export const HEIGHT_MIN = 200;

// ============================================================================
// VALIDATION RESULT TYPE
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// TIMELINE SETTINGS TYPE (mirrors frontend)
// ============================================================================

export interface XcomTimelineSettings {
  theme?: 'dark' | 'light';
  tweetLimit?: number;
  width?: number;
  height?: number;
  chrome?: {
    noheader?: boolean;
    nofooter?: boolean;
    noborders?: boolean;
    noscrollbar?: boolean;
    transparent?: boolean;
  };
}

// ============================================================================
// USERNAME VALIDATION
// ============================================================================

/**
 * Clean username by removing @ prefix and trimming whitespace
 */
export function cleanUsername(username: string): string {
  if (!username) return '';
  return username.replace(/^@/, '').trim();
}

/**
 * Validate X.com username format
 * @param username - The username to validate (with or without @)
 * @returns ValidationResult with valid flag and error messages
 */
export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];
  const cleanedUsername = cleanUsername(username);

  if (!cleanedUsername) {
    errors.push('Username is required');
    return { valid: false, errors };
  }

  if (cleanedUsername.length < XCOM_USERNAME_MIN_LENGTH) {
    errors.push(`Username must be at least ${XCOM_USERNAME_MIN_LENGTH} character`);
  }

  if (cleanedUsername.length > XCOM_USERNAME_MAX_LENGTH) {
    errors.push(`Username must be at most ${XCOM_USERNAME_MAX_LENGTH} characters`);
  }

  if (!XCOM_USERNAME_PATTERN.test(cleanedUsername)) {
    errors.push('Username must contain only letters, numbers, and underscores');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// SLUG VALIDATION
// ============================================================================

/**
 * Clean slug by trimming whitespace
 */
export function cleanSlug(slug: string): string {
  if (!slug) return '';
  return slug.trim();
}

/**
 * Validate X.com list slug format
 * @param slug - The slug to validate
 * @returns ValidationResult with valid flag and error messages
 */
export function validateSlug(slug: string): ValidationResult {
  const errors: string[] = [];
  const cleanedSlug = cleanSlug(slug);

  if (!cleanedSlug) {
    errors.push('Slug is required');
    return { valid: false, errors };
  }

  if (cleanedSlug.length < XCOM_SLUG_MIN_LENGTH) {
    errors.push(`Slug must be at least ${XCOM_SLUG_MIN_LENGTH} character`);
  }

  if (cleanedSlug.length > XCOM_SLUG_MAX_LENGTH) {
    errors.push(`Slug must be at most ${XCOM_SLUG_MAX_LENGTH} characters`);
  }

  if (!XCOM_SLUG_PATTERN.test(cleanedSlug)) {
    errors.push('Slug must contain only letters, numbers, hyphens, and underscores');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// TIMELINE SETTINGS VALIDATION
// ============================================================================

/**
 * Validate timeline settings constraints
 * @param settings - The timeline settings to validate
 * @returns ValidationResult with valid flag and error messages
 */
export function validateTimelineSettings(settings: XcomTimelineSettings): ValidationResult {
  const errors: string[] = [];

  if (!settings || typeof settings !== 'object') {
    // Empty settings are valid
    return { valid: true, errors: [] };
  }

  // Tweet limit: 1-20
  if (settings.tweetLimit !== undefined && settings.tweetLimit !== null) {
    if (typeof settings.tweetLimit !== 'number') {
      errors.push('Tweet limit must be a number');
    } else if (!Number.isInteger(settings.tweetLimit)) {
      errors.push('Tweet limit must be a whole number');
    } else if (settings.tweetLimit < TWEET_LIMIT_MIN || settings.tweetLimit > TWEET_LIMIT_MAX) {
      errors.push(`Tweet limit must be between ${TWEET_LIMIT_MIN} and ${TWEET_LIMIT_MAX}`);
    }
  }

  // Width: 180-520px
  if (settings.width !== undefined && settings.width !== null) {
    if (typeof settings.width !== 'number') {
      errors.push('Width must be a number');
    } else if (!Number.isInteger(settings.width)) {
      errors.push('Width must be a whole number');
    } else if (settings.width < WIDTH_MIN || settings.width > WIDTH_MAX) {
      errors.push(`Width must be between ${WIDTH_MIN} and ${WIDTH_MAX} pixels`);
    }
  }

  // Height: must be positive (min 200px for usability)
  if (settings.height !== undefined && settings.height !== null) {
    if (typeof settings.height !== 'number') {
      errors.push('Height must be a number');
    } else if (!Number.isInteger(settings.height)) {
      errors.push('Height must be a whole number');
    } else if (settings.height < HEIGHT_MIN) {
      errors.push(`Height must be at least ${HEIGHT_MIN} pixels`);
    }
  }

  // Theme validation
  if (settings.theme !== undefined && settings.theme !== null) {
    if (settings.theme !== 'dark' && settings.theme !== 'light') {
      errors.push('Theme must be either "dark" or "light"');
    }
  }

  // Chrome validation (all booleans)
  if (settings.chrome !== undefined && settings.chrome !== null) {
    if (typeof settings.chrome !== 'object') {
      errors.push('Chrome options must be an object');
    } else {
      const chromeKeys = ['noheader', 'nofooter', 'noborders', 'noscrollbar', 'transparent'] as const;
      for (const key of chromeKeys) {
        const value = settings.chrome[key];
        if (value !== undefined && value !== null && typeof value !== 'boolean') {
          errors.push(`Chrome option "${key}" must be a boolean`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// COMPREHENSIVE PROFILE VALIDATION
// ============================================================================

/**
 * Validate a complete X.com profile for creation
 * @param profile - The profile data to validate
 * @returns ValidationResult with valid flag and all error messages
 */
export function validateProfileCreate(profile: {
  organization_id?: string;
  username?: string;
  display_name?: string | null;
  settings?: XcomTimelineSettings;
}): ValidationResult {
  const errors: string[] = [];

  // Organization ID is required
  if (!profile.organization_id) {
    errors.push('Organization ID is required');
  }

  // Username is required
  if (!profile.username) {
    errors.push('Username is required');
  } else {
    const usernameValidation = validateUsername(profile.username);
    errors.push(...usernameValidation.errors);
  }

  // Validate settings if provided
  if (profile.settings) {
    const settingsValidation = validateTimelineSettings(profile.settings);
    errors.push(...settingsValidation.errors);
  }

  // Display name length check
  if (profile.display_name && profile.display_name.length > 100) {
    errors.push('Display name must be at most 100 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a complete X.com profile for update
 * @param profile - The profile data to validate
 * @returns ValidationResult with valid flag and all error messages
 */
export function validateProfileUpdate(profile: {
  username?: string;
  display_name?: string | null;
  settings?: XcomTimelineSettings;
}): ValidationResult {
  const errors: string[] = [];

  // Validate username if provided
  if (profile.username !== undefined) {
    const usernameValidation = validateUsername(profile.username);
    errors.push(...usernameValidation.errors);
  }

  // Validate settings if provided
  if (profile.settings) {
    const settingsValidation = validateTimelineSettings(profile.settings);
    errors.push(...settingsValidation.errors);
  }

  // Display name length check
  if (profile.display_name && profile.display_name.length > 100) {
    errors.push('Display name must be at most 100 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// COMPREHENSIVE LIST VALIDATION
// ============================================================================

/**
 * Validate a complete X.com list for creation
 * @param list - The list data to validate
 * @returns ValidationResult with valid flag and all error messages
 */
export function validateListCreate(list: {
  organization_id?: string;
  owner_screen_name?: string;
  slug?: string;
  display_name?: string | null;
  settings?: XcomTimelineSettings;
}): ValidationResult {
  const errors: string[] = [];

  // Organization ID is required
  if (!list.organization_id) {
    errors.push('Organization ID is required');
  }

  // Owner screen name is required
  if (!list.owner_screen_name) {
    errors.push('Owner screen name is required');
  } else {
    const ownerValidation = validateUsername(list.owner_screen_name);
    if (!ownerValidation.valid) {
      errors.push(...ownerValidation.errors.map(e => e.replace('Username', 'Owner screen name')));
    }
  }

  // Slug is required
  if (!list.slug) {
    errors.push('Slug is required');
  } else {
    const slugValidation = validateSlug(list.slug);
    errors.push(...slugValidation.errors);
  }

  // Validate settings if provided
  if (list.settings) {
    const settingsValidation = validateTimelineSettings(list.settings);
    errors.push(...settingsValidation.errors);
  }

  // Display name length check
  if (list.display_name && list.display_name.length > 100) {
    errors.push('Display name must be at most 100 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a complete X.com list for update
 * @param list - The list data to validate
 * @returns ValidationResult with valid flag and all error messages
 */
export function validateListUpdate(list: {
  owner_screen_name?: string;
  slug?: string;
  display_name?: string | null;
  settings?: XcomTimelineSettings;
}): ValidationResult {
  const errors: string[] = [];

  // Validate owner screen name if provided
  if (list.owner_screen_name !== undefined) {
    const ownerValidation = validateUsername(list.owner_screen_name);
    if (!ownerValidation.valid) {
      errors.push(...ownerValidation.errors.map(e => e.replace('Username', 'Owner screen name')));
    }
  }

  // Validate slug if provided
  if (list.slug !== undefined) {
    const slugValidation = validateSlug(list.slug);
    errors.push(...slugValidation.errors);
  }

  // Validate settings if provided
  if (list.settings) {
    const settingsValidation = validateTimelineSettings(list.settings);
    errors.push(...settingsValidation.errors);
  }

  // Display name length check
  if (list.display_name && list.display_name.length > 100) {
    errors.push('Display name must be at most 100 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
