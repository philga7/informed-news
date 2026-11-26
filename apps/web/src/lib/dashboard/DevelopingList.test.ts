import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBriefFetchMock, jsonResponse } from '$lib/brief/fetchMock';
import DevelopingList, { type DashboardStory } from './DevelopingList.svelte';

const NOW = new Date('2026-11-26T15:00:00.000Z');
const TIMED_ENTRY = '2026-11-26T14:10:00.000Z';
const DAY_ENTRY = '2026-11-12T00:30:00.000Z';
const READ_UP_TO = '2026-11-25T18:30:00.000Z';

type Mock = ReturnType<typeof installBriefFetchMock>;
let active: Mock | null = null;

function story(partial: Partial<DashboardStory> & Pick<DashboardStory, 'id' | 'title'>): DashboardStory {
	return {
		role: 'hub',
		status: 'developing',
		nowSummary: null,
		latestEntryAt: null,
		latestEntryPrecision: null,
		newCount: 0,
		readUpTo: null,
		categories: [],
		followState: null,
		hubTitle: null,
		private: false,
		...partial,
	};
}

function localTime(iso: string): string {
	return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function readUpToLine(iso: string): string {
	const when = new Date(iso);
	const weekday = when.toLocaleDateString(undefined, { weekday: 'short' });
	return `read up to ${weekday} ${localTime(iso)}`;
}

function renderList(
	props: Partial<{
		developing: DashboardStory[];
		quiet: DashboardStory[];
		categories: { id: string; name: string; count: number }[];
		hidden: { id: string; title: string }[];
		hasAccount: boolean;
		onReload: () => void;
	}> = {},
) {
	return render(DevelopingList, {
		props: {
			developing: [],
			quiet: [],
			categories: [],
			hidden: [],
			hasAccount: false,
			onReload: () => {},
			...props,
		},
	});
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	cleanup();
	active?.restore();
	active = null;
	vi.useRealTimers();
});

