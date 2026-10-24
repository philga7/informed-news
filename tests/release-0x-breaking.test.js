import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes } from '@semantic-release/release-notes-generator';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const logger = { log() {} };

function read(rel) {
	return readFileSync(join(root, rel), 'utf8');
}

function analyzerConfig() {
	const rc = JSON.parse(read('.releaserc.json'));
	const entry = rc.plugins.find(
		(plugin) =>
			plugin === '@semantic-release/commit-analyzer' ||
			(Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer'),
	);
	const pluginConfig = Array.isArray(entry) ? entry[1] : {};
	return { preset: rc.preset, ...pluginConfig };
}

function bump(version, releaseType) {
	const [major, minor, patch] = version.split('.').map(Number);
	if (releaseType === 'major') return `${major + 1}.0.0`;
	if (releaseType === 'minor') return `${major}.${minor + 1}.0`;
	if (releaseType === 'patch') return `${major}.${minor}.${patch + 1}`;
	return null;
}

async function nextVersion(message) {
	const current = JSON.parse(read('package.json')).version;
	const releaseType = await analyzeCommits(analyzerConfig(), {
		commits: [{ message, hash: 'abc1234' }],
		cwd: root,
		logger,
	});
	return { current, releaseType, version: bump(current, releaseType) };
}

describe('NEWS-171 breaking changes stay on 0.x minor', () => {
	it('bumps a feat!: commit to the next 0.x minor, not 1.0.0', async () => {
		const { current, releaseType, version } = await nextVersion('feat!: rename the brief path');
		assert.equal(current.split('.')[0], '0', `package version ${current} is no longer 0.x`);
		assert.equal(
			version,
			bump(current, 'minor'),
			`feat!: from ${current} analyzed as ${releaseType} and computed ${version}`,
		);
		assert.notEqual(version, '1.0.0');
		const footer = await nextVersion('feat: rename the brief path\n\nBREAKING CHANGE: clients must use the new path');
		assert.equal(footer.version, bump(current, 'minor'));
	});

	it('still bumps feat: to minor and fix: to patch', async () => {
		const feat = await nextVersion('feat: add a brief section');
		const fix = await nextVersion('fix: keep a dropped story reason');
		assert.equal(feat.version, bump(feat.current, 'minor'));
		assert.equal(fix.version, bump(fix.current, 'patch'));
	});

	it('still renders Features and Bug Fixes sections (NEWS-132)', async () => {
		const pkg = JSON.parse(read('package.json'));
		assert.equal(pkg.devDependencies['conventional-changelog-conventionalcommits'], '^9.3.1');
		const current = pkg.version;
		const notes = await generateNotes(
			{ preset: 'conventionalcommits' },
			{
				commits: [
					{ message: 'feat: add a brief section', hash: 'aaa1111' },
					{ message: 'fix: keep a dropped story reason', hash: 'bbb2222' },
				],
				lastRelease: { version: current, gitTag: `v${current}` },
				nextRelease: { version: bump(current, 'minor'), gitTag: `v${bump(current, 'minor')}` },
				options: { repositoryUrl: 'https://github.com/philga7/informed-news.git' },
				cwd: root,
				logger,
			},
		);
		assert.match(notes, /### Features/);
		assert.match(notes, /### Bug Fixes/);
	});

	it('says the minor-on-breaking rule is removed when 1.0 ships', () => {
		const contributing = read('CONTRIBUTING.md');
		assert.match(contributing, /0\.x/);
		assert.match(contributing, /minor/);
		assert.match(contributing, /Remove that `releaseRules` entry/);
		assert.match(contributing, /1\.0/);
	});
});
