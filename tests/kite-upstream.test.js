import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PINNED_SHA = 'c4fc3b579c3bbdcce5277d1956347131283170e5';

describe('NEWS-40 kite upstream provenance', () => {
	it('pins kite-public under apps/kite with MIT license', () => {
		assert.equal(existsSync(join(root, 'apps/kite/package.json')), true);
		assert.equal(existsSync(join(root, 'apps/kite/LICENSE')), true);
		assert.equal(existsSync(join(root, 'apps/kite/src/routes/+page.svelte')), true);
		assert.equal(existsSync(join(root, 'apps/kite/.git')), false);

		const license = readFileSync(join(root, 'apps/kite/LICENSE'), 'utf8');
		assert.match(license, /MIT License/);
		assert.match(license, /Kagi Search/);
	});

	it('records matching SHA in UPSTREAM.md, THIRD_PARTY.md, and NOTICE', () => {
		const upstream = readFileSync(join(root, 'apps/kite/UPSTREAM.md'), 'utf8');
		const thirdParty = readFileSync(join(root, 'THIRD_PARTY.md'), 'utf8');
		const notice = readFileSync(join(root, 'NOTICE'), 'utf8');
		const syncDoc = readFileSync(join(root, 'docs/UPSTREAM_KITE.md'), 'utf8');

		for (const text of [upstream, thirdParty, notice]) {
			assert.match(text, new RegExp(PINNED_SHA));
		}
		assert.match(upstream, /kagisearch\/kite-public/);
		assert.match(syncDoc, /How to bump/);
		assert.match(thirdParty, /CC BY-NC/);
	});

	it('ships .env.example for documented local port smoke', () => {
		const envExample = readFileSync(join(root, 'apps/kite/.env.example'), 'utf8');
		assert.match(envExample, /VITE_BASE_PATH=https:\/\/kite\.kagi\.com/);
		assert.match(envExample, /VITE_STATIC_PATH=https:\/\/kite\.kagi\.com\/static/);
	});
});
