import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it } from 'vitest';
import VerdictReasonExpander from '../VerdictReasonExpander.svelte';

describe('VerdictReasonExpander (NEWS-167)', () => {
	it('exposes an advisory region and opens via keyboard on the summary', async () => {
		render(VerdictReasonExpander, {
			props: {
				reasonText: 'Kept for topic Energy grid.',
				criteriaRef: 'topic:e2e-topic-grid',
			},
		});

		const details = screen.getByTestId('verdict-reason-expander');
		expect(details).not.toHaveAttribute('open');

		const summary = screen.getByText('Why this verdict');
		summary.focus();
		await fireEvent.keyDown(summary, { key: 'Enter' });
		await tick();
		// Native <details> toggles on click; keyboard activation goes through click on summary.
		await fireEvent.click(summary);
		await tick();

		expect(details).toHaveAttribute('open');
		expect(screen.getByRole('region', { name: 'Advisory triage reason' })).toBeVisible();
		expect(screen.getByText('Kept for topic Energy grid.')).toBeVisible();
		expect(screen.getByTestId('verdict-reason-advisory')).toHaveTextContent(
			'Advisory — AI-assisted judgment, not ground truth',
		);
		expect(screen.getByText('topic:e2e-topic-grid')).toBeVisible();
	});

	it('omits criteriaRef when absent', () => {
		render(VerdictReasonExpander, {
			props: { reasonText: 'Muted by rule or undesired topic gossip.' },
		});
		expect(screen.queryByText(/topic:/)).not.toBeInTheDocument();
		expect(screen.getByText('Muted by rule or undesired topic gossip.')).toBeInTheDocument();
	});
});
