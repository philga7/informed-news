import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('NEWS-42 nav shell route map', () => {
	it('documents Brief + Transparency + Radar shipped and reserved layers docs-only', () => {
		const map = readFileSync(join(root, 'docs/ROUTE_MAP.md'), 'utf8');
		assert.match(map, /NEWS-42/);
		assert.match(map, /`\/`/);
		assert.match(map, /`\/transparency`/);
		assert.match(map, /`\/radar`/);
		assert.match(map, /Session-required/);
		assert.match(map, /CFP \+ curated RSS/);
		assert.match(map, /`\/finance`/);
		assert.match(map, /`\/situation`/);
		assert.match(map, /`\/listen`/);
		assert.match(map, /Do not ship empty/);
		assert.match(map, /Reserved/);
		const shippedSection = map.split('## Shipped (live)')[1]?.split('## Planned')[0];
		assert.ok(shippedSection?.includes('`/radar`'), 'expected /radar in Shipped section');
	});

	it('ships /transparency and /radar pages with footer links', () => {
		assert.equal(
			existsSync(
				join(root, 'apps/kite/src/routes/transparency/+page.svelte'),
			),
			true,
		);
		assert.equal(
			existsSync(join(root, 'apps/kite/src/routes/radar/+page.svelte')),
			true,
		);
		const footer = readFileSync(
			join(root, 'apps/kite/src/lib/components/Footer.svelte'),
			'utf8',
		);
		assert.match(footer, /href="\/transparency"/);
		assert.match(footer, /href="\/radar"/);
		assert.doesNotMatch(footer, /href="\/finance"/);
		assert.doesNotMatch(footer, /href="\/situation"/);
		assert.doesNotMatch(footer, /href="\/listen"/);
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
});
