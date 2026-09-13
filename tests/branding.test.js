import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);

describe('NEWS-45 Informed News branding', () => {
	it('defines Informed News product chrome overrides', async () => {
		// Load brand module via dynamic import from apps/kite (TS transpiled by Node? use read+eval of constants via file text)
		const brandSrc = readFileSync(join(root, 'apps/kite/src/lib/brand.ts'), 'utf8');
		assert.match(brandSrc, /PRODUCT_NAME = 'Informed News'/);
		assert.match(brandSrc, /'app\.title'/);
		assert.match(brandSrc, /applyBrandOverrides/);
	});

	it('ships Informed News document title and manifest', () => {
		const appHtml = readFileSync(join(root, 'apps/kite/src/app.html'), 'utf8');
		const manifest = JSON.parse(
			readFileSync(join(root, 'apps/kite/static/manifest.json'), 'utf8'),
		);
		assert.match(appHtml, /<title>Informed News<\/title>/);
		assert.doesNotMatch(appHtml, /Kagi News/);
		assert.equal(manifest.name, 'Informed News');
		assert.equal(manifest.short_name, 'Informed News');
	});

	it('keeps MIT attribution files intact', () => {
		const license = readFileSync(join(root, 'apps/kite/LICENSE'), 'utf8');
		const notice = readFileSync(join(root, 'NOTICE'), 'utf8');
		const thirdParty = readFileSync(join(root, 'THIRD_PARTY.md'), 'utf8');
		assert.match(license, /MIT License/);
		assert.match(license, /Kagi Search/);
		assert.match(notice, /c4fc3b579c3bbdcce5277d1956347131283170e5/);
		assert.match(thirdParty, /kite-public/);
	});

	it('replaces Kagi header logos with BrandMark', () => {
		const header = readFileSync(
			join(root, 'apps/kite/src/lib/components/Header.svelte'),
			'utf8',
		);
		assert.match(header, /BrandMark/);
		assert.doesNotMatch(header, /kagi_news_compact/);
	});
});
