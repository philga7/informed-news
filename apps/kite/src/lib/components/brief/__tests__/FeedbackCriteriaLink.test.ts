import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackCriteriaLink, {
	resetFeedbackCriteriaCache,
} from '../FeedbackCriteriaLink.svelte';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

describe('FeedbackCriteriaLink', () => {
	beforeEach(() => {
		resetFeedbackCriteriaCache();
		vi.unstubAllGlobals();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('renders a link when the id is in the GET body', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			jsonResponse(200, {
				entries: [{ id: 'fb-1', itemId: 'story-1', signal: 'like', comment: '' }],
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		render(FeedbackCriteriaLink, { props: { feedbackId: 'fb-1' } });
		await vi.waitFor(() => expect(screen.getByTestId('feedback-criteria-link')).toBeInTheDocument());

		const link = screen.getByRole('link', { name: 'feedback:fb-1' });
		expect(link).toHaveAttribute('href', '/feedback#fb-1');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/feedback', { credentials: 'include' });
	});

	it('shows feedback removed when the id is absent from entries', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			jsonResponse(200, {
				entries: [{ id: 'other-id', itemId: 'story-2', signal: 'not_relevant', comment: '' }],
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		render(FeedbackCriteriaLink, { props: { feedbackId: 'missing-id' } });
		await vi.waitFor(() =>
			expect(screen.getByTestId('feedback-criteria-removed')).toHaveTextContent('feedback removed'),
		);
		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('keeps raw feedback:id text when GET returns 500', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(500, { error: 'server error' }));
		vi.stubGlobal('fetch', fetchMock);

		render(FeedbackCriteriaLink, { props: { feedbackId: 'fb-1' } });
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		await tick();

		expect(screen.getByText('feedback:fb-1')).toBeInTheDocument();
		expect(screen.queryByTestId('feedback-criteria-link')).not.toBeInTheDocument();
		expect(screen.queryByTestId('feedback-criteria-removed')).not.toBeInTheDocument();
	});

	it('two mounted links share a single GET', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(
			jsonResponse(200, {
				entries: [
					{ id: 'fb-a', itemId: 'a', signal: 'like', comment: '' },
					{ id: 'fb-b', itemId: 'b', signal: 'like', comment: '' },
				],
			}),
		);
		vi.stubGlobal('fetch', fetchMock);

		render(FeedbackCriteriaLink, { props: { feedbackId: 'fb-a' } });
		render(FeedbackCriteriaLink, { props: { feedbackId: 'fb-b' } });
		await vi.waitFor(() => expect(screen.getAllByTestId('feedback-criteria-link')).toHaveLength(2));

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
