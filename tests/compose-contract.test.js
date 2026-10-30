import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

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

		const forbiddenSecrets = [
			'MVP_PASSWORD',
			'SESSION_SECRET',
			'TYPESAFE_API_KEY',
			'OLLAMA_API_KEY',
			'TS_AUTHKEY',
			'127.0.0.1:8888',
			'localhost:8888',
		];
		for (const forbidden of forbiddenSecrets) {
			assert.ok(!contents.includes(forbidden), `must not include: ${forbidden}`);
		}
	});
});
