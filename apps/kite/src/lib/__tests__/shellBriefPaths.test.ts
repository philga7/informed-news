import { describe, expect, it } from 'vitest';
import { isShellBriefPath } from '$lib/shellBriefPaths';

describe('isShellBriefPath', () => {
	it('is true for / and /latest brief URLs', () => {
		const owned = ['/', '/latest', '/latest/world', '/latest/world/1'];
		for (const pathname of owned) {
			expect(isShellBriefPath(pathname), pathname).toBe(true);
		}
	});

	it('is false for /shell, lookalikes, and other Kite routes', () => {
		const notOwned = [
			'',
			'/shell',
			'/shell/',
			'/shell/deep',
			'/shellish',
			'/latestish',
			'/topics',
			'/transparency',
			'/filtered',
			'/feedback',
			'/contribute',
			'/radar',
			'/api',
			'/healthz',
			'/map',
			'/signals',
			'/finance',
			'/situation',
			'/listen',
			'/desk',
			'/2026-09-30/world',
			'/api/fetch',
		];
		for (const pathname of notOwned) {
			expect(isShellBriefPath(pathname), pathname).toBe(false);
		}
	});
});
