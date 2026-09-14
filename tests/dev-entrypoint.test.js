import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('NEWS-41 default npm run dev entry', () => {
	it('starts Kite UI with mvp/server, not the archived React feed', () => {
		const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
		const { dev, kite } = pkg.scripts;

		assert.match(dev, /npm run kite/);
		assert.match(dev, /npm run server/);
		assert.doesNotMatch(dev, /npm run web\b/);
		assert.doesNotMatch(dev, /mvp\/web/);
		assert.doesNotMatch(dev, /_legacy\/mvp-web/);
		assert.match(kite, /apps\/kite/);
		assert.equal(pkg.scripts.web, undefined);
		assert.equal(pkg.scripts['dev:mvp-web'], undefined);
	});

	it('documents Kite as the default UI in README and agents.md', () => {
		const readme = readFileSync(join(root, 'README.md'), 'utf8');
		// Repo path is agents.md (lowercase); macOS is case-insensitive, Linux CI is not.
		const agents = readFileSync(join(root, 'agents.md'), 'utf8');

		assert.match(readme, /localhost:5173/);
		assert.match(readme, /Default:\*\* mvp\/server \+ Kite UI/);
		assert.doesNotMatch(readme, /Default `npm run dev` is still the MVP UI/);

		assert.match(agents, /apps\/kite/);
		assert.match(agents, /mvp\/server \+ Kite/);
		assert.doesNotMatch(agents, /Primary architecture is the MVP/);
	});
});
