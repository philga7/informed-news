import type {
  CitationCheckItem,
  CitationCheckResult,
  CitationSourceRecord,
} from '../../../types/citationGuard.js';

/**
 * Court citation check (NEWS-173). Reads the attachment the guard run put on the
 * item; does no I/O and never mutates its input.
 */
export function resolveCourtCitation(
  item: CitationCheckItem,
  _sourcesForRun: CitationSourceRecord[],
): CitationCheckResult {
  const base = {
    kind: 'court' as const,
    ...(item.url !== undefined ? { url: item.url } : {}),
    ...(item.id !== undefined ? { id: item.id } : {}),
    ...(item.citation !== undefined ? { citation: item.citation } : {}),
    ...(item.volume !== undefined ? { volume: item.volume } : {}),
    ...(item.reporter !== undefined ? { reporter: item.reporter } : {}),
    ...(item.page !== undefined ? { page: item.page } : {}),
  };
  const attachment = item.courtAttachment;
  if (attachment?.status === 'resolved' && attachment.courtRecordUrl) {
    return {
      ...base,
      status: 'match',
      display: 'ok',
      courtRecordUrl: attachment.courtRecordUrl,
      procedural: attachment.procedural,
    };
  }
  return { ...base, status: 'missing-source', display: 'unverified' };
}
