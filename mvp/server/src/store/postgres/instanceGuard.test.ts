import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import {
  DashboardConfigError,
  LIVE_DATABASE,
  QA_DATABASE,
  assertInstanceDatabase,
  openDashboardPool,
  readDashboardConnection,
  readNewsInstance,
} from './instanceGuard.js';

test('blank INFORMED_NEWS_INSTANCE is live and qa is QA', () => {
  assert.equal(readNewsInstance({}), 'live');
  assert.equal(readNewsInstance({ INFORMED_NEWS_INSTANCE: '   ' }), 'live');
  assert.equal(readNewsInstance({ INFORMED_NEWS_INSTANCE: 'live' }), 'live');
  assert.equal(readNewsInstance({ INFORMED_NEWS_INSTANCE: 'qa' }), 'qa');
});

test('an unknown instance name is refused', () => {
  assert.throws(
    () => readNewsInstance({ INFORMED_NEWS_INSTANCE: 'production' }),
    DashboardConfigError,
  );
});

test('live accepts only the live database and QA accepts only the QA database', () => {
  assert.doesNotThrow(() => assertInstanceDatabase('live', LIVE_DATABASE));
  assert.doesNotThrow(() => assertInstanceDatabase('qa', QA_DATABASE));
  assert.throws(() => assertInstanceDatabase('live', QA_DATABASE), /refused database/);
  assert.throws(() => assertInstanceDatabase('qa', LIVE_DATABASE), /refused database/);
  assert.throws(() => assertInstanceDatabase('live', ''), /refused database/);
  assert.throws(() => assertInstanceDatabase('qa', ''), /refused database/);
  assert.throws(() => assertInstanceDatabase('qa', 'informed_news_test'), /refused database/);
});

test('a QA connection pointed at the live database fails closed before a password is echoed', () => {
  const password = 'not-a-real-database-password';
  assert.throws(
    () =>
      readDashboardConnection({
        INFORMED_NEWS_INSTANCE: 'qa',
        POSTGRES_DB: LIVE_DATABASE,
        POSTGRES_PASSWORD: password,
      }),
    (err: unknown) => {
      assert.ok(err instanceof DashboardConfigError);
      assert.equal(err.message.includes(password), false);
      assert.match(err.message, /refused database informed_news$/);
      return true;
    },
  );
});

test('a live connection pointed at the QA database fails closed', () => {
  assert.throws(
    () =>
      readDashboardConnection({
        INFORMED_NEWS_INSTANCE: 'live',
        POSTGRES_DB: QA_DATABASE,
        POSTGRES_PASSWORD: 'placeholder',
      }),
    (err: unknown) => {
      assert.ok(err instanceof DashboardConfigError);
      assert.equal(err.message.includes('placeholder'), false);
      return true;
    },
  );
});

test('a missing password is refused and the error does not contain a password value', () => {
  assert.throws(
    () => readDashboardConnection({ INFORMED_NEWS_INSTANCE: 'live', POSTGRES_DB: LIVE_DATABASE }),
    (err: unknown) => {
      assert.ok(err instanceof DashboardConfigError);
      assert.equal(err.message, 'POSTGRES_PASSWORD is required');
      return true;
    },
  );
});

test('defaults are the live database, user informed_news, host postgres, and port 5432', () => {
  const connection = readDashboardConnection({ POSTGRES_PASSWORD: 'placeholder' });
  assert.equal(connection.instance, 'live');
  assert.equal(connection.database, LIVE_DATABASE);
  assert.equal(connection.user, 'informed_news');
  assert.equal(connection.host, 'postgres');
  assert.equal(connection.port, 5432);
  assert.equal(connection.password, 'placeholder');
});

test('QA defaults to the QA database when POSTGRES_DB is unset', () => {
  const connection = readDashboardConnection({
    INFORMED_NEWS_INSTANCE: 'qa',
    POSTGRES_PASSWORD: 'placeholder',
  });
  assert.equal(connection.instance, 'qa');
  assert.equal(connection.database, QA_DATABASE);
});

