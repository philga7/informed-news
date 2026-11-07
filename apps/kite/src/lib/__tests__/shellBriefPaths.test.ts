import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isShellBriefPath, shouldReloadForShell } from '$lib/shellBriefPaths';

const layoutPath = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../routes/+layout.svelte',
);

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

	it('reloads a brief URL only when the served shell owns it', () => {
		expect(shouldReloadForShell('/', false)).toBe(false);
		expect(shouldReloadForShell('/latest/world/1', false)).toBe(false);
		expect(shouldReloadForShell('/', true)).toBe(true);
		expect(shouldReloadForShell('/latest/world/1', true)).toBe(true);
		expect(shouldReloadForShell('/topics', true)).toBe(false);
		expect(shouldReloadForShell('/shell', true)).toBe(false);
	});

	it('root layout consults the shell-ownership flag instead of always reloading', () => {
		const layout = readFileSync(layoutPath, 'utf8');
		expect(layout).toContain('shouldReloadForShell');
		expect(layout).toContain('PUBLIC_SHELL_OWNS_BRIEF');
		expect(layout).not.toContain('isShellBriefPath(');
	});
});
