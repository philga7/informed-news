import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFeedbackCriteriaCache } from './FeedbackCriteriaLink.svelte';
import VerdictReasonExpander from './VerdictReasonExpander.svelte';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

describe('VerdictReasonExpander (NEWS-167)', () => {
	beforeEach(() => {
		resetFeedbackCriteriaCache();
		vi.unstubAllGlobals();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

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

	it('renders feedback criteriaRef as a link and keeps other refs plain text', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			jsonResponse(200, {
				entries: [{ id: 'fb-1', itemId: 'story-1', signal: 'like', comment: '' }],
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		render(VerdictReasonExpander, {
			props: {
				reasonText: 'Filtered after feedback.',
				criteriaRef: 'feedback:fb-1',
			},
		});
		await vi.waitFor(() =>
			expect(screen.getByTestId('feedback-criteria-link')).toBeInTheDocument(),
		);
		expect(screen.getByRole('link', { name: 'feedback:fb-1' })).toHaveAttribute(
			'href',
			'/feedback#fb-1',
		);

		render(VerdictReasonExpander, {
			props: {
				reasonText: 'Kept for topic.',
				criteriaRef: 'topic:e2e-topic-grid',
			},
		});
		expect(screen.getByText('topic:e2e-topic-grid')).toBeInTheDocument();
		expect(screen.queryAllByTestId('feedback-criteria-link')).toHaveLength(1);
	});
});
