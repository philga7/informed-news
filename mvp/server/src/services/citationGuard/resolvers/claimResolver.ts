import { isUnresolvedGoogleNewsUrl } from '../../../store/citationSourcesStore.js';
import type {
  CitationCheckResult,
  CitationCheckStatus,
  CitationSourceRecord,
} from '../../../types/citationGuard.js';
import { normalizeCitationUrl } from './urlResolver.js';

function displayForClaimStatus(status: CitationCheckStatus): CitationCheckResult['display'] {
  switch (status) {
    case 'match':
      return 'ok';
    case 'mismatch':
    case 'missing-source':
      // Claims that fail show as unconfirmed (no debunked/verified/false badge).
      return 'unconfirmed';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Check a link-backed claim against the current run's citation sources.
 * A claim is only `match` / `ok` when its refuting URL is among fetched sources;
 * otherwise `missing-source` / `unconfirmed`. No verified/false/debunked badge.
 * Does not call the network; does not mutate any payload.
 */
export function resolveClaimCitation(
  refutingUrl: string | null | undefined,
  sourcesForRun: CitationSourceRecord[],
  options?: { id?: string; claimText?: string | null },
): CitationCheckResult {
  const raw = typeof refutingUrl === 'string' ? refutingUrl : '';
  const resultBase: Pick<CitationCheckResult, 'kind' | 'refutingUrl' | 'claimText' | 'id'> = {
    kind: 'claim',
    refutingUrl: typeof refutingUrl === 'string' ? refutingUrl : null,
    ...(options?.claimText !== undefined ? { claimText: options.claimText } : {}),
    ...(options?.id !== undefined ? { id: options.id } : {}),
  };

  if (!raw.trim() || isUnresolvedGoogleNewsUrl(raw)) {
    const status = 'missing-source' as const;
    return {
      ...resultBase,
      status,
      display: displayForClaimStatus(status),
    };
  }

  const normalized = normalizeCitationUrl(raw);
  const matched = sourcesForRun.some((source) => {
    if (source.procedural === true) return false;
    if (typeof source.url !== 'string' || !source.url.trim()) return false;
    return normalizeCitationUrl(source.url) === normalized;
  });

  const status: CitationCheckStatus = matched ? 'match' : 'missing-source';
  return {
    ...resultBase,
    status,
    display: displayForClaimStatus(status),
  };
}
