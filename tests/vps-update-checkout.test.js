import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const script = join(root, 'scripts/vps-update-checkout.sh');

const gitEnv = {
	...process.env,
	GIT_AUTHOR_NAME: 't',
	GIT_AUTHOR_EMAIL: 't@example.com',
	GIT_COMMITTER_NAME: 't',
	GIT_COMMITTER_EMAIL: 't@example.com',
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(cwd, ...args) {
	const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
	assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
	return r.stdout.trim();
}

function commit(origin, name) {
	writeFileSync(join(origin, name), name);
	git(origin, 'add', name);
	git(origin, 'commit', '-m', name);
}

function run(checkout, ...args) {
	return spawnSync(script, args, { cwd: checkout, encoding: 'utf8', env: gitEnv });
}

describe('NEWS-236 VPS checkout update by release tag', () => {
	let origin;
	let checkout;
	let v1;
	let v2;

	before(() => {
		const base = mkdtempSync(join(tmpdir(), 'informed-news-vps-'));
		origin = join(base, 'origin');
		checkout = join(base, 'checkout');
		git(base, 'init', '-b', 'main', origin);
		commit(origin, 'a');
		git(origin, 'tag', 'v0.1.0');
		v1 = git(origin, 'rev-parse', 'HEAD');
		commit(origin, 'b');
		git(origin, 'tag', 'v0.2.0');
		v2 = git(origin, 'rev-parse', 'HEAD');
		// Divergent history: a tag that is not a descendant of v0.2.0.
		git(origin, 'checkout', '-b', 'side', 'v0.1.0');
		commit(origin, 'c');
		git(origin, 'tag', 'v0.2.1-side');
		git(origin, 'checkout', 'main');
		git(base, 'clone', origin, checkout);
		git(checkout, 'checkout', '--detach', v1);
	});

	it('requires a tag argument', () => {
		const r = run(checkout);
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /usage: scripts\/vps-update-checkout\.sh TAG/);
	});

	it('refuses a tag that does not exist', () => {
		const r = run(checkout, 'v9.9.9');
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /tag v9\.9\.9 not found/);
	});

	it('moves forward to a tag, detached, and prints old and new', () => {
		const r = run(checkout, 'v0.2.0');
		assert.equal(r.status, 0, r.stderr);
		assert.equal(git(checkout, 'rev-parse', 'HEAD'), v2);
		const sym = spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: checkout, env: gitEnv });
		assert.equal(sym.status, 1, 'HEAD must be detached');
		assert.match(r.stdout, new RegExp(`old: ${v1}`));
		assert.match(r.stdout, new RegExp(`new: ${v2} \\(v0\\.2\\.0\\)`));
	});

	it('is a no-op on rerun of the same tag and stays on that tag', () => {
		const r = run(checkout, 'v0.2.0');
		assert.equal(r.status, 0, r.stderr);
		assert.equal(git(checkout, 'rev-parse', 'HEAD'), v2);
		assert.match(r.stdout, /already at v0\.2\.0/);
	});

	it('refuses a non-fast-forward move and leaves HEAD alone', () => {
		const r = run(checkout, 'v0.2.1-side');
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /not a fast-forward/);
		assert.equal(git(checkout, 'rev-parse', 'HEAD'), v2);
		const back = run(checkout, 'v0.1.0');
		assert.notEqual(back.status, 0);
		assert.equal(git(checkout, 'rev-parse', 'HEAD'), v2);
	});

	it('refuses a dirty tree', () => {
		commit(origin, 'd');
		git(origin, 'tag', 'v0.3.0');
		writeFileSync(join(checkout, 'a'), 'local edit');
		const r = run(checkout, 'v0.3.0');
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /working tree is not clean/);
		assert.equal(git(checkout, 'rev-parse', 'HEAD'), v2);
		git(checkout, 'checkout', '--', 'a');
		const ok = run(checkout, 'v0.3.0');
		assert.equal(ok.status, 0, ok.stderr);
	});

	it('ignores untracked files such as qa.env and still moves forward', () => {
		commit(origin, 'e');
		git(origin, 'tag', 'v0.4.0');
		const v4 = git(origin, 'rev-parse', 'HEAD');
		writeFileSync(join(checkout, 'qa.env'), 'SECRET=1');
		writeFileSync(join(checkout, '.env.bak'), 'SECRET=1');
		const r = run(checkout, 'v0.4.0');
		assert.equal(r.status, 0, r.stderr);
		assert.equal(git(checkout, 'rev-parse', 'HEAD'), v4);
	});
});
