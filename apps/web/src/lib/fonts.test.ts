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
			expect(read(f), f).not.toMatch(/\bfont(-family)?:[^;]*system-ui/);
		}
	});

	const sel = (file: string, selector: string): string => {
		const src = read(join(webRoot, 'src/lib', file));
		const style = src.slice(src.indexOf('<style'));
		const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const re = new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{}]*)?\\{([^}]*)\\}`, 'gm');
		return [...style.matchAll(re)].map((m) => m[1]).join('\n');
	};
	const mono = (file: string, selector: string) =>
		expect(sel(file, selector), `${file} ${selector}`).toMatch(/font-family:\s*var\(--font-mono\)/);

	it('uses mono on kickers, counts, meta, labels, badges and panel headings', () => {
		mono('dashboard/DevelopingList.svelte', '.kicker');
		mono('dashboard/DevelopingList.svelte', '.count');
		mono('dashboard/DevelopingList.svelte', '.meta');
		mono('dashboard/DevelopingList.svelte', '.quiet');
		mono('dashboard/TrackersLine.svelte', '.count');
		mono('dashboard/DashboardHome.svelte', 'h2');
		mono('dashboard/MorningCards.svelte', 'h3');
		mono('brief/StoryArticle.svelte', '.read-badge');
		mono('brief/StoryArticle.svelte', '.category-label');
		mono('brief/StoryArticle.svelte', '.meta');
	});

	it('uses mono on every control button, including developing-list row buttons', () => {
		mono('dashboard/DevelopingList.svelte', '.chips button');
		mono('dashboard/DevelopingList.svelte', '.actions button');
		mono('dashboard/DevelopingList.svelte', '.foot button');
		mono('dashboard/DevelopingList.svelte', 'li button');
		mono('brief/StoryArticle.svelte', '.read-button');
		expect(css).toMatch(/(^|\n)button[^{]*\{[^}]*font-family:\s*var\(--font-mono\)/);
	});

	it('keeps the headline button and developing-story prose in sans', () => {
		expect(sel('brief/StoryArticle.svelte', '.title-button')).toMatch(/font-family:\s*var\(--font-sans\)/);
		expect(sel('brief/StoryArticle.svelte', '.title-button')).not.toMatch(/--font-mono/);
		for (const s of ['.part', '.now']) {
			const body = sel('dashboard/DevelopingList.svelte', s);
			expect(body, s).toMatch(/font-family:\s*var\(--font-sans\)/);
		}
		expect(sel('dashboard/DevelopingList.svelte', '.part')).not.toMatch(/--font-mono/);
		expect(sel('dashboard/DevelopingList.svelte', '.now')).not.toMatch(/--font-mono/);
	});
});
