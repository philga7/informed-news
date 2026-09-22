import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('NEWS-43 MVP API compat surface', () => {
	it('keeps health and session-gated article/fetch/classify routes in the server', () => {
		const src = readFileSync(join(root, 'mvp/server/src/app.ts'), 'utf8');
		assert.match(src, /app\.get\('\/health'/);
		assert.match(src, /status:\s*'ok'/);
		assert.match(src, /app:\s*'mvp-server'/);
		assert.match(src, /app\.get\('\/api\/articles'/);
		assert.match(src, /app\.get\('\/api\/articles\/:id'/);
		assert.match(src, /app\.post\('\/api\/fetch'/);
		assert.match(src, /app\.post\('\/api\/classify'/);
		assert.match(src, /app\.post\('\/api\/classify\/:id'/);
		assert.match(src, /app\.get\('\/api\/radar'/);
		assert.match(src, /app\.get\('\/api\/brief\/membership'/);
		assert.match(src, /app\.post\('\/api\/brief\/accept'/);
		assert.match(src, /app\.post\('\/api\/brief\/unaccept'/);
		assert.match(src, /app\.post\('\/api\/brief\/seed'/);
		assert.match(src, /app\.post\('\/api\/brief\/track'/);
		assert.match(src, /app\.post\('\/api\/brief\/untrack'/);
		assert.match(src, /app\.get\('\/api\/brief\/tracked'/);
		assert.match(src, /app\.post\('\/api\/brief\/tracked\/ack'/);
		assert.match(src, /app\.get\('\/api\/brief\/mutes'/);
		assert.match(src, /app\.post\('\/api\/brief\/mutes'/);
		assert.match(src, /app\.delete\('\/api\/brief\/mutes\/:id'/);
		assert.match(src, /hiddenMutedCount/);
		assert.match(src, /requireApiSession/);
		assert.match(src, /createKiteBriefRouter/);
	});

	it('default npm run dev still starts mvp/server with Kite', () => {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
		assert.match(pkg.scripts.dev, /npm run server/);
		assert.match(pkg.scripts.dev, /npm run kite/);
		assert.match(pkg.scripts.server, /mvp\/server/);
	});

	it('documents the frozen compat surface', () => {
		const doc = readFileSync(join(root, 'docs/MVP_API_COMPAT.md'), 'utf8');
		assert.match(doc, /GET \| `\/health`/);
		assert.match(doc, /GET \| `\/api\/articles`/);
		assert.match(doc, /POST \| `\/api\/fetch`/);
		assert.match(doc, /POST \| `\/api\/classify`/);
		assert.match(doc, /GET \| `\/api\/radar`/);
		assert.match(doc, /GET \| `\/api\/brief\/membership`/);
		assert.match(doc, /POST \| `\/api\/brief\/accept`/);
		assert.match(doc, /POST \| `\/api\/brief\/unaccept`/);
		assert.match(doc, /POST \| `\/api\/brief\/seed`/);
		assert.match(doc, /POST \| `\/api\/brief\/track`/);
		assert.match(doc, /POST \| `\/api\/brief\/untrack`/);
		assert.match(doc, /GET \| `\/api\/brief\/tracked`/);
		assert.match(doc, /POST \| `\/api\/brief\/tracked\/ack`/);
		assert.match(doc, /GET \| `\/api\/brief\/mutes`/);
		assert.match(doc, /POST \| `\/api\/brief\/mutes`/);
		assert.match(doc, /DELETE \| `\/api\/brief\/mutes\/:id`/);
		assert.match(doc, /hiddenMutedCount/);
		assert.match(doc, /muted/);
		assert.match(doc, /pendingUpdate/);
		assert.match(doc, /Session/);
		assert.match(doc, /CFP/);
		assert.match(doc, /xcancel/i);
		assert.match(doc, /NEWS-46/);
	});

	it('README points operators at the compat doc', () => {
		const readme = readFileSync(join(root, 'README.md'), 'utf8');
		assert.match(readme, /docs\/MVP_API_COMPAT\.md/);
		assert.match(readme, /GET \/health/);
	});
});
