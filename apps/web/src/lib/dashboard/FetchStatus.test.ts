import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FetchStatus from './FetchStatus.svelte';

const AT = '2026-11-12T15:04:00.000Z';

function localTime(iso: string): string {
	return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function renderStatus(
	props: Partial<{
		running: boolean;
		runningSince: string | null;
		lastFetchAt: string | null;
		lastFetchOk: boolean | null;
		keysOn: boolean;
		onRefresh: () => void;
	}> = {},
) {
	return render(FetchStatus, {
		props: {
			running: false,
			runningSince: null,
			lastFetchAt: null,
			lastFetchOk: null,
			keysOn: true,
			onRefresh: () => {},
			...props,
		},
	});
}

function expectInstant(iso: string): void {
	const time = document.querySelector('time');
	expect(time).toHaveAttribute('datetime', iso);
	expect(time).toHaveAttribute('title', new Date(iso).toLocaleString());
	expect(time).toHaveTextContent(localTime(iso));
	expect(time?.textContent?.trim()).not.toBe(iso);
	expect(screen.queryByText(iso)).not.toBeInTheDocument();
}

afterEach(() => {
	cleanup();
});

describe('FetchStatus', () => {
	it('shows Refreshing since the local time, and a disabled busy button', async () => {
		const onRefresh = vi.fn();
		renderStatus({ running: true, runningSince: AT, onRefresh });

		expect(screen.getByText('Refreshing since')).toBeVisible();
		expectInstant(AT);
		const button = screen.getByRole('button', { name: 'Refreshing…' });
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute('aria-busy', 'true');
		await fireEvent.click(button);
		expect(onRefresh).not.toHaveBeenCalled();
	});

	it('shows Refreshing… when a run has no start time', () => {
		renderStatus({ running: true, runningSince: null });

		expect(screen.getByRole('paragraph')).toHaveTextContent('Refreshing…');
		expect(document.querySelector('time')).toBeNull();
		const button = screen.getByRole('button', { name: 'Refreshing…' });
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute('aria-busy', 'true');
	});

	it('shows Last fetch succeeded with the local time', () => {
		renderStatus({ lastFetchAt: AT, lastFetchOk: true });

		expect(screen.getByText('Last fetch succeeded')).toBeVisible();
		expectInstant(AT);
		expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
	});

	it('shows Last fetch failed with the local time', () => {
		renderStatus({ lastFetchAt: AT, lastFetchOk: false });

		expect(screen.getByText('Last fetch failed')).toBeVisible();
		expectInstant(AT);
		expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
	});

	it('shows No fetch yet and calls onRefresh once', async () => {
		const onRefresh = vi.fn();
		renderStatus({ onRefresh });

		expect(screen.getByText('No fetch yet')).toBeVisible();
		expect(document.querySelector('time')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		expect(onRefresh).toHaveBeenCalledTimes(1);
	});

	it('does not call onRefresh when keys are off', async () => {
		const onRefresh = vi.fn();
		renderStatus({ keysOn: false, lastFetchAt: AT, lastFetchOk: true, onRefresh });

		expect(screen.getByText('Last fetch succeeded')).toBeVisible();
		const button = screen.getByRole('button', { name: 'Refresh' });
		expect(button).toBeDisabled();
		await fireEvent.click(button);
		expect(onRefresh).not.toHaveBeenCalled();
	});
});
