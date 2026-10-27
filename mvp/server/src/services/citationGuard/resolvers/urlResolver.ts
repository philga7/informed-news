import { isUnresolvedGoogleNewsUrl } from '../../../store/citationSourcesStore.js';
import type {
  CitationCheckResult,
  CitationCheckStatus,
  CitationSourceRecord,
} from '../../../types/citationGuard.js';

/**
 * Normalize a URL for citation matching: trim, then absolute `URL.href`
 * when parseable; otherwise the trimmed string.
 */
export function normalizeCitationUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).href;
  } catch {
    return trimmed;
  }
}

function displayForUrlStatus(status: CitationCheckStatus): CitationCheckResult['display'] {
  switch (status) {
    case 'match':
      return 'ok';
    case 'mismatch':
    case 'missing-source':
      return 'unverified';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Check an outbound link against the current run's citation sources.
 * Unresolved Google News URLs are never sources → missing-source / unverified.
 * Does not call the network; does not mutate any payload.
 */
export function resolveUrlCitation(
  url: string | null | undefined,
  sourcesForRun: CitationSourceRecord[],
  options?: { id?: string },
): CitationCheckResult {
  const raw = typeof url === 'string' ? url : '';
  const resultBase: Pick<CitationCheckResult, 'kind' | 'url' | 'id'> = {
    kind: 'url',
    url: typeof url === 'string' ? url : null,
    ...(options?.id !== undefined ? { id: options.id } : {}),
  };

  if (!raw.trim() || isUnresolvedGoogleNewsUrl(raw)) {
    const status = 'missing-source' as const;
    return {
      ...resultBase,
      status,
      display: displayForUrlStatus(status),
    };
  }

  const normalized = normalizeCitationUrl(raw);
  const matched = sourcesForRun.some((source) => {
    if (typeof source.url !== 'string' || !source.url.trim()) return false;
    return normalizeCitationUrl(source.url) === normalized;
  });

  const status: CitationCheckStatus = matched ? 'match' : 'missing-source';
  return {
    ...resultBase,
    status,
    display: displayForUrlStatus(status),
  };
}
