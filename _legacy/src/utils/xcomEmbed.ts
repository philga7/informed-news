/**
 * X.com Embedded Timeline Utility
 * 
 * Shared utility for generating X.com embedded timeline anchor attributes
 * and data attributes for both profiles and lists.
 * 
 * Also includes comprehensive validation functions for usernames, slugs,
 * and timeline settings.
 */

import type { XcomTimelineSettings } from '../types/xcom';

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
// USERNAME VALIDATION
// ============================================================================

/**
 * Clean username by removing @ prefix and trimming whitespace
 */
export function cleanUsername(username: string): string {
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
// DATA ATTRIBUTE GENERATION
// ============================================================================

/**
 * Generate data attributes for X.com embedded timeline
 * Converts settings object to Twitter widget data attributes
 */
export function generateTimelineDataAttributes(settings: XcomTimelineSettings = {}): Record<string, string> {
  const attributes: Record<string, string> = {};

  // Theme: 'dark' or 'light' (default: 'dark')
  if (settings.theme) {
    attributes['data-theme'] = settings.theme;
  } else {
    attributes['data-theme'] = 'dark'; // Default for app
  }

  // Tweet limit: 1-20 (or unlimited if not specified)
  if (settings.tweetLimit !== undefined && settings.tweetLimit !== null) {
    if (settings.tweetLimit >= 1 && settings.tweetLimit <= 20) {
      attributes['data-tweet-limit'] = String(settings.tweetLimit);
    }
  }

  // Width: 180-520px (auto-adjusted by Twitter if out of range)
  if (settings.width !== undefined && settings.width !== null) {
    attributes['data-width'] = String(settings.width);
  }

  // Height: pixels (auto if not specified)
  if (settings.height !== undefined && settings.height !== null) {
    attributes['data-height'] = String(settings.height);
  }

  // Chrome options: space-separated tokens
  if (settings.chrome) {
    const chromeOptions: string[] = [];
    if (settings.chrome.noheader) chromeOptions.push('noheader');
    if (settings.chrome.nofooter) chromeOptions.push('nofooter');
    if (settings.chrome.noborders) chromeOptions.push('noborders');
    if (settings.chrome.noscrollbar) chromeOptions.push('noscrollbar');
    if (settings.chrome.transparent) chromeOptions.push('transparent');

    if (chromeOptions.length > 0) {
      attributes['data-chrome'] = chromeOptions.join(' ');
    }
  }

  return attributes;
}

/**
 * Generate profile timeline URL
 * Format: https://twitter.com/[username]
 */
export function generateProfileTimelineUrl(username: string): string {
  // Ensure username doesn't have @ prefix
  const cleanUsername = username.replace(/^@/, '');
  return `https://twitter.com/${cleanUsername}`;
}

/**
 * Generate list timeline URL
 * Format: https://twitter.com/{owner_screen_name}/lists/{slug}
 */
export function generateListTimelineUrl(ownerScreenName: string, slug: string): string {
  // Ensure owner_screen_name doesn't have @ prefix
  const cleanOwner = ownerScreenName.replace(/^@/, '');
  return `https://twitter.com/${cleanOwner}/lists/${slug}`;
}

/**
 * Generate anchor element text for profile timeline
 * Default: "Tweets by {username}"
 */
export function generateProfileTimelineText(username: string): string {
  const cleanUsername = username.replace(/^@/, '');
  return `Tweets by ${cleanUsername}`;
}

/**
 * Generate anchor element text for list timeline
 * Default: "Tweets from {url}"
 */
export function generateListTimelineText(ownerScreenName: string, slug: string): string {
  const url = generateListTimelineUrl(ownerScreenName, slug);
  return `Tweets from ${url}`;
}

/**
 * Validate timeline settings constraints
 * @param settings - The timeline settings to validate
 * @returns ValidationResult with valid flag and error messages
 */
export function validateTimelineSettings(settings: XcomTimelineSettings): ValidationResult {
  const errors: string[] = [];

  // Tweet limit: 1-20
  if (settings.tweetLimit !== undefined && settings.tweetLimit !== null) {
    if (!Number.isInteger(settings.tweetLimit)) {
      errors.push('Tweet limit must be a whole number');
    } else if (settings.tweetLimit < TWEET_LIMIT_MIN || settings.tweetLimit > TWEET_LIMIT_MAX) {
      errors.push(`Tweet limit must be between ${TWEET_LIMIT_MIN} and ${TWEET_LIMIT_MAX}`);
    }
  }

  // Width: 180-520px
  if (settings.width !== undefined && settings.width !== null) {
    if (!Number.isInteger(settings.width)) {
      errors.push('Width must be a whole number');
    } else if (settings.width < WIDTH_MIN || settings.width > WIDTH_MAX) {
      errors.push(`Width must be between ${WIDTH_MIN} and ${WIDTH_MAX} pixels`);
    }
  }

  // Height: must be positive (min 200px for usability)
  if (settings.height !== undefined && settings.height !== null) {
    if (!Number.isInteger(settings.height)) {
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

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// COMPREHENSIVE PROFILE VALIDATION
// ============================================================================

/**
 * Validate a complete X.com profile insert/update
 * @param profile - The profile data to validate
 * @returns ValidationResult with valid flag and all error messages
 */
export function validateXcomProfile(profile: {
  username?: string;
  displayName?: string | null;
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

  // Display name doesn't need strict validation, but check reasonable length
  if (profile.displayName && profile.displayName.length > 100) {
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
 * Validate a complete X.com list insert/update
 * @param list - The list data to validate
 * @returns ValidationResult with valid flag and all error messages
 */
export function validateXcomList(list: {
  ownerScreenName?: string;
  slug?: string;
  displayName?: string | null;
  settings?: XcomTimelineSettings;
}): ValidationResult {
  const errors: string[] = [];

  // Validate owner screen name if provided
  if (list.ownerScreenName !== undefined) {
    const ownerValidation = validateUsername(list.ownerScreenName);
    if (!ownerValidation.valid) {
      // Customize error message for owner screen name
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

  // Display name doesn't need strict validation, but check reasonable length
  if (list.displayName && list.displayName.length > 100) {
    errors.push('Display name must be at most 100 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
