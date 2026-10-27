import type {
  CitationCheckResult,
  CitationSourceRecord,
} from '../../../types/citationGuard.js';
import { matchQuoteInSources } from '../matchQuote.js';

/**
 * Check a quoted line against the current run's citation source texts.
 * Does not call the network; does not mutate any payload.
 */
export function resolveQuoteCitation(
  quote: string | null | undefined,
  sourcesForRun: CitationSourceRecord[],
  options?: { id?: string },
): CitationCheckResult {
  const outcome = matchQuoteInSources(quote, sourcesForRun);
  return {
    kind: 'quote',
    status: outcome.status,
    display: outcome.display,
    quote: typeof quote === 'string' ? quote : null,
    ...(options?.id !== undefined ? { id: options.id } : {}),
  };
}
