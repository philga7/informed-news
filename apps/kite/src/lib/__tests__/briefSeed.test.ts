import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as briefSeed from '$lib/briefSeed';
import {
	BRIEF_SEED_LOGIN_HINT,
	BRIEF_SEED_LOGIN_HREF,
	BRIEF_SEED_LOGIN_LINK_LABEL,
	BRIEF_SEED_NETWORK_ERROR,
	BRIEF_SEED_NO_TOPICS,
	BRIEF_SEED_NO_TOPICS_LINK_LABEL,
	BRIEF_SEED_TOPIC_LABEL,
	BRIEF_SEED_TOPIC_PLACEHOLDER,
	BRIEF_SEED_TOPIC_REQUIRED,
	BRIEF_SEED_URL_REQUIRED,
	BRIEF_SEED_URLS_LABEL,
	buildSeedPayload,
	fetchSeedTopics,
	parseUrlsFromTextarea,
	postBriefSeed,
	seedTopicOptions,
} from '$lib/briefSeed';
import type { Topic } from '$lib/topics';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function makeTopic(id: string, overrides: Partial<Topic> = {}): Topic {
	return {
		id,
		name: `Topic ${id}`,
		kind: 'desired',
		level: 'core',
		description: '',
		keywords: [],
		searchQuery: '',
		sections: [],
		notes: '',
		createdAt: '2026-10-01T00:00:00.000Z',
		updatedAt: '2026-10-01T00:00:00.000Z',
		...overrides,
	};
}

describe('seed form copy', () => {
	it('uses the NEWS-98 labels and messages', () => {
		expect(BRIEF_SEED_TOPIC_LABEL).toBe('Topic');
		expect(BRIEF_SEED_TOPIC_PLACEHOLDER).toBe('Choose a topic');
		expect(BRIEF_SEED_URLS_LABEL).toBe('URLs (one per line, at least one)');
		expect(BRIEF_SEED_NO_TOPICS).toBe('Add a desired topic first.');
		expect(BRIEF_SEED_NO_TOPICS_LINK_LABEL).toBe('Go to Topics');
		expect(BRIEF_SEED_TOPIC_REQUIRED).toBe('Choose a topic.');
		expect(BRIEF_SEED_URL_REQUIRED).toBe('Add at least one URL.');
	});

	it('points the login link at Topics', () => {
		expect(BRIEF_SEED_LOGIN_HINT).toBe('Log in to add stories.');
		expect(BRIEF_SEED_LOGIN_LINK_LABEL).toBe('Log in on Topics');
		expect(BRIEF_SEED_LOGIN_HREF).toBe('/topics');
	});

	it('no longer carries the topic Brief note', () => {
		expect('BRIEF_SEED_TOPIC_BRIEF_NOTE' in briefSeed).toBe(false);
	});
});

describe('Unaccept is retired from Kite', () => {
	it('briefSeed exports no Unaccept helper or copy', () => {
		expect('postBriefUnaccept' in briefSeed).toBe(false);
		expect(Object.keys(briefSeed).filter((key) => key.startsWith('BRIEF_UNACCEPT'))).toEqual([]);
	});

	it('has no unaccept proxy route, and a remove proxy route', () => {
		const route = (dir: string) => resolve('src/routes/api/brief', dir, '+server.ts');
		expect(existsSync(route('unaccept'))).toBe(false);
		expect(existsSync(route('stories/[articleId]/remove'))).toBe(true);
	});
});

describe('parseUrlsFromTextarea', () => {
	it('splits lines and drops blanks', () => {
		expect(
			parseUrlsFromTextarea('https://a.example/x\n\n  https://b.example/y  \n'),
		).toEqual(['https://a.example/x', 'https://b.example/y']);
	});

	it('returns empty for blank input', () => {
		expect(parseUrlsFromTextarea('  \n  ')).toEqual([]);
	});
});

describe('seedTopicOptions', () => {
	it('drops undesired topics', () => {
		const topics = [
			makeTopic('a'),
			makeTopic('u', { kind: 'undesired', level: null, name: 'Celebrity gossip' }),
		];
		expect(seedTopicOptions(topics)).toEqual([{ id: 'a', name: 'Topic a', level: 'core' }]);
	});

	it('lists Core (and no-level) topics before Watch, keeping input order in each group', () => {
		const topics = [
			makeTopic('w1', { level: 'watch' }),
			makeTopic('c1'),
			makeTopic('n1', { level: null }),
			makeTopic('w2', { level: 'watch' }),
			makeTopic('c2'),
		];
		expect(seedTopicOptions(topics)).toEqual([
			{ id: 'c1', name: 'Topic c1', level: 'core' },
			{ id: 'n1', name: 'Topic n1', level: 'core' },
			{ id: 'c2', name: 'Topic c2', level: 'core' },
			{ id: 'w1', name: 'Topic w1', level: 'watch' },
			{ id: 'w2', name: 'Topic w2', level: 'watch' },
		]);
	});

	it('returns an empty list when there are no desired topics', () => {
		expect(seedTopicOptions([makeTopic('u', { kind: 'undesired' })])).toEqual([]);
	});
});

