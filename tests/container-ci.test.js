import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function configureAndStartStep(contents) {
	const marker = '- name: Configure and start container';
	const start = contents.indexOf(marker);
	assert.ok(start !== -1, 'missing Configure and start container step');
	const next = contents.indexOf('\n      - name:', start + marker.length);
	const block =
		next === -1 ? contents.slice(start) : contents.slice(start, next);
	return block;
}

describe('NEWS-109 CI builds and starts the container', () => {
	it('contains the required docker build/start steps in the validate job', () => {
		const contents = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

		const requiredSubstrings = [
			'docker build -t informed-news:ci .',
			'image_build_seconds',
			'container_start_seconds',
			'docker compose up -d --wait --no-build',
			'nanobot-mem0',
		];
		for (const substring of requiredSubstrings) {
			assert.ok(contents.includes(substring), `missing required substring: ${substring}`);
		}
	});

	it('does not set a time cap on the job or its steps', () => {
		const contents = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
		assert.doesNotMatch(contents, /timeout-minutes/, 'must not set timeout-minutes');
	});

	it('creates the dummy env file with mode 600 before writing contents', () => {
		const block = configureAndStartStep(
			readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'),
		);
		const usesRestrictedUmask =
			block.includes('umask 077') || block.includes('install -m 600');
		assert.ok(
			usesRestrictedUmask,
			'expected umask 077 or install -m 600 before writing the env file',
		);
		assert.doesNotMatch(
			block,
			/cat > "\$env_file"[\s\S]*EOF[\s\S]*\n\s*chmod 600 "\$env_file"/,
			'must not chmod 600 only after writing the env file',
		);
	});

	it('exports INFORMED_NEWS_IMAGE, logs on compose up failure, tears down always', () => {
		const block = configureAndStartStep(
			readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'),
		);
		assert.match(block, /export INFORMED_NEWS_IMAGE=informed-news:ci/);
		assert.ok(block.includes('docker compose logs'), 'must print docker compose logs on failure');
		assert.ok(block.includes('docker compose down'), 'must run docker compose down');
		assert.match(block, /trap[\s\S]*docker compose down/, 'must trap teardown');
	});
});
