import { Pool as PgPool, type Pool, type PoolConfig } from 'pg';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { openDashboardPool } from '../store/postgres/instanceGuard.js';

type Log = (message: string) => void;

/** A shorter token is refused as too easy to guess. */
export const INGEST_TOKEN_MIN_LENGTH = 32;
const CONNECT_TIMEOUT_MS = 3_000;

/**
 * What the ingest route needs (NEWS-228). `token` is null when INGEST_TOKEN is
 * unset or too short; `pool` is null when the env file does not configure
 * Postgres. The route answers 503 in either case, and the server still starts.
 */
export type IngestConfig = {
  token: string | null;
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

  const raw = env.INGEST_TOKEN?.trim() ?? '';
  let token: string | null = null;
  if (raw === '') {
    log('Ingest off: INGEST_TOKEN is not set');
  } else if (raw.length < INGEST_TOKEN_MIN_LENGTH) {
    warn(`Ingest off: INGEST_TOKEN must be at least ${INGEST_TOKEN_MIN_LENGTH} characters`);
  } else {
    token = raw;
  }

  let pool: Pool | null = null;
  if (token !== null) {
    try {
      pool = openDashboardPool(env, (config) =>
        createPool({ ...config, connectionTimeoutMillis: CONNECT_TIMEOUT_MS }),
      );
      // An idle client that loses its connection emits 'error'; unhandled, it would crash the server.
      pool.on('error', (err) => warn(`Ingest Postgres pool error: ${err.message}`));
      log('Ingest on');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Ingest off (${message})`);
    }
  }

  let applied: Promise<void> | null = null;
  return {
    token,
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
