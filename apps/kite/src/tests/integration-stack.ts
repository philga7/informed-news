import { spawn } from 'node:child_process';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
	export interface ProvidedContext {
		kiteBaseUrl: string;
	}
}

// Ports apart from the dev server (5173/3001) and Playwright's stack (5174/3101).
const KITE_PORT = 5175;
const API_PORT = 3102;

async function waitForUp(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Integration stack did not come up at ${url}`);
}

/** Hermetic mvp/server + Kite (e2e/stack) seeded with the topic Brief scenario. */
export default async function setup(project: TestProject) {
	const root = path.resolve(import.meta.dirname, '../../../..');
	const kiteBaseUrl = `http://localhost:${KITE_PORT}`;
	const stack = spawn(process.execPath, [path.join(root, 'e2e/stack/start.mjs')], {
		cwd: root,
		env: {
			...process.env,
			E2E_API_PORT: String(API_PORT),
			E2E_KITE_PORT: String(KITE_PORT),
			E2E_SCENARIO: 'topics',
		},
		stdio: 'ignore',
		detached: true,
	});
	const stop = async () => {
		if (stack.exitCode !== null || stack.pid === undefined) return;
		const exited = new Promise((resolve) => stack.once('exit', resolve));
		process.kill(-stack.pid, 'SIGTERM');
		await exited;
	};

	try {
		await waitForUp(kiteBaseUrl, 120_000);
	} catch (err) {
		await stop();
		throw err;
	}
	project.provide('kiteBaseUrl', kiteBaseUrl);
	return stop;
}
