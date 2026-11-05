import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackList from '../FeedbackList.svelte';

type Entry = {
	id: string;
	itemId: string;
	signal: string;
	comment: string;
	ts: string;
	snapshot: { headline: string; source: string; url: string; topics: { id: string; name: string }[] };
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

function entry(over: Partial<Entry> & Pick<Entry, 'id' | 'snapshot'>): Entry {
	return {
		itemId: `item-${over.id}`,
		signal: 'like',
		comment: '',
		ts: '2026-11-04T18:00:00.000Z',
		...over,
	};
}

const grid = entry({
	id: 'fb-1',
	signal: 'like',
	comment: 'keep the grid story',
	ts: '2026-11-04T18:00:00.000Z',
	snapshot: {
		headline: 'Operators add battery storage',
		source: 'gridwatch.example',
		url: 'https://gridwatch.example/e2e/storage',
		topics: [{ id: 'e2e-topic-grid', name: 'Energy grid' }],
	},
});

const bakery = entry({
	id: 'fb-2',
	signal: 'not_relevant',
	comment: 'not this bakery',
	ts: '2026-11-04T19:00:00.000Z',
	snapshot: {
		headline: 'Local bakery wins',
		source: 'townpaper.example',
		url: 'https://townpaper.example/e2e/bakery',
		topics: [{ id: 'e2e-topic-ports', name: 'Ports & shipping' }],
	},
});

async function mount(entries: Entry[] = [grid, bakery], status = 200) {
	const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(status, { ok: true, entries }));
	vi.stubGlobal('fetch', fetchMock);
	render(FeedbackList);
	if (status === 200) {
		await screen.findByText(entries[0]?.snapshot.headline ?? 'No feedback yet.');
	}
	await tick();
	return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
	const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
	return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

describe('FeedbackList', () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
		window.location.hash = '';
		vi.spyOn(window, 'confirm').mockImplementation(() => {
			throw new Error('confirm should not be called');
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('renders entries in response order with headline, source, link, topics, comment, and time', async () => {
		await mount([bakery, grid]);
		const headlines = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
		expect(headlines).toEqual(['Local bakery wins', 'Operators add battery storage']);
		expect(screen.getByText('townpaper.example')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'https://townpaper.example/e2e/bakery' })).toHaveAttribute(
			'href',
			'https://townpaper.example/e2e/bakery',
		);
		expect(screen.getByText('Ports & shipping')).toBeInTheDocument();
		expect(screen.getByText('not this bakery')).toBeInTheDocument();
		expect(screen.getAllByRole('time').length).toBe(2);
	});

	it('shows the Topics login link on 401 and no entries', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401, { ok: false, error: 'Unauthorized' }));
		vi.stubGlobal('fetch', fetchMock);
		render(FeedbackList);
		const link = await screen.findByRole('link', { name: 'Log in on Topics to see feedback.' });
		expect(link).toHaveAttribute('href', '/topics');
		expect(screen.queryByTestId('feedback-entry')).not.toBeInTheDocument();
	});

	it('says when there is no feedback yet', async () => {
		await mount([]);
		expect(screen.getByText('No feedback yet.')).toBeInTheDocument();
	});

	it('switches the other signal with PATCH and does not delete the pressed one', async () => {
		const fetchMock = await mount([grid]);
		const calls = fetchMock.mock.calls.length;
		await fireEvent.click(screen.getByRole('button', { name: 'Like' }));
		expect(fetchMock.mock.calls.length).toBe(calls);

		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { ok: true, entry: { ...grid, signal: 'not_relevant' } }),
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Not relevant' }));
		await screen.findByLabelText('Comment (optional)');
		expect(lastCall(fetchMock)).toEqual({
			url: '/api/feedback/fb-1',
			method: 'PATCH',
			body: { signal: 'not_relevant' },
		});
		expect(screen.getByRole('button', { name: 'Not relevant' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('edits a comment with Save and discards a Cancel without a request', async () => {
		const fetchMock = await mount([grid]);
		await fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
		const box = (await screen.findByLabelText('Comment (optional)')) as HTMLTextAreaElement;
		expect(box).toHaveAttribute('maxlength', '500');
		await fireEvent.input(box, { target: { value: 'updated note' } });
		expect(screen.getByText('12 / 500')).toBeInTheDocument();

		const calls = fetchMock.mock.calls.length;
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(fetchMock.mock.calls.length).toBe(calls);
		expect(screen.getByText('keep the grid story')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
		const again = await screen.findByLabelText('Comment (optional)');
		await fireEvent.input(again, { target: { value: 'updated note' } });
		fetchMock.mockResolvedValueOnce(
			jsonResponse(200, { ok: true, entry: { ...grid, comment: 'updated note' } }),
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await vi.waitFor(() => expect(screen.getByText('updated note')).toBeInTheDocument());
		expect(lastCall(fetchMock)).toEqual({
			url: '/api/feedback/fb-1',
			method: 'PATCH',
			body: { comment: 'updated note' },
		});
	});

	it('deletes only after Yes, and No sends nothing', async () => {
		const fetchMock = await mount([grid, bakery]);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
		expect(screen.getByRole('group', { name: 'Delete this feedback?' })).toBeInTheDocument();
		const calls = fetchMock.mock.calls.length;
		await fireEvent.click(screen.getByRole('button', { name: 'No' }));
		expect(fetchMock.mock.calls.length).toBe(calls);
		expect(screen.getAllByTestId('feedback-entry')).toHaveLength(2);

		await fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true, removed: true }));
		await fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
		await vi.waitFor(() => expect(screen.getAllByTestId('feedback-entry')).toHaveLength(1));
		expect(lastCall(fetchMock)).toMatchObject({ url: '/api/feedback/fb-1', method: 'DELETE' });
		expect(window.confirm).not.toHaveBeenCalled();
	});

	it('shows a 400 from Save and keeps the draft', async () => {
		const fetchMock = await mount([grid]);
		await fireEvent.click(screen.getByRole('button', { name: 'Edit comment' }));
		const box = (await screen.findByLabelText('Comment (optional)')) as HTMLTextAreaElement;
		await fireEvent.input(box, { target: { value: 'keep me' } });
		fetchMock.mockResolvedValueOnce(
			jsonResponse(400, { ok: false, error: 'comment must be 500 characters or fewer' }),
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(await screen.findByRole('alert')).toHaveTextContent('comment must be 500 characters or fewer');
		expect(box.value).toBe('keep me');
	});

	it('does not link a story URL that is not http or https', async () => {
		const unsafe = entry({
			id: 'fb-js',
			snapshot: {
				headline: 'Odd scheme',
				source: 'example.test',
				url: 'javascript:alert(1)',
				topics: [],
			},
		});
		await mount([unsafe]);
		expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument();
	});

	it('scrolls to and highlights the entry named by the hash', async () => {
		const scroll = vi.fn();
		HTMLElement.prototype.scrollIntoView = scroll;
		window.location.hash = '#fb-2';
		await mount([grid, bakery]);
		const article = document.getElementById('fb-2');
		expect(article).toHaveClass('feedback-highlight');
		expect(article).toHaveFocus();
		expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
	});
});
