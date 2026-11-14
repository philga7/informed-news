import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const SECRET_KEYS = [
	'POSTGRES_PASSWORD',
	'MVP_PASSWORD',
	'SESSION_SECRET',
	'TYPESAFE_API_KEY',
	'OLLAMA_API_KEY',
	'COURTLISTENER_API_TOKEN',
	'TS_AUTHKEY',
];

const DEFAULT_POSTGRES_ENV = `POSTGRES_PASSWORD=change-me
POSTGRES_USER=informed_news
POSTGRES_DB=informed_news
`;

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

function nonCommentText(text) {
	return text
		.split('\n')
		.filter((line) => !/^\s*#/.test(line))
		.join('\n');
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

	it('gives a second project its own volume and port, and keeps the env file settable', () => {
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
		assert.match(contents, /\$\{INFORMED_NEWS_ENV_FILE:-\/opt\/informed-news\/\.env\}/);
		assert.doesNotMatch(nonCommentText(contents), /informed-news-qa/);
		assert.match(contents, /Only `informed-news` and `informed-news-qa` are supported project names/);
		assert.match(contents, /Any other name fails because its include file is missing/);
	});
});

function composeCli() {
	const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
	if (docker.status === 0) return { command: 'docker', prefix: ['compose'] };
	return null;
}

function redactSecrets(text, literals) {
	let out = text;
	for (const [key, value] of Object.entries(literals)) {
		if (value) out = out.split(value).join(`<redacted:${key}>`);
	}
	return out;
}

function postgresPasswordFromEnvFile(filePath) {
	if (!existsSync(filePath)) return undefined;
	const text = readFileSync(filePath, 'utf8');
	const match = text.match(/^POSTGRES_PASSWORD=(.*)$/m);
	return match ? match[1].trim() : undefined;
}

function composeInvocation(extraEnv, project, configArgs = ['config']) {
	const cli = composeCli();
	assert.ok(cli, 'docker compose is required for this test');
	const env = { ...process.env };
	delete env.INFORMED_NEWS_DATA_VOLUME;
	delete env.INFORMED_NEWS_PORT;
	delete env.INFORMED_NEWS_IMAGE;
	delete env.COMPOSE_PROJECT_NAME;
	delete env.COMPOSE_FILE;
	delete env.INFORMED_NEWS_DB_NETWORK;
	delete env.INFORMED_NEWS_DB_EXTERNAL;
	delete env.INFORMED_NEWS_POSTGRES_ENV_FILE;
	delete env.COMPOSE_PROFILES;
	Object.assign(env, extraEnv);
	env.COMPOSE_ANSI = 'never';

	const redactLiterals = {};
	for (const key of SECRET_KEYS) {
		if (env[key]) redactLiterals[key] = env[key];
		delete env[key];
	}

	env.INFORMED_NEWS_ENV_FILE = join(root, 'mvp/.env.example');

	const hasProfilesKey = Object.prototype.hasOwnProperty.call(extraEnv, 'COMPOSE_PROFILES');
	if (!hasProfilesKey) {
		env.COMPOSE_PROFILES = 'informed-news-postgres';
	}

	const hasPostgresEnvKey = Object.prototype.hasOwnProperty.call(
		extraEnv,
		'INFORMED_NEWS_POSTGRES_ENV_FILE',
	);
	let tempDir;
	if (!hasPostgresEnvKey) {
		tempDir = mkdtempSync(join(tmpdir(), 'informed-news-pg-env-'));
		const postgresEnvPath = join(tempDir, 'postgres.env');
		writeFileSync(postgresEnvPath, DEFAULT_POSTGRES_ENV, { mode: 0o600 });
		env.INFORMED_NEWS_POSTGRES_ENV_FILE = postgresEnvPath;
	}
	const postgresEnvPath = env.INFORMED_NEWS_POSTGRES_ENV_FILE;
	if (postgresEnvPath) {
		const fromFile = postgresPasswordFromEnvFile(postgresEnvPath);
		if (fromFile && !redactLiterals.POSTGRES_PASSWORD) {
			redactLiterals.POSTGRES_PASSWORD = fromFile;
		}
	}
	redactLiterals.MVP_PASSWORD = 'change-me';
	redactLiterals.SESSION_SECRET = 'change-me-to-a-long-random-string';

	const args = [...cli.prefix];
	if (project) args.push('-p', project);
	args.push(...configArgs);
	try {
		const result = spawnSync(cli.command, args, {
			cwd: root,
			env,
			encoding: 'utf8',
			timeout: 20000,
		});
		return {
			status: result.status,
			stdout: redactSecrets(result.stdout ?? '', redactLiterals),
			stderr: redactSecrets(result.stderr ?? '', redactLiterals),
		};
	} finally {
		if (tempDir) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	}
}

