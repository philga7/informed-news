import { isUnresolvedGoogleNewsUrl } from '../../../store/citationSourcesStore.js';
import type {
  CitationCheckResult,
  CitationCheckStatus,
  CitationSourceRecord,
} from '../../../types/citationGuard.js';

/**
 * Comparison key for citation URLs: trim; http compares as https; trailing
 * slash dropped on non-root paths; `utm_*` query keys dropped, others kept.
 * Unparseable strings stay trimmed.
 */
export function normalizeCitationUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    }
    const kept = [...parsed.searchParams.entries()].filter(
      ([key]) => !key.toLowerCase().startsWith('utm_'),
    );
    parsed.search = '';
    for (const [key, value] of kept) parsed.searchParams.append(key, value);
    return parsed.href;
  } catch {
    return trimmed;
  }
}

export function displayForUrlStatus(status: CitationCheckStatus): CitationCheckResult['display'] {
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
