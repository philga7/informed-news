import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('NEWS-46 retire mvp/web', () => {
	it('archives the React feed under _legacy/mvp-web', () => {
		assert.equal(existsSync(join(root, 'mvp/web')), false);
		assert.equal(existsSync(join(root, '_legacy/mvp-web/package.json')), true);
		assert.equal(existsSync(join(root, '_legacy/mvp-web/README.md')), true);
		assert.equal(existsSync(join(root, 'mvp/server/package.json')), true);
	});

	it('removes mvp/web from default install/dev/typecheck scripts', () => {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
		assert.match(pkg.scripts.dev, /npm run kite/);
		assert.match(pkg.scripts.dev, /npm run server/);
		assert.equal(pkg.scripts.web, undefined);
		assert.equal(pkg.scripts['dev:mvp-web'], undefined);
		assert.doesNotMatch(pkg.scripts['install:all'], /mvp\/web/);
		assert.doesNotMatch(pkg.scripts.typecheck, /mvp\/web/);
		assert.match(pkg.scripts.typecheck, /mvp\/server/);
		assert.match(pkg.scripts.build, /_legacy\/mvp-web/);
	});

	it('points Vercel at the archived feed until hosting cutover', () => {
		const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
		assert.match(vercel.outputDirectory, /_legacy\/mvp-web/);
		assert.match(vercel.installCommand, /_legacy\/mvp-web/);
		assert.doesNotMatch(vercel.outputDirectory, /mvp\/web/);
	});

	it('documents archive in README and agents.md', () => {
		const readme = readFileSync(join(root, 'README.md'), 'utf8');
		const agents = readFileSync(join(root, 'agents.md'), 'utf8');
		assert.match(readme, /_legacy\/mvp-web/);
		assert.doesNotMatch(readme, /Frozen UI \| `mvp\/web`/);
		assert.doesNotMatch(readme, /npm run dev:mvp-web/);
		assert.match(agents, /_legacy\/mvp-web/);
		assert.doesNotMatch(agents, /mvp\/web\/\s+# Frozen/);
		assert.doesNotMatch(agents, /npm run dev:mvp-web/);
	});
});
