import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { page } from '$app/state';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBriefFetchMock, jsonResponse } from '$lib/brief/fetchMock';
import { CONTENT_FILTER_STORAGE_KEY } from './assemble';
import { resetFeedbackCache } from './FeedbackButtons.svelte';
import BriefScreen from './BriefScreen.svelte';
import type { InformedCitationMark } from './citationMarks';

const unverifiedLink: InformedCitationMark = {
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
};

function setPath(path: string): void {
	// `$app/state` exposes `page.url` as a getter. Mutate the URL it already holds.
	page.url.href = `http://localhost${path}`;
}

function overview(partial: Pick<Overview, 'sections' | 'quiet'>): Overview {
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
	vi.unstubAllGlobals();
});

function install(options: {
	stories?: unknown[];
	brief?: Overview;
	onSummary?: () => Response | Promise<Response>;
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
	let summaryPosts = 0;
	const mock = installBriefFetchMock(({ url, method }) => {
		if (url === '/api/batches/latest') return jsonResponse(200, { id: 'batch-1' });
		if (url === '/api/batches/batch-1/categories') {
			return jsonResponse(200, { categories: [{ id: 'world', categoryName: 'Brief' }] });
		}
		if (url.startsWith('/api/batches/batch-1/categories/world/stories')) {
			return jsonResponse(200, { stories });
		}
		if (url === '/api/brief/overview') return jsonResponse(200, brief);
		if (url.startsWith('/api/triage/filtered')) {
			filteredUrls.push(url);
			return jsonResponse(401, { ok: false });
		}
		if (url === '/api/fetch' && method === 'POST') return jsonResponse(200, { ok: true });
		if (url.includes('/summary') && method === 'POST') {
			summaryPosts += 1;
			return options.onSummary ? options.onSummary() : jsonResponse(401, { ok: false });
		}
		if (url === '/api/feedback') return jsonResponse(200, { ok: true, entries: [] });
		return jsonResponse(404, { ok: false });
	});
	return {
		...mock,
		filteredUrls,
		summaryPosts: () => summaryPosts,
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
