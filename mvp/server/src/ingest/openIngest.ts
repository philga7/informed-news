import { Pool as PgPool, type Pool, type PoolConfig } from 'pg';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { openDashboardPool } from '../store/postgres/instanceGuard.js';
import { pgErrorCode } from '../store/postgres/storeSupport.js';

type Log = (message: string) => void;

const CONNECT_TIMEOUT_MS = 3_000;

/**
 * What the ingest route needs. `pool` is null when the env file does not
 * configure Postgres; the route then answers 503, and the server still starts.
 * Each agent signs in with its own token, looked up in the `agents` table
 * (NEWS-263), so there is no token in the env file.
 */
export type IngestConfig = {
  pool: Pool | null;
  /** Applies the dashboard schema once. A failure is retried on the next call. */
  ready: () => Promise<void>;
};

export function openIngest(
  env: NodeJS.ProcessEnv,
  options: { createPool?: (config: PoolConfig) => Pool; log?: Log; warn?: Log } = {},
): IngestConfig {
  const log = options.log ?? ((message) => console.log(message));
  const warn = options.warn ?? ((message) => console.error(message));
  const createPool = options.createPool ?? ((config: PoolConfig) => new PgPool(config));

  // Retired by NEWS-263. Its value is never read or logged; agents have their own tokens now.
  if (env.INGEST_TOKEN?.trim()) {
    warn('INGEST_TOKEN is set but no longer used: remove it from the env file. Agents use their own tokens (npm run agents).');
  }

  let pool: Pool | null = null;
  try {
    pool = openDashboardPool(env, (config) =>
      createPool({ ...config, connectionTimeoutMillis: CONNECT_TIMEOUT_MS }),
    );
    // An idle client that loses its connection emits 'error'; unhandled, it would crash the server.
    // Only the error's code is logged: a driver message can carry values.
    pool.on('error', (err) => warn(`Ingest Postgres pool error (${pgErrorCode(err) ?? err.name})`));
    log('Ingest on');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Ingest off (${message})`);
  }

  let applied: Promise<void> | null = null;
  return {
    pool,
    ready: () => {
      if (pool === null) return Promise.reject(new Error('no database'));
      applied ??= ensureDashboardSchema(pool).catch((error: unknown) => {
        applied = null;
        throw error;
      });
      return applied;
    },
  };
}
