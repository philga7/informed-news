import type {
  CitationCheckItem,
  CitationCheckResult,
  CitationCheckStatus,
  CitationKind,
  CitationSourceRecord,
} from '../../types/citationGuard.js';
import { resolveClaimCitation } from './resolvers/claimResolver.js';
import { resolveCourtCitation } from './resolvers/courtResolver.js';
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

function resolveClaimItem(
  item: CitationCheckItem,
  sourcesForRun: CitationSourceRecord[],
): CitationCheckResult {
  return resolveClaimCitation(item.refutingUrl, sourcesForRun, {
    ...(item.id !== undefined ? { id: item.id } : {}),
    ...(item.claimText !== undefined ? { claimText: item.claimText } : {}),
  });
}

/**
 * Kind → resolver map. `url`, `quote`, `claim`, and `court` (NEWS-173 stub) registered.
 */
export const citationResolvers: Partial<Record<CitationKind, CitationResolver>> = {
  url: resolveUrlItem,
  quote: resolveQuoteItem,
  claim: resolveClaimItem,
  court: resolveCourtCitation,
};

/**
 * Run citation checks for items against the current run's sources.
 * Registered kinds resolve via the map; unknown kinds without a resolver return
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
      ...(item.refutingUrl !== undefined ? { refutingUrl: item.refutingUrl } : {}),
      ...(item.claimText !== undefined ? { claimText: item.claimText } : {}),
      ...(item.id !== undefined ? { id: item.id } : {}),
    };
  });
}
