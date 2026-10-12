import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
const skill = readFileSync(
	join(root, '.cursor/skills/news-ship-loop/SKILL.md'),
	'utf8',
);

describe('NEWS-103 require green CI before merge', () => {
	it('runs the merge gate on pull_request and push to main', () => {
		assert.match(ci, /pull_request:/);
		assert.match(ci, /push:/);
		assert.match(ci, /branches:\s*\n\s*-\s*main/);
		assert.doesNotMatch(ci, /secrets\./i);
		assert.doesNotMatch(ci, /\$\{\{\s*secrets\./);
	});

	it('typechecks, runs server + kite provenance tests, kite unit + check, and product-path build', () => {
		assert.match(ci, /npm run typecheck/);
		assert.match(ci, /npm test\b/);
		assert.match(ci, /npm run test:kite/);
		assert.match(ci, /bun run test:unit/);
		assert.match(ci, /bun run check/);
		assert.match(ci, /bun run build/);
		assert.match(ci, /apps\/kite/);
		assert.doesNotMatch(ci, /_legacy\/mvp-web/);
	});

	it('installs root, mvp/server, and apps/kite with lockfiles', () => {
		assert.match(ci, /npm ci\b/);
		assert.match(ci, /npm ci --prefix mvp\/server/);
		assert.match(ci, /bun install --frozen-lockfile/);
		assert.match(ci, /bun-version:\s*'1\./);
	});

	it('ship-loop refuses merge when required checks are red or pending', () => {
		assert.match(skill, /gh pr checks/);
		assert.match(skill, /refuse merge on red\/pending/i);
		assert.match(skill, /only merge when required checks are green/i);
		assert.match(skill, /MVP build & typecheck/);
	});
});
