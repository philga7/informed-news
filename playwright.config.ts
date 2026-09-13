import { defineConfig, devices } from '@playwright/test';

const kitePort = Number(process.env.KITE_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${kitePort}`;

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
		command: `npm run kite -- --host 127.0.0.1 --port ${kitePort} --strictPort`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
