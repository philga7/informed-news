import { describe, expect, it, vi } from 'vitest';
import { fetchTopicsPage, mutateTopicsApi } from '$lib/topicsApi';
import { MUTES_LOAD_ERROR, MUTES_SAVE_ERROR, TOPICS_LOAD_ERROR, TOPICS_SAVE_ERROR } from '$lib/topics';

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('fetchTopicsPage (NEWS-116)', () => {
	it('loads topics and mutes', async () => {
		const topics = [{ id: 't1', name: 'Grid' }];
		const rules = [{ id: 'm1', keyword: 'spam', source: null, createdAt: '2026-01-01T00:00:00.000Z' }];
		const fetchFn = vi.fn(async (url: string) => {
			if (url === '/api/topics') return jsonResponse(200, { ok: true, topics });
			return jsonResponse(200, { ok: true, rules });
		});
		expect(await fetchTopicsPage(fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			topics,
			muteRules: rules,
			loadError: null,
			muteLoadError: null,
		});
	});

	it('shows generic copy for 5xx on topics load, never the raw server message', async () => {
		const fetchFn = vi.fn(async (url: string) => {
			if (url === '/api/topics') {
				return jsonResponse(500, { ok: false, error: 'ENOENT: /data/topics.json' });
			}
			return jsonResponse(200, { ok: true, rules: [] });
		});
		expect(await fetchTopicsPage(fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			topics: [],
			muteRules: [],
			loadError: TOPICS_LOAD_ERROR,
			muteLoadError: null,
		});
	});

	it('shows generic copy for mutes 5xx and keeps topics when topics ok', async () => {
		const topics = [{ id: 't1', name: 'Grid' }];
		const fetchFn = vi.fn(async (url: string) => {
			if (url === '/api/topics') return jsonResponse(200, { ok: true, topics });
			return jsonResponse(503, { ok: false, error: 'disk full' });
		});
		expect(await fetchTopicsPage(fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			topics,
			muteRules: [],
			loadError: null,
			muteLoadError: MUTES_LOAD_ERROR,
		});
	});

	it('returns 400 validation text for topics load', async () => {
		const fetchFn = vi.fn(async (url: string) => {
			if (url === '/api/topics') return jsonResponse(400, { ok: false, error: 'bad store' });
			return jsonResponse(200, { ok: true, rules: [] });
		});
		expect(await fetchTopicsPage(fetchFn as unknown as typeof fetch)).toEqual({
			ok: true,
			topics: [],
			muteRules: [],
			loadError: 'bad store',
			muteLoadError: null,
		});
	});

	it('maps 401 to unauthenticated', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(401, { ok: false, error: 'Unauthorized' }));
		expect(await fetchTopicsPage(fetchFn as unknown as typeof fetch)).toEqual({
			ok: false,
			unauthenticated: true,
		});
	});
});

describe('mutateTopicsApi (NEWS-116)', () => {
	it('shows generic copy for 5xx and non-400/409 4xx', async () => {
		for (const status of [403, 404, 429, 500, 503]) {
			const fetchFn = vi.fn(async () =>
				jsonResponse(status, { ok: false, error: 'ENOENT: /data/topics.json' }),
			);
			expect(
				await mutateTopicsApi('/api/topics', 'POST', TOPICS_SAVE_ERROR, {}, fetchFn as unknown as typeof fetch),
			).toEqual({
				ok: false,
				unauthenticated: false,
				error: TOPICS_SAVE_ERROR,
			});
		}
	});

	it('shows 400 and 409 server text', async () => {
		const bad400 = vi.fn(async () => jsonResponse(400, { ok: false, error: 'Name is required' }));
		expect(
			await mutateTopicsApi(
				'/api/topics',
				'POST',
				TOPICS_SAVE_ERROR,
				{},
				bad400 as unknown as typeof fetch,
			),
		).toEqual({ ok: false, unauthenticated: false, error: 'Name is required' });

		const conflict = vi.fn(async () =>
			jsonResponse(409, { ok: false, error: 'A topic with that name already exists' }),
		);
		expect(
			await mutateTopicsApi(
				'/api/brief/mutes',
				'POST',
				MUTES_SAVE_ERROR,
				{ keyword: 'x' },
				conflict as unknown as typeof fetch,
			),
		).toEqual({
			ok: false,
			unauthenticated: false,
			error: 'A topic with that name already exists',
		});
	});

	it('maps 401 to unauthenticated', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }));
		expect(
			await mutateTopicsApi('/api/topics', 'DELETE', TOPICS_SAVE_ERROR, undefined, fetchFn as unknown as typeof fetch),
		).toEqual({ ok: false, unauthenticated: true, error: null });
	});
});
