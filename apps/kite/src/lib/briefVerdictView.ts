/** NEWS-167: Approved / Filtered / All toggle on the Brief (ephemeral; default Approved). */

export const BRIEF_VERDICT_VIEWS = ['approved', 'filtered', 'all'] as const;
export type BriefVerdictView = (typeof BRIEF_VERDICT_VIEWS)[number];

export const BRIEF_VERDICT_VIEW_LABEL: Record<BriefVerdictView, string> = {
	approved: 'Approved',
	filtered: 'Filtered',
	all: 'All',
};

export const DEFAULT_BRIEF_VERDICT_VIEW: BriefVerdictView = 'approved';

export function parseBriefVerdictView(raw: unknown): BriefVerdictView {
	return raw === 'filtered' || raw === 'all' ? raw : 'approved';
}

export function showsApproved(view: BriefVerdictView): boolean {
	return view === 'approved' || view === 'all';
}

export function showsFiltered(view: BriefVerdictView): boolean {
	return view === 'filtered' || view === 'all';
}
