import dotenv from 'dotenv';
import path from 'node:path';
import type { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { openDashboardPool } from '../store/postgres/instanceGuard.js';
import { runAgentsCli } from './agentsCli.js';

// Operator commands for agents (NEWS-263). Same env file as the server (src/index.ts).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = process.env.MVP_ENV_FILE?.trim() || path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envFile, override: true, quiet: true });

let code = 1;
let pool: Pool | undefined;
try {
  pool = openDashboardPool(process.env);
  await ensureDashboardSchema(pool);
  code = await runAgentsCli(process.argv.slice(2), pool, {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await pool?.end();
}
process.exit(code);
