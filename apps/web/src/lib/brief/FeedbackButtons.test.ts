import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBriefFetchMock, jsonResponse } from '$lib/brief/fetchMock';
import {
	FEEDBACK_COMMENT_MAX,
	feedbackEntry,
	feedbackListBody,
	feedbackSavedBody,
	type FeedbackEntry,
} from '$lib/brief/fixtures';
import FeedbackButtons, { resetFeedbackCache } from './FeedbackButtons.svelte';

type Mock = ReturnType<typeof installBriefFetchMock>;
let active: Mock | null = null;
let next: (method: string) => Response = () => jsonResponse(500, { ok: false });

const entry = (itemId: string, signal: FeedbackEntry['signal'], comment = ''): FeedbackEntry =>
	feedbackEntry({ id: `fb-${itemId}`, itemId, signal, comment });

/** Fresh cache per test; GET returns `existing`, other methods go through `next`. */
async function mount(itemId: string, existing: FeedbackEntry[] = []) {
	resetFeedbackCache();
	const mock = installBriefFetchMock(({ method }) =>
		method === 'GET' ? jsonResponse(200, feedbackListBody(existing)) : next(method),
	);
	active = mock;
	const view = render(FeedbackButtons, { props: { itemId } });
	await vi.waitFor(() => expect(mock.calls.length).toBeGreaterThan(0));
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
	return { ...mock, view };
}

const like = () => screen.getByRole('button', { name: 'Like' });
const notRelevant = () => screen.getByRole('button', { name: 'Not relevant' });
const commentBox = () => screen.findByLabelText('Comment (optional)') as Promise<HTMLTextAreaElement>;

afterEach(() => {
	active?.restore();
	active = null;
	next = () => jsonResponse(500, { ok: false });
});

describe('FeedbackButtons: toggle / switch / clear', () => {
	it('renders unpressed toggles and GETs /api/feedback once with credentials', async () => {
		const { calls } = await mount('story-1');
		expect(like()).toHaveAttribute('aria-pressed', 'false');
		expect(notRelevant()).toHaveAttribute('aria-pressed', 'false');
		expect(calls).toEqual([
			{ url: '/api/feedback', method: 'GET', body: undefined, credentials: 'include' },
		]);
	});

	it('matches the loaded entry to the card by itemId', async () => {
		await mount('story-1', [entry('story-1', 'not_relevant'), entry('other', 'like')]);
		expect(notRelevant()).toHaveAttribute('aria-pressed', 'true');
		expect(like()).toHaveAttribute('aria-pressed', 'false');
	});

	it('first click POSTs the signal, presses the button and opens the comment box', async () => {
		const { calls } = await mount('story-1');
		next = () => jsonResponse(201, feedbackSavedBody(entry('story-1', 'like')));
		await fireEvent.click(like());
		await vi.waitFor(() => expect(like()).toHaveAttribute('aria-pressed', 'true'));
		expect(calls.at(-1)).toMatchObject({
			url: '/api/feedback',
			method: 'POST',
			body: { itemId: 'story-1', signal: 'like' },
			credentials: 'include',
		});
		expect(await commentBox()).toBeInTheDocument();
	});

	it('clicking the other button PATCHes the signal', async () => {
		const { calls } = await mount('story-1', [entry('story-1', 'like')]);
		// Asserted locally: the PATCH reply is a saved body with replaced=true.
		next = () => jsonResponse(200, feedbackSavedBody(entry('story-1', 'not_relevant'), true));
		await fireEvent.click(notRelevant());
		await vi.waitFor(() => expect(notRelevant()).toHaveAttribute('aria-pressed', 'true'));
		expect(calls.at(-1)).toMatchObject({
			url: '/api/feedback/fb-story-1',
			method: 'PATCH',
			body: { signal: 'not_relevant' },
		});
		expect(like()).toHaveAttribute('aria-pressed', 'false');
	});

	it('clicking the active button DELETEs it and closes the comment box', async () => {
		const { calls } = await mount('story-1', [entry('story-1', 'like')]);
		next = () => jsonResponse(200, { ok: true, removed: true });
		await fireEvent.click(like());
		await vi.waitFor(() => expect(like()).toHaveAttribute('aria-pressed', 'false'));
		expect(calls.at(-1)).toMatchObject({ url: '/api/feedback/fb-story-1', method: 'DELETE' });
		expect(screen.queryByLabelText('Comment (optional)')).not.toBeInTheDocument();
	});

	it('shows a failed choice in place and leaves the button state alone', async () => {
		await mount('story-1');
		next = () => jsonResponse(404, { ok: false, error: 'item not found' });
		await fireEvent.click(like());
		expect(await screen.findByRole('alert')).toHaveTextContent('item not found');
		expect(like()).toHaveAttribute('aria-pressed', 'false');
	});

	it('hides 5xx server text behind the fallback message', async () => {
		await mount('story-1');
		next = () => jsonResponse(500, { ok: false, error: '/srv/data/feedback.json EACCES' });
		await fireEvent.click(like());
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Could not save feedback. Try again.',
		);
	});
});

