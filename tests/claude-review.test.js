import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github/workflows/claude-review.yml'), 'utf8');
const build = readFileSync(join(root, '.github/workflows/claude.yml'), 'utf8');
const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const roadmap = readFileSync(join(root, 'docs/ROADMAP.md'), 'utf8');

function parseOnKeys(source) {
	const start = source.indexOf('on:\n');
	const end = source.indexOf('\npermissions:');
	const block = source.slice(start, end);
	return [...block.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]);
}

describe('NEWS-166 Claude Code PR review', () => {
	it('pins the official action, OAuth secret only, and Sonnet model', () => {
		assert.match(workflow, /anthropics\/claude-code-action@v1/);
		assert.match(
			workflow,
			/claude_code_oauth_token:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN\s*\}\}/,
		);
		assert.doesNotMatch(workflow, /anthropic_api_key/i);
		assert.doesNotMatch(workflow, /sk-ant-/);
		assert.doesNotMatch(workflow, /CLAUDE_CODE_OAUTH_TOKEN:\s*['"]?[A-Za-z0-9_-]{20,}/);
		assert.match(workflow, /--model claude-sonnet-5-5/);
	});

	it('triggers on PR events and skips drafts', () => {
		for (const event of ['opened', 'synchronize', 'reopened', 'ready_for_review']) {
			assert.match(workflow, new RegExp(event));
		}
		assert.match(workflow, /draft == false/);
		assert.doesNotMatch(workflow, /issue_comment/);
		assert.doesNotMatch(workflow, /pull_request_review_comment/);
	});

	it('sets read/write permissions needed for review comments', () => {
		assert.match(workflow, /contents:\s*read/);
		assert.match(workflow, /pull-requests:\s*write/);
		assert.match(workflow, /issues:\s*write/);
		assert.match(workflow, /id-token:\s*write/);
	});

	it('reviews against CLAUDE.md, comments only, and blocks merge/push tools', () => {
		assert.match(workflow, /When reviewing a PR/);
		assert.match(workflow, /gh pr comment/);
		assert.match(workflow, /never approve/i);
		assert.match(workflow, /merge/i);
		assert.match(workflow, /push/i);
		assert.match(workflow, /disallowedTools/);
		assert.match(workflow, /Bash\(git push:\*\)/);
		assert.match(workflow, /Bash\(git commit:\*\)/);
		assert.match(workflow, /Bash\(gh pr merge:\*\)/);
		assert.match(workflow, /Bash\(gh pr review:\*\)/);
	});

	it('an @claude mention starts claude-build only; review stays on pull_request', () => {
		assert.deepEqual(parseOnKeys(workflow), ['pull_request']);
		assert.doesNotMatch(workflow, /\n {2}mention:/);
		assert.doesNotMatch(workflow, /name:\s*claude-mention/);
		assert.deepEqual(parseOnKeys(build), [
			'issue_comment',
			'pull_request_review_comment',
			'pull_request_review',
			'issues',
		]);
		assert.match(build, /name:\s*claude-build/);
		assert.match(claudeMd, /starts only `claude\.yml` job `build`/);
		assert.match(claudeMd, /claude-mention/);
	});

	it('allows cursor[bot] on automatic review; @claude mentions stay human-only', () => {
		assert.match(workflow, /allowed_bots:\s*"cursor\[bot\],claude\[bot\]"/);
		assert.equal([...workflow.matchAll(/allowed_bots:/g)].length, 1);
		assert.doesNotMatch(workflow, /allowed_bots:\s*"\*"/);
		assert.doesNotMatch(workflow, /allowed_bots:\s*'\*'/);
	});

	it('CLAUDE.md keeps the review contract for Informed News', () => {
		assert.match(claudeMd, /## When reviewing a PR/);
		assert.match(claudeMd, /never merge/i);
		assert.match(claudeMd, /docs\/ROADMAP\.md/);
		assert.match(
			claudeMd,
			/Claude reports findings\. It never approves or merges\./,
		);
	});

	it('ROADMAP lists NEWS-166 under Dev tooling as Done', () => {
		const rows = roadmap
			.split('\n')
			.filter((line) => line.startsWith('|') && line.includes('/browse/NEWS-166)'));
		assert.equal(rows.length, 1, rows);
		assert.match(rows[0], /Dev tooling/);
		assert.match(rows[0], /\*\*Done\*\*/);
		assert.doesNotMatch(rows[0], /\*\(in progress\)\*/i);
	});
});
