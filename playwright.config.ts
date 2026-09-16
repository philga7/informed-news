import { defineConfig, devices } from '@playwright/test';

const kitePort = Number(process.env.KITE_PORT ?? 5173);
// Use localhost (not 127.0.0.1): Vite may bind IPv6-only on macOS.
const baseURL = `http://localhost:${kitePort}`;

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
		// Owned brief requires mvp/server + Kite (NEWS-44).
		command: `npm run dev`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
