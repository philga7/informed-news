import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_POLL_MS } from '$lib/brief/briefClient';
import { installBriefFetchMock, jsonResponse } from '$lib/brief/fetchMock';
import DashboardHome from './DashboardHome.svelte';

const emptyDashboard = {
	ok: true,
	developing: [],
	quiet: [],
	hidden: [],
	categories: [],
	trackers: { stories: [], weather: null },
	morning: { bluf: null, weather: null, market: null, osint: null },
	breaking: [{ title: 'Missile test headline' }],
	cfp: [{ title: 'Roundup headline' }],
};

const signedOut = { ok: false, error: 'Unauthorized' };
const signedIn = { ok: true, user: null };

const iranTalks = {
	id: 's1',
	title: 'Iran talks',
	role: 'hub' as const,
	status: 'developing' as const,
	nowSummary: null,
	latestEntryAt: null,
	latestEntryPrecision: null,
	newCount: 0,
	readUpTo: null,
	categories: [],
	followState: null,
	hubTitle: null,
	private: false,
};

type Mock = ReturnType<typeof installBriefFetchMock>;
let active: Mock | null = null;

function install(handler: Parameters<typeof installBriefFetchMock>[0]): Mock {
	const mock = installBriefFetchMock(handler);
	active = mock;
	return mock;
}

function deferredResponse() {
	let resolveResponse: (response: Response) => void = () => {};
	const promise = new Promise<Response>((resolve) => {
		resolveResponse = resolve;
	});
	return { promise, resolve: resolveResponse };
}

