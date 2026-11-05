import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackButtons, { resetFeedbackCache } from '../FeedbackButtons.svelte';

type Entry = { id: string; itemId: string; signal: string; comment: string };

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

function entry(itemId: string, signal: string, comment = '', id = `fb-${itemId}`): Entry {
	return { id, itemId, signal, comment };
}

/** Fresh module so the page-load GET cache starts empty in every test. */
async function mount(itemId: string, existing: Entry[] = []) {
	resetFeedbackCache();
	const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: true, entries: existing }));
	vi.stubGlobal('fetch', fetchMock);
	const view = render(FeedbackButtons, { props: { itemId } });
	await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
	return { fetchMock, view, FeedbackButtons };
}

const like = () => screen.getByRole('button', { name: 'Like' });
const notRelevant = () => screen.getByRole('button', { name: 'Not relevant' });

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
	const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
	return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

describe('FeedbackButtons', () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('renders two toggle buttons, unpressed with no saved feedback, and GETs /api/feedback once', async () => {
		const { fetchMock } = await mount('a1');
		expect(like()).toHaveAttribute('aria-pressed', 'false');
		expect(notRelevant()).toHaveAttribute('aria-pressed', 'false');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(lastCall(fetchMock)).toMatchObject({ url: '/api/feedback', method: 'GET' });
	});

	it('matches the loaded entry to the card by itemId', async () => {
		await mount('a1', [entry('a1', 'not_relevant'), entry('other', 'like')]);
		expect(notRelevant()).toHaveAttribute('aria-pressed', 'true');
		expect(like()).toHaveAttribute('aria-pressed', 'false');
	});

	it('two cards on one page share a single GET', async () => {
		const { fetchMock, FeedbackButtons } = await mount('a1', [entry('b2', 'like')]);
		render(FeedbackButtons, { props: { itemId: 'b2' } });
		await tick();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(screen.getAllByRole('button', { name: 'Like' })[1]).toHaveAttribute('aria-pressed', 'true');
	});

	it('first click POSTs the signal, presses the button and opens the comment box', async () => {
		const { fetchMock } = await mount('a1');
		fetchMock.mockResolvedValueOnce(
			jsonResponse(201, { ok: true, replaced: false, entry: entry('a1', 'like') }),
		);
		await fireEvent.click(like());
		await vi.waitFor(() => expect(like()).toHaveAttribute('aria-pressed', 'true'));
		expect(lastCall(fetchMock)).toEqual({
			url: '/api/feedback',
			method: 'POST',
			body: { itemId: 'a1', signal: 'like' },
		});
		expect(screen.getByLabelText('Comment (optional)')).toBeInTheDocument();
	});

	it('clicking the other button PATCHes the signal', async () => {
		const { fetchMock } = await mount('a1', [entry('a1', 'like')]);
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, entry: entry('a1', 'not_relevant') }));
		await fireEvent.click(notRelevant());
		await vi.waitFor(() => expect(notRelevant()).toHaveAttribute('aria-pressed', 'true'));
		expect(lastCall(fetchMock)).toEqual({
			url: '/api/feedback/fb-a1',
			method: 'PATCH',
			body: { signal: 'not_relevant' },
		});
		expect(like()).toHaveAttribute('aria-pressed', 'false');
	});

	it('clicking the active button DELETEs it and closes the comment box', async () => {
		const { fetchMock } = await mount('a1', [entry('a1', 'like')]);
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, removed: true }));
		await fireEvent.click(like());
		await vi.waitFor(() => expect(like()).toHaveAttribute('aria-pressed', 'false'));
		expect(lastCall(fetchMock)).toMatchObject({ url: '/api/feedback/fb-a1', method: 'DELETE' });
		expect(screen.queryByLabelText('Comment (optional)')).not.toBeInTheDocument();
	});

	it('shows a live counter, caps the field at 500 and labels both', async () => {
		const { fetchMock } = await mount('a1');
		fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, entry: entry('a1', 'like') }));
		await fireEvent.click(like());
		const box = (await screen.findByLabelText('Comment (optional)')) as HTMLTextAreaElement;
		expect(box).toHaveAttribute('maxlength', '500');
		expect(screen.getByText('0 / 500')).toBeInTheDocument();
		await fireEvent.input(box, { target: { value: 'hello' } });
		expect(screen.getByText('5 / 500')).toBeInTheDocument();
		const counter = screen.getByText('5 / 500');
		expect(box.getAttribute('aria-describedby')).toBe(counter.id);
	});

	it('Cancel closes the box without a request', async () => {
		const { fetchMock } = await mount('a1');
		fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, entry: entry('a1', 'like') }));
		await fireEvent.click(like());
		await screen.findByLabelText('Comment (optional)');
		const calls = fetchMock.mock.calls.length;
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByLabelText('Comment (optional)')).not.toBeInTheDocument();
		expect(fetchMock.mock.calls.length).toBe(calls);
		expect(like()).toHaveAttribute('aria-pressed', 'true');
	});

	it('Save PATCHes the comment and closes the box', async () => {
		const { fetchMock } = await mount('a1');
		fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, entry: entry('a1', 'like') }));
		await fireEvent.click(like());
		const box = await screen.findByLabelText('Comment (optional)');
		await fireEvent.input(box, { target: { value: 'old news' } });
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, entry: entry('a1', 'like', 'old news') }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await vi.waitFor(() =>
			expect(screen.queryByLabelText('Comment (optional)')).not.toBeInTheDocument(),
		);
		expect(lastCall(fetchMock)).toEqual({
			url: '/api/feedback/fb-a1',
			method: 'PATCH',
			body: { comment: 'old news' },
		});
	});

	it('shows the server error in place and keeps the typed comment', async () => {
		const { fetchMock } = await mount('a1');
		fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true, entry: entry('a1', 'like') }));
		await fireEvent.click(like());
		const box = (await screen.findByLabelText('Comment (optional)')) as HTMLTextAreaElement;
		await fireEvent.input(box, { target: { value: 'keep me' } });
		fetchMock.mockResolvedValueOnce(
			jsonResponse(400, { ok: false, error: 'comment must be 500 characters or fewer' }),
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('comment must be 500 characters or fewer');
		expect(box.value).toBe('keep me');
	});

	it('shows a failed choice request in place and leaves the button state alone', async () => {
		const { fetchMock } = await mount('a1');
		fetchMock.mockResolvedValueOnce(jsonResponse(404, { ok: false, error: 'item not found' }));
		await fireEvent.click(like());
		expect(await screen.findByRole('alert')).toHaveTextContent('item not found');
		expect(like()).toHaveAttribute('aria-pressed', 'false');
	});

	it('keeps page shortcuts out: keydown inside does not reach window', async () => {
		await mount('a1');
		const pageKeydown = vi.fn();
		window.addEventListener('keydown', pageKeydown);
		try {
			await fireEvent.keyDown(like(), { key: 'j' });
			expect(pageKeydown).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('keydown', pageKeydown);
		}
	});
});
