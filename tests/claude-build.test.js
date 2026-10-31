import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github/workflows/claude.yml'), 'utf8');
const review = readFileSync(join(root, '.github/workflows/claude-review.yml'), 'utf8');

function parseOnKeys(source) {
	const start = source.indexOf('on:\n');
	const end = source.indexOf('\npermissions:');
	assert.ok(start >= 0 && end > start, 'on: block');
	const block = source.slice(start, end);
	return [...block.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]);
}

function claudeArgsToolString(source, flag) {
	const match = source.match(new RegExp(`${flag} "([^"]*)"`));
	assert.ok(match, `missing ${flag}`);
	return match[1];
}

describe('NEWS-180 claude build workflow', () => {
	it('pins the official action and the OAuth secret only', () => {
		assert.match(workflow, /anthropics\/claude-code-action@v1/);
		assert.match(
			workflow,
			/claude_code_oauth_token:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN\s*\}\}/,
		);
		const secrets = [...workflow.matchAll(/secrets\.[A-Z0-9_]+/g)].map((match) => match[0]);
		assert.deepEqual([...new Set(secrets)], ['secrets.CLAUDE_CODE_OAUTH_TOKEN']);
		assert.doesNotMatch(workflow, /anthropic_api_key/i);
		assert.doesNotMatch(workflow, /sk-ant-/);
		assert.doesNotMatch(workflow, /allowed_bots/);
		assert.doesNotMatch(workflow, /allowed_non_write_users/);
		assert.doesNotMatch(workflow, /github_token/);
	});

	it('runs only for a collaborator @claude mention, with actions read', () => {
		assert.deepEqual(parseOnKeys(workflow), [
			'issue_comment',
			'pull_request_review_comment',
			'pull_request_review',
			'issues',
		]);
		assert.match(workflow, /\njobs:\n  build:\n/);
		assert.match(workflow, /issue_comment/);
		assert.match(workflow, /pull_request_review_comment/);
		assert.match(workflow, /pull_request_review/);
		assert.match(workflow, /issues:/);
		assert.match(workflow, /@claude/);
		assert.match(workflow, /OWNER/);
		assert.match(workflow, /MEMBER/);
		assert.match(workflow, /COLLABORATOR/);
		assert.match(workflow, /actions:\s*read/);
		assert.match(workflow, /contents:\s*write/);
		assert.match(workflow, /pull-requests:\s*write/);
		assert.match(workflow, /issues:\s*write/);
		assert.match(workflow, /id-token:\s*write/);
		assert.match(
			workflow,
			/claude-build-\$\{\{ github\.event\.issue\.number \|\| github\.event\.pull_request\.number \}\}/,
		);
		assert.match(workflow, /cancel-in-progress:\s*false/);
		assert.match(workflow, /name:\s*claude-build/);
		assert.match(workflow, /fetch-depth:\s*1/);
		assert.match(workflow, /additional_permissions:[\s\S]*actions:\s*read/);
		const beforeJobs = workflow.slice(0, workflow.indexOf('jobs:'));
		assert.doesNotMatch(beforeJobs, /\nconcurrency:/);
		assert.doesNotMatch(workflow, /pull_request_target/);
		assert.doesNotMatch(workflow, /\n\s*schedule:/);
		assert.doesNotMatch(workflow, /\n {2}pull_request:\n/);
		assert.doesNotMatch(workflow, /^\s*ref:/m);
		assert.doesNotMatch(workflow, /--model/);
		assert.doesNotMatch(workflow, /^\s*prompt:/m);
		assert.match(workflow, /--max-turns 30/);
		assert.match(workflow, /open a PR, never merge, follow CLAUDE\.md and the work-hours hold/);
	});

	it('has no merge step and denies merge, force-push, and extra installs', () => {
		assert.doesNotMatch(workflow, /^\s*run:/m);
		const allowed = claudeArgsToolString(workflow, '--allowedTools');
		const disallowed = claudeArgsToolString(workflow, '--disallowedTools');
		for (const needle of [
			'gh pr merge',
			'git push origin main',
			'git push --force',
			'npm install',
			'bun install',
			'gh issue create',
		]) {
			assert.match(disallowed, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
			assert.doesNotMatch(allowed, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		}
		assert.match(workflow, /uses: actions\/checkout@v7/);
		const tools = allowed.split(',');
		for (const banned of ['Edit', 'Write', 'Bash(git:*)']) {
			assert.ok(!tools.includes(banned), `${banned} must not be allowed`);
		}
		assert.doesNotMatch(allowed, /Bash\(git push/);
		for (const readOnly of [
			'Bash(git status:*)',
			'Bash(git diff:*)',
			'Bash(git log:*)',
			'Bash(git show:*)',
		]) {
			assert.ok(tools.includes(readOnly), `${readOnly} must be allowed`);
		}
	});

	it('uses a job name the review workflow does not use', () => {
		assert.match(review, /name:\s*claude-review/);
		assert.match(review, /name:\s*claude-mention/);
		assert.doesNotMatch(review, /name:\s*claude-build/);
		assert.match(workflow, /claude-mention/);
		assert.match(workflow, /claude-build/);
	});

	it('evaluates the workflow if against sample payloads', () => {
		const result = spawnSync('node', ['scripts/check-claude-build-if.mjs'], {
			cwd: root,
			encoding: 'utf8',
		});
		assert.equal(result.status, 0, result.stderr + result.stdout);
		assert.match(result.stdout, /RUN owner @claude issue_comment/);
		assert.match(result.stdout, /SKIP non-collaborator @claude issue_comment/);
		assert.match(result.stdout, /SKIP owner issue_comment without @claude/);
		assert.match(result.stdout, /ok 15\/15/);
	});
});
