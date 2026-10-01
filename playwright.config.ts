import { defineConfig, devices } from '@playwright/test';
import { E2E_API_PORT, E2E_DATA_DIR, E2E_KITE_PORT } from './e2e/stack/config.mjs';

// Use localhost (not 127.0.0.1): Vite may bind IPv6-only on macOS.
const baseURL = `http://localhost:${E2E_KITE_PORT}`;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	timeout: 120_000,
	use: {
		baseURL,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		// Hermetic stack (e2e/stack): own ports + seeded data dir + generated env file,
		// never the dev server, mvp/data or mvp/.env — so no live budget and no data-dependent skips.
		command: 'node e2e/stack/start.mjs',
		url: baseURL,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			...Object.fromEntries(
				Object.entries(process.env).filter(
					(entry): entry is [string, string] => entry[1] !== undefined,
				),
			),
			E2E_API_PORT: String(E2E_API_PORT),
			E2E_KITE_PORT: String(E2E_KITE_PORT),
			E2E_DATA_DIR,
		},
	},
});
