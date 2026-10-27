import type {
  CitationCheckItem,
  CitationCheckResult,
  CitationCheckStatus,
  CitationKind,
  CitationSourceRecord,
} from '../../types/citationGuard.js';
import { resolveUrlCitation } from './resolvers/urlResolver.js';

export type CitationResolver = (
  item: CitationCheckItem,
  sourcesForRun: CitationSourceRecord[],
) => CitationCheckResult;

function displayForUnresolvedKind(
  kind: CitationKind,
  status: CitationCheckStatus,
): CitationCheckResult['display'] {
  switch (status) {
    case 'match':
      return 'ok';
    case 'mismatch':
      return 'unverified';
    case 'missing-source':
      switch (kind) {
        case 'claim':
          return 'unconfirmed';
        case 'url':
        case 'quote':
        case 'court':
          return 'unverified';
        default: {
          const _exhaustiveKind: never = kind;
          return _exhaustiveKind;
        }
      }
    default: {
      const _exhaustiveStatus: never = status;
      return _exhaustiveStatus;
    }
  }
}

/** Keep only sources registered under `runId`. */
export function filterCitationSourcesForRun(
  sources: CitationSourceRecord[] | Record<string, CitationSourceRecord>,
  runId: string,
): CitationSourceRecord[] {
  const list = Array.isArray(sources) ? sources : Object.values(sources);
  return list.filter((s) => s.runId === runId);
}

function resolveUrlItem(
  item: CitationCheckItem,
  sourcesForRun: CitationSourceRecord[],
): CitationCheckResult {
  return resolveUrlCitation(item.url, sourcesForRun, {
    ...(item.id !== undefined ? { id: item.id } : {}),
  });
}

/**
 * Kind → resolver map. Task 2 registers `url` only; quote/claim/court plug in later.
 */
export const citationResolvers: Partial<Record<CitationKind, CitationResolver>> = {
  url: resolveUrlItem,
};

/**
 * Run citation checks for items against the current run's sources.
 * Only `url` is handled in Task 2; other kinds without a resolver return
 * missing-source (display unverified / unconfirmed by kind).
 * Structured results only — never mutates the input payload.
 */
export function checkCitationItems(
  items: CitationCheckItem[],
  sourcesForRun: CitationSourceRecord[],
): CitationCheckResult[] {
  return items.map((item) => {
    const resolver = citationResolvers[item.kind];
    if (resolver) return resolver(item, sourcesForRun);

    const status = 'missing-source' as const;
    return {
      kind: item.kind,
      status,
      display: displayForUnresolvedKind(item.kind, status),
      ...(item.url !== undefined ? { url: item.url } : {}),
      ...(item.id !== undefined ? { id: item.id } : {}),
    };
  });
}
