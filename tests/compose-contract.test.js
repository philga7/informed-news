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
			'name: ${INFORMED_NEWS_DATA_VOLUME:-${COMPOSE_PROJECT_NAME:-informed-news}-data}',
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
			/^\s*image:\s*informed-news:ci\s*$/m,
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

const LIVE_VOLUME = 'informed-news-data';
const LIVE_PORT = '3001';
const LIVE_PROJECT = 'informed-news';
const QA_VOLUME = 'informed-news-qa-data';
const QA_PORT = '3002';
const QA_PROJECT = 'informed-news-qa';

const VOLUME_EXPR =
	'${INFORMED_NEWS_DATA_VOLUME:-${COMPOSE_PROJECT_NAME:-informed-news}-data}';

function composeText() {
	return readFileSync(join(root, 'compose.yaml'), 'utf8');
}

function resolveVolumeName(contents, env) {
	assert.ok(
		contents.includes(`name: ${VOLUME_EXPR}`),
		'volume name must be settable and follow the project name by default',
	);
	const override = env.INFORMED_NEWS_DATA_VOLUME;
	if (override !== undefined && override !== '') return override;
	const project = env.COMPOSE_PROJECT_NAME;
	const projectName = project !== undefined && project !== '' ? project : LIVE_PROJECT;
	return `${projectName}-data`;
}

function resolvePublishedPort(contents, env) {
	const override = env.INFORMED_NEWS_PORT;
	if (override !== undefined && override !== '') return override;
	const match = contents.match(/127\.0\.0\.1:\$\{INFORMED_NEWS_PORT:-(\d+)\}:3001/);
	assert.ok(match, 'published port must default on loopback');
	return match[1];
}

describe('QA instance compose isolation', () => {
	it('keeps the live volume name when the volume env and project name are unset', () => {
		const contents = composeText();
		assert.equal(resolveVolumeName(contents, {}), LIVE_VOLUME);
		assert.equal(resolvePublishedPort(contents, {}), LIVE_PORT);
		assert.match(contents, /^name: informed-news$/m);
		assert.doesNotMatch(contents, /container_name:/);
		assert.match(contents, /fetch\('http:\/\/127\.0\.0\.1:3001\/healthz'\)/);
	});

	it('uses an override volume name that is not the live volume', () => {
		const contents = composeText();
		const override = resolveVolumeName(contents, {
			INFORMED_NEWS_DATA_VOLUME: QA_VOLUME,
			COMPOSE_PROJECT_NAME: QA_PROJECT,
		});
		assert.equal(override, QA_VOLUME);
		assert.notEqual(override, LIVE_VOLUME);
	});

	it('gives a second project its own volume, port, and env file without a live mount', () => {
		const contents = composeText();
		const liveVolume = resolveVolumeName(contents, { COMPOSE_PROJECT_NAME: LIVE_PROJECT });
		const qaVolume = resolveVolumeName(contents, { COMPOSE_PROJECT_NAME: QA_PROJECT });
		const livePort = resolvePublishedPort(contents, {});
		const qaPort = resolvePublishedPort(contents, { INFORMED_NEWS_PORT: QA_PORT });
		assert.equal(liveVolume, LIVE_VOLUME);
		assert.equal(qaVolume, QA_VOLUME);
		assert.notEqual(qaVolume, LIVE_VOLUME);
		assert.equal(livePort, LIVE_PORT);
		assert.equal(qaPort, QA_PORT);
		assert.notEqual(qaPort, livePort);
		assert.notEqual(QA_PROJECT, LIVE_PROJECT);
		assert.match(contents, /INFORMED_NEWS_ENV_FILE:-\/opt\/informed-news\/\.env/);
		assert.doesNotMatch(contents, /informed-news-qa/);
	});
});

describe('QA instance runbook', () => {
	it('documents an isolated QA instance with no real secrets', () => {
		const runbook = readFileSync(join(root, 'docs/RUNBOOK.md'), 'utf8');
		const start = runbook.indexOf('## QA instance');
		assert.ok(start !== -1, 'missing QA instance section');
		const next = runbook.indexOf('\n## ', start + 1);
		const section = next === -1 ? runbook.slice(start) : runbook.slice(start, next);

		for (const phrase of [
			'/opt/informed-news/qa.env',
			'mode `600`',
			'informed-news-qa',
			'informed-news-qa-data',
			'3002',
			'mvp_qa_session',
			'REFRESH_INTERVAL_HOURS=off',
			'OLLAMA_API_KEY',
			'TYPESAFE_API_KEY',
			'tailscale serve --bg --https=8443 http://127.0.0.1:3002',
			'tailscale serve --https=8443 off',
			'INFORMED_NEWS_DATA_VOLUME=informed-news-qa-data \\',
			'INFORMED_NEWS_IMAGE=informed-news:qa \\',
			'docker compose --env-file /opt/informed-news/qa.env -p informed-news-qa up -d --build',
			'Docker Compose v2.40.3',
			'informed-news:local',
			'docker compose --env-file /opt/informed-news/qa.env -p informed-news-qa down',
			'docker volume rm informed-news-qa-data',
			'Do not set `INFORMED_NEWS_DATA_VOLUME` to `informed-news-data`',
			'Do not copy',
			'single-quoted',
			'curl -fsS http://127.0.0.1:3002/healthz',
		]) {
			assert.ok(section.includes(phrase), `QA instance section missing: ${phrase}`);
		}

		const imageTagLines = section
			.split('\n')
			.filter((line) => line.includes('INFORMED_NEWS_IMAGE=informed-news:qa'));
		assert.equal(
			imageTagLines.length,
			2,
			'QA image tag belongs in the env placeholder and the start command',
		);

		assert.doesNotMatch(section, /\$2[aby]\$/);
		assert.doesNotMatch(section, /SESSION_SECRET=(?!<)[^\s<]/);
		assert.equal(section.includes('informed-news-data'), true);
		assert.match(section, /never remove `informed-news-data`/i);
	});
});
