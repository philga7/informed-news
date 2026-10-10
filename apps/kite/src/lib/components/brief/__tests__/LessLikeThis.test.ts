import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '$lib/types';
import LessLikeThis from '../LessLikeThis.svelte';

const story = {
	title: 'Royal row deepens',
	informed_publisher_domain: 'dailymail.co.uk',
} as unknown as Story;

let articleSeq = 0;
let articleId = '';

function mount(id = articleId) {
	return render(LessLikeThis, { props: { story, articleId: id } });
}

async function openPanel(): Promise<void> {
	await fireEvent.click(screen.getByRole('button', { name: 'Less like this' }));
	await tick();
}

describe('LessLikeThis', () => {
	beforeEach(() => {
		articleId = `story-${++articleSeq}`;
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('Escape inside the open panel cancels it, returns focus to the trigger, and stays out of page shortcuts', async () => {
		const pageKeydown = vi.fn();
		window.addEventListener('keydown', pageKeydown);
		try {
			mount();
			await openPanel();
			const nameInput = screen.getByLabelText('Undesired topic name');
			expect(nameInput).toHaveFocus();

			await fireEvent.keyDown(nameInput, { key: 'Escape' });
			await tick();

			expect(screen.queryByLabelText('Undesired topic name')).not.toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Less like this' })).toHaveFocus();
			expect(pageKeydown).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('keydown', pageKeydown);
		}
	});

	it('after a successful save, focus moves to the View Topics link', async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(201, { ok: true, created: true, topic: { name: 'dailymail.co.uk' }, topics: [] }),
		);
		mount();
		await openPanel();
		await fireEvent.click(screen.getByRole('button', { name: 'Block dailymail.co.uk' }));

		const success = await screen.findByTestId('less-like-this-success');
		expect(success).toHaveTextContent('Added "dailymail.co.uk" to undesired topics.');
		await vi.waitFor(() => expect(screen.getByRole('link', { name: 'View Topics' })).toHaveFocus());
	});

	it('keeps the saved result for the page session when the card collapses and re-expands', async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(201, { ok: true, created: true, topic: { name: 'dailymail.co.uk' }, topics: [] }),
		);
		const first = mount();
		await openPanel();
		await fireEvent.click(screen.getByRole('button', { name: 'Block dailymail.co.uk' }));
		await screen.findByTestId('less-like-this-success');
		first.unmount();

		mount();
		expect(screen.getByTestId('less-like-this-success')).toHaveTextContent(
			'Added "dailymail.co.uk" to undesired topics.',
		);
		expect(screen.queryByRole('button', { name: 'Less like this' })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'View Topics' })).not.toHaveFocus();
	});

	it('other stories still start with the Less like this button', async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(201, { ok: true, created: true, topic: { name: 'dailymail.co.uk' }, topics: [] }),
		);
		const first = mount();
		await openPanel();
		await fireEvent.click(screen.getByRole('button', { name: 'Block dailymail.co.uk' }));
		await screen.findByTestId('less-like-this-success');
		first.unmount();

		mount(`${articleId}-other`);
		expect(screen.queryByTestId('less-like-this-success')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Less like this' })).toBeInTheDocument();
	});

	it('a 409 says the name is taken with a View Topics link, keeps the panel open, and saves nothing', async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(409, { ok: false, error: 'a topic named "royal row deepens" already exists' }),
		);
		const first = mount();
		await openPanel();
		await fireEvent.click(screen.getByRole('button', { name: 'Add undesired topic' }));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent(
			'A topic named "Royal row deepens" already exists, so nothing was saved.',
		);
		expect(alert.querySelector('a[href="/topics"]')).toHaveTextContent('View Topics');
		expect(screen.queryByText(/royal row deepens" already exists$/)).not.toBeInTheDocument();
		expect(screen.getByLabelText('Undesired topic name')).toBeInTheDocument();
		expect(screen.queryByTestId('less-like-this-success')).not.toBeInTheDocument();

		first.unmount();
		mount();
		expect(screen.getByRole('button', { name: 'Less like this' })).toBeInTheDocument();
	});

	it('a 5xx shows the generic retry line, not the server message, and keeps the panel open', async () => {
		vi.mocked(fetch).mockResolvedValue(
			jsonResponse(500, { ok: false, error: 'EACCES: /data/topics.json' }),
		);
		mount();
		await openPanel();
		await fireEvent.click(screen.getByRole('button', { name: 'Block dailymail.co.uk' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Try again.');
		expect(screen.queryByText(/EACCES/)).not.toBeInTheDocument();
		expect(screen.getByLabelText('Undesired topic name')).toBeInTheDocument();
	});
});

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}
