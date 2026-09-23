import type { ClaimStatus, EvidenceLink } from '../types/claim.js';

/** Ignore evidence below this confidence when deriving status. */
export const CONFIDENCE_FLOOR = 0.5;
/** Minimum confidence for a primary support to yield supported_by_primary. */
export const PRIMARY_SUPPORT_FLOOR = 0.6;

function qualifyingLinks(links: readonly EvidenceLink[]): EvidenceLink[] {
  return links.filter((l) => l.confidence >= CONFIDENCE_FLOOR);
}

export function deriveClaimStatus(links: readonly EvidenceLink[]): ClaimStatus {
  const qualifying = qualifyingLinks(links);

  const qualifyingSupports = qualifying.filter((l) => l.stance === 'supports');
  const qualifyingContradicts = qualifying.filter((l) => l.stance === 'contradicts');

  const isContested =
    qualifyingSupports.length > 0 && qualifyingContradicts.length > 0;
  if (isContested) return 'contested';

  const hasPrimarySupport =
    qualifyingSupports.some(
      (l) =>
        l.sourceTier === 'primary' && l.confidence >= PRIMARY_SUPPORT_FLOOR,
    );
  if (hasPrimarySupport) return 'supported_by_primary';

  const hasQualifyingNonMention =
    qualifyingSupports.length > 0 || qualifyingContradicts.length > 0;
  if (!hasQualifyingNonMention) return 'insufficient_evidence';

  return 'reported';
}
