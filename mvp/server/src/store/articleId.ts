import { createHash } from 'node:crypto';

/** Stable article id derived from the canonical source URL. */
export function articleIdFromCanonicalUrl(canonicalUrl: string): string {
  return createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 32);
}
