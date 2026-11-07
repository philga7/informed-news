import { describe, expect, it } from 'vitest';
import { shellOwnsPath } from './shellPaths';

describe('shellOwnsPath', () => {
	it('is true for Brief, /shell, and /latest paths', () => {
		const owned = [
			'/',
			'/shell',
			'/shell/',
			'/shell/deep',
			'/latest',
			'/latest/world',
			'/latest/world/1',
		];
		for (const pathname of owned) {
			expect(shellOwnsPath(pathname), pathname).toBe(true);
		}
	});

	it('is false for lookalikes and non-shell routes', () => {
		const notOwned = [
			'',
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
			expect(shellOwnsPath(pathname), pathname).toBe(false);
		}
	});
});
