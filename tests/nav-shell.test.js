import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const { shellOwnsPath } = await import(
	new URL('../mvp/server/src/serveShell.ts', import.meta.url).href
);

const FORBIDDEN_SEGMENTS = ['map', 'signals', 'finance', 'situation', 'listen'];
const NAMES = FORBIDDEN_SEGMENTS.join('|');
// href="/map", href="/signals/x", or a nav label like >Map<
const FORBIDDEN_HREF = new RegExp('href\\s*=\\s*[^>]*?/(?:' + NAMES + ')(?![a-z0-9-])', 'i');
const FORBIDDEN_LABEL = new RegExp('>\\s*(?:' + NAMES + ')\\s*<', 'i');

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name);
		return entry.isDirectory() ? walk(full) : [full];
	});
}

/** Violations in the shell route tree: forbidden route dirs and nav chrome. */
function scanShell(files) {
	const routesDir = join(root, 'apps/web/src/routes');
	const problems = [];
	for (const file of files) {
		const segments = relative(routesDir, file).split(sep);
		const hit = segments.find((s) => FORBIDDEN_SEGMENTS.includes(s.toLowerCase()));
		if (hit) problems.push(relative(root, file) + ': forbidden route segment ' + hit);
		if (/\.(svelte|ts|js)$/.test(file) && existsSync(file)) {
			const text = readFileSync(file, 'utf8');
			const m = text.match(FORBIDDEN_HREF) || text.match(FORBIDDEN_LABEL);
			if (m) problems.push(relative(root, file) + ': forbidden chrome ' + m[0].trim());
		}
	}
	return problems;
}

describe('NEWS-42 nav shell route map', () => {
	it('documents Brief + Transparency + Topics + Filtered shipped, Radar retired, and reserved layers docs-only', () => {
		const map = readFileSync(join(root, 'docs/ROUTE_MAP.md'), 'utf8');
		assert.match(map, /NEWS-42/);
		assert.match(map, /`\/`/);
		assert.match(map, /`\/transparency`/);
		assert.match(map, /Session-required/);
		assert.match(map, /CFP \+ curated RSS/);
		assert.match(map, /`\/finance`/);
		assert.match(map, /`\/situation`/);
		assert.match(map, /`\/listen`/);
		assert.match(map, /Do not ship empty/);
		assert.match(map, /Reserved/);
		const shippedSection = map.split('## Shipped (live)')[1]?.split('## Retired')[0];
		assert.ok(shippedSection, 'expected a Shipped section before Retired');
		assert.ok(!shippedSection.includes('`/radar`'), 'did not expect /radar in Shipped section');
		assert.ok(shippedSection.includes('`/topics`'), 'expected /topics in Shipped section');
		assert.ok(shippedSection.includes('`/filtered`'), 'expected /filtered in Shipped section');
	});

	it('documents /radar as retired with a redirect to /topics (NEWS-91)', () => {
		const map = readFileSync(join(root, 'docs/ROUTE_MAP.md'), 'utf8');
		const retiredSection = map.split('## Retired')[1]?.split('## Planned')[0];
		assert.ok(retiredSection, 'expected a Retired section');
		assert.ok(retiredSection.includes('`/radar`'), 'expected /radar in Retired section');
		assert.ok(retiredSection.includes('`/topics`'), 'expected /topics in Retired section');
		assert.match(retiredSection, /307/);
		assert.match(retiredSection, /NEWS-91/);
	});

	it('marks the claims desk parked in CLAIMS_DISCERNMENT (NEWS-91)', () => {
		const doc = readFileSync(join(root, 'docs/CLAIMS_DISCERNMENT.md'), 'utf8');
		assert.match(doc, /Parked \(Epic L, NEWS-91\)/);
		assert.match(doc, /Running claims manually/);
		assert.match(doc, /POST \/api\/claims\/extract/);
		assert.match(doc, /POST \/api\/claims\/enrich/);
	});

	it('ships the session /filtered page (NEWS-90)', () => {
		assert.equal(
			existsSync(join(root, 'apps/kite/src/routes/filtered/+page.svelte')),
			true,
		);
	});

	it('ships /topics page with footer link (NEWS-85)', () => {
		assert.equal(
			existsSync(join(root, 'apps/kite/src/routes/topics/+page.svelte')),
			true,
		);
		const footer = readFileSync(
			join(root, 'apps/kite/src/lib/components/Footer.svelte'),
			'utf8',
		);
		assert.match(footer, /href="\/topics"/);
	});

	it('ships /transparency with a footer link and retires the /radar page (NEWS-91)', () => {
		assert.equal(
			existsSync(
				join(root, 'apps/kite/src/routes/transparency/+page.svelte'),
			),
			true,
		);
		assert.equal(
			existsSync(join(root, 'apps/kite/src/routes/radar/+page.svelte')),
			false,
		);
		const redirectFile = join(root, 'apps/kite/src/routes/radar/+page.server.ts');
		assert.equal(existsSync(redirectFile), true);
		assert.match(readFileSync(redirectFile, 'utf8'), /redirect\(307, '\/topics'\)/);
		const footer = readFileSync(
			join(root, 'apps/kite/src/lib/components/Footer.svelte'),
			'utf8',
		);
		assert.match(footer, /href="\/transparency"/);
		assert.match(footer, /href="\/topics"/);
		assert.doesNotMatch(footer, /href="\/radar"/);
		assert.doesNotMatch(footer, /href="\/finance"/);
		assert.doesNotMatch(footer, /href="\/situation"/);
		assert.doesNotMatch(footer, /href="\/listen"/);
		assert.equal(
			existsSync(join(root, 'apps/kite/src/routes/topics/+page.svelte')),
			true,
		);
		assert.equal(
			existsSync(join(root, 'apps/kite/src/routes/filtered/+page.svelte')),
			true,
		);
	});

	it('does not add empty Finance/Situation/Listen chrome in Header', () => {
		const header = readFileSync(
			join(root, 'apps/kite/src/lib/components/Header.svelte'),
			'utf8',
		);
		assert.doesNotMatch(header, /href="\/finance"/);
		assert.doesNotMatch(header, /href="\/situation"/);
		assert.doesNotMatch(header, /href="\/listen"/);
	});

	it('keeps Map/Signals/Finance/Situation/Listen out of the SPA shell (NEWS-195)', () => {
		const files = walk(join(root, 'apps/web/src/routes'));
		assert.ok(files.length > 0, 'expected shell route files');
		assert.deepEqual(scanShell(files), []);
	});

	it('scanner flags a forbidden route (sensitivity)', () => {
		const routes = join(root, 'apps/web/src/routes');
		assert.ok(scanShell([join(routes, 'map/+page.svelte')]).length > 0);
		assert.ok(scanShell([join(routes, 'signals/+page.svelte')]).length > 0);
		assert.ok(scanShell([join(routes, 'shell/listen/+page.svelte')]).length > 0);
	});

	it('does not let the shell own /map or /signals (NEWS-195)', () => {
		assert.equal(shellOwnsPath('/map'), false);
		assert.equal(shellOwnsPath('/signals'), false);
		assert.equal(shellOwnsPath('/shell'), true);
	});

	it('lets the shell own Brief URLs (NEWS-200)', () => {
		assert.equal(shellOwnsPath('/'), true);
		assert.equal(shellOwnsPath('/latest/world/1'), true);
		assert.equal(shellOwnsPath('/topics'), false);
		assert.equal(shellOwnsPath('/map'), false);
		assert.equal(shellOwnsPath('/signals'), false);
	});
});