/** Let an in-flight load apply its view before the assertion. */
async function flushPaint(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function block(name: string) {
	const heading = screen.getByRole('heading', { name });
	const region = heading.parentElement;
	if (!(region instanceof HTMLElement)) throw new Error(`missing block for ${name}`);
	return within(region);
}

function follows(earlier: HTMLElement, later: HTMLElement): void {
	expect(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
		Node.DOCUMENT_POSITION_FOLLOWING,
	);
}

afterEach(() => {
	cleanup();
	active?.restore();
	active = null;
});

describe('DashboardHome', () => {
	it('shows the sign-in link and no Developing stories heading when signed out', async () => {
		const mock = install(({ url }) => {
			if (url === '/api/me') return jsonResponse(401, signedOut);
			if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		const signIn = await screen.findByRole('link', { name: 'Sign in to see the dashboard' });
		expect(signIn).toHaveAttribute('href', '/topics');
		expect(screen.queryByRole('heading', { name: 'Developing stories' })).not.toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Breaking' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Refreshing…' })).not.toBeInTheDocument();
		expect(screen.queryByText('No fetch yet')).not.toBeInTheDocument();
		expect(screen.queryByText(/Refreshing since/)).not.toBeInTheDocument();
		expect(mock.calls).toEqual([
			{ url: '/api/me', method: 'GET', body: undefined, credentials: 'include' },
		]);
	});

	it('shows the sign-in link when the dashboard is 401', async () => {
		const mock = install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(401, signedOut);
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		const signIn = await screen.findByRole('link', { name: 'Sign in to see the dashboard' });
		expect(signIn).toHaveAttribute('href', '/topics');
		expect(screen.queryByRole('heading', { name: 'Developing stories' })).not.toBeInTheDocument();
		expect(screen.queryByText('data unavailable')).not.toBeInTheDocument();
		expect(mock.calls.map((call) => call.url)).toEqual(['/api/me', '/api/dashboard']);
		expect(mock.calls.every((call) => call.credentials === 'include')).toBe(true);
	});

	it('shows data unavailable and no Breaking heading when the dashboard is 503', async () => {
		install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(503, { ok: false, error: 'data unavailable' });
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByText('data unavailable')).toBeVisible();
		expect(screen.getAllByText('data unavailable')).toHaveLength(1);
		expect(screen.queryByRole('heading', { name: 'Breaking' })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Sign in to see the dashboard' })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Home' })).toBeVisible();
	});

	it('shows data unavailable when the dashboard body is not ok', async () => {
		install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(200, { ok: false, error: 'nope' });
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByText('data unavailable')).toBeVisible();
		expect(screen.queryByRole('heading', { name: 'Breaking' })).not.toBeInTheDocument();
		expect(screen.queryByText('nope')).not.toBeInTheDocument();
	});

	it('shows an empty dashboard in order, with placeholders and morning cards', async () => {
		const mock = install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		const trackers = await screen.findByText('0 trackers have news');
		const breaking = screen.getByRole('heading', { name: 'Breaking' });
		const developing = screen.getByRole('heading', { name: 'Developing stories' });
		const morning = screen.getByRole('heading', { name: 'Morning' });
		const cfp = screen.getByRole('heading', { name: 'CFP' });
		const topics = screen.getByRole('heading', { name: 'My topics' });

		follows(trackers, breaking);
		follows(breaking, developing);
		follows(developing, morning);
		follows(morning, cfp);
		follows(cfp, topics);

		expect(block('Developing stories').getByText('nothing yet')).toBeVisible();
		expect(block('Breaking').getByText('Not on this page yet')).toBeVisible();
		expect(block('CFP').getByText('Not on this page yet')).toBeVisible();
		expect(block('My topics').getByText('Not on this page yet')).toBeVisible();
		expect(screen.getAllByText('Not on this page yet')).toHaveLength(3);

		const cards = ['BLUF', 'Weather', 'Market', 'OSINT'] as const;
		for (const title of cards) {
			expect(block(title).getByText('nothing yet')).toBeVisible();
		}
		follows(screen.getByRole('heading', { name: 'BLUF' }), screen.getByRole('heading', { name: 'Weather' }));
		follows(screen.getByRole('heading', { name: 'Weather' }), screen.getByRole('heading', { name: 'Market' }));
		follows(screen.getByRole('heading', { name: 'Market' }), screen.getByRole('heading', { name: 'OSINT' }));
		expect(screen.getAllByText('nothing yet')).toHaveLength(5);

		expect(screen.queryByText('Missile test headline')).not.toBeInTheDocument();
		expect(screen.queryByText('Roundup headline')).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Hide' })).not.toBeInTheDocument();
		expect(mock.calls).toEqual([
			{ url: '/api/me', method: 'GET', body: undefined, credentials: 'include' },
			{ url: '/api/dashboard', method: 'GET', body: undefined, credentials: 'include' },
			{ url: '/api/brief/overview', method: 'GET', body: undefined, credentials: 'include' },
		]);
	});

	it('says 1 tracker has news for a single story and no weather', async () => {
		install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') {
				return jsonResponse(200, {
					...emptyDashboard,
					trackers: {
						stories: [{ id: 's1', title: 'Iran talks', newCount: 1 }],
						weather: null,
					},
				});
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByText('1 tracker has news')).toBeVisible();
	});

	it('counts trackers from stories and weather', async () => {
		install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') {
				return jsonResponse(200, {
					...emptyDashboard,
					trackers: {
						stories: [
							{ id: 's1', title: 'Iran talks', newCount: 2 },
							{ id: 's2', title: 'Grid', newCount: 1 },
						],
						weather: { newCount: 1 },
					},
				});
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByText('3 trackers have news')).toBeVisible();
		expect(screen.queryByText('0 trackers have news')).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /Iran talks/ })).not.toBeInTheDocument();
	});

	it('hides the empty line when a developing story exists and shows a filled morning card', async () => {
		install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') {
				return jsonResponse(200, {
					...emptyDashboard,
					developing: [iranTalks],
					morning: {
						...emptyDashboard.morning,
						bluf: {
							id: 'm1',
							postedAt: '2026-11-26T12:00:00.000Z',
							body: 'The morning lead',
							link: null,
							data: null,
						},
					},
				});
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByRole('heading', { name: 'Developing stories' })).toBeVisible();
		expect(block('Developing stories').queryByText('nothing yet')).not.toBeInTheDocument();
		expect(block('Developing stories').getByText('Iran talks')).toBeVisible();
		expect(screen.getByRole('heading', { name: 'BLUF' })).toBeVisible();
		expect(block('BLUF').queryByText('nothing yet')).not.toBeInTheDocument();
		expect(block('BLUF').getByText('The morning lead')).toBeVisible();
		expect(block('Weather').getByText('nothing yet')).toBeVisible();
	});

	it('reloads the dashboard after Follow when the viewer has an account', async () => {
		let dashboardReads = 0;
		const mock = install(({ url, method }) => {
			if (url === '/api/me') return jsonResponse(200, { ok: true, user: { id: 'user-1' } });
			if (url === '/api/dashboard') {
				dashboardReads += 1;
				return jsonResponse(200, { ...emptyDashboard, developing: [iranTalks] });
			}
			if (url === '/api/stories/s1/follow-state' && method === 'PUT') {
				return jsonResponse(200, {
					ok: true,
					state: 'follow',
					updatedAt: '2026-11-26T15:00:00.000Z',
				});
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		const follow = await screen.findByRole('button', { name: 'Follow' });
		expect(dashboardReads).toBe(1);
		await fireEvent.click(follow);
		await vi.waitFor(() => expect(dashboardReads).toBe(2));
		expect(mock.calls.filter((call) => call.url === '/api/stories/s1/follow-state')).toEqual([
			{
				url: '/api/stories/s1/follow-state',
				method: 'PUT',
				body: { state: 'follow' },
				credentials: 'include',
			},
		]);
		expect(mock.calls.filter((call) => call.url === '/api/dashboard')).toHaveLength(2);
		expect(mock.calls.every((call) => call.credentials === 'include')).toBe(true);
	});

	it('does not let an earlier follow reload paint over a later hide', async () => {
		const followReload = deferredResponse();
		const hideReload = deferredResponse();
		let dashboardReads = 0;
		const mock = install(({ url, method }) => {
			if (url === '/api/me') return jsonResponse(200, { ok: true, user: { id: 'user-1' } });
			if (url === '/api/dashboard') {
				dashboardReads += 1;
				if (dashboardReads === 1) {
					return jsonResponse(200, { ...emptyDashboard, developing: [iranTalks] });
				}
				if (dashboardReads === 2) return followReload.promise;
				return hideReload.promise;
			}
			if (url === '/api/stories/s1/follow-state' && method === 'PUT') {
				return jsonResponse(200, {
					ok: true,
					state: 'follow',
					updatedAt: '2026-11-26T15:00:00.000Z',
				});
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		await screen.findByRole('button', { name: 'Follow' });
		await fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
		await vi.waitFor(() => expect(dashboardReads).toBe(2));
		await fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
		await vi.waitFor(() => expect(dashboardReads).toBe(3));

		hideReload.resolve(
			jsonResponse(200, {
				...emptyDashboard,
				hidden: [{ id: 's1', title: 'Iran talks' }],
			}),
		);
		expect(await screen.findByRole('button', { name: 'show' })).toBeVisible();
		expect(screen.queryByRole('article', { name: 'Iran talks' })).not.toBeInTheDocument();

		followReload.resolve(
			jsonResponse(200, {
				...emptyDashboard,
				developing: [{ ...iranTalks, followState: 'follow' }],
			}),
		);
		await flushPaint();

		expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();
		expect(screen.queryByRole('article', { name: 'Iran talks' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'show' })).toBeVisible();
		expect(
			mock.calls
				.filter((call) => call.url === '/api/stories/s1/follow-state')
				.map((call) => call.body),
		).toEqual([{ state: 'follow' }, { state: 'hide' }]);
	});

	it('shows Home and Topics in the first render and no Stories or Sources link', () => {
		install(({ url }) => {
			if (url === '/api/me') return jsonResponse(401, signedOut);
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(screen.getByRole('heading', { level: 1, name: 'Informed News' })).toBeVisible();
		expect(screen.getByText('informed-news')).toBeVisible();
		expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/shell');
		expect(screen.getByRole('link', { name: 'Topics' })).toHaveAttribute('href', '/topics');
		expect(screen.queryByRole('link', { name: 'Stories' })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Sources' })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Brief' })).not.toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Breaking' })).not.toBeInTheDocument();
		expect(screen.queryByRole('heading', { name: 'Developing stories' })).not.toBeInTheDocument();
	});
});

const FETCH_AT = '2026-11-12T15:04:00.000Z';
const SINCE_AT = '2026-11-12T18:30:00.000Z';

function localTime(iso: string): string {
	return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function overviewBody(partial: {
	keysOn: boolean;
	running: boolean;
	runningSince?: string | null;
	last?: { ok: boolean; completedAt: string } | null;
}) {
	return {
		ok: true,
		fixture: true,
		version: '9.9.9',
		signedIn: true,
		keysOn: partial.keysOn,
		refresh: {
			running: partial.running,
			runningSince: partial.runningSince ?? null,
			last: partial.last ?? null,
		},
	};
}

function header(): HTMLElement {
	const element = document.querySelector('header');
	if (!(element instanceof HTMLElement)) throw new Error('missing header');
	return element;
}

describe('DashboardHome refresh status', () => {
	it('shows the overview status on a signed-in empty dashboard and no Version text', async () => {
		install(({ url }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
			if (url === '/api/brief/overview') {
				return jsonResponse(
					200,
					overviewBody({
						keysOn: true,
						running: false,
						last: { ok: true, completedAt: FETCH_AT },
					}),
				);
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByText('Last fetch succeeded')).toBeVisible();
		const time = within(header()).getByText(localTime(FETCH_AT));
		expect(time).toHaveAttribute('datetime', FETCH_AT);
		expect(time.textContent?.trim()).not.toBe(FETCH_AT);
		expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
		expect(screen.queryByText('Keys on')).not.toBeInTheDocument();
		expect(screen.queryByText('Provider keys off')).not.toBeInTheDocument();
		expect(screen.getByText('0 trackers have news')).toBeVisible();
	});

	it('shows Refreshing since for a running overview', async () => {
		let posts = 0;
		install(({ url, method }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
			if (url === '/api/brief/overview') {
				return jsonResponse(
					200,
					overviewBody({ keysOn: true, running: true, runningSince: SINCE_AT }),
				);
			}
			if (url === '/api/fetch' && method === 'POST') {
				posts += 1;
				return jsonResponse(200, { ok: true });
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByText('Refreshing since')).toBeVisible();
		const time = within(header()).getByText(localTime(SINCE_AT));
		expect(time).toHaveAttribute('datetime', SINCE_AT);
		expect(time).toHaveAttribute('title', new Date(SINCE_AT).toLocaleString());
		const button = screen.getByRole('button', { name: 'Refreshing…' });
		expect(button).toBeDisabled();
		await fireEvent.click(button);
		await flushPaint();
		expect(posts).toBe(0);
		expect(screen.getByText('Refreshing since')).toBeVisible();
		expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
	});

	it('POSTs /api/fetch once and keeps Refreshing since when that overview is shown again', async () => {
		let posts = 0;
		const mock = install(({ url, method }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
			if (url === '/api/brief/overview') {
				if (posts === 0) {
					return jsonResponse(200, overviewBody({ keysOn: true, running: false }));
				}
				return jsonResponse(
					200,
					overviewBody({ keysOn: true, running: true, runningSince: SINCE_AT }),
				);
			}
			if (url === '/api/fetch' && method === 'POST') {
				posts += 1;
				return jsonResponse(200, { ok: true });
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		const refresh = await screen.findByRole('button', { name: 'Refresh' });
		expect(screen.getByText('No fetch yet')).toBeVisible();
		await fireEvent.click(refresh);
		expect(await screen.findByText('Refreshing since')).toBeVisible();
		expect(within(header()).getByText(localTime(SINCE_AT))).toHaveAttribute('datetime', SINCE_AT);
		expect(mock.calls.filter((call) => call.url === '/api/fetch')).toEqual([
			{ url: '/api/fetch', method: 'POST', body: {}, credentials: 'include' },
		]);
		await fireEvent.click(screen.getByRole('button', { name: 'Refreshing…' }));
		await flushPaint();
		expect(posts).toBe(1);
		expect(screen.getByText('Refreshing since')).toBeVisible();
	});

	it('does not POST when keys are off', async () => {
		let posts = 0;
		install(({ url, method }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
			if (url === '/api/brief/overview') {
				return jsonResponse(200, overviewBody({ keysOn: false, running: false }));
			}
			if (url === '/api/fetch' && method === 'POST') {
				posts += 1;
				return jsonResponse(200, { ok: true });
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		const button = await screen.findByRole('button', { name: 'Refresh' });
		expect(button).toBeDisabled();
		expect(screen.getByText('No fetch yet')).toBeVisible();
		await fireEvent.click(button);
		await flushPaint();
		expect(posts).toBe(0);
	});

	it('keeps the previous line and Refresh button when the overview after a click fails', async () => {
		let posts = 0;
		let overviewReads = 0;
		install(({ url, method }) => {
			if (url === '/api/me') return jsonResponse(200, signedIn);
			if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
			if (url === '/api/brief/overview') {
				overviewReads += 1;
				if (overviewReads === 1) {
					return jsonResponse(
						200,
						overviewBody({
							keysOn: true,
							running: false,
							last: { ok: true, completedAt: FETCH_AT },
						}),
					);
				}
				return jsonResponse(503, { ok: false });
			}
			if (url === '/api/fetch' && method === 'POST') {
				posts += 1;
				return jsonResponse(200, { ok: true });
			}
			return jsonResponse(404, { ok: false });
		});

		render(DashboardHome);

		expect(await screen.findByText('Last fetch succeeded')).toBeVisible();
		await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await vi.waitFor(() => expect(overviewReads).toBe(2));
		expect(posts).toBe(1);
		expect(screen.getByText('Last fetch succeeded')).toBeVisible();
		expect(within(header()).getByText(localTime(FETCH_AT))).toHaveAttribute('datetime', FETCH_AT);
		expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
	});

	it('polls a running overview until the fetch succeeds, and stops the poll on unmount', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		let overviews = 0;
		let running = true;
		try {
			install(({ url }) => {
				if (url === '/api/me') return jsonResponse(200, signedIn);
				if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
				if (url === '/api/brief/overview') {
					overviews += 1;
					if (running) {
						return jsonResponse(
							200,
							overviewBody({ keysOn: true, running: true, runningSince: SINCE_AT }),
						);
					}
					return jsonResponse(
						200,
						overviewBody({
							keysOn: true,
							running: false,
							last: { ok: true, completedAt: FETCH_AT },
						}),
					);
				}
				return jsonResponse(404, { ok: false });
			});

			const shown = render(DashboardHome);
			expect(await screen.findByText('Refreshing since')).toBeVisible();
			const afterLoad = overviews;
			running = false;
			await vi.advanceTimersByTimeAsync(REFRESH_POLL_MS);
			expect(await screen.findByText('Last fetch succeeded')).toBeVisible();
			expect(within(header()).getByText(localTime(FETCH_AT))).toHaveAttribute('datetime', FETCH_AT);
			expect(overviews).toBe(afterLoad + 1);
			shown.unmount();

			running = true;
			const again = render(DashboardHome);
			expect(await screen.findByText('Refreshing since')).toBeVisible();
			const whileRunning = overviews;
			again.unmount();
			await vi.advanceTimersByTimeAsync(REFRESH_POLL_MS);
			expect(overviews).toBe(whileRunning);
		} finally {
			vi.useRealTimers();
		}
	});

	it('settles a refresh POST that does not succeed instead of leaving Refreshing up', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const finishedAt = '2026-11-12T19:10:00.000Z';
		let posts = 0;
		let overviews = 0;
		try {
			install(({ url, method }) => {
				if (url === '/api/me') return jsonResponse(200, signedIn);
				if (url === '/api/dashboard') return jsonResponse(200, emptyDashboard);
				if (url === '/api/brief/overview') {
					overviews += 1;
					if (posts === 0) {
						return jsonResponse(200, overviewBody({ keysOn: true, running: false }));
					}
					if (overviews === 2) {
						return jsonResponse(
							200,
							overviewBody({ keysOn: true, running: true, runningSince: SINCE_AT }),
						);
					}
					return jsonResponse(
						200,
						overviewBody({
							keysOn: true,
							running: false,
							last: { ok: true, completedAt: finishedAt },
						}),
					);
				}
				if (url === '/api/fetch' && method === 'POST') {
					posts += 1;
					return jsonResponse(502, { ok: false });
				}
				return jsonResponse(404, { ok: false });
			});

			render(DashboardHome);
			expect(await screen.findByText('No fetch yet')).toBeVisible();
			await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
			await vi.waitFor(() => expect(overviews).toBe(2));
			expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled();
			await vi.advanceTimersByTimeAsync(REFRESH_POLL_MS);
			expect(await screen.findByText('Last fetch succeeded')).toBeVisible();
			expect(within(header()).getByText(localTime(finishedAt))).toHaveAttribute('datetime', finishedAt);
			expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
			expect(posts).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});
});
