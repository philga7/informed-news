import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import BriefRefreshBar from '../BriefRefreshBar.svelte';

const refresh = {
	last: null,
	lastSuccess: null,
	nextAt: null,
	intervalHours: null,
	running: false,
};

describe('BriefRefreshBar verdict toggle (NEWS-167)', () => {
	it('uses a segmented control (group + aria-pressed), not radios', async () => {
		const onVerdictViewChange = vi.fn();
		render(BriefRefreshBar, {
			props: {
				refresh,
				filteredOut: 2,
				verdictView: 'approved',
				onVerdictViewChange,
			},
		});

		const group = screen.getByRole('group', { name: 'Brief verdict view' });
		expect(group).toBeInTheDocument();
		expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
		expect(screen.queryByRole('radio')).not.toBeInTheDocument();

		const approved = screen.getByRole('button', { name: 'Approved', pressed: true });
		const filtered = screen.getByRole('button', { name: 'Filtered', pressed: false });
		const all = screen.getByRole('button', { name: 'All', pressed: false });
		expect(approved).toBeVisible();
		expect(filtered).toBeVisible();
		expect(all).toBeVisible();

		await fireEvent.click(filtered);
		expect(onVerdictViewChange).toHaveBeenCalledWith('filtered');
	});
});
