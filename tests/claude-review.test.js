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
	it('pins the official action, OAuth secret only, and Opus model', () => {
		assert.match(workflow, /anthropics\/claude-code-action@v1/);
		assert.match(
			workflow,
			/claude_code_oauth_token:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN\s*\}\}/,
		);
		assert.doesNotMatch(workflow, /anthropic_api_key/i);
		assert.doesNotMatch(workflow, /sk-ant-/);
		assert.doesNotMatch(workflow, /CLAUDE_CODE_OAUTH_TOKEN:\s*['"]?[A-Za-z0-9_-]{20,}/);
		assert.match(workflow, /--model claude-opus-5-5/);
		assert.doesNotMatch(workflow, /claude-sonnet-5-5/);
		assert.doesNotMatch(workflow, /^\s*model:/m);
	});

	it('triggers on PR events and skips drafts', () => {
		for (const event of ['opened', 'synchronize', 'reopened', 'ready_for_review']) {
			assert.match(workflow, new RegExp(event));
		}
		assert.match(workflow, /draft == false/);
		assert.doesNotMatch(workflow, /issue_comment/);
		assert.doesNotMatch(workflow, /pull_request_review_comment/);
	});

	it('sets contents read and pull-request write for comments', () => {
		const permissions = workflow.slice(
			workflow.indexOf('\npermissions:\n'),
			workflow.indexOf('\njobs:'),
		);
		assert.match(permissions, /contents:\s*read/);
		assert.match(permissions, /pull-requests:\s*write/);
		assert.doesNotMatch(permissions, /contents:\s*write/);
		assert.doesNotMatch(permissions, /issues:\s*write/);
		assert.doesNotMatch(permissions, /issues:\s*read/);
		assert.match(permissions, /id-token:\s*write/);
		assert.match(
			workflow,
			/additional_permissions:\s*\|\n\s+contents:\s*read\n\s+pull_requests:\s*write\n\s+issues:\s*read/,
		);
	});

	it('reviews acceptance criteria only, comments only, and blocks edits, commits, and pushes', () => {
		assert.match(workflow, /acceptance criteria/i);
		assert.match(workflow, /no Jira access/);
		assert.match(workflow, /gh pr comment/);
		assert.match(workflow, /gh issue view/);
		assert.match(workflow, /Do not approve/i);
		assert.match(workflow, /Do not merge/i);
		assert.match(workflow, /Do not push/i);
		assert.match(workflow, /Do not edit files/i);
		assert.doesNotMatch(workflow, /When reviewing a PR/);
		const allowed = workflow.match(/--allowedTools "([^"]*)"/);
		assert.ok(allowed, 'missing --allowedTools');
		const allowedTools = allowed[1].split(',');
		for (const entry of [
			'mcp__github_inline_comment__create_inline_comment',
			'Bash(gh pr comment:*)',
			'Bash(gh pr diff:*)',
			'Bash(gh pr view:*)',
			'Bash(gh issue view:*)',
		]) {
			assert.ok(allowedTools.includes(entry), `${entry} must be allowed`);
		}
		for (const banned of ['Edit', 'Write', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(gh pr edit:*)']) {
			assert.equal(allowedTools.includes(banned), false, `${banned} must not be allowed`);
		}
		const disallowed = workflow.match(/--disallowedTools "([^"]*)"/);
		assert.ok(disallowed, 'missing --disallowedTools');
		const disallowedTools = disallowed[1].split(',');
		for (const entry of [
			'Edit',
			'Write',
			'NotebookEdit',
			'Bash(git push:*)',
			'Bash(git commit:*)',
			'Bash(gh pr merge:*)',
			'Bash(gh pr review:*)',
			'Bash(gh pr edit:*)',
		]) {
			assert.ok(disallowedTools.includes(entry), `${entry} must be disallowed`);
		}
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
