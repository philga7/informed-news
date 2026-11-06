import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	briefCard,
	lessLikeThisSavedBody,
	lessLikeThisUrl,
	storyForLessLikeThis,
} from '$lib/brief/fixtures';
import { installBriefFetchMock, jsonResponse } from '$lib/brief/fetchMock';
import LessLikeThis from './LessLikeThis.svelte';

const story = storyForLessLikeThis(briefCard());

let articleSeq = 0;
let articleId = '';
let mock: ReturnType<typeof installBriefFetchMock>;

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
	});

	afterEach(() => {
		mock?.restore();
	});

	it('Escape inside the open panel cancels it, returns focus to the trigger, and stays out of page shortcuts', async () => {
		mock = installBriefFetchMock(() => jsonResponse(500, {}));
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

	it('blocking the outlet posts the outlet kind to the less-like-this URL and moves focus to View Topics', async () => {
		mock = installBriefFetchMock(() => jsonResponse(201, lessLikeThisSavedBody('dailymail.co.uk')));
		mount();
		await openPanel();
		await fireEvent.click(screen.getByRole('button', { name: 'Block dailymail.co.uk' }));

		const success = await screen.findByTestId('less-like-this-success');
		expect(success).toHaveTextContent('Added "dailymail.co.uk" to undesired topics.');
		await vi.waitFor(() => expect(screen.getByRole('link', { name: 'View Topics' })).toHaveFocus());
		expect(mock.calls).toEqual([
			{
				url: lessLikeThisUrl(articleId),
				method: 'POST',
				body: { kind: 'outlet' },
				credentials: 'include',
			},
		]);
	});

	it('the subject form posts the name, parsed keywords, and the story title as description', async () => {
		mock = installBriefFetchMock(() =>
			jsonResponse(201, lessLikeThisSavedBody('Royal row deepens')),
		);
		mount();
		await openPanel();
		await fireEvent.input(screen.getByLabelText(/Keywords/), {
			target: { value: 'royal, Row, royal' },
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add undesired topic' }));

		await screen.findByTestId('less-like-this-success');
		expect(mock.calls[0].body).toEqual({
			kind: 'subject',
			name: 'Royal row deepens',
			keywords: ['royal', 'Row'],
			description: 'Royal row deepens',
		});
	});

	it('keeps the saved result for the page session when the card collapses and re-expands', async () => {
		mock = installBriefFetchMock(() => jsonResponse(201, lessLikeThisSavedBody('dailymail.co.uk')));
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
		mock = installBriefFetchMock(() => jsonResponse(201, lessLikeThisSavedBody('dailymail.co.uk')));
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
		mock = installBriefFetchMock(() =>
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
		expect(screen.getByLabelText('Undesired topic name')).toBeInTheDocument();
		expect(screen.queryByTestId('less-like-this-success')).not.toBeInTheDocument();

		first.unmount();
		mount();
		expect(screen.getByRole('button', { name: 'Less like this' })).toBeInTheDocument();
	});

	it('a 401 shows the login hint linking to Topics', async () => {
		mock = installBriefFetchMock(() => jsonResponse(401, { ok: false, error: 'unauthorized' }));
		mount();
		await openPanel();
		await fireEvent.click(screen.getByRole('button', { name: 'Block dailymail.co.uk' }));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Log in on Topics to use Less like this');
		expect(alert.querySelector('a[href="/topics"]')).not.toBeNull();
	});

	it('a 5xx shows the generic retry line, not the server message, and keeps the panel open', async () => {
		mock = installBriefFetchMock(() =>
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
