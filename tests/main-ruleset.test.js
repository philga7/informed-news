import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

describe('NEWS-178 main requires a PR, one approval, PR title, and squash by title', () => {
	it('requires both GitHub Actions checks on the default branch', () => {
		const ruleset = JSON.parse(read('.github/rulesets/main-requires-ci.json'));
		assert.equal(ruleset.name, 'main requires CI');
		assert.equal(ruleset.target, 'branch');
		assert.equal(ruleset.enforcement, 'active');
		assert.deepEqual(ruleset.conditions.ref_name.include, ['~DEFAULT_BRANCH']);
		for (const key of [
			'id',
			'source_type',
			'source',
			'node_id',
			'created_at',
			'updated_at',
			'current_user_can_bypass',
			'_links',
		]) {
			assert.equal(Object.hasOwn(ruleset, key), false, key);
		}

		const checksRule = ruleset.rules.find((rule) => rule.type === 'required_status_checks');
		assert.ok(checksRule, 'required_status_checks');
		const checks = checksRule.parameters.required_status_checks;
		assert.deepEqual(
			checks.map((check) => check.context),
			['MVP build & typecheck', 'PR title'],
		);
		for (const check of checks) {
			assert.equal(check.integration_id, 15368);
		}
	});

	it('requires one approval of the last push, dismisses stale approvals, and allows squash only', () => {
		const ruleset = JSON.parse(read('.github/rulesets/main-requires-ci.json'));
		const pullRequest = ruleset.rules.find((rule) => rule.type === 'pull_request');
		assert.ok(pullRequest, 'pull_request');
		assert.equal(pullRequest.parameters.required_approving_review_count, 1);
		assert.equal(pullRequest.parameters.require_last_push_approval, true);
		assert.equal(pullRequest.parameters.dismiss_stale_reviews_on_push, true);
		assert.deepEqual(pullRequest.parameters.required_reviewers, []);
		assert.deepEqual(pullRequest.parameters.allowed_merge_methods, ['squash']);
	});

	it('blocks force-push and deletion of the default branch', () => {
		const ruleset = JSON.parse(read('.github/rulesets/main-requires-ci.json'));
		const types = ruleset.rules.map((rule) => rule.type);
		assert.ok(types.includes('non_fast_forward'));
		assert.ok(types.includes('deletion'));
	});

	it('bypass actors are not a bot or a GitHub App integration', () => {
		const ruleset = JSON.parse(read('.github/rulesets/main-requires-ci.json'));
		assert.deepEqual(ruleset.bypass_actors, [
			{
				actor_id: 5,
				actor_type: 'RepositoryRole',
				bypass_mode: 'pull_request',
			},
			{
				actor_id: null,
				actor_type: 'DeployKey',
				bypass_mode: 'always',
			},
		]);
		for (const actor of ruleset.bypass_actors) {
			assert.notEqual(actor.actor_type, 'Integration');
			assert.notEqual(actor.actor_type, 'User');
		}
	});

	it('apply script is dry-run by default, prints a diff, and does not PUT or PATCH', () => {
		const script = read('scripts/apply-repo-settings.sh');
		assert.match(script, /--apply/);
		assert.match(script, /squash_merge_commit_title=PR_TITLE/);
		assert.match(script, /squash_merge_commit_message=PR_BODY/);
		assert.match(script, /repos\/philga7\/informed-news\/rulesets\/24903925/);
		assert.doesNotMatch(script, /ghp_|github_pat_|Bearer |sk-ant-|AKIA/);
		const applyAt = script.indexOf('apply=1');
		const putAt = script.indexOf('gh api -X PUT');
		assert.ok(applyAt !== -1 && putAt > applyAt);

		const dir = mkdtempSync(join(tmpdir(), 'news-178-gh-'));
		const log = join(dir, 'calls.txt');
		writeFileSync(
			join(dir, 'gh'),
			`#!/bin/bash
printf '%s\\n' "$*" >> "$GH_CALL_LOG"
if [[ "$*" == *"-X PUT"* || "$*" == *"-X PATCH"* ]]; then
  echo "refusing write" >&2
  exit 99
fi
if [[ "$*" == *rulesets* ]]; then
  printf '%s\\n' '{"id":24903925,"name":"main requires CI","target":"branch","source_type":"Repository","source":"philga7/informed-news","enforcement":"active","conditions":{"ref_name":{"exclude":[],"include":["refs/heads/main"]}},"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"MVP build & typecheck","integration_id":15368}]}}],"node_id":"RRS","created_at":"2026-10-12T02:05:43.514Z","updated_at":"2026-10-12T02:05:43.566Z","current_user_can_bypass":"never"}'
  exit 0
fi
printf '%s\\n' '{"squash_merge_commit_title":"COMMIT_OR_PR_TITLE","squash_merge_commit_message":"COMMIT_MESSAGES","allow_auto_merge":false}'
`,
		);
		chmodSync(join(dir, 'gh'), 0o755);

		const result = spawnSync('bash', [join(root, 'scripts/apply-repo-settings.sh')], {
			cwd: root,
			env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GH_CALL_LOG: log },
			encoding: 'utf8',
		});
		assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
		assert.match(result.stdout, /Dry run/);
		assert.match(result.stdout, /PR title/);
		assert.match(result.stdout, /PR_TITLE/);
		assert.doesNotMatch(readFileSync(log, 'utf8'), /-X PUT|-X PATCH/);
	});

	it('CONTRIBUTING requires PR title and says how Phil applies the ruleset', () => {
		const contributing = read('CONTRIBUTING.md');
		assert.match(contributing, /\*\*PR title\*\* is required/);
		assert.doesNotMatch(contributing, /once it is added/);
		assert.match(contributing, /One approving review/);
		assert.match(contributing, /scripts\/apply-repo-settings\.sh --apply/);
		assert.match(contributing, /squash_merge_commit_title: PR_TITLE/);
		assert.match(contributing, /squash_merge_commit_message=PR_BODY/);
	});

	it('CLAUDE.md says the builder never approves, merges, or enables auto-merge', () => {
		const claudeMd = read('CLAUDE.md');
		assert.match(claudeMd, /never approves, never merges, and never enables auto-merge/);
		assert.match(claudeMd, /Its pull requests need Phil's approval/);
	});

	it('DECISIONS records the ruleset choice and leaves the product direction unchanged', () => {
		const decisions = read('docs/DECISIONS.md');
		const heading =
			'## 2026-11-01 — main requires a PR, one approval, PR title and build checks; squash by PR title; no bot bypass (NEWS-178)';
		assert.ok(decisions.includes(heading));
		const next = decisions.indexOf('\n## ', decisions.indexOf(heading) + heading.length);
		const entry = decisions.slice(decisions.indexOf(heading), next);
		assert.match(entry, /Bots must not merge their own green pull requests/);
		assert.match(entry, /\[VISION\.md\]\(VISION\.md\) is unchanged/);
		assert.match(entry, /\*\*What it rules out:\*\*/);
	});

	it('ROADMAP says NEWS-183 runs after Phil applies the NEWS-178 settings', () => {
		const roadmap = read('docs/ROADMAP.md');
		assert.match(roadmap, /after Phil applies the NEWS-178 settings/);
		const rows = roadmap
			.split('\n')
			.filter((line) => line.startsWith('|') && line.includes('/browse/NEWS-178)'));
		assert.equal(rows.length, 1, rows);
		assert.match(rows[0], /Dev tooling/);
		assert.match(rows[0], /NEWS-183/);
	});
});
