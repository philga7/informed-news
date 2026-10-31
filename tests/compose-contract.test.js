import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const forbiddenSecrets = [
	'MVP_PASSWORD',
	'SESSION_SECRET',
	'TYPESAFE_API_KEY',
	'OLLAMA_API_KEY',
	'TS_AUTHKEY',
];

describe('NEWS-109 compose.yaml contract', () => {
	it('matches the isolated Compose project requirements', () => {
		const contents = readFileSync(join(root, 'compose.yaml'), 'utf8');

		const requiredSubstrings = [
			'name: informed-news',
			'name: informed-news-data',
			'external: true',
			'name: nanobot-mem0',
			'restart: unless-stopped',
			'/app/mvp/data',
			'127.0.0.1:',
			'INFORMED_NEWS_ENV_FILE:-/opt/informed-news/.env',
			'${INFORMED_NEWS_IMAGE:-informed-news:local}',
			'interval: 30s',
			'timeout: 5s',
			'retries: 3',
			'start_period: 20s',
			'SEARXNG_URL',
			'TOPIC_SEARCH_ENABLED',
		];
		for (const substring of requiredSubstrings) {
			assert.ok(contents.includes(substring), `missing required substring: ${substring}`);
		}

		assert.doesNotMatch(contents, /SEARXNG_URL\s*:/, 'SEARXNG_URL must not appear as environment assignment');
		assert.doesNotMatch(
			contents,
			/image:\s*informed-news:ci\s*$/,
			'must not hardcode image: informed-news:ci',
		);

		for (const forbidden of forbiddenSecrets) {
			assert.ok(!contents.includes(forbidden), `must not include: ${forbidden}`);
		}
	});

	it('does not embed localhost SearXNG URLs in compose.yaml', () => {
		const contents = readFileSync(join(root, 'compose.yaml'), 'utf8');
		for (const url of ['127.0.0.1:8888', 'localhost:8888']) {
			assert.ok(!contents.includes(url), `must not include SearXNG bind URL: ${url}`);
		}
	});

	it('forbiddenSecrets list has no bind-address literals', () => {
		for (const entry of forbiddenSecrets) {
			assert.ok(!entry.includes('127.0.0.1'), `secret entry must not include 127.0.0.1: ${entry}`);
			assert.ok(!entry.includes('localhost'), `secret entry must not include localhost: ${entry}`);
		}
	});
});
