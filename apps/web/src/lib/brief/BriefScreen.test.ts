import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { goto, replaceState } from '$app/navigation';
import { page } from '$app/state';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBriefFetchMock, jsonResponse } from '$lib/brief/fetchMock';
import { CONTENT_FILTER_STORAGE_KEY, SHARED_STORY_NOT_FOUND } from './assemble';
import { resetFeedbackCache } from './FeedbackButtons.svelte';
import BriefScreen from './BriefScreen.svelte';
import type { InformedCitationMark } from './citationMarks';

// The unit runner has no SvelteKit router, so navigation is recorded instead of run.
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: vi.fn(async () => {}),
	replaceState: vi.fn(),
}));

const unverifiedLink:InformedCitationMark = {
	kind: 'url',
	status: 'missing-source',
	display: 'unverified',
	itemId: 'https://missing.example/x',
	url: 'https://missing.example/x',
};

type Overview = {
	ok: true;
	filteredOut: number;
	notices: string[];
	sections: Array<{
		topicId: string;
		name: string;
		level: 'core' | 'watch';
		storyIds: string[];
		moreIds: string[];
	}>;
	quiet: Array<{ id: string; name: string; level: 'core' | 'watch' }>;
	refresh?: {
		lastSuccess: { completedAt: string } | null;
		nextAt: string | null;
	};
};

function setPath(path: string): void {
	// `$app/state` exposes `page.url` as a getter. Mutate the URL it already holds.
	page.url.href = `http://localhost${path}`;
}

function overview(partial: Pick<Overview, 'sections' | 'quiet'> & Partial<Pick<Overview, 'refresh' | 'notices'>>): Overview {
	return { ok: true, filteredOut: 0, notices: [], ...partial };
}

function story(partial: Record<string, unknown> = {}) {
	return {
		id: 'story-1',
		cluster_number: 1,
		category: 'Brief',
		title: 'Battery storage rises',
		short_summary: '',
		informed_article_id: 'story-1',
		informed_topic_id: 'grid',
		informed_topic_name: 'Grid',
		informed_summary_status: 'missing',
		informed_citation_marks: [unverifiedLink],
		...partial,
	};
}

afterEach(() => {
	cleanup();
	resetFeedbackCache();
	setPath('/');
	vi.mocked(localStorage.getItem).mockReset();
	vi.mocked(goto).mockClear();
	vi.mocked(replaceState).mockClear();
	vi.unstubAllGlobals();
});

function install(options: {
	stories?: unknown[];
	brief?: Overview;
	onSummary?: () => Response | Promise<Response>;
	onFull?: () => Response | Promise<Response>;
	onSeen?: () => Response | Promise<Response>;
	onUnseen?: () => Response | Promise<Response>;
}) {
	const stories = options.stories ?? [];
	const brief =
		options.brief ??
		overview({
			sections: [
				{
					topicId: 'grid',
					name: 'Grid',
					level: 'core',
					storyIds: stories.map((item) => (item as { id: string }).id),
					moreIds: [],
				},
			],
			quiet: [],
		});
	const filteredUrls: string[] = [];
	const seenBodies: unknown[] = [];
	const seenIds = new Set<string>();
	const unseenUrls: string[] = [];
	let summaryPosts = 0;
	let fullPosts = 0;
	let refreshed = false;
	const mock = installBriefFetchMock(({ url, method, body }) => {
		if (url === '/api/batches/latest') return jsonResponse(200, { id: 'batch-1' });
		if (url === '/api/batches/batch-1/categories') {
			return jsonResponse(200, { categories: [{ id: 'world', categoryName: 'Brief' }] });
		}
		if (url.startsWith('/api/batches/batch-1/categories/world/stories')) {
			const visible = refreshed
				? stories.filter((item) => !seenIds.has((item as { id: string }).id))
				: stories;
			return jsonResponse(200, { stories: visible });
		}
		if (url === '/api/brief/overview') return jsonResponse(200, brief);
		if (url.startsWith('/api/triage/filtered')) {
			filteredUrls.push(url);
			return jsonResponse(401, { ok: false });
		}
		if (url === '/api/brief/seen' && method === 'POST') {
			seenBodies.push(body);
			if (options.onSeen) return options.onSeen();
			const ids = (body as { articleIds?: string[] } | undefined)?.articleIds ?? [];
			for (const id of ids) seenIds.add(id);
			return jsonResponse(200, { ok: true });
		}
		if (url.startsWith('/api/brief/seen/') && method === 'DELETE') {
			unseenUrls.push(url);
			if (options.onUnseen) return options.onUnseen();
			return jsonResponse(200, { ok: true, cleared: 1 });
		}
		if (url === '/api/fetch' && method === 'POST') {
			refreshed = true;
			return jsonResponse(200, { ok: true });
		}
		if (url.includes('/summary') && method === 'POST') {
			summaryPosts += 1;
			return options.onSummary ? options.onSummary() : jsonResponse(401, { ok: false });
		}
		if (url.includes('/full') && method === 'POST') {
			fullPosts += 1;
			return options.onFull ? options.onFull() : jsonResponse(401, { ok: false });
		}
		if (url === '/api/feedback') return jsonResponse(200, { ok: true, entries: [] });
		return jsonResponse(404, { ok: false });
	});
	return {
		...mock,
		filteredUrls,
		seenBodies,
		unseenUrls,
		summaryPosts: () => summaryPosts,
		fullPosts: () => fullPosts,
	};
}