describe('DevelopingList', () => {
	it('shows a branch row with status, privacy, new count, and a timed entry, and a day row as a UTC date', () => {
		renderList({
			developing: [
				story({
					id: 'branch-1',
					title: 'Ceasefire talks',
					role: 'branch',
					status: 'developing',
					nowSummary: 'Envoy is in Muscat',
					latestEntryAt: TIMED_ENTRY,
					latestEntryPrecision: 'time',
					newCount: 2,
					hubTitle: 'Iran',
					private: true,
				}),
				story({
					id: 'day-1',
					title: 'Budget vote',
					status: 'waiting',
					latestEntryAt: DAY_ENTRY,
					latestEntryPrecision: 'day',
				}),
			],
		});

		const branch = screen.getByRole('article', { name: 'Ceasefire talks' });
		expect(branch).toHaveTextContent('Developing');
		expect(branch).toHaveTextContent('Branch');
		expect(branch).toHaveTextContent('part of Iran');
		expect(branch).toHaveTextContent('Ceasefire talks');
		expect(branch).toHaveTextContent('Private');
		expect(branch).toHaveTextContent('+2 new');
		expect(branch).toHaveTextContent('Envoy is in Muscat');
		expect(branch).toHaveTextContent(localTime(TIMED_ENTRY));
		expect(branch).toHaveTextContent('50 min ago');
		expect(within(branch).queryByRole('link', { name: 'Ceasefire talks' })).not.toBeInTheDocument();

		const day = screen.getByRole('article', { name: 'Budget vote' });
		expect(day).toHaveTextContent('Waiting');
		expect(day).toHaveTextContent('Nov 12');
		expect(day).not.toHaveTextContent('ago');
		expect(day).not.toHaveTextContent('Branch');
		expect(day).not.toHaveTextContent('Private');
		expect(screen.queryByText('nothing yet')).not.toBeInTheDocument();
	});

	it('phrases a timed entry from just now through several days', () => {
		const cases = [
			{ id: 'just', title: 'Just now story', at: '2026-11-26T14:59:01.000Z', phrase: 'just now' },
			{ id: 'min', title: 'Minute story', at: '2026-11-26T14:59:00.000Z', phrase: '1 min ago' },
			{ id: 'mins', title: 'Minutes story', at: '2026-11-26T14:01:00.000Z', phrase: '59 min ago' },
			{ id: 'hour', title: 'Hour story', at: '2026-11-26T14:00:00.000Z', phrase: '1 h ago' },
			{ id: 'hours', title: 'Hours story', at: '2026-11-25T16:00:00.000Z', phrase: '23 h ago' },
			{ id: 'day', title: 'Day story', at: '2026-11-25T15:00:00.000Z', phrase: '1 day ago' },
			{ id: 'days', title: 'Days story', at: '2026-11-24T15:00:00.000Z', phrase: '2 days ago' },
		];
		renderList({
			developing: cases.map((item) =>
				story({
					id: item.id,
					title: item.title,
					latestEntryAt: item.at,
					latestEntryPrecision: 'time',
				}),
			),
		});

		for (const item of cases) {
			const row = screen.getByRole('article', { name: item.title });
			expect(row).toHaveTextContent(item.phrase);
			expect(row).toHaveTextContent(localTime(item.at));
			expect(row).not.toHaveTextContent('read up to');
		}
	});

	it('omits read up to when there is no marker, and places a quiet row under Quiet', () => {
		renderList({
			hasAccount: true,
			developing: [story({ id: 'open-1', title: 'Open story' })],
			quiet: [
				story({
					id: 'quiet-1',
					title: 'Settled story',
					status: 'active',
					readUpTo: READ_UP_TO,
					latestEntryAt: '2026-11-25T12:00:00.000Z',
					latestEntryPrecision: 'time',
				}),
			],
		});

		const open = screen.getByRole('article', { name: 'Open story' });
		expect(open).not.toHaveTextContent('read up to');
		expect(within(open).getByRole('button', { name: 'Follow' })).toBeVisible();
		expect(within(open).getByRole('button', { name: 'Hide' })).toBeVisible();
		expect(open).toHaveTextContent('Follow · Hide');

		const heading = screen.getByRole('heading', { name: 'Quiet' });
		const settled = screen.getByRole('article', { name: 'Settled story' });
		expect(open.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(heading.compareDocumentPosition(settled) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(settled).toHaveTextContent(readUpToLine(READ_UP_TO));
		expect(settled).toHaveTextContent('Active');
		expect(settled).toHaveTextContent('Follow · Hide');
	});

	it('has no Quiet heading when quiet is empty', () => {
		renderList({
			developing: [story({ id: 'open-1', title: 'Open story', readUpTo: null })],
			quiet: [],
		});

		expect(screen.getByRole('article', { name: 'Open story' })).toBeVisible();
		expect(screen.queryByRole('heading', { name: 'Quiet' })).not.toBeInTheDocument();
		expect(screen.getByRole('article', { name: 'Open story' })).not.toHaveTextContent('read up to');
	});

	it('filters developing and quiet by category and restores both from All', async () => {
		renderList({
			categories: [
				{ id: 'elections', name: 'Elections', count: 2 },
				{ id: 'economy', name: 'Economy', count: 0 },
			],
			developing: [
				story({
					id: 'senate',
					title: 'Senate race',
					categories: [{ id: 'elections', name: 'Elections' }],
				}),
				story({
					id: 'oil',
					title: 'Oil prices',
					categories: [{ id: 'economy', name: 'Economy' }],
				}),
			],
			quiet: [
				story({
					id: 'turnout',
					title: 'Turnout',
					categories: [{ id: 'elections', name: 'Elections' }],
				}),
				story({
					id: 'inflation',
					title: 'Inflation',
					categories: [{ id: 'economy', name: 'Economy' }],
				}),
			],
		});

		const all = screen.getByRole('button', { name: 'All' });
		const elections = screen.getByRole('button', { name: 'Elections 2' });
		const economy = screen.getByRole('button', { name: 'Economy 0' });
		expect(all).toHaveAttribute('aria-pressed', 'true');
		expect(elections).toHaveAttribute('aria-pressed', 'false');
		expect(economy).toHaveAttribute('aria-pressed', 'false');
		expect(all).toHaveTextContent('All');
		expect(all).not.toHaveTextContent(/\d/);

		await fireEvent.click(economy);

		expect(screen.getByRole('article', { name: 'Oil prices' })).toBeVisible();
		expect(screen.getByRole('article', { name: 'Inflation' })).toBeVisible();
		expect(screen.queryByRole('article', { name: 'Senate race' })).not.toBeInTheDocument();
		expect(screen.queryByRole('article', { name: 'Turnout' })).not.toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Quiet' })).toBeVisible();
		expect(screen.getByRole('article', { name: 'Oil prices' }).compareDocumentPosition(
			screen.getByRole('heading', { name: 'Quiet' }),
		) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(economy).toHaveAttribute('aria-pressed', 'true');
		expect(all).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByRole('button', { name: 'Elections 2' })).toBeVisible();
		expect(screen.getByRole('button', { name: 'Economy 0' })).toBeVisible();

		await fireEvent.click(screen.getByRole('button', { name: 'All' }));

		expect(screen.getByRole('article', { name: 'Senate race' })).toBeVisible();
		expect(screen.getByRole('article', { name: 'Oil prices' })).toBeVisible();
		expect(screen.getByRole('article', { name: 'Turnout' })).toBeVisible();
		expect(screen.getByRole('article', { name: 'Inflation' })).toBeVisible();
		expect(all).toHaveAttribute('aria-pressed', 'true');
	});

	it('sends follow and hide, then reloads, without relabeling the row locally', async () => {
		const onReload = vi.fn();
		active = installBriefFetchMock(() =>
			jsonResponse(200, { ok: true, state: 'follow', updatedAt: NOW.toISOString() }),
		);
		renderList({
			hasAccount: true,
			onReload,
			developing: [story({ id: 'story-9', title: 'Grid', followState: null })],
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
		await vi.waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
		expect(active.calls).toEqual([
			{
				url: '/api/stories/story-9/follow-state',
				method: 'PUT',
				body: { state: 'follow' },
				credentials: 'include',
			},
		]);
		expect(screen.getByRole('button', { name: 'Follow' })).toBeVisible();
		expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
		await vi.waitFor(() => expect(onReload).toHaveBeenCalledTimes(2));
		expect(active.calls).toEqual([
			{
				url: '/api/stories/story-9/follow-state',
				method: 'PUT',
				body: { state: 'follow' },
				credentials: 'include',
			},
			{
				url: '/api/stories/story-9/follow-state',
				method: 'PUT',
				body: { state: 'hide' },
				credentials: 'include',
			},
		]);
	});

	it('does not reload when follow is rejected', async () => {
		const onReload = vi.fn();
		active = installBriefFetchMock(() => jsonResponse(503, { ok: false, error: 'data unavailable' }));
		renderList({
			hasAccount: true,
			onReload,
			developing: [story({ id: 'story-9', title: 'Grid' })],
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
		await vi.waitFor(() => expect(active?.calls).toHaveLength(1));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onReload).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Follow' })).toBeVisible();
	});

	it('sends DELETE when the row is already Following', async () => {
		const onReload = vi.fn();
		active = installBriefFetchMock(() => new Response(null, { status: 204 }));
		renderList({
			hasAccount: true,
			onReload,
			developing: [story({ id: 'story-9', title: 'Grid', followState: 'follow' })],
		});

		expect(screen.getByRole('article', { name: 'Grid' })).toHaveTextContent('Following · Hide');
		await fireEvent.click(screen.getByRole('button', { name: 'Following' }));
		await vi.waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
		expect(active.calls).toEqual([
			{
				url: '/api/stories/story-9/follow-state',
				method: 'DELETE',
				body: undefined,
				credentials: 'include',
			},
		]);
	});

	it('hides Follow and the foot when there is no account', () => {
		renderList({
			hasAccount: false,
			hidden: [{ id: 'h1', title: 'Alpha memo' }],
			developing: [story({ id: 'story-9', title: 'Grid', followState: 'follow' })],
		});

		expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'show' })).not.toBeInTheDocument();
		expect(document.body).not.toHaveTextContent('hidden · show');
		expect(screen.queryByText('Alpha memo')).not.toBeInTheDocument();
	});

	it('lists two hidden titles after show, and Unhide sends DELETE', async () => {
		const onReload = vi.fn();
		active = installBriefFetchMock(() => new Response(null, { status: 204 }));
		renderList({
			hasAccount: true,
			onReload,
			developing: [story({ id: 'story-9', title: 'Grid' })],
			hidden: [
				{ id: 'h1', title: 'Alpha memo' },
				{ id: 'h2', title: 'Beta memo' },
			],
		});

		const show = screen.getByRole('button', { name: 'show' });
		const foot = show.closest('p');
		if (!(foot instanceof HTMLElement)) throw new Error('missing hidden foot');
		expect(foot).toHaveTextContent('2 hidden · show');
		expect(screen.queryByText('Alpha memo')).not.toBeInTheDocument();
		expect(screen.queryByText('Beta memo')).not.toBeInTheDocument();

		await fireEvent.click(show);

		expect(screen.getByText('Alpha memo')).toBeVisible();
		expect(screen.getByText('Beta memo')).toBeVisible();
		expect(screen.queryByRole('article', { name: 'Alpha memo' })).not.toBeInTheDocument();
		expect(screen.queryByRole('article', { name: 'Beta memo' })).not.toBeInTheDocument();

		const alpha = screen.getByText('Alpha memo').closest('li');
		if (!(alpha instanceof HTMLElement)) throw new Error('missing hidden title');
		await fireEvent.click(within(alpha).getByRole('button', { name: 'Unhide' }));
		await vi.waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
		expect(active.calls).toEqual([
			{
				url: '/api/stories/h1/follow-state',
				method: 'DELETE',
				body: undefined,
				credentials: 'include',
			},
		]);
	});

	it('shows nothing yet when developing and quiet are both empty', () => {
		renderList();

		expect(screen.getByText('nothing yet')).toBeVisible();
		expect(screen.queryByRole('heading', { name: 'Quiet' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
	});

	it('shows nothing yet and the hidden foot when every story is hidden', () => {
		renderList({
			hasAccount: true,
			hidden: [
				{ id: 'h1', title: 'Alpha memo' },
				{ id: 'h2', title: 'Beta memo' },
			],
		});

		expect(screen.getByText('nothing yet')).toBeVisible();
		const show = screen.getByRole('button', { name: 'show' });
		const foot = show.closest('p');
		if (!(foot instanceof HTMLElement)) throw new Error('missing hidden foot');
		expect(foot).toHaveTextContent('2 hidden · show');
		expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
		expect(screen.queryByText('Alpha memo')).not.toBeInTheDocument();
	});
});
