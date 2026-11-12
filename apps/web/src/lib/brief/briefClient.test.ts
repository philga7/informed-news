import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from './fetchMock';
import { loadBrief, parseBriefStatus, sharedHrefVisit } from './briefClient';

const missingHref = '/latest/world/99?shared=1';

describe('sharedHrefVisit', () => {
	it('clears the latch when the shared story is missing so the same href runs again', () => {
		const first = sharedHrefVisit(missingHref, '', false);
		expect(first).toEqual({ action: 'missing', latch: '' });
		if (first.action !== 'missing') return;
		// replaceState does not change page.url. The next click is a real navigation
		// of the same href, and an uncleared latch would skip it.
		const again = sharedHrefVisit(missingHref, first.latch, false);
		expect(again).toEqual({ action: 'missing', latch: '' });
	});

	it('keeps the latch when the story is found so a later stories update does not re-enter', () => {
		const href = '/latest/world/1?shared=1';
		const first = sharedHrefVisit(href, '', true);
		expect(first).toEqual({ action: 'found', latch: href });
		if (first.action !== 'found') return;
		expect(sharedHrefVisit(href, first.latch, true)).toEqual({ action: 'skip' });
	});
});

const FAILED_AT = '2026-11-12T00:05:00.000Z';

describe('parseBriefStatus', () => {
	it('yields status from a fixture body whose topic overview is dropped', () => {
		expect(
			parseBriefStatus({
				ok: true,
				fixture: true,
				sections: [],
				quiet: [],
				version: '0.41.0',
				signedIn: true,
				keysOn: true,
				refresh: { running: false },
			}),
		).toEqual({
			version: '0.41.0',
			signedIn: true,
			keysOn: true,
			running: false,
			lastFetchAt: null,
			lastFetchOk: null,
		});
	});

	it('treats missing flags as signed out and keys off', () => {
		expect(parseBriefStatus({ ok: true, fixture: true })).toEqual({
			version: 'unknown',
			signedIn: false,
			keysOn: false,
			running: false,
			lastFetchAt: null,
			lastFetchOk: null,
		});
	});

	it('keeps completedAt and ok false for a last failed run', () => {
		const status = parseBriefStatus({
			ok: true,
			refresh: {
				running: false,
				last: {
					ok: false,
					startedAt: '2026-11-12T00:00:00.000Z',
					completedAt: FAILED_AT,
					error: 'fetch failed',
				},
			},
		});
		expect(status?.lastFetchAt).toBe(FAILED_AT);
		expect(status?.lastFetchOk).toBe(false);
	});
});

describe('loadBrief status', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns status when the overview is a fixture and drops the topic overview', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
				if (url === '/api/brief/overview') {
					return jsonResponse(200, {
						ok: true,
						fixture: true,
						sections: [],
						quiet: [],
						version: '0.41.0',
						signedIn: true,
						keysOn: false,
						refresh: {
							running: false,
							last: { ok: false, completedAt: FAILED_AT },
						},
					});
				}
				return jsonResponse(404, { ok: false });
			}),
		);
		const loaded = await loadBrief();
		expect(loaded.overview).toBeNull();
		expect(loaded.status).toEqual({
			version: '0.41.0',
			signedIn: true,
			keysOn: false,
			running: false,
			lastFetchAt: FAILED_AT,
			lastFetchOk: false,
		});
	});
});
