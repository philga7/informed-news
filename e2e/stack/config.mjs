// Hermetic test stack (e2e + Kite integration): own ports, own data dir, own env file.
// Never the developer's mvp/data or mvp/.env, so runs are deterministic and spend no budget.
import os from 'node:os';
import path from 'node:path';

export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
export const E2E_KITE_PORT = Number(process.env.E2E_KITE_PORT ?? 5174);
export const E2E_DATA_DIR =
	process.env.E2E_DATA_DIR ?? path.join(os.tmpdir(), `informed-news-e2e-${E2E_API_PORT}`);

/** Local "publisher" pages the server can scrape (manual seeds, NEWS-98); served by start.mjs. */
export const E2E_FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT ?? E2E_API_PORT + 100);

export const E2E_SEED_ARTICLE_PATH = '/seed-article';

export function e2eFixtureUrl(pathname) {
	return `http://127.0.0.1:${E2E_FIXTURE_PORT}${pathname}`;
}

/** Session password for the throwaway test server only (written to its generated env file). */
export const E2E_MVP_PASSWORD = 'informed-news-e2e-only';
