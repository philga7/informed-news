import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const build = readFileSync(join(root, '.github/workflows/claude.yml'), 'utf8');
const review = readFileSync(join(root, '.github/workflows/claude-review.yml'), 'utf8');
const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');

function claudeArgsToolString(source, flag) {
	const match = source.match(new RegExp(`${flag} "([^"]*)"`));
	assert.ok(match, `missing ${flag}`);
	return match[1];
}

function quotedAllowedBots(source) {
	const matches = [...source.matchAll(/allowed_bots:\s*"([^"]*)"/g)];
	assert.equal(matches.length, 1, 'allowed_bots must be one quoted list');
	return matches[0][1];
}

describe('NEWS-193 Claude follow-up CI', () => {
	it('keeps claude-review allowed_bots an explicit list that includes claude[bot]', () => {
		assert.equal([...review.matchAll(/allowed_bots:/g)].length, 1);
		const list = quotedAllowedBots(review);
		const bots = list.split(',').map((bot) => bot.trim()).filter(Boolean);
		assert.ok(bots.length >= 1, list);
		assert.ok(bots.includes('claude[bot]'), list);
		for (const bot of bots) {
			assert.match(bot, /^[a-z0-9][a-z0-9-]*\[bot\]$/, bot);
		}
		assert.equal(bots.includes('*'), false);
		assert.doesNotMatch(review, /allowed_bots:\s*"\*"/);
		assert.doesNotMatch(review, /allowed_bots:\s*'\*'/);
		assert.equal(bots.includes('github-actions[bot]'), false);
		const reviewAllowed = claudeArgsToolString(review, '--allowedTools');
		assert.equal(reviewAllowed.split(',').includes('Bash(gh pr edit:*)'), false);
	});

	it('lets claude-build commit its branch, edit its own PR, and still blocks merge', () => {
		const allowed = claudeArgsToolString(build, '--allowedTools').split(',');
		const disallowed = claudeArgsToolString(build, '--disallowedTools').split(',');
		for (const entry of [
			'Edit',
			'Write',
			'Bash(git add)',
			'Bash(git add:*)',
			'Bash(git commit)',
			'Bash(git commit:*)',
			'Bash(git push)',
			'Bash(git push:*)',
			'Bash(gh pr edit:*)',
		]) {
			assert.ok(allowed.includes(entry), `${entry} must be allowed`);
		}
		assert.equal(allowed.includes('Bash(git:*)'), false);
		for (const entry of [
			'Bash(gh pr merge:*)',
			'Bash(gh pr review:*)',
			'Bash(git push origin main)',
			'Bash(git push origin main:*)',
			'Bash(git push -u origin main)',
			'Bash(git push -u origin main:*)',
			'Bash(git push origin HEAD:main)',
			'Bash(git push origin HEAD:main:*)',
			'Bash(git push --force)',
			'Bash(git push --force:*)',
			'Bash(git push -f)',
			'Bash(git push -f:*)',
			'Bash(git push --force-with-lease)',
			'Bash(git push --force-with-lease:*)',
		]) {
			assert.ok(disallowed.includes(entry), `${entry} must stay disallowed`);
			assert.equal(allowed.includes(entry), false, `${entry} must not be allowed`);
		}
		const permissions = build.slice(build.indexOf('\npermissions:\n'), build.indexOf('\njobs:'));
		assert.doesNotMatch(permissions, /\badmin\b/i);
		const turns = build.match(/--max-turns\s+(\d+)/);
		assert.ok(turns, 'missing --max-turns');
		assert.ok(Number(turns[1]) >= 100, turns[1]);
		assert.doesNotMatch(build, /github_token/);
		assert.match(
			claudeMd,
			/Never merge PRs or push to main\. Open a PR and stop; Phil decides when it merges\./,
		);
		assert.match(claudeMd, /Anything under `\.github\/workflows` goes to Cursor, not Claude\./);
	});
});
