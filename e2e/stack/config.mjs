// Hermetic test stack (e2e + Kite integration): own ports, own data dir, own env file.
// Never the developer's mvp/data or mvp/.env, so runs are deterministic and spend no budget.
import os from 'node:os';
import path from 'node:path';

export const E2E_API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
export const E2E_KITE_PORT = Number(process.env.E2E_KITE_PORT ?? 5174);
export const E2E_DATA_DIR =
	process.env.E2E_DATA_DIR ?? path.join(os.tmpdir(), `informed-news-e2e-${E2E_API_PORT}`);

/** Session password for the throwaway test server only (written to its generated env file). */
export const E2E_MVP_PASSWORD = 'informed-news-e2e-only';
