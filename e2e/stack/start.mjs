#!/usr/bin/env node
// Hermetic test stack. Express (mvp/server src/index.ts) listens on E2E_API_PORT
// with WEB_BUILD_DIR and KITE_BUILD_DIR set, so it serves the shell Brief at /
// and Kite everywhere else. A TCP proxy on E2E_KITE_PORT forwards every
// connection, including upgrades, to 127.0.0.1:E2E_API_PORT. Playwright's
// baseURL stays the public port. No Kite vite process.
//
// Also: a fresh data dir seeded with E2E_SCENARIO (default "topics"), a
// generated env file in place of mvp/.env (no Ollama / TypeSafe keys,
// auto-refresh off, test-only password), and a local fixture page server for
// manual-seed scrapes (never the internet).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	E2E_API_PORT,
	E2E_DATA_DIR,
	E2E_FIXTURE_PORT,
	E2E_KITE_PORT,
	E2E_MVP_PASSWORD,
	E2E_SEED_ARTICLE_PATH,
} from './config.mjs';
import { createTcpProxy } from './proxy.mjs';
import { writeScenario } from './scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kiteBase = `http://localhost:${E2E_KITE_PORT}`;

/**
 * Production handler for one SvelteKit app. Skips `bun run build` when
 * build/handler.js is already there.
 * @param {string} appDir repo-relative app directory, e.g. "apps/web"
 */
function ensureBuild(appDir) {
	const buildDir = path.join(root, appDir, 'build');
	const handler = path.join(buildDir, 'handler.js');
	if (existsSync(handler)) return buildDir;
	console.log(`e2e: ${handler} missing; running bun run --cwd ${appDir} build`);
	const result = spawnSync('bun', ['run', '--cwd', appDir, 'build'], {
		cwd: root,
		stdio: 'inherit',
		env: process.env,
	});
	if (result.error) {
		console.error(`e2e: failed to start bun for ${appDir}: ${result.error.message}`);
		process.exit(1);
	}
	if (result.status !== 0) {
		console.error(`e2e: ${appDir} build exited ${result.status}`);
		process.exit(result.status ?? 1);
	}
	if (!existsSync(handler)) {
		console.error(`e2e: ${appDir} build did not write ${handler}`);
		process.exit(1);
	}
	return buildDir;
}

const webBuildDir = ensureBuild('apps/web');
const kiteBuildDir = ensureBuild('apps/kite');

rmSync(E2E_DATA_DIR, { recursive: true, force: true });
writeScenario(E2E_DATA_DIR, process.env.E2E_SCENARIO ?? 'topics', { imageBaseUrl: kiteBase });

const envFile = path.join(E2E_DATA_DIR, '.env.e2e');
writeFileSync(
	envFile,
	[
		`PORT=${E2E_API_PORT}`,
		`MVP_PASSWORD=${E2E_MVP_PASSWORD}`,
		'MVP_PASSWORD_HASH=',
		'SESSION_SECRET=informed-news-e2e-session-secret',
		'REFRESH_INTERVAL_HOURS=off',
		'TRIAGE_ENABLED=false',
		'OLLAMA_API_KEY=',
		'TYPESAFE_API_KEY=',
		'',
	].join('\n'),
);

// Subject unrelated to every scenario headline, so the seed duplicate check never fires.
const SEED_ARTICLE_HTML = `<!doctype html>
<html lang="en">
<head><title>Library extends weekend reading-room hours</title></head>
<body>
<article>
<h1>Library extends weekend reading-room hours</h1>
<p>The city library will keep its main reading room open until nine in the evening on Saturdays and Sundays starting next month.</p>
<p>The library board approved the change after a survey of cardholders asked for more weekend study space. Staffing for the extra hours comes from the existing volunteer program, and the children's wing keeps its current schedule.</p>
</article>
</body>
</html>
`;

const fixtures = createServer((req, res) => {
	if (req.method === 'GET' && req.url === E2E_SEED_ARTICLE_PATH) {
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(SEED_ARTICLE_HTML);
		return;
	}
	res.writeHead(404, { 'Content-Type': 'text/plain' });
	res.end('Not found');
});
fixtures.on('error', (err) => {
	console.error(`e2e fixture server failed on :${E2E_FIXTURE_PORT}: ${err.message}`);
	stop(1);
});
fixtures.listen(E2E_FIXTURE_PORT, '127.0.0.1');

// Kite's server proxy reads KITE_API_BASE at runtime ($env/dynamic/private).
// The built handler runs inside this Express process; without this it would
// call 127.0.0.1:3001 (the dev default) instead of the hermetic API.
const api = spawn(path.join(root, 'mvp/server/node_modules/.bin/tsx'), ['src/index.ts'], {
	cwd: path.join(root, 'mvp/server'),
	env: {
		...process.env,
		MVP_ENV_FILE: envFile,
		MVP_DATA_DIR: E2E_DATA_DIR,
		PORT: String(E2E_API_PORT),
		WEB_BUILD_DIR: webBuildDir,
		KITE_BUILD_DIR: kiteBuildDir,
		KITE_API_BASE: `http://127.0.0.1:${E2E_API_PORT}/api`,
	},
	stdio: 'inherit',
});

const proxy = createTcpProxy({ targetHost: '127.0.0.1', targetPort: E2E_API_PORT });
proxy.on('error', (err) => {
	console.error(`e2e proxy failed on :${E2E_KITE_PORT}: ${err.message}`);
	stop(1);
});
proxy.listen(E2E_KITE_PORT, () => {
	console.log(`e2e proxy :${E2E_KITE_PORT} -> 127.0.0.1:${E2E_API_PORT}`);
});

const children = [api];

let stopping = false;
function stop(code) {
	if (stopping) return;
	stopping = true;
	fixtures.close();
	proxy.closeProxy();
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
	}
	process.exitCode = code;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) {
	child.on('exit', (code) => stop(code ?? 1));
}