function refusesBeforePool(env: NodeJS.ProcessEnv): void {
  const password = 'not-a-real-database-password';
  let opened = false;
  assert.throws(
    () =>
      openDashboardPool({ ...env, POSTGRES_PASSWORD: password }, () => {
        opened = true;
        throw new Error('pool should not be constructed');
      }),
    (err: unknown) => {
      assert.equal(opened, false);
      assert.ok(err instanceof DashboardConfigError);
      assert.equal(err.message.includes(password), false);
      return true;
    },
  );
}

test('instance mix-ups fail closed before a pool is opened', () => {
  refusesBeforePool({ INFORMED_NEWS_INSTANCE: 'live', POSTGRES_DB: QA_DATABASE });
  refusesBeforePool({ INFORMED_NEWS_INSTANCE: 'qa', POSTGRES_DB: LIVE_DATABASE });
  refusesBeforePool({ INFORMED_NEWS_INSTANCE: '   ', POSTGRES_DB: QA_DATABASE });
  refusesBeforePool({ INFORMED_NEWS_INSTANCE: 'staging' });
  refusesBeforePool({ INFORMED_NEWS_INSTANCE: 'qa', POSTGRES_DB: 'informed_news_test' });
});

test('a missing password fails closed before a pool is opened', () => {
  let opened = false;
  assert.throws(
    () =>
      openDashboardPool({ INFORMED_NEWS_INSTANCE: 'live' }, () => {
        opened = true;
        throw new Error('pool should not be constructed');
      }),
    (err: unknown) => {
      assert.equal(opened, false);
      assert.ok(err instanceof DashboardConfigError);
      assert.equal(err.message, 'POSTGRES_PASSWORD is required');
      return true;
    },
  );
});

test('QA pool targets informed_news_qa on host postgres and refuses the live database first', () => {
  const password = 'placeholder';
  openDashboardPool(
    {
      INFORMED_NEWS_INSTANCE: 'qa',
      POSTGRES_DB: QA_DATABASE,
      POSTGRES_HOST: 'postgres',
      POSTGRES_USER: 'informed_news',
      POSTGRES_PASSWORD: password,
    },
    (config) => {
      assert.equal(config.database, QA_DATABASE);
      assert.equal(config.host, 'postgres');
      assert.equal(config.user, 'informed_news');
      assert.equal(config.password, password);
      return {} as Pool;
    },
  );

  let opened = false;
  assert.throws(
    () =>
      openDashboardPool(
        {
          INFORMED_NEWS_INSTANCE: 'qa',
          POSTGRES_DB: LIVE_DATABASE,
          POSTGRES_HOST: 'postgres',
          POSTGRES_USER: 'informed_news',
          POSTGRES_PASSWORD: password,
        },
        () => {
          opened = true;
          throw new Error('pool should not be constructed');
        },
      ),
    (err: unknown) => {
      assert.equal(opened, false);
      assert.ok(err instanceof DashboardConfigError);
      assert.equal(err.message.includes(password), false);
      assert.match(err.message, /refused database informed_news$/);
      return true;
    },
  );
});

test('a guarded connection opens the instance database', () => {
  const live = openDashboardPool({ POSTGRES_PASSWORD: 'placeholder' }, (config) => {
    assert.equal(config.database, LIVE_DATABASE);
    assert.equal(config.user, 'informed_news');
    assert.equal(config.host, 'postgres');
    assert.equal(config.port, 5432);
    assert.equal(config.password, 'placeholder');
    return {} as Pool;
  });
  assert.ok(live);

  let qaOpened = false;
  openDashboardPool(
    { INFORMED_NEWS_INSTANCE: 'qa', POSTGRES_PASSWORD: 'placeholder' },
    (config) => {
      qaOpened = true;
      assert.equal(config.database, QA_DATABASE);
      return {} as Pool;
    },
  );
  assert.equal(qaOpened, true);
});
