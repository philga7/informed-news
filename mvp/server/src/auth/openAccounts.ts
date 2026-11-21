import { Pool as PgPool, type Pool, type PoolConfig } from 'pg';
import { openDashboardPool } from '../store/postgres/instanceGuard.js';
import { createAccounts, type Accounts } from './accounts.js';

type Log = (message: string) => void;

const CONNECT_TIMEOUT_MS = 3_000;

/**
 * Accounts for the running server (NEWS-254). Accounts are on when the env
 * file configures Postgres (POSTGRES_PASSWORD and the instance checks in
 * instanceGuard). Otherwise they are off and sign-in works as before. A
 * database that cannot be reached at startup does not stop the server: the
 * schema is applied in the background, and sign-in tries again on use.
 */
export function openAccounts(
  env: NodeJS.ProcessEnv,
  options: {
    createPool?: (config: PoolConfig) => Pool;
    log?: Log;
    warn?: Log;
  } = {},
): Accounts | undefined {
  const log = options.log ?? ((message) => console.log(message));
  const warn = options.warn ?? ((message) => console.error(message));
  const createPool = options.createPool ?? ((config: PoolConfig) => new PgPool(config));
  let pool: Pool;
  try {
    // A host that never answers must not hold a request open: give up on a
    // connection after a few seconds and treat the database as unreachable.
    pool = openDashboardPool(env, (config) =>
      createPool({ ...config, connectionTimeoutMillis: CONNECT_TIMEOUT_MS }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`User accounts off (${message}); sign-in uses the MVP password only`);
    return undefined;
  }
  // An idle client that loses its connection emits 'error'. Unhandled, that
  // would crash the server; the next query reconnects instead.
  pool.on('error', (err) => warn(`Postgres pool error: ${err.message}`));
  const accounts = createAccounts(pool, env);
  accounts.prepare().then(
    () => log('User accounts on'),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      warn(`User accounts: the database is not ready (${message}); sign-in will retry`);
    },
  );
  return accounts;
}
