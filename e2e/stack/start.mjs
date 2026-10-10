#!/usr/bin/env node
// Start the hermetic test stack: mvp/server + Kite on the E2E ports, a fresh data dir
// seeded with E2E_SCENARIO (default "topics"), and a generated env file in place of
// mvp/.env (no Ollama / TypeSafe keys, auto-refresh off, test-only password), plus a
// local fixture page server for manual-seed scrapes (never the internet).
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
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
import { writeScenario } from './scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const kiteBase = `http://localhost:${E2E_KITE_PORT}`;

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

const children = [
	spawn(path.join(root, 'mvp/server/node_modules/.bin/tsx'), ['src/index.ts'], {
		cwd: path.join(root, 'mvp/server'),
		env: { ...process.env, MVP_ENV_FILE: envFile, MVP_DATA_DIR: E2E_DATA_DIR },
		stdio: 'inherit',
	}),
	spawn(
		path.join(root, 'apps/kite/node_modules/.bin/vite'),
		['dev', '--port', String(E2E_KITE_PORT), '--strictPort'],
		{
			cwd: path.join(root, 'apps/kite'),
			env: { ...process.env, KITE_API_BASE: `http://127.0.0.1:${E2E_API_PORT}/api` },
			stdio: 'inherit',
		},
	),
];

let stopping = false;
function stop(code) {
	if (stopping) return;
	stopping = true;
	fixtures.close();
	for (const child of children) {
		if (child.exitCode === null) child.kill('SIGTERM');
	}
	process.exitCode = code;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const child of children) {
	child.on('exit', (code) => stop(code ?? 1));
}
