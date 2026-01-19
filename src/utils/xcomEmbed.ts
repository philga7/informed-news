/**
 * X.com Embedded Timeline Utility
 * 
 * Shared utility for generating X.com embedded timeline anchor attributes
 * and data attributes for both profiles and lists.
 */

import type { XcomTimelineSettings } from '../types/xcom';

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
 */
export function validateTimelineSettings(settings: XcomTimelineSettings): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Tweet limit: 1-20
  if (settings.tweetLimit !== undefined && settings.tweetLimit !== null) {
    if (settings.tweetLimit < 1 || settings.tweetLimit > 20) {
      errors.push('Tweet limit must be between 1 and 20');
    }
  }

  // Width: 180-520px (Twitter auto-adjusts, but warn if out of range)
  if (settings.width !== undefined && settings.width !== null) {
    if (settings.width < 180 || settings.width > 520) {
      // Not an error, just a warning - Twitter will auto-adjust
      // But we'll still validate it's a positive number
      if (settings.width <= 0) {
        errors.push('Width must be a positive number');
      }
    }
  }

  // Height: must be positive if specified
  if (settings.height !== undefined && settings.height !== null) {
    if (settings.height <= 0) {
      errors.push('Height must be a positive number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
