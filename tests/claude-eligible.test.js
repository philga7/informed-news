import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const contributing = readFileSync(join(root, 'CONTRIBUTING.md'), 'utf8');
const roadmap = readFileSync(join(root, 'docs/ROADMAP.md'), 'utf8');
const decisions = readFileSync(join(root, 'docs/DECISIONS.md'), 'utf8');
const vision = readFileSync(join(root, 'docs/VISION.md'), 'utf8');
const productSpec = readFileSync(join(root, 'docs/PRODUCT_SPEC.md'), 'utf8');
const whatsNew = readFileSync(join(root, 'docs/WHATS_NEW.md'), 'utf8');
const reviewWorkflow = readFileSync(
	join(root, '.github/workflows/claude-review.yml'),
	'utf8',
);

describe('NEWS-180 Claude-eligible work docs', () => {
	it('CLAUDE.md documents builder-claude rules and workflow names', () => {
		assert.match(claudeMd, /## Claude-eligible work/);
		assert.match(claudeMd, /builder-claude/);
		assert.match(
			claudeMd,
			/one area, under about 300 lines, clear acceptance criteria and a test, no auth, secrets, CI, release config, migrations or deploys, and no design call\./,
		);
		assert.match(claudeMd, /stop and comment instead of building/);
		assert.match(claudeMd, /failing test first/);
		assert.match(claudeMd, /One Conventional Commit per ticket/);
		assert.match(claudeMd, /PR title that names every key/);
		assert.match(claudeMd, /CI green/);
		assert.match(claudeMd, /PRODUCT_SPEC/);
		assert.match(claudeMd, /WHATS_NEW/);
		assert.match(claudeMd, /9 AM–6 PM ET/);
		assert.match(claudeMd, /only Phil merges/);
		assert.match(claudeMd, /claude-build/);
		assert.match(claudeMd, /claude-mention/);
	});

	it('CONTRIBUTING links to CLAUDE.md Claude-eligible work', () => {
		assert.match(contributing, /CLAUDE\.md#claude-eligible-work/);
		assert.match(contributing, /builder-claude/);
	});

	it('ROADMAP lists NEWS-180 as dev tooling without Done on that row', () => {
		const rows = roadmap
			.split('\n')
			.filter((line) => line.startsWith('|') && line.includes('/browse/NEWS-180)'));
		assert.equal(rows.length, 1, rows);
		assert.match(rows[0], /Dev tooling/);
		assert.doesNotMatch(rows[0], /\*\*Done\*\*/);
		assert.match(roadmap, /pending Phil; not filed/);
	});

	it('DECISIONS records NEWS-180 with required sections', () => {
		const heading =
			'2026-10-31 — Claude builds Small builder-claude tickets on @claude mention via GitHub (NEWS-180)';
		const start = decisions.indexOf(`## ${heading}`);
		assert.ok(start >= 0, 'NEWS-180 decision entry missing');
		const nextHeading = decisions.indexOf('\n## ', start + 1);
		const entry = decisions.slice(start, nextHeading === -1 ? undefined : nextHeading);
		assert.match(entry, /\*\*Decision:\*\*/);
		assert.match(entry, /\*\*Why:\*\*/);
		assert.match(entry, /\*\*What it rules out:\*\*/);
		assert.match(entry, /\[VISION\.md\]\(VISION\.md\) is unchanged/);
	});

	it('product direction docs stay free of builder-claude', () => {
		for (const [name, text] of [
			['VISION.md', vision],
			['PRODUCT_SPEC.md', productSpec],
			['WHATS_NEW.md', whatsNew],
		]) {
			assert.doesNotMatch(text, /builder-claude/, name);
		}
	});

	it('claude-review.yml comment links build workflow to pull requests', () => {
		assert.match(reviewWorkflow, /claude-build opens a pull request/);
	});
});
