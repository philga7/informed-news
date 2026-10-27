import { describe, expect, it } from 'vitest';
import {
	BRIEF_VERDICT_VIEW_LABEL,
	BRIEF_VERDICT_VIEWS,
	DEFAULT_BRIEF_VERDICT_VIEW,
	parseBriefVerdictView,
	showsApproved,
	showsFiltered,
	type BriefVerdictView,
} from '$lib/briefVerdictView';

describe('briefVerdictView (NEWS-167)', () => {
	it('defaults to Approved and lists all three views', () => {
		expect(DEFAULT_BRIEF_VERDICT_VIEW).toBe('approved');
		expect([...BRIEF_VERDICT_VIEWS]).toEqual(['approved', 'filtered', 'all']);
		expect(BRIEF_VERDICT_VIEW_LABEL.approved).toBe('Approved');
		expect(BRIEF_VERDICT_VIEW_LABEL.filtered).toBe('Filtered');
		expect(BRIEF_VERDICT_VIEW_LABEL.all).toBe('All');
	});

	it('parseBriefVerdictView accepts filtered and all; everything else is approved', () => {
		expect(parseBriefVerdictView('filtered')).toBe('filtered');
		expect(parseBriefVerdictView('all')).toBe('all');
		expect(parseBriefVerdictView('approved')).toBe('approved');
		expect(parseBriefVerdictView(undefined)).toBe('approved');
		expect(parseBriefVerdictView(null)).toBe('approved');
		expect(parseBriefVerdictView('bogus')).toBe('approved');
		expect(parseBriefVerdictView(1)).toBe('approved');
	});

	it('showsApproved / showsFiltered cover Approved, Filtered, and All without overlap bugs', () => {
		const cases: Array<{
			view: BriefVerdictView;
			approved: boolean;
			filtered: boolean;
		}> = [
			{ view: 'approved', approved: true, filtered: false },
			{ view: 'filtered', approved: false, filtered: true },
			{ view: 'all', approved: true, filtered: true },
		];
		for (const { view, approved, filtered } of cases) {
			expect(showsApproved(view)).toBe(approved);
			expect(showsFiltered(view)).toBe(filtered);
		}
	});
});
