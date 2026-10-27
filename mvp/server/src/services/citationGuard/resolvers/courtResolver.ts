import type {
  CitationCheckItem,
  CitationCheckResult,
  CitationSourceRecord,
} from '../../../types/citationGuard.js';

/**
 * NEWS-173 hook: court citation stub.
 * Always returns missing-source / unverified until CourtListener / RECAP checks land.
 * Uses only existing status/display unions — no new terminal states.
 * Does not call the network; does not mutate any payload.
 */
export function resolveCourtCitation(
  item: CitationCheckItem,
  _sourcesForRun: CitationSourceRecord[],
): CitationCheckResult {
  const status = 'missing-source' as const;
  return {
    kind: 'court',
    status,
    display: 'unverified',
    ...(item.url !== undefined ? { url: item.url } : {}),
    ...(item.id !== undefined ? { id: item.id } : {}),
  };
}
