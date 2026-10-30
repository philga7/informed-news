import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

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
});
