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

	it('defaults brief proxy to owned mvp/server, not kite.kagi.com', () => {
		const envExample = readFileSync(join(root, 'apps/kite/.env.example'), 'utf8');
		const proxy = readFileSync(
			join(root, 'apps/kite/src/lib/server/proxy.ts'),
			'utf8',
		);
		const ownedDoc = readFileSync(join(root, 'docs/OWNED_BRIEF.md'), 'utf8');

		assert.match(envExample, /KITE_API_BASE/);
		assert.match(envExample, /kite\.kagi\.com\/api/);
		assert.match(proxy, /127\.0\.0\.1:3001\/api/);
		assert.doesNotMatch(
			proxy,
			/const KITE_API_BASE = 'https:\/\/kite\.kagi\.com\/api'/,
		);
		assert.match(ownedDoc, /owned-latest/);
		assert.match(ownedDoc, /POST \/api\/fetch/);
	});
});
