import { Pool, type PoolConfig } from 'pg';

export const LIVE_DATABASE = 'informed_news';
export const QA_DATABASE = 'informed_news_qa';

export type NewsInstance = 'live' | 'qa';

export type DashboardConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  instance: NewsInstance;
};

export class DashboardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DashboardConfigError';
  }
}

export function readNewsInstance(env: NodeJS.ProcessEnv): NewsInstance {
  const raw = env.INFORMED_NEWS_INSTANCE?.trim() ?? '';
  if (raw === '' || raw === 'live') return 'live';
  if (raw === 'qa') return 'qa';
  throw new DashboardConfigError('INFORMED_NEWS_INSTANCE must be live or qa');
}

/**
 * Refuse to open a database that does not belong to this instance.
 * Live is only `informed_news`. QA is only `informed_news_qa`.
 */
export function assertInstanceDatabase(instance: NewsInstance, database: string): void {
  switch (instance) {
    case 'live':
      if (database !== LIVE_DATABASE) {
        throw new DashboardConfigError(`live instance refused database ${database}`);
      }
      return;
    case 'qa':
      if (database !== QA_DATABASE) {
        throw new DashboardConfigError(`qa instance refused database ${database}`);
      }
      return;
    default: {
      const unexpected: never = instance;
      throw new DashboardConfigError(`unknown instance ${String(unexpected)}`);
    }
  }
}

function databaseForInstance(instance: NewsInstance): string {
  switch (instance) {
    case 'live':
      return LIVE_DATABASE;
    case 'qa':
      return QA_DATABASE;
    default: {
      const unexpected: never = instance;
      throw new DashboardConfigError(`unknown instance ${String(unexpected)}`);
    }
  }
}

export function readDashboardConnection(env: NodeJS.ProcessEnv): DashboardConnection {
  const instance = readNewsInstance(env);
  const configuredDatabase = env.POSTGRES_DB?.trim() ?? '';
  const database = configuredDatabase || databaseForInstance(instance);
  assertInstanceDatabase(instance, database);

  const password = env.POSTGRES_PASSWORD ?? '';
  if (password.trim() === '') {
    throw new DashboardConfigError('POSTGRES_PASSWORD is required');
  }

  const portText = env.POSTGRES_PORT?.trim() || '5432';
  const port = Number(portText);
  if (!Number.isInteger(port) || port <= 0) {
    throw new DashboardConfigError('POSTGRES_PORT must be a positive integer');
  }

  const user = env.POSTGRES_USER?.trim() || 'informed_news';
  const host = env.POSTGRES_HOST?.trim() || 'postgres';

  return { host, port, user, password, database, instance };
}

/**
 * Opens a dashboard pool. Instance and password checks run before `new Pool`.
 */
export function openDashboardPool(
  env: NodeJS.ProcessEnv,
  createPool: (config: PoolConfig) => Pool = (config) => new Pool(config),
): Pool {
  const connection = readDashboardConnection(env);
  return createPool({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
  });
}
