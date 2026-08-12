import { createHash } from 'node:crypto';

/** Stable article id derived from the CFP aggregator URL. */
export function articleIdFromCfpUrl(cfpUrl: string): string {
  return createHash('sha256').update(cfpUrl).digest('hex').slice(0, 32);
}
