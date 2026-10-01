#!/usr/bin/env node
// Start the hermetic test stack: mvp/server + Kite on the E2E ports, a fresh data dir
// seeded with E2E_SCENARIO (default "topics"), and a generated env file in place of
// mvp/.env (no Ollama / TypeSafe keys, auto-refresh off, test-only password).
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_API_PORT, E2E_DATA_DIR, E2E_KITE_PORT, E2E_MVP_PASSWORD } from './config.mjs';
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