describe('fetchSeedTopics', () => {
	it('returns the topics from GET /api/topics', async () => {
		const topics = [makeTopic('a')];
		const fetchFn = vi.fn(async () =>
			jsonResponse(200, { ok: true, topics, updatedAt: '2026-10-01T00:00:00.000Z' }),
		);
		expect(await fetchSeedTopics(fetchFn as unknown as typeof fetch)).toEqual({ ok: true, topics });
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/topics');
		expect(init.credentials).toBe('include');
	});

	it('maps 401 to the login hint', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(await fetchSeedTopics(fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: true,
			error: 'Log in to add stories.',
		});
	});

	it('maps a server failure to the topics load error', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(500, { ok: false, error: 'disk full' }));
		expect(await fetchSeedTopics(fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: false,
			error: 'Could not load topics. Try again.',
		});
	});

	it('maps a network failure to the topics network error', async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		expect(await fetchSeedTopics(fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: false,
			error: 'Network error while talking to the topics API. Check that the server is running on :3001.',
		});
	});
});

describe('buildSeedPayload', () => {
	it('requires a title', () => {
		expect(buildSeedPayload({ title: '  ', topicId: 't', note: '', urlsText: 'https://a.example' })).toEqual({
			ok: false,
			error: 'Title is required.',
		});
	});

	it('requires a topic', () => {
		expect(buildSeedPayload({ title: 'T', topicId: '', note: '', urlsText: 'https://a.example' })).toEqual({
			ok: false,
			error: 'Choose a topic.',
		});
	});

	it('requires at least one URL', () => {
		expect(buildSeedPayload({ title: 'T', topicId: 't', note: '', urlsText: ' \n ' })).toEqual({
			ok: false,
			error: 'Add at least one URL.',
		});
	});

	it('trims fields and omits a blank note', () => {
		expect(
			buildSeedPayload({
				title: '  Port strike  ',
				topicId: 'core-1',
				note: '   ',
				urlsText: 'https://a.example/x\n\nhttps://b.example/y',
			}),
		).toEqual({
			ok: true,
			payload: {
				title: 'Port strike',
				topicId: 'core-1',
				urls: ['https://a.example/x', 'https://b.example/y'],
			},
		});
	});

	it('keeps a non-blank note', () => {
		expect(
			buildSeedPayload({ title: 'T', topicId: 't', note: ' why ', urlsText: 'https://a.example' }),
		).toEqual({
			ok: true,
			payload: { title: 'T', topicId: 't', note: 'why', urls: ['https://a.example'] },
		});
	});
});

describe('postBriefSeed', () => {
	const payload = {
		title: 'Port strike',
		topicId: 'core-1',
		urls: ['https://a.example/x'],
	};

	it('posts the payload with topicId and urls and maps 200', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(200, { ok: true, articleId: 'art-1', clusterId: 'cl-1', topicId: 'core-1' }),
		);
		expect(await postBriefSeed(payload, fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			clusterId: 'cl-1',
		});
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('/api/brief/seed');
		expect(init.method).toBe('POST');
		expect(init.credentials).toBe('include');
		expect(JSON.parse(init.body as string)).toEqual({
			title: 'Port strike',
			topicId: 'core-1',
			urls: ['https://a.example/x'],
		});
	});

	it('shows 400 validation copy from the server', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(400, { ok: false, error: 'topic must be a desired topic' }),
		);
		expect(await postBriefSeed(payload, fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			status: 400,
			error: 'topic must be a desired topic',
		});
	});

	it('shows 409 refusal copy verbatim', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(409, {
				ok: false,
				code: 'duplicate',
				error: "Already in your Brief: 'Port strike ends' under Shipping.",
				existing: { articleId: 'art-0', title: 'Port strike ends', topicName: 'Shipping' },
			}),
		);
		expect(await postBriefSeed(payload, fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			status: 409,
			error: "Already in your Brief: 'Port strike ends' under Shipping.",
		});
	});

	it('maps 401 to the login hint', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(await postBriefSeed(payload, fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			status: 401,
			error: 'Log in to add stories.',
			unauthenticated: true,
		});
	});

	it('maps a network failure to the network copy', async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		expect(await postBriefSeed(payload, fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			status: 0,
			error: BRIEF_SEED_NETWORK_ERROR,
		});
		expect(BRIEF_SEED_NETWORK_ERROR).toBe(
			'Network error while creating the story. Check that the server is running.',
		);
	});
});
