import type {
  CitationCheckResult,
  CitationCheckStatus,
  CitationSourceRecord,
} from '../../types/citationGuard.js';
import { normalizeQuote } from './normalizeQuote.js';

function displayForQuoteStatus(status: CitationCheckStatus): CitationCheckResult['display'] {
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

function hasUsableText(source: CitationSourceRecord): boolean {
  return typeof source.text === 'string' && normalizeQuote(source.text).length > 0;
}

export type QuoteMatchOutcome = {
  status: CitationCheckStatus;
  display: CitationCheckResult['display'];
};

/**
 * Match a candidate quote against full source texts for the current run.
 * Contiguous substring after normalize → match; else mismatch.
 * Empty run set / no usable text → missing-source.
 */
export function matchQuoteInSources(
  quote: string | null | undefined,
  sourcesForRun: CitationSourceRecord[],
): QuoteMatchOutcome {
  const usable = sourcesForRun.filter(hasUsableText);
  if (usable.length === 0) {
    const status = 'missing-source' as const;
    return { status, display: displayForQuoteStatus(status) };
  }

  const raw = typeof quote === 'string' ? quote : '';
  const normalizedQuote = normalizeQuote(raw);
  if (!normalizedQuote) {
    const status = 'missing-source' as const;
    return { status, display: displayForQuoteStatus(status) };
  }

  const matched = usable.some((source) =>
    normalizeQuote(source.text).includes(normalizedQuote),
  );
  const status: CitationCheckStatus = matched ? 'match' : 'mismatch';
  return { status, display: displayForQuoteStatus(status) };
}