describe('BriefScreen empty topic copy', () => {
	it('says No topics yet and links to Topics when nothing is quiet', async () => {
		const mock = install({
			brief: overview({ sections: [], quiet: [] }),
		});
		render(BriefScreen);
		expect(await screen.findByRole('heading', { name: 'Your topics', level: 2 })).toBeVisible();
		expect(screen.getByText(/No topics yet\./)).toBeVisible();
		expect(screen.getByRole('link', { name: 'Add topics' })).toHaveAttribute('href', '/topics');
		expect(screen.queryByText('No new stories for your topics.')).not.toBeInTheDocument();
		mock.restore();
	});

	it('keeps the quiet-topics sentence when topics exist and nothing is new', async () => {
		const mock = install({
			brief: overview({
				sections: [],
				quiet: [{ id: 'grid', name: 'Grid', level: 'core' }],
			}),
		});
		render(BriefScreen);
		expect(await screen.findByText('No new stories for your topics.')).toBeVisible();
		expect(screen.getByTestId('topic-brief-quiet')).toHaveTextContent('Nothing new: Grid');
		expect(screen.queryByText(/No topics yet\./)).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Add topics' })).not.toBeInTheDocument();
		mock.restore();
	});
});

describe('BriefScreen filtered reload', () => {
	it('fetches filtered stories once until Refresh, then once more while Filtered is showing', async () => {
		const mock = install({
			stories: [story()],
			brief: overview({
				sections: [
					{ topicId: 'grid', name: 'Grid', level: 'core', storyIds: ['story-1'], moreIds: [] },
				],
				quiet: [],
			}),
		});
		render(BriefScreen);
		await screen.findByRole('heading', { name: 'Your topics', level: 2 });
		expect(mock.filteredUrls).toHaveLength(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Filtered' }));
		await screen.findByRole('link', { name: 'Log in on Topics to see filtered stories' });
		expect(mock.filteredUrls).toHaveLength(1);

		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(mock.filteredUrls).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await vi.waitFor(() => expect(mock.filteredUrls).toHaveLength(2));
		mock.restore();
	});
});

describe('BriefScreen summary request', () => {
	it('shows a loading line, then a Topics link on 401, and retries after the card is closed', async () => {
		let release: (response: Response) => void = () => {};
		const first = new Promise<Response>((resolve) => {
			release = resolve;
		});
		let gate: Promise<Response> = first;
		const mock = install({
			stories: [story()],
			onSummary: () => gate,
		});
		render(BriefScreen);
		const title = await screen.findByRole('button', { name: 'Battery storage rises' });
		await fireEvent.click(title);
		expect(await screen.findByText('Loading summary…')).toBeVisible();
		expect(screen.queryByText('Summary loads when you open this story')).not.toBeInTheDocument();
		expect(mock.summaryPosts()).toBe(1);

		release(jsonResponse(401, { ok: false }));
		const login = await screen.findByRole('link', { name: 'Log in on Topics to load summaries' });
		expect(login).toHaveAttribute('href', '/topics');
		await tick();
		expect(mock.summaryPosts()).toBe(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Battery storage rises' }));
		expect(await screen.findByText('Summary loads when you open this story')).toBeVisible();

		let releaseAgain: (response: Response) => void = () => {};
		gate = new Promise<Response>((resolve) => {
			releaseAgain = resolve;
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Battery storage rises' }));
		expect(await screen.findByText('Loading summary…')).toBeVisible();
		expect(mock.summaryPosts()).toBe(2);
		releaseAgain(jsonResponse(500, { ok: false }));
		expect(await screen.findByText('Summary could not be loaded right now.')).toBeVisible();
		await tick();
		expect(mock.summaryPosts()).toBe(2);
		mock.restore();
	});
});

describe('BriefScreen shared card', () => {
	it('blurs a keyword match and still shows citation marks without making the title a button', async () => {
		setPath('/latest/world/0?shared=1');
		vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
			if (key !== CONTENT_FILTER_STORAGE_KEY) return null;
			return JSON.stringify({
				keywords: ['battery'],
				filterMode: 'blur',
				filterScope: 'title',
				version: 1,
			});
		});
		const mock = install({ stories: [story()] });
		render(BriefScreen);

		const reveal = await screen.findByRole('button', { name: 'filtered (matches "battery")' });
		expect(screen.queryByRole('button', { name: 'Battery storage rises' })).not.toBeInTheDocument();
		expect(screen.queryByTestId('citation-guard-marks')).not.toBeInTheDocument();

		await fireEvent.click(reveal);
		expect(await screen.findByText('Citation checks')).toBeVisible();
		expect(screen.getByText('Battery storage rises')).toBeVisible();
		expect(screen.queryByRole('button', { name: 'Battery storage rises' })).not.toBeInTheDocument();
		mock.restore();
	});
});

const fullStory = {
	status: 'ok' as const,
	changeSummary: 'New outlets',
	timeline: [{ date: 'Monday', content: 'The vote' }],
	perspectives: [{ text: 'One view' }],
	quote: 'A line',
	talking_points: ['Stored point'],
};

describe('BriefScreen full story, seen marks, and refresh clock', () => {
	it('opening one card fetches the full story and renders its details', async () => {
		const mock = install({
			stories: [story({ informed_full_story_status: 'missing', informed_summary_status: 'ok' })],
			onFull: () => jsonResponse(200, { ok: true, fullStory }),
		});
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		expect(await screen.findByText('Loading full story…')).toBeVisible();
		expect(await screen.findByText(/The vote/)).toBeVisible();
		expect(screen.getByText('One view')).toBeVisible();
		expect(screen.getByText('A line')).toBeVisible();
		expect(screen.getByText('Updated: New outlets')).toBeVisible();
		expect(mock.fullPosts()).toBe(1);
		mock.restore();
	});

	it('a signed-out full story links to Topics', async () => {
		const mock = install({
			stories: [story({ informed_full_story_status: 'missing', informed_summary_status: 'ok' })],
			onFull: () => jsonResponse(401, { ok: false }),
		});
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		const login = await screen.findByRole('link', { name: 'Log in on Topics to load full stories' });
		expect(login).toHaveAttribute('href', '/topics');
		expect(mock.fullPosts()).toBe(1);
		mock.restore();
	});

	it('does not fetch a full story when Expand all opens more than one card, matching Kite', async () => {
		const second = story({
			id: 'story-2',
			cluster_number: 2,
			title: 'Ports stay open',
			informed_article_id: 'story-2',
			informed_full_story_status: 'missing',
			informed_summary_status: 'ok',
		});
		const mock = install({
			stories: [
				story({ informed_full_story_status: 'missing', informed_summary_status: 'ok' }),
				second,
			],
			onFull: () => jsonResponse(200, { ok: true, fullStory }),
		});
		render(BriefScreen);
		await screen.findByRole('heading', { name: 'Your topics', level: 2 });
		await fireEvent.doubleClick(screen.getByRole('button', { name: 'Brief' }));
		expect(screen.getByRole('button', { name: 'Battery storage rises' })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		expect(screen.getByRole('button', { name: 'Ports stay open' })).toHaveAttribute(
			'aria-expanded',
			'true',
		);
		await tick();
		expect(mock.fullPosts()).toBe(0);
		mock.restore();
	});

	it('a card the guard skips shows a load control, not the loading line, and sends no request', async () => {
		const second = story({
			id: 'story-2',
			cluster_number: 2,
			title: 'Ports stay open',
			informed_article_id: 'story-2',
			informed_full_story_status: 'missing',
			informed_summary_status: 'ok',
		});
		const mock = install({
			stories: [story({ informed_full_story_status: 'missing', informed_summary_status: 'ok' }), second],
			onFull: () => jsonResponse(200, { ok: true, fullStory }),
		});
		render(BriefScreen);
		await screen.findByRole('heading', { name: 'Your topics', level: 2 });
		await fireEvent.doubleClick(screen.getByRole('button', { name: 'Brief' }));
		await tick();
		expect(mock.fullPosts()).toBe(0);
		expect(screen.queryByText('Loading full story…')).not.toBeInTheDocument();
		const loaders = screen.getAllByRole('button', { name: 'Load full story' });
		expect(loaders).toHaveLength(2);
		await fireEvent.click(loaders[1]);
		expect(await screen.findByText(/The vote/)).toBeVisible();
		expect(mock.fullPosts()).toBe(1);
		expect(screen.queryByText('Loading full story…')).not.toBeInTheDocument();
		mock.restore();
	});

	it('a card opened while another is open sends no request and offers Load; Load sends exactly one', async () => {
		const second = story({
			id: 'story-2',
			cluster_number: 2,
			title: 'Ports stay open',
			informed_article_id: 'story-2',
			informed_full_story_status: 'missing',
			informed_summary_status: 'ok',
		});
		const mock = install({
			stories: [story({ informed_full_story_status: 'missing', informed_summary_status: 'ok' }), second],
			onFull: () => jsonResponse(200, { ok: true, fullStory }),
		});
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		expect(await screen.findByText(/The vote/)).toBeVisible();
		expect(mock.fullPosts()).toBe(1);
		await fireEvent.click(screen.getByRole('button', { name: 'Ports stay open' }));
		await tick();
		expect(mock.fullPosts()).toBe(1);
		expect(screen.queryByText('Loading full story…')).not.toBeInTheDocument();
		const loader = screen.getByRole('button', { name: 'Load full story' });
		await fireEvent.click(loader);
		await waitFor(() => expect(screen.getAllByText(/The vote/)).toHaveLength(2));
		expect(mock.fullPosts()).toBe(2);
		mock.restore();
	});

	it('a failed Load on a guard-skipped card shows the error', async () => {
		const second = story({
			id: 'story-2',
			cluster_number: 2,
			title: 'Ports stay open',
			informed_article_id: 'story-2',
			informed_full_story_status: 'missing',
			informed_summary_status: 'ok',
		});
		let calls = 0;
		const mock = install({
			stories: [story({ informed_full_story_status: 'missing', informed_summary_status: 'ok' }), second],
			onFull: () => (++calls === 1 ? jsonResponse(200, { ok: true, fullStory }) : jsonResponse(500, { ok: false })),
		});
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		await screen.findByText(/The vote/);
		await fireEvent.click(screen.getByRole('button', { name: 'Ports stay open' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Load full story' }));
		expect(await screen.findByText('Full story could not be loaded right now.')).toBeVisible();
		expect(mock.fullPosts()).toBe(2);
		mock.restore();
	});

	it('fetches the provider status line fresh, never from the HTTP cache', async () => {
		const mock = install({
			stories: [story({ informed_summary_status: 'ok' })],
			brief: overview({ sections: [], quiet: [], notices: ['Summaries unavailable (Ollama not configured)'] }),
		});
		render(BriefScreen);
		expect(await screen.findByText('Summaries unavailable (Ollama not configured)')).toBeVisible();
		const init = mock.fetchMock.mock.calls.find(([url]) => url === '/api/brief/overview')?.[1];
		expect(init?.cache).toBe('no-store');
		mock.restore();
	});

	it('a failed full-story request shows the error and no loading line', async () => {
		const mock = install({
			stories: [story({ informed_full_story_status: 'missing', informed_summary_status: 'ok' })],
			onFull: () => jsonResponse(500, { ok: false }),
		});
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		expect(await screen.findByText('Full story could not be loaded right now.')).toBeVisible();
		expect(screen.queryByText('Loading full story…')).not.toBeInTheDocument();
		expect(mock.fullPosts()).toBe(1);
		mock.restore();
	});

	it('has exactly one level-1 heading, above the Your topics h2', async () => {
		const mock = install({ stories: [story({ informed_summary_status: 'ok' })] });
		render(BriefScreen);
		await screen.findByRole('heading', { name: 'Your topics', level: 2 });
		const h1s = screen.getAllByRole('heading', { level: 1 });
		expect(h1s).toHaveLength(1);
		expect(h1s[0]).toHaveTextContent('Informed News');
		mock.restore();
	});

	it('opening, Mark as read, and Mark all as read each post seen marks', async () => {
		const second = story({
			id: 'story-2',
			cluster_number: 2,
			title: 'Ports stay open',
			informed_article_id: 'story-2',
			informed_summary_status: 'ok',
		});
		const third = story({
			id: 'story-3',
			cluster_number: 3,
			title: 'Demand response',
			informed_article_id: 'story-3',
			informed_summary_status: 'ok',
		});
		const mock = install({
			stories: [story({ informed_summary_status: 'ok' }), second, third],
		});
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		await vi.waitFor(() => expect(mock.seenBodies).toEqual([{ articleIds: ['story-1'] }]), {
			timeout: 2500,
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);
		await vi.waitFor(
			() =>
				expect(mock.seenBodies).toEqual([
					{ articleIds: ['story-1'] },
					{ articleIds: ['story-2'] },
				]),
			{ timeout: 2500 },
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
		await vi.waitFor(
			() =>
				expect(mock.seenBodies).toEqual([
					{ articleIds: ['story-1'] },
					{ articleIds: ['story-2'] },
					{ articleIds: ['story-3'] },
				]),
			{ timeout: 2500 },
		);
		mock.restore();
	});

	it('hides a seen story after the next refresh returns the server list without it', async () => {
		const mock = install({
			stories: [
				story({ informed_summary_status: 'ok' }),
				story({
					id: 'story-2',
					cluster_number: 2,
					title: 'Ports stay open',
					informed_article_id: 'story-2',
					informed_summary_status: 'ok',
				}),
			],
		});
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		await vi.waitFor(() => expect(mock.seenBodies.length).toBe(1), { timeout: 2500 });
		await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await vi.waitFor(() =>
			expect(screen.queryByRole('button', { name: 'Battery storage rises' })).not.toBeInTheDocument(),
		);
		expect(screen.getByRole('button', { name: 'Ports stay open' })).toBeVisible();
		mock.restore();
	});

	it('renders the last-updated and next-refresh clock on the refresh bar', async () => {
		const now = Date.now();
		const mock = install({
			stories: [story({ informed_summary_status: 'ok' })],
			brief: overview({
				sections: [
					{ topicId: 'grid', name: 'Grid', level: 'core', storyIds: ['story-1'], moreIds: [] },
				],
				quiet: [],
				refresh: {
					lastSuccess: { completedAt: new Date(now - 30_000).toISOString() },
					nextAt: new Date(now + 3_600_000).toISOString(),
				},
			}),
		});
		render(BriefScreen);
		expect(await screen.findByText(/Updated/)).toBeVisible();
		expect(screen.getByText(/Next refresh/)).toBeVisible();
		mock.restore();
	});
});

function threeStories() {
	return [
		story({ informed_summary_status: 'ok' }),
		story({
			id: 'story-2',
			cluster_number: 2,
			title: 'Ports stay open',
			informed_article_id: 'story-2',
			informed_summary_status: 'ok',
		}),
		story({
			id: 'story-3',
			cluster_number: 3,
			title: 'Demand response',
			informed_article_id: 'story-3',
			informed_summary_status: 'ok',
		}),
	];
}

function card(title: string): HTMLElement {
	return screen.getByRole('article', { name: `News story: ${title}` });
}

describe('BriefScreen visible read state (NEWS-204)', () => {
	it('Mark as read gives the card a visible Read marker and announces it politely', async () => {
		const mock = install({ stories: threeStories() });
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		expect(card('Battery storage rises')).not.toHaveAttribute('data-read');
		await fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);
		const read = card('Battery storage rises');
		expect(read).toHaveAttribute('data-read', 'true');
		expect(within(read).getByText('Read')).toBeVisible();
		expect(card('Ports stay open')).not.toHaveAttribute('data-read');
		expect(screen.getByTestId('read-announcer')).toHaveAttribute('aria-live', 'polite');
		expect(screen.getByTestId('read-announcer')).toHaveTextContent(
			'Marked as read: Battery storage rises',
		);
		await fireEvent.click(within(read).getByRole('button', { name: 'Mark as unread' }));
		expect(card('Battery storage rises')).not.toHaveAttribute('data-read');
		mock.restore();
	});

	it('Mark all as read marks every rendered card and posts each id once', async () => {
		const mock = install({ stories: threeStories() });
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		await fireEvent.click(screen.getAllByRole('button', { name: 'Mark all as read' })[0]);
		for (const title of ['Battery storage rises', 'Ports stay open', 'Demand response']) {
			expect(card(title)).toHaveAttribute('data-read', 'true');
		}
		await vi.waitFor(
			() => expect(mock.seenBodies).toEqual([{ articleIds: ['story-1', 'story-2', 'story-3'] }]),
			{ timeout: 2500 },
		);
		mock.restore();
	});

	it('a failed seen write is not shown as saved: error shown, local mark reverted', async () => {
		const mock = install({
			stories: threeStories(),
			onSeen: () => jsonResponse(500, { ok: false }),
		});
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		await fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);
		const alert = await screen.findByRole('alert', {}, { timeout: 2500 });
		expect(alert).toHaveTextContent("Couldn't save read marks.");
		expect(card('Battery storage rises')).not.toHaveAttribute('data-read');
		mock.restore();
	});

	it('a 401 seen write shows the error and reverts the read style', async () => {
		const mock = install({
			stories: threeStories(),
			onSeen: () => jsonResponse(401, { ok: false, error: 'Unauthorized' }),
		});
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		await fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);
		await screen.findByRole('alert', {}, { timeout: 2500 });
		expect(card('Battery storage rises')).not.toHaveAttribute('data-read');
		mock.restore();
	});
});

describe('BriefScreen read state follows server seen state (NEWS-208)', () => {
	function seenFirst(): unknown[] {
		const stories = threeStories();
		Object.assign(stories[0] as object, {
			informed_seen: true,
			informed_seen_at: '2026-11-09T12:00:00.000Z',
		});
		return stories;
	}

	it('shows stories the server reports as seen as read after a load', async () => {
		const mock = install({ stories: seenFirst() });
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		expect(card('Battery storage rises')).toHaveAttribute('data-read', 'true');
		expect(card('Ports stay open')).not.toHaveAttribute('data-read');
		mock.restore();
	});

	it('opening a card shows it as read', async () => {
		const mock = install({ stories: threeStories() });
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		await vi.waitFor(() =>
			expect(card('Battery storage rises')).toHaveAttribute('data-read', 'true'),
		);
		mock.restore();
	});

	it('Mark as unread sends one DELETE with the exact story id', async () => {
		const mock = install({ stories: seenFirst() });
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		await fireEvent.click(
			within(card('Battery storage rises')).getByRole('button', { name: 'Mark as unread' }),
		);
		expect(card('Battery storage rises')).not.toHaveAttribute('data-read');
		await vi.waitFor(() => expect(mock.unseenUrls).toEqual(['/api/brief/seen/story-1']));
		mock.restore();
	});

	it('a 401 on Mark as unread shows the error and restores the read style', async () => {
		const mock = install({
			stories: seenFirst(),
			onUnseen: () => jsonResponse(401, { ok: false, error: 'Unauthorized' }),
		});
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		await fireEvent.click(
			within(card('Battery storage rises')).getByRole('button', { name: 'Mark as unread' }),
		);
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent("Couldn't save read marks.");
		await vi.waitFor(() =>
			expect(card('Battery storage rises')).toHaveAttribute('data-read', 'true'),
		);
		mock.restore();
	});
});

describe('BriefScreen seen marks across refresh and reload (NEWS-204)', () => {
	it('marks post exact ids once, a reload without refresh keeps cards, a refresh drops them', async () => {
		const mock = install({ stories: threeStories() });
		render(BriefScreen);
		await fireEvent.click(await screen.findByRole('button', { name: 'Battery storage rises' }));
		await vi.waitFor(() => expect(mock.seenBodies).toEqual([{ articleIds: ['story-1'] }]), {
			timeout: 2500,
		});
		// The opened card is now read, so index 0 is the second story.
		await fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]);
		await vi.waitFor(
			() =>
				expect(mock.seenBodies).toEqual([{ articleIds: ['story-1'] }, { articleIds: ['story-2'] }]),
			{ timeout: 2500 },
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
		await vi.waitFor(
			() =>
				expect(mock.seenBodies).toEqual([
					{ articleIds: ['story-1'] },
					{ articleIds: ['story-2'] },
					{ articleIds: ['story-3'] },
				]),
			{ timeout: 2500 },
		);

		// Reload without a refresh: the server list is unchanged, so all cards stay.
		cleanup();
		render(BriefScreen);
		expect(await screen.findByRole('button', { name: 'Battery storage rises' })).toBeVisible();
		expect(screen.getByRole('button', { name: 'Ports stay open' })).toBeVisible();
		expect(screen.getByRole('button', { name: 'Demand response' })).toBeVisible();

		// A successful refresh whose server list omits the seen ids removes them.
		await fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
		await vi.waitFor(() =>
			expect(screen.queryByRole('button', { name: 'Battery storage rises' })).not.toBeInTheDocument(),
		);
		expect(screen.queryByRole('button', { name: 'Ports stay open' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Demand response' })).not.toBeInTheDocument();
		mock.restore();
	});
});

describe('BriefScreen story links (NEWS-204)', () => {
	it('/latest/world/0 opens the first card and the last loaded index opens the last card', async () => {
		setPath('/latest/world/0?shared=1');
		let mock = install({ stories: threeStories() });
		render(BriefScreen);
		expect(await screen.findByText('Viewing a shared story')).toBeVisible();
		expect(card('Battery storage rises')).toBeVisible();
		expect(screen.getAllByRole('article')).toHaveLength(1);
		cleanup();
		mock.restore();

		setPath('/latest/world/2?shared=1');
		mock = install({ stories: threeStories() });
		render(BriefScreen);
		expect(await screen.findByText('Viewing a shared story')).toBeVisible();
		expect(card('Demand response')).toBeVisible();
		expect(screen.getAllByRole('article')).toHaveLength(1);
		mock.restore();
	});

	it('an out-of-range shared index shows the not-found notice and clears shared', async () => {
		setPath('/latest/world/3?shared=1');
		const mock = install({ stories: threeStories() });
		render(BriefScreen);
		expect(await screen.findByText(SHARED_STORY_NOT_FOUND)).toBeVisible();
		expect(screen.queryByText('Viewing a shared story')).not.toBeInTheDocument();
		expect(screen.getAllByRole('article')).toHaveLength(3);
		expect(replaceState).toHaveBeenCalledWith('/latest/world/3', {});
		mock.restore();
	});

	it('an out-of-range index without shared shows the normal Brief and opens nothing', async () => {
		setPath('/latest/world/3');
		const mock = install({ stories: threeStories() });
		render(BriefScreen);
		await screen.findByRole('button', { name: 'Battery storage rises' });
		expect(screen.queryByText(SHARED_STORY_NOT_FOUND)).not.toBeInTheDocument();
		expect(screen.queryByText('Viewing a shared story')).not.toBeInTheDocument();
		for (const title of ['Battery storage rises', 'Ports stay open', 'Demand response']) {
			expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false');
		}
		mock.restore();
	});

	it('leaving a shared view restores the full Brief, and View latest goes to /', async () => {
		setPath('/latest/world/1?shared=1');
		let mock = install({ stories: threeStories() });
		render(BriefScreen);
		expect(await screen.findByText('Viewing a shared story')).toBeVisible();
		await fireEvent.click(screen.getByRole('button', { name: 'View latest stories' }));
		expect(goto).toHaveBeenCalledWith('/');
		cleanup();
		mock.restore();

		// Back lands on the previous URL, which remounts the Brief without `shared`.
		setPath('/');
		mock = install({ stories: threeStories() });
		render(BriefScreen);
		expect(await screen.findByRole('heading', { name: 'Your topics', level: 2 })).toBeVisible();
		expect(screen.queryByText('Viewing a shared story')).not.toBeInTheDocument();
		expect(screen.getAllByRole('article')).toHaveLength(3);
		mock.restore();
	});
});
