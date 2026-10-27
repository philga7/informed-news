import type {
  CitationCheckItem,
  CitationCheckResult,
  CitationCheckStatus,
  CitationKind,
  CitationSourceRecord,
} from '../../types/citationGuard.js';
import { resolveQuoteCitation } from './resolvers/quoteResolver.js';
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

function resolveQuoteItem(
  item: CitationCheckItem,
  sourcesForRun: CitationSourceRecord[],
): CitationCheckResult {
  return resolveQuoteCitation(item.quote, sourcesForRun, {
    ...(item.id !== undefined ? { id: item.id } : {}),
  });
}

/**
 * Kind → resolver map. Task 3 registers `url` and `quote`; claim/court plug in later.
 */
export const citationResolvers: Partial<Record<CitationKind, CitationResolver>> = {
  url: resolveUrlItem,
  quote: resolveQuoteItem,
};

/**
 * Run citation checks for items against the current run's sources.
 * `url` and `quote` are handled; other kinds without a resolver return
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
      ...(item.quote !== undefined ? { quote: item.quote } : {}),
      ...(item.id !== undefined ? { id: item.id } : {}),
    };
  });
}
