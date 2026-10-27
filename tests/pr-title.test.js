import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkPrTitle } from '../scripts/check-pr-title.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

function runCli(title) {
	return spawnSync(process.execPath, [join(root, 'scripts/check-pr-title.mjs')], {
		env: { ...process.env, PR_TITLE: title },
		encoding: 'utf8',
	});
}

describe('NEWS-155 PR titles are Conventional Commits listing every key', () => {
	it('accepts a Conventional Commit with every key in the scope', () => {
		for (const title of [
			'fix(NEWS-131, NEWS-155, NEWS-174): ship-loop links, PR titles, Topics copy',
			'feat(NEWS-167): triage verdict view',
			'fix(NEWS-132,NEWS-151): pin changelog preset',
			'feat(NEWS-171)!: hold breaking changes to minor on 0.x',
			'refactor(NEWS-123): retire xcancel',
			'docs(NEWS-165): add VISION and DECISIONS',
		]) {
			assert.deepEqual(checkPrTitle(title), [], title);
		}
	});

	it('accepts a key-less title only for no-release types', () => {
		for (const title of [
			'docs: add product spec and plain-English changelog to ship loop',
			'ci: add Claude Code PR review',
			'chore(deps): bump playwright',
			'test: cover filtered view',
			'style: format',
			'build: bump node',
		]) {
			assert.deepEqual(checkPrTitle(title), [], title);
		}
		for (const title of [
			'fix(classify): single-flight batch classify',
			'feat: new view',
			'perf: faster triage',
			'refactor(store): shared helper',
			'revert: undo NEWS-1',
			'docs!: drop old API docs',
		]) {
			assert.notDeepEqual(checkPrTitle(title), [], title);
		}
	});

	it('rejects titles that are not Conventional Commits (PR #191)', () => {
		for (const title of [
			'NEWS-119, NEWS-120: shared store write helper; triage write-back patches only its fields',
			'Develop (#60)',
			'Fix(NEWS-1): capitalised type',
			'fix(NEWS-1):missing space',
			'fix(NEWS-1): ',
			'wip(NEWS-1): unknown type',
			'',
		]) {
			assert.notDeepEqual(checkPrTitle(title), [], JSON.stringify(title));
		}
	});

	it('requires keys in the scope, not the subject, and a keys-only scope', () => {
		assert.notDeepEqual(checkPrTitle('fix(classify): batch classify (NEWS-161, NEWS-160)'), []);
		assert.notDeepEqual(checkPrTitle('fix(NEWS-161): batch classify; also NEWS-160'), []);
		assert.notDeepEqual(checkPrTitle('fix(classify, NEWS-162): join batch'), []);
		assert.notDeepEqual(checkPrTitle('fix(NEWS-162 NEWS-163): space separated'), []);
		assert.notDeepEqual(checkPrTitle('fix(news-162): lowercase key'), []);
	});

	it('CLI exits 1 on a non-conventional title and 0 on a conventional one', () => {
		const bad = runCli('NEWS-131, NEWS-155: ship loop');
		assert.equal(bad.status, 1);
		assert.match(bad.stderr, /Conventional Commit/);
		const good = runCli('fix(NEWS-131, NEWS-155): ship loop');
		assert.equal(good.status, 0, good.stderr);
	});

	it('runs as its own PR title workflow on title edits, passing the title through env', () => {
		const workflow = read('.github/workflows/pr-title.yml');
		assert.match(workflow, /name: PR title/);
		assert.match(workflow, /pull_request:/);
		assert.match(workflow, /types:\s*\[opened, edited, synchronize, reopened\]/);
		assert.match(workflow, /PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/);
		assert.match(workflow, /node scripts\/check-pr-title\.mjs/);
		assert.doesNotMatch(workflow, /run:.*\$\{\{/);
		assert.doesNotMatch(workflow, /secrets\./);
		assert.doesNotMatch(workflow, /pull_request_target/);
	});

	it('ship-loop § 3 and CONTRIBUTING state the rule', () => {
		const skill = read('.cursor/skills/news-ship-loop/SKILL.md');
		assert.match(skill, /Conventional Commit listing every ticket key/);
		assert.match(skill, /highest bump type in the batch/i);
		assert.match(skill, /CONTRIBUTING\.md#squash-merges-and-semantic-release-harn-10/);
		assert.match(skill, /PR #205/);
		assert.match(skill, /grill/i);
		assert.doesNotMatch(skill, /Title referencing NEWS-N/);

		const contributing = read('CONTRIBUTING.md');
		assert.match(contributing, /multi-ticket PR/i);
		assert.match(contributing, /every key/i);
		assert.match(contributing, /`refactor`, `revert`, and any breaking `!` title always need keys/);
		assert.match(contributing, /scripts\/check-pr-title\.mjs/);
		assert.match(contributing, /PR title/);
	});
});