function renderedCompose(extraEnv, project, configArgs = ['config']) {
	const result = composeInvocation(extraEnv, project, configArgs);
	if (result.status !== 0) {
		assert.fail(`compose exited ${result.status}: ${result.stderr}`);
	}
	return result.stdout;
}

function renderedComposeServices(extraEnv, project, extraArgs = []) {
	return renderedCompose(extraEnv, project, ['config', '--services', ...extraArgs]);
}

function postgresServiceBlock(contents) {
	const start = contents.indexOf('\n  postgres:\n');
	assert.ok(start !== -1, 'missing postgres service');
	const rest = contents.slice(start);
	const end = rest.indexOf('\nvolumes:\n');
	assert.ok(end !== -1, 'postgres service must stay above the volumes block');
	return rest.slice(0, end);
}

function postgresEnvironmentKeys(config) {
	const start = config.indexOf('\n  postgres:\n');
	if (start === -1) return [];
	const rest = config.slice(start);
	const envHeader = '\n    environment:\n';
	const envStart = rest.indexOf(envHeader);
	if (envStart === -1) return [];
	const afterEnv = rest.slice(envStart + envHeader.length);
	const nextServiceKey = afterEnv.search(/\n    [a-z]/);
	const body = nextServiceKey === -1 ? afterEnv : afterEnv.slice(0, nextServiceKey);
	return [...body.matchAll(/^\s+([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]);
}

function volumeNames(config) {
	const volumes = config.split(/^volumes:\s*$/m)[1] ?? '';
	return [...volumes.matchAll(/^\s+name:\s*(\S+)\s*$/gm)].map((match) => match[1]);
}

function configuredVolume(config) {
	const data = volumeNames(config).find((name) => name.endsWith('-data'));
	assert.ok(data, 'rendered config has no data volume name');
	return data;
}

function configuredPostgresVolume(config) {
	const postgres = volumeNames(config).find((name) => name.endsWith('-postgres'));
	assert.ok(postgres, 'rendered config has no postgres volume name');
	return postgres;
}

function configuredPort(config) {
	const match = config.match(/published:\s*"?(\d+)"?/);
	assert.ok(match, 'rendered config has no published port');
	return match[1];
}

function declaredNetwork(config, name) {
	const parts = config.split(/\nnetworks:\n/);
	assert.equal(parts.length, 2, 'rendered config should have one networks block');
	const section = parts[1];
	const header = `  ${name}:\n`;
	const start = section.indexOf(header);
	assert.ok(start !== -1, `missing network ${name}`);
	const rest = section.slice(start + header.length);
	const next = rest.search(/\n  [A-Za-z0-9_-]+:\n|\nvolumes:\n/);
	return rest.slice(0, next === -1 ? undefined : next);
}

describe('QA instance rendered by docker compose', { skip: composeCli() ? false : 'docker compose is not installed' }, () => {
	it('keeps the live volume, port, and image when the new vars are unset', () => {
		const config = renderedCompose({}, undefined);
		assert.equal(configuredVolume(config), LIVE_VOLUME);
		assert.equal(configuredPostgresVolume(config), 'informed-news-postgres');
		assert.notEqual(configuredPostgresVolume(config), LIVE_VOLUME);
		assert.equal(configuredPort(config), LIVE_PORT);
		assert.match(config, /informed-news:local/);
		assert.doesNotMatch(config, /informed-news:qa/);
	});

	it('does not mount the live volume for project informed-news-qa', () => {
		const config = renderedCompose({}, QA_PROJECT);
		assert.equal(configuredVolume(config), QA_VOLUME);
		assert.notEqual(configuredVolume(config), LIVE_VOLUME);
		assert.doesNotMatch(config, /\n  postgres:\n/);
		assert.match(config, /^name: informed-news-qa$/m);
	});

	it('still has the live postgres volume when the live postgres profile is on', () => {
		const config = renderedCompose({}, undefined);
		assert.equal(configuredPostgresVolume(config), 'informed-news-postgres');
	});

	it('uses a QA port and volume override that are not the live ones', () => {
		const config = renderedCompose(
			{ INFORMED_NEWS_DATA_VOLUME: QA_VOLUME, INFORMED_NEWS_PORT: QA_PORT, INFORMED_NEWS_IMAGE: 'informed-news:qa' },
			QA_PROJECT,
		);
		assert.equal(configuredVolume(config), QA_VOLUME);
		assert.notEqual(configuredVolume(config), LIVE_VOLUME);
		assert.equal(configuredPort(config), QA_PORT);
		assert.notEqual(configuredPort(config), LIVE_PORT);
		assert.match(config, /informed-news:qa/);
	});
});

describe('NEWS-224 postgres compose service', () => {
	it('caps memory, sets shared_buffers, and does not publish the database port', () => {
		const contents = readFileSync(join(root, 'compose.postgres.informed-news.yaml'), 'utf8');
		const service = postgresServiceBlock(contents);
		assert.match(service, /image: postgres:16-alpine/);
		assert.match(service, /mem_limit: 512m/);
		assert.match(service, /shm_size: 256mb/);
		assert.match(service, /shared_buffers=128MB/);
		assert.match(service, /POSTGRES_USER: informed_news/);
		assert.match(
			service,
			/\$\{COMPOSE_PROJECT_NAME:-informed-news\}-postgres/,
		);
		assert.match(
			service,
			/\$\{INFORMED_NEWS_POSTGRES_ENV_FILE:-\/opt\/informed-news\/postgres\.env\}/,
		);
		assert.doesNotMatch(service, /INFORMED_NEWS_ENV_FILE/);
		assert.doesNotMatch(service, /^\s*ports:/m);
		assert.doesNotMatch(service, /POSTGRES_PASSWORD/);
		assert.match(
			contents,
			/\$\{INFORMED_NEWS_POSTGRES_VOLUME:-\$\{COMPOSE_PROJECT_NAME:-informed-news\}-postgres\}/,
		);
		const appFile = composeText();
		assert.match(
			appFile,
			/name: \$\{INFORMED_NEWS_DATA_VOLUME:-\$\{COMPOSE_PROJECT_NAME:-informed-news\}-data\}/,
		);
		assert.match(
			appFile,
			/compose\.postgres\.\$\{COMPOSE_PROJECT_NAME:-informed-news\}\.yaml/,
		);
		assert.doesNotMatch(nonCommentText(appFile), /informed-news-qa/);
		assert.doesNotMatch(contents, /informed-news-qa/);
		const qaInclude = readFileSync(join(root, 'compose.postgres.informed-news-qa.yaml'), 'utf8');
		assert.doesNotMatch(qaInclude, /^\s*postgres:/m);
	});
});

describe('NEWS-230 postgres env and QA compose contract', { skip: composeCli() ? false : 'docker compose is not installed' }, () => {
	it('QA config --services lists only app, even with COMPOSE_PROFILES=informed-news-postgres', () => {
		assert.equal(renderedComposeServices({}, QA_PROJECT), 'app\n');
		assert.equal(
			renderedComposeServices({ COMPOSE_PROFILES: 'informed-news-postgres' }, QA_PROJECT),
			'app\n',
		);
	});

	it('QA joins informed-news-db without a project-owned network', () => {
		const config = renderedCompose({ COMPOSE_PROFILES: '' }, QA_PROJECT);
		const network = declaredNetwork(config, 'informed-news-db');
		assert.match(network, /name: informed-news-db$/m);
		assert.match(network, /external: true/);
		assert.doesNotMatch(network, /informed-news-qa-db/);
	});

	it('live postgres profile renders only POSTGRES_* keys on the postgres service', () => {
		const config = renderedCompose({}, undefined);
		const keys = postgresEnvironmentKeys(config);
		assert.deepEqual(keys.sort(), ['POSTGRES_DB', 'POSTGRES_PASSWORD', 'POSTGRES_USER']);
		assert.ok(!keys.includes('MVP_PASSWORD'));
		assert.ok(!keys.includes('SESSION_SECRET'));
	});

	it('postgres.env.example holds POSTGRES_* placeholders only', () => {
		const text = readFileSync(join(root, 'mvp/postgres.env.example'), 'utf8');
		const keys = [...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
		for (const key of keys) {
			assert.match(key, /^POSTGRES_/);
		}
		assert.ok(keys.includes('POSTGRES_USER'));
		assert.ok(keys.includes('POSTGRES_PASSWORD'));
		assert.ok(keys.includes('POSTGRES_DB'));
		assert.match(text, /POSTGRES_PASSWORD=change-me/);
	});

	it('a QA profile does not render a Postgres service or volume', () => {
		const config = renderedCompose(
			{ COMPOSE_PROFILES: 'informed-news-qa-postgres' },
			QA_PROJECT,
		);
		assert.doesNotMatch(config, /\n  postgres:\n/);
		assert.equal(
			volumeNames(config).find((name) => name.endsWith('-postgres')),
			undefined,
		);
	});
});

describe('NEWS-231 QA compose cannot start Postgres', { skip: composeCli() ? false : 'docker compose is not installed' }, () => {
	const profiles = ['', 'informed-news-postgres', 'informed-news-qa-postgres'];

	for (const profile of profiles) {
		it(`project informed-news-qa with COMPOSE_PROFILES=${profile || '(unset)'} has no postgres service`, () => {
			assert.equal(
				renderedComposeServices({ COMPOSE_PROFILES: profile }, QA_PROJECT),
				'app\n',
			);
			const named = composeInvocation({ COMPOSE_PROFILES: profile }, QA_PROJECT, [
				'up',
				'--dry-run',
				'--no-deps',
				'postgres',
			]);
			assert.notEqual(named.status, 0);
			assert.match(`${named.stderr}\n${named.stdout}`, /no such service: postgres/);
		});
	}

	it('an unknown project name fails because the include file is missing', () => {
		const result = composeInvocation({ COMPOSE_PROFILES: '' }, 'informed-news-other', [
			'config',
			'--services',
		]);
		assert.notEqual(result.status, 0);
		assert.match(
			`${result.stderr}\n${result.stdout}`,
			/compose\.postgres\.informed-news-other\.yaml: no such file or directory/,
		);
	});

	it('live profile still renders the live Postgres service and an external db network', () => {
		const services = renderedComposeServices({}, undefined);
		assert.match(services, /^app\npostgres\n$|^postgres\napp\n$/);
		const config = renderedCompose({}, undefined);
		assert.equal(configuredPostgresVolume(config), 'informed-news-postgres');
		const network = declaredNetwork(config, 'informed-news-db');
		assert.match(network, /name: informed-news-db$/m);
		assert.match(network, /external: true/);
	});
});

describe('NEWS-232 informed-news-db is external', { skip: composeCli() ? false : 'docker compose is not installed' }, () => {
	for (const project of [undefined, QA_PROJECT]) {
		const label = project ?? LIVE_PROJECT;
		it(`project ${label} joins informed-news-db and does not own it`, () => {
			const config = renderedCompose({ COMPOSE_PROFILES: project ? '' : 'informed-news-postgres' }, project);
			const network = declaredNetwork(config, 'informed-news-db');
			assert.match(network, /name: informed-news-db$/m);
			assert.match(network, /external: true/);
			assert.doesNotMatch(config, /informed-news-qa-db/);
			assert.doesNotMatch(network, /external:\s*false/);
		});
	}
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
			3,
			'QA image tag belongs in the env placeholder, the first start, and the recreate command',
		);

		const recreateAt = section.indexOf('### Recreate without a build');
		assert.ok(recreateAt !== -1, 'missing recreate-without-a-build section');
		const recreateNext = section.indexOf('\n### ', recreateAt + 1);
		const recreate = section.slice(recreateAt, recreateNext === -1 ? undefined : recreateNext);
		const command = recreate.match(/```bash\n([\s\S]*?)```/);
		assert.ok(command, 'recreate section needs a command');
		assert.match(
			command[1],
			/docker compose --env-file \/opt\/informed-news\/qa.env -p informed-news-qa up -d\n$/,
		);
		assert.doesNotMatch(command[1], /--build/);
		assert.doesNotMatch(command[1], /--pull/);

		assert.doesNotMatch(section, /\$2[aby]\$/);
		assert.doesNotMatch(section, /SESSION_SECRET=(?!<)[^\s<]/);
		assert.equal(section.includes('informed-news-data'), true);
		assert.match(section, /never remove `informed-news-data`/i);

		const liveStart = runbook.indexOf('## Start, logs, stop');
		const liveNext = runbook.indexOf('\n## ', liveStart + 1);
		const startSection = runbook.slice(liveStart, liveNext);
		assert.match(startSection, /must not pass `-p`/);
		assert.match(startSection, /must not set `COMPOSE_PROJECT_NAME`/);
		assert.match(startSection, /volume `informed-news-data`/);
	});
});

