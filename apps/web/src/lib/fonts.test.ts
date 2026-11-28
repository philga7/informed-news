import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '../..');
const read = (p: string) => readFileSync(p, 'utf8');
const css = read(join(here, 'fonts.css'));

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return svelteFiles(p);
		return p.endsWith('.svelte') ? [p] : [];
	});
}

describe('shell fonts (NEWS-283)', () => {
	it('resolves the sans token to Geist with the mockup fallback stack', () => {
		expect(css).toMatch(/--font-sans:\s*'Geist',\s*ui-sans-serif,\s*system-ui/);
	});

	it('resolves the mono token to Geist Mono with the mockup fallback stack', () => {
		expect(css).toMatch(
			/--font-mono:\s*'Geist Mono',\s*ui-monospace,\s*SFMono-Regular,\s*Menlo,\s*Consolas,\s*monospace/,
		);
	});

	it('declares variable @font-face rules served from the shell origin path', () => {
		expect(css).toContain("url('/shell/fonts/Geist-Variable.woff2')");
		expect(css).toContain("url('/shell/fonts/GeistMono-Variable.woff2')");
		expect(css).toMatch(/font-weight:\s*100 900/);
		expect(css).not.toMatch(/https?:\/\//);
	});

	it('ships the font files and the OFL license in static', () => {
		for (const f of ['Geist-Variable.woff2', 'GeistMono-Variable.woff2', 'OFL.txt']) {
			expect(existsSync(join(webRoot, 'static/shell/fonts', f))).toBe(true);
		}
	});

	it('applies sans to the body and headings', () => {
		expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
		expect(css).toMatch(/h1,\s*h2,\s*h3[^{]*\{[^}]*font-family:\s*var\(--font-sans\)/);
	});

	it('loads the font stylesheet in the layout', () => {
		expect(read(join(webRoot, 'src/routes/+layout.svelte'))).toContain('fonts.css');
	});

	it('has no shell component declaring bare system-ui', () => {
		for (const f of svelteFiles(join(webRoot, 'src'))) {
			expect(read(f), f).not.toMatch(/font-family:[^;]*system-ui/);
		}
	});

	it('uses the mono token in the shell components that carry times, kickers, labels, counts and badges', () => {
		for (const f of [
			'lib/dashboard/DashboardHome.svelte',
			'lib/dashboard/DevelopingList.svelte',
			'lib/dashboard/MorningCards.svelte',
			'lib/dashboard/TrackersLine.svelte',
			'lib/brief/BriefScreen.svelte',
			'lib/brief/StoryArticle.svelte',
		]) {
			expect(read(join(webRoot, 'src', f)), f).toContain('var(--font-mono)');
		}
	});
});
