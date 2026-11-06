import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeSeedSavedBody, removeSeedUrl } from '$lib/brief/fixtures';
import { installBriefFetchMock, jsonResponse } from '$lib/brief/fetchMock';
import SeedRemove from './SeedRemove.svelte';

let mock: ReturnType<typeof installBriefFetchMock>;

afterEach(() => {
	mock?.restore();
});

describe('SeedRemove', () => {
	it('posts to the remove URL with an empty body and calls onRemoved on success', async () => {
		mock = installBriefFetchMock(() => jsonResponse(200, removeSeedSavedBody()));
		const onRemoved = vi.fn();
		render(SeedRemove, { props: { articleId: 'story 1', onRemoved } });

		await fireEvent.click(screen.getByTestId('seed-remove'));

		await vi.waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
		expect(mock.calls).toEqual([
			{ url: removeSeedUrl('story 1'), method: 'POST', body: {}, credentials: 'include' },
		]);
	});

	it('shows Removing… and ignores a second click while pending', async () => {
		let release: (res: Response) => void = () => {};
		mock = installBriefFetchMock(() => new Promise<Response>((resolve) => (release = resolve)));
		const onRemoved = vi.fn();
		render(SeedRemove, { props: { articleId: 'story-1', onRemoved } });

		const button = screen.getByTestId('seed-remove');
		await fireEvent.click(button);
		expect(button).toHaveTextContent('Removing…');
		expect(button).toBeDisabled();
		await fireEvent.click(button);
		expect(mock.calls).toHaveLength(1);

		release(jsonResponse(200, removeSeedSavedBody()));
		await vi.waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
	});

	it('a 401 shows a login link to Topics and does not call onRemoved', async () => {
		mock = installBriefFetchMock(() => jsonResponse(401, { ok: false }));
		const onRemoved = vi.fn();
		render(SeedRemove, { props: { articleId: 'story-1', onRemoved } });

		await fireEvent.click(screen.getByTestId('seed-remove'));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Log in on Topics to remove stories');
		expect(alert.querySelector('a[href="/topics"]')).not.toBeNull();
		expect(onRemoved).not.toHaveBeenCalled();
	});

	it('a 5xx shows the retry line, keeps the button, and does not call onRemoved', async () => {
		mock = installBriefFetchMock(() => jsonResponse(500, { ok: false, error: 'boom' }));
		const onRemoved = vi.fn();
		render(SeedRemove, { props: { articleId: 'story-1', onRemoved } });

		await fireEvent.click(screen.getByTestId('seed-remove'));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Could not remove this story. Try again.');
		expect(alert.querySelector('a')).toBeNull();
		expect(screen.getByTestId('seed-remove')).toHaveTextContent('Remove');
		expect(screen.getByTestId('seed-remove')).not.toBeDisabled();
		expect(onRemoved).not.toHaveBeenCalled();
	});

	it('keydown inside the control does not reach page shortcuts', async () => {
		mock = installBriefFetchMock(() => jsonResponse(200, removeSeedSavedBody()));
		const pageKeydown = vi.fn();
		window.addEventListener('keydown', pageKeydown);
		try {
			render(SeedRemove, { props: { articleId: 'story-1', onRemoved: vi.fn() } });
			await fireEvent.keyDown(screen.getByTestId('seed-remove'), { key: 'j' });
			expect(pageKeydown).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('keydown', pageKeydown);
		}
	});
});
