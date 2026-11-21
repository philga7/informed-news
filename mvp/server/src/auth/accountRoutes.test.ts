import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test, type TestContext } from 'node:test';
import express from 'express';
import type { Pool, PoolConfig } from 'pg';
import {
  PREPARE_RETRY_MS,
  createAccounts,
  hashPassword,
  type Accounts,
  type SessionUser,
} from './accounts.js';
import { openAccounts } from './openAccounts.js';
import { requireApiSession, createAuthRouter } from './routes.js';
import { createSessionMiddleware } from './session.js';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { createUser, disableUser, setUserPasswordHash } from '../store/postgres/userStore.js';
import { testPool } from '../testing/dashboardTestDb.js';

const saved = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  MVP_PASSWORD: process.env.MVP_PASSWORD,
  MVP_PASSWORD_HASH: process.env.MVP_PASSWORD_HASH,
};

before(() => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** The sign-in routes and one protected route, as createApp mounts them. */
async function serve(t: TestContext, accounts?: Accounts): Promise<string> {
  const app = express();
  app.use('/api', express.json());
  app.use(createSessionMiddleware());
  app.use('/api', requireApiSession(accounts));
  app.use('/api', createAuthRouter(accounts));
  app.get('/api/protected', (_req, res) => {
    res.json({ ok: true });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function post(base: string, body: unknown, cookie = ''): Promise<Response> {
  return fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

function cookieOf(resp: Response): string {
  return resp.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function get(base: string, path: string, cookie: string): Promise<Response> {
  return fetch(`${base}${path}`, { headers: { cookie } });
}

const PHIL: SessionUser = { id: 'u-phil', email: 'phil@example.com', displayName: 'Phil' };

/** A fake account list: one user with password "secret". */
function fakeAccounts(options: { operator?: boolean; failing?: boolean } = {}) {
  const state = { active: true, stamp: 'stamp-1' };
  const phil = () => (state.active ? { user: PHIL, stamp: state.stamp } : null);
  const accounts: Accounts = {
    async prepare() {},
    async signIn(email, password) {
      if (options.failing) throw new Error('database down');
      return email.toLowerCase() === PHIL.email && password === 'secret' ? phil() : null;
    },
    hasOperator: options.operator ?? false,
    async operator() {
      if (options.failing) throw new Error('database down');
      return phil();
    },
    async activeUser(id, stamp) {
      if (options.failing) throw new Error('database down');
      return id === PHIL.id && state.active && stamp === state.stamp ? PHIL : null;
    },
  };
  return { accounts, state };
}

test('email and password sign in a user, and /api/me says who', async (t) => {
  const { accounts } = fakeAccounts();
  const base = await serve(t, accounts);
  const resp = await post(base, { email: 'Phil@Example.com', password: 'secret' });
  assert.equal(resp.status, 200);
  assert.deepEqual(await resp.json(), { ok: true, user: PHIL });
  const cookie = cookieOf(resp);
  assert.equal((await get(base, '/api/protected', cookie)).status, 200);
  assert.deepEqual(await (await get(base, '/api/me', cookie)).json(), { ok: true, user: PHIL });
});

test('a wrong password and an unknown email get the same 401', async (t) => {
  const { accounts } = fakeAccounts();
  const base = await serve(t, accounts);
  const wrong = await post(base, { email: PHIL.email, password: 'nope' });
  const unknown = await post(base, { email: 'nobody@example.com', password: 'secret' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal(cookieOf(wrong), '');
});

test('email sign-in needs both fields, and answers 503 when accounts are off or down', async (t) => {
  const off = await serve(t);
  assert.equal((await post(off, { email: PHIL.email })).status, 400);
  assert.equal((await post(off, { email: '', password: 'secret' })).status, 400);
  const offResp = await post(off, { email: PHIL.email, password: 'secret' });
  assert.equal(offResp.status, 503);
  assert.match(((await offResp.json()) as { error: string }).error, /not set up/);

  const down = await serve(t, fakeAccounts({ failing: true }).accounts);
  const downResp = await post(down, { email: PHIL.email, password: 'secret' });
  assert.equal(downResp.status, 503);
});

test('a disabled account is signed out on its next request', async (t) => {
  const { accounts, state } = fakeAccounts();
  const base = await serve(t, accounts);
  const cookie = cookieOf(await post(base, { email: PHIL.email, password: 'secret' }));
  assert.equal((await get(base, '/api/protected', cookie)).status, 200);
  state.active = false;
  const refused = await get(base, '/api/protected', cookie);
  assert.equal(refused.status, 401);
  assert.match(refused.headers.getSetCookie().join(';'), /mvp_session=;/, 'the session is cleared');
});

test('a new password signs out sessions made with the old one', async (t) => {
  const { accounts, state } = fakeAccounts();
  const base = await serve(t, accounts);
  const cookie = cookieOf(await post(base, { email: PHIL.email, password: 'secret' }));
  assert.equal((await get(base, '/api/protected', cookie)).status, 200);
  state.stamp = 'stamp-2';
  assert.equal((await get(base, '/api/protected', cookie)).status, 401);
  const fresh = cookieOf(await post(base, { email: PHIL.email, password: 'secret' }));
  assert.equal((await get(base, '/api/protected', fresh)).status, 200);
});

test('when the database is down, a signed session is trusted for that request', async (t) => {
  const healthy = fakeAccounts();
  const signIn = await serve(t, healthy.accounts);
  const cookie = cookieOf(await post(signIn, { email: PHIL.email, password: 'secret' }));
  const down = await serve(t, fakeAccounts({ failing: true }).accounts);
  assert.equal((await get(down, '/api/protected', cookie)).status, 200);
  assert.equal((await get(down, '/api/me', cookie)).status, 503);
});

test('with accounts off, the MVP password signs in as before, with no user', async (t) => {
  const base = await serve(t);
  assert.equal((await post(base, { password: 'wrong' })).status, 401);
  const resp = await post(base, { password: 'pw' });
  assert.equal(resp.status, 200);
  assert.deepEqual(await resp.json(), { ok: true }, 'the answer is unchanged');
  const cookie = cookieOf(resp);
  assert.equal((await get(base, '/api/protected', cookie)).status, 200);
  assert.deepEqual(await (await get(base, '/api/me', cookie)).json(), { ok: true, user: null });
});

test('the MVP password signs in as the operator account when OPERATOR_EMAIL names one', async (t) => {
  const { accounts, state } = fakeAccounts({ operator: true });
  const base = await serve(t, accounts);
  const resp = await post(base, { password: 'pw' });
  assert.equal(resp.status, 200);
  assert.deepEqual(await resp.json(), { ok: true, user: PHIL });
  assert.deepEqual(await (await get(base, '/api/me', cookieOf(resp))).json(), {
    ok: true,
    user: PHIL,
  });

  state.active = false;
  const refused = await post(base, { password: 'pw' });
  assert.equal(refused.status, 401);
  assert.match(((await refused.json()) as { error: string }).error, /Operator account is missing or disabled/);
});

test('with OPERATOR_EMAIL set but the database down, the MVP password signs in with no user', async (t) => {
  const base = await serve(t, fakeAccounts({ operator: true, failing: true }).accounts);
  const resp = await post(base, { password: 'pw' });
  assert.equal(resp.status, 200);
  assert.deepEqual(await resp.json(), { ok: true });
});

test('a password sign-in after an account sign-in drops the old user', async (t) => {
  const { accounts } = fakeAccounts();
  const base = await serve(t, accounts);
  const first = cookieOf(await post(base, { email: PHIL.email, password: 'secret' }));
  const second = await post(base, { password: 'pw' }, first);
  assert.deepEqual(await (await get(base, '/api/me', cookieOf(second))).json(), {
    ok: true,
    user: null,
  });
});

test('openAccounts leaves accounts off when Postgres is not configured', () => {
  const logs: string[] = [];
  const accounts = openAccounts({}, { log: (m) => logs.push(m), warn: (m) => logs.push(m) });
  assert.equal(accounts, undefined);
  assert.match(logs.join('\n'), /User accounts off \(POSTGRES_PASSWORD is required\)/);
});

/** A pool whose every connection fails, and the config it was opened with. */
function unreachablePool() {
  const seen: { config?: PoolConfig; connects: number } = { connects: 0 };
  const createPool = (config: PoolConfig) => {
    seen.config = config;
    return {
      on: () => undefined,
      connect: async () => {
        seen.connects += 1;
        throw new Error('connect ECONNREFUSED');
      },
    } as unknown as Pool;
  };
  return { seen, createPool };
}

test('openAccounts keeps the server up when the database cannot be reached', async () => {
  const { seen, createPool } = unreachablePool();
  const logs: string[] = [];
  const warnings: string[] = [];
  const accounts = openAccounts(
    { POSTGRES_PASSWORD: 'x', POSTGRES_HOST: 'db.invalid' },
    { createPool, log: (m) => logs.push(m), warn: (m) => warnings.push(m) },
  );
  assert.ok(accounts, 'accounts are on: Postgres is configured');
  assert.ok(seen.config?.connectionTimeoutMillis, 'a connection attempt cannot wait forever');
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(warnings.join('\n'), /database is not ready \(connect ECONNREFUSED\); sign-in will retry/);
  await assert.rejects(accounts.signIn(PHIL.email, 'secret'), /ECONNREFUSED/);
});

test('after a failed prepare, calls fail fast until the retry wait has passed', async () => {
  const { seen, createPool } = unreachablePool();
  let clock = 1_000_000;
  const accounts = createAccounts(createPool({}), {}, () => clock);
  await assert.rejects(accounts.prepare(), /ECONNREFUSED/);
  await assert.rejects(accounts.prepare(), /ECONNREFUSED/);
  await assert.rejects(accounts.activeUser('u', 's'), /ECONNREFUSED/);
  assert.equal(seen.connects, 1, 'no new attempt inside the wait');
  clock += PREPARE_RETRY_MS;
  await assert.rejects(accounts.prepare(), /ECONNREFUSED/);
  assert.equal(seen.connects, 2);
});

// Against the real store

function store(t: TestContext): Pool {
  const pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(() => pool.end());
  return pool;
}

test('real accounts: sign in with a bcrypt hash, refuse a disabled user, resolve the operator', async (t) => {
  const pool = store(t);
  await ensureDashboardSchema(pool);
  const email = `reader-${randomUUID()}@example.com`;
  const created = await createUser(pool, {
    email,
    displayName: 'Reader',
    passwordHash: await hashPassword('correct horse'),
  });
  const accounts = createAccounts(pool, { OPERATOR_EMAIL: email.toUpperCase() });
  const expected = { id: created.id, email, displayName: 'Reader' };

  const signed = await accounts.signIn(email.toUpperCase(), 'correct horse');
  assert.deepEqual(signed?.user, expected);
  assert.ok(signed && signed.stamp.length > 0 && !signed.stamp.includes('$2'));
  assert.equal(await accounts.signIn(email, 'wrong'), null);
  assert.equal(await accounts.signIn(`nobody-${randomUUID()}@example.com`, 'correct horse'), null);
  assert.equal(accounts.hasOperator, true);
  assert.deepEqual(await accounts.operator(), signed);
  assert.deepEqual(await accounts.activeUser(created.id, signed.stamp), expected);
  assert.equal(await accounts.activeUser(created.id, 'other-stamp'), null);

  await setUserPasswordHash(pool, created.id, await hashPassword('battery staple'));
  assert.equal(await accounts.activeUser(created.id, signed.stamp), null, 'old sessions end');
  const again = await accounts.signIn(email, 'battery staple');
  assert.ok(again && again.stamp !== signed.stamp);

  await disableUser(pool, created.id);
  assert.equal(await accounts.signIn(email, 'battery staple'), null);
  assert.equal(await accounts.operator(), null);
  assert.equal(await accounts.activeUser(created.id, again.stamp), null);

  const noOperator = createAccounts(pool, {});
  assert.equal(noOperator.hasOperator, false);
  assert.equal(await noOperator.operator(), null);
});
