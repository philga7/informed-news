/**
 * NEWS-172 / NEWS-173 citation guard marks: slim type and advisory copy helpers.
 * Ported from apps/kite (`$lib/types`, `$lib/topicBrief`) so apps/web does not
 * depend on the Kite tree.
 */

/** Slim citation-guard mark on a Brief story (NEWS-172). */
export type InformedCitationMark = {
	kind: 'url' | 'quote' | 'claim' | 'court';
	status: 'match' | 'mismatch' | 'missing-source';
	display: 'ok' | 'unverified' | 'unconfirmed';
	itemId: string;
	url?: string | null;
	/** NEWS-173: CourtListener record page when it differs from `url`. */
	courtRecordUrl?: string | null;
	/** NEWS-173: the matched court record is a procedural disposition. */
	procedural?: boolean;
};

export const CITATION_MARK_SUMMARY = 'Citation checks';
export const CITATION_MARK_REGION_LABEL = 'Advisory citation marks';
export const CITATION_MARK_UNVERIFIED_LINK = 'Unverified link';
export const CITATION_MARK_UNVERIFIED_QUOTE = 'Unverified quote';
export const CITATION_MARK_UNCONFIRMED = 'Unconfirmed';
export const CITATION_MARK_ADVISORY_SUFFIX = '(advisory)';
export const CITATION_MARK_UNVERIFIED_CITATION = 'Unverified citation';
export const CITATION_MARK_PROCEDURAL = 'Dismissed on procedure, not on the merits';
export const CITATION_MARK_DETAIL_UNVERIFIED = 'This did not match a source from this run.';
export const CITATION_MARK_DETAIL_UNCONFIRMED = 'No linked refuting source from this run.';
export const CITATION_MARK_COURT_RECORD_LINK = 'CourtListener record';

/** Extra CourtListener link only when it points somewhere other than `url`. */
export function citationMarkCourtRecordUrl(mark: InformedCitationMark): string | null {
	const record = mark.courtRecordUrl?.trim();
	if (!record || record === mark.url) return null;
	return record;
}

/** A court mark whose CourtListener record page differs from the original link. */
export function hasCourtRecordLink(mark: InformedCitationMark): boolean {
	return mark.kind === 'court' && citationMarkCourtRecordUrl(mark) !== null;
}

/**
 * Unverified, unconfirmed, and procedural marks (even when display is ok), plus
 * court marks that offer a CourtListener record link. Other ok marks stay hidden.
 */
export function visibleCitationMarks(
	marks: InformedCitationMark[] | null | undefined,
): InformedCitationMark[] {
	if (!marks?.length) return [];
	return marks.filter(
		(m) =>
			m.procedural === true ||
			m.display === 'unverified' ||
			m.display === 'unconfirmed' ||
			hasCourtRecordLink(m),
	);
}

/** Visible label for a citation mark (no advisory suffix). */
export function citationMarkVisibleLabel(mark: InformedCitationMark): string | null {
	if (mark.procedural === true) return CITATION_MARK_PROCEDURAL;
	switch (mark.display) {
		case 'ok':
			return hasCourtRecordLink(mark) ? CITATION_MARK_COURT_RECORD_LINK : null;
		case 'unverified':
			switch (mark.kind) {
				case 'url':
					return CITATION_MARK_UNVERIFIED_LINK;
				case 'court':
					return CITATION_MARK_UNVERIFIED_CITATION;
				case 'quote':
					return CITATION_MARK_UNVERIFIED_QUOTE;
				case 'claim':
					return CITATION_MARK_UNCONFIRMED;
				default: {
					const _exhaustive: never = mark.kind;
					return _exhaustive;
				}
			}
		case 'unconfirmed':
			return CITATION_MARK_UNCONFIRMED;
		default: {
			const _exhaustive: never = mark.display;
			return _exhaustive;
		}
	}
}

/** Screen-reader accessible name including advisory wording. */
export function citationMarkAccessibleName(mark: InformedCitationMark): string | null {
	const label = citationMarkVisibleLabel(mark);
	if (!label) return null;
	return `${label} ${CITATION_MARK_ADVISORY_SUFFIX}`;
}

/** Expander detail sentence, or null when the label already says everything. */
export function citationMarkDetail(mark: InformedCitationMark): string | null {
	if (mark.procedural === true) return CITATION_MARK_PROCEDURAL;
	switch (mark.display) {
		case 'ok':
			return null;
		case 'unverified':
			return CITATION_MARK_DETAIL_UNVERIFIED;
		case 'unconfirmed':
			return CITATION_MARK_DETAIL_UNCONFIRMED;
		default: {
			const _exhaustive: never = mark.display;
			return _exhaustive;
		}
	}
}
