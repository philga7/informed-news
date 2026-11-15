import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const script = join(root, 'scripts/stage-claude-checkout-auth.mjs');
const token = 'ghs_stage_token_not_a_secret';

function git(cwd, args) {
	const result = spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
	});
	assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
	return result.stdout.trim();
}

function initRepo() {
	const dir = mkdtempSync(join(tmpdir(), 'stage-claude-auth-'));
	git(dir, ['init', '-b', 'main']);
	git(dir, ['remote', 'add', 'origin', 'https://github.com/philga7/informed-news.git']);
	return dir;
}

function run(cwd, env = {}) {
	return spawnSync('node', [script], {
		cwd,
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: '/dev/null',
			GIT_CONFIG_SYSTEM: '/dev/null',
			GITHUB_TOKEN: token,
			...env,
		},
	});
}

describe('NEWS-237 stage Claude checkout auth', () => {
	it('puts the workflow token on origin and leaves no extraheader', () => {
		const dir = initRepo();
		const result = run(dir);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.includes(token), false);
		assert.equal(result.stderr.includes(token), false);
		const url = git(dir, ['remote', 'get-url', 'origin']);
		assert.equal(url, `https://x-access-token:${token}@github.com/philga7/informed-news.git`);
		const listed = git(dir, ['config', '--list', '--show-origin']);
		assert.equal(listed.toLowerCase().includes('extraheader'), false);
	});

	it('clears an includeIf.gitdir checkout header before stamping origin', () => {
		const dir = initRepo();
		const cred = join(dir, 'creds.config');
		git(dir, ['config', '--file', cred, 'http.https://github.com/.extraheader', 'AUTHORIZATION: basic dGVzdA==']);
		git(dir, ['config', '--local', `includeIf.gitdir:${dir}/.git.path`, cred]);
		git(dir, ['config', '--local', `includeIf.gitdir:${dir}/.git/worktrees/*.path`, cred]);
		const result = run(dir);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(readFileSync(cred, 'utf8').toLowerCase().includes('extraheader'), false);
		const listed = git(dir, ['config', '--list', '--show-origin']);
		assert.equal(listed.toLowerCase().includes('extraheader'), false);
		assert.equal(
			git(dir, ['remote', 'get-url', 'origin']),
			`https://x-access-token:${token}@github.com/philga7/informed-news.git`,
		);
	});

	it('refuses a missing token and a non-https origin without printing a token', () => {
		const missing = run(initRepo(), { GITHUB_TOKEN: '' });
		assert.notEqual(missing.status, 0);
		assert.match(missing.stderr, /GITHUB_TOKEN/);

		const ssh = initRepo();
		git(ssh, ['remote', 'set-url', 'origin', 'git@github.com:philga7/informed-news.git']);
		const refused = run(ssh);
		assert.notEqual(refused.status, 0);
		assert.equal(refused.stdout.includes(token), false);
		assert.equal(refused.stderr.includes(token), false);
		assert.equal(git(ssh, ['remote', 'get-url', 'origin']), 'git@github.com:philga7/informed-news.git');
	});
});