describe('FeedbackButtons: comment box', () => {
	async function openBox() {
		const mock = await mount('story-1');
		next = () => jsonResponse(201, feedbackSavedBody(entry('story-1', 'like')));
		await fireEvent.click(like());
		return { ...mock, box: await commentBox() };
	}

	it('shows a live counter and caps the field at the comment max', async () => {
		const { box } = await openBox();
		expect(box).toHaveAttribute('maxlength', String(FEEDBACK_COMMENT_MAX));
		expect(screen.getByText('0 / 500')).toBeInTheDocument();
		await fireEvent.input(box, { target: { value: 'hello' } });
		expect(screen.getByText('5 / 500')).toBeInTheDocument();
	});

	it('Cancel closes the box without a request', async () => {
		const { calls } = await openBox();
		const before = calls.length;
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByLabelText('Comment (optional)')).not.toBeInTheDocument();
		expect(calls.length).toBe(before);
		expect(like()).toHaveAttribute('aria-pressed', 'true');
	});

	it('Save PATCHes the comment and closes the box', async () => {
		const { calls, box } = await openBox();
		await fireEvent.input(box, { target: { value: 'old news' } });
		next = () => jsonResponse(200, feedbackSavedBody(entry('story-1', 'like', 'old news'), true));
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await vi.waitFor(() =>
			expect(screen.queryByLabelText('Comment (optional)')).not.toBeInTheDocument(),
		);
		expect(calls.at(-1)).toMatchObject({
			url: '/api/feedback/fb-story-1',
			method: 'PATCH',
			body: { comment: 'old news' },
		});
	});

	it('shows the server error and keeps the typed comment', async () => {
		const { box } = await openBox();
		await fireEvent.input(box, { target: { value: 'keep me' } });
		next = () =>
			jsonResponse(400, { ok: false, error: 'comment must be 500 characters or fewer' });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'comment must be 500 characters or fewer',
		);
		expect(box.value).toBe('keep me');
	});
});

describe('FeedbackButtons: shared GET', () => {
	it('two cards on one page share a single GET', async () => {
		const { calls } = await mount('story-1', [entry('story-2', 'like')]);
		render(FeedbackButtons, { props: { itemId: 'story-2' } });
		await tick();
		expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1);
		expect(screen.getAllByRole('button', { name: 'Like' })[1]).toHaveAttribute(
			'aria-pressed',
			'true',
		);
	});
});

describe('FeedbackButtons: a11y', () => {
	it('groups the toggles under a labelled group', async () => {
		await mount('story-1');
		expect(screen.getByRole('group', { name: 'Feedback on this story' })).toContainElement(like());
	});

	it('labels the textarea and ties the counter via aria-describedby', async () => {
		await mount('story-1');
		next = () => jsonResponse(201, feedbackSavedBody(entry('story-1', 'like')));
		await fireEvent.click(like());
		const box = await commentBox();
		await fireEvent.input(box, { target: { value: 'hello' } });
		const counter = screen.getByText('5 / 500');
		expect(box.getAttribute('aria-describedby')).toBe(counter.id);
		expect(counter).toHaveAttribute('aria-live', 'polite');
	});

	it('keeps page shortcuts out: keydown inside does not reach window', async () => {
		await mount('story-1');
		const pageKeydown = vi.fn();
		window.addEventListener('keydown', pageKeydown);
		try {
			await fireEvent.keyDown(like(), { key: 'j' });
			expect(pageKeydown).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('keydown', pageKeydown);
		}
	});

	it('Escape cancels an open comment box', async () => {
		await mount('story-1');
		next = () => jsonResponse(201, feedbackSavedBody(entry('story-1', 'like')));
		await fireEvent.click(like());
		const box = await commentBox();
		await fireEvent.keyDown(box, { key: 'Escape' });
		expect(screen.queryByLabelText('Comment (optional)')).not.toBeInTheDocument();
	});
});
