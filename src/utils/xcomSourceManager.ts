/**
 * X.com Source Manager Utility
 * 
 * Manages the organization's X.com source for creating Source Records from tweets.
 * Follows the existing pattern from manual input sources.
 */

import { osintSourcesService } from '../services';
import type { Source } from '../types/osint';

// ============================================================================
// CONSTANTS
// ============================================================================

const XCOM_SOURCE_NAME = 'X.com';
const XCOM_SOURCE_TYPE = 'manual'; // Use 'manual' type since we're manually creating records from tweets
const XCOM_SOURCE_URL = 'https://x.com';
const XCOM_DOMAIN = 'social'; // Domain categorization

// Cache for organization sources to avoid repeated API calls
const sourceCache = new Map<string, Source>();

// ============================================================================
// SOURCE MANAGER
// ============================================================================

/**
 * Get or create the organization's X.com source
 * 
 * This function ensures each organization has a dedicated X.com source
 * that can be used to create Source Records from tweets.
 * 
 * @param organizationId - The organization ID
 * @returns The X.com source for the organization
 */
export async function getOrCreateXcomSource(organizationId: string): Promise<Source> {
  // Check cache first
  const cacheKey = `xcom-${organizationId}`;
  const cached = sourceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch all sources for the organization
  const sources = await osintSourcesService.getAll(organizationId);

  // Look for existing X.com source
  const existingSource = sources.find(
    (s) => 
      s.name === XCOM_SOURCE_NAME || 
      (s.name.toLowerCase().includes('x.com') && s.sourceType === XCOM_SOURCE_TYPE) ||
      (s.name.toLowerCase().includes('twitter') && s.sourceType === XCOM_SOURCE_TYPE)
  );

  if (existingSource) {
    // Cache and return existing source
    sourceCache.set(cacheKey, existingSource);
    return existingSource;
  }

  // Create new X.com source
  const newSource = await osintSourcesService.create(organizationId, {
    name: XCOM_SOURCE_NAME,
    sourceType: XCOM_SOURCE_TYPE,
    url: XCOM_SOURCE_URL,
    domain: XCOM_DOMAIN,
    reliabilityRating: 'MEDIUM', // Social media default
    notes: 'Auto-created source for tweets captured from X.com embedded timelines.',
    enabled: true,
  });

  // Cache and return new source
  sourceCache.set(cacheKey, newSource);
  return newSource;
}

/**
 * Get the X.com source ID for an organization
 * 
 * Convenience function that returns just the source ID.
 * 
 * @param organizationId - The organization ID
 * @returns The X.com source ID
 */
export async function getXcomSourceId(organizationId: string): Promise<string> {
  const source = await getOrCreateXcomSource(organizationId);
  return source.id;
}

/**
 * Clear the source cache for an organization
 * 
 * Useful when sources are modified externally.
 * 
 * @param organizationId - The organization ID to clear cache for, or undefined to clear all
 */
export function clearXcomSourceCache(organizationId?: string): void {
  if (organizationId) {
    sourceCache.delete(`xcom-${organizationId}`);
  } else {
    sourceCache.clear();
  }
}

/**
 * Check if a source is the X.com source
 * 
 * @param source - The source to check
 * @returns True if the source is the X.com source
 */
export function isXcomSource(source: Source): boolean {
  return (
    source.name === XCOM_SOURCE_NAME ||
    (source.name.toLowerCase().includes('x.com') && source.sourceType === XCOM_SOURCE_TYPE)
  );
}