describe('NEWS-230 runbook postgres env', () => {
	it('documents live env ownership, postgres env layout, and QA db join', () => {
		const runbook = readFileSync(join(root, 'docs/RUNBOOK.md'), 'utf8');

		const envStart = runbook.indexOf('## Env file');
		assert.ok(envStart !== -1, 'missing Env file section');
		const envNext = runbook.indexOf('\n## ', envStart + 1);
		const envSection = runbook.slice(envStart, envNext);
		assert.match(envSection, /owner `root:root`/);
		assert.match(envSection, /mode `600`/);
		assert.match(envSection, /Do not recreate it from scratch or chown it to `deploy`/);
		assert.doesNotMatch(
			envSection,
			/set owner `deploy:deploy` and mode `600`, then edit the placeholders/,
		);

		const pgStart = runbook.indexOf('## Postgres env');
		assert.ok(pgStart !== -1, 'missing Postgres env section');
		const pgNext = runbook.indexOf('\n## ', pgStart + 1);
		const pgSection = runbook.slice(pgStart, pgNext);
		for (const phrase of [
			'informed-news-postgres-1',
			'postgres.env',
			'COMPOSE_PROFILES=informed-news-postgres',
			'root:root',
			"Phil's approval",
			'Do not print the file',
			'Do not print the rendered config',
		]) {
			assert.ok(pgSection.includes(phrase), `Postgres env missing: ${phrase}`);
		}

		const qaStart = runbook.indexOf('## QA instance');
		const qaNext = runbook.indexOf('\n## ', qaStart + 1);
		const qaSection = runbook.slice(qaStart, qaNext);
		for (const phrase of [
			'POSTGRES_HOST=postgres',
			'compose.postgres.informed-news-qa.yaml',
			'no such service: postgres',
			'COMPOSE_PROFILES=informed-news-postgres',
			'COMPOSE_PROFILES=informed-news-qa-postgres',
			'do not start Postgres',
			'docker compose --env-file /opt/informed-news/qa.env -p informed-news-qa config --services',
			'must print only `app`',
		]) {
			assert.ok(qaSection.includes(phrase), `QA section missing: ${phrase}`);
		}
		for (const phrase of [
			'## Database network',
			'docker network create informed-news-db',
			'does not remove it',
			'already has this network',
			"Phil's approval",
		]) {
			assert.ok(runbook.includes(phrase), `runbook missing: ${phrase}`);
		}
		assert.doesNotMatch(
			qaSection,
			/naming `postgres` does/,
			'QA runbook must not say naming postgres starts a database',
		);
	});
});
