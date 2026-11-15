import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const SCRIPT = fileURLToPath(new URL('../../../../../scripts/provision-qa-role.sh', import.meta.url));
const QA_PASSWORD = "ci-qa-o'brien";
const OTHER_QA_PASSWORD = 'ci-qa-dummy';

interface AdminConnection {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

interface ScriptResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runScript(
  env: Record<string, string | undefined>,
  args: string[] = [],
): ScriptResult {
  const result = spawnSync('sh', [...args, SCRIPT], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function readAdminConnection(): AdminConnection {
  const raw = process.env.INFORMED_NEWS_TEST_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error('INFORMED_NEWS_TEST_DATABASE_URL is required');
  }
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (database !== 'informed_news_test') {
    throw new Error('INFORMED_NEWS_TEST_DATABASE_URL must name database informed_news_test');
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('INFORMED_NEWS_TEST_DATABASE_URL must point at 127.0.0.1 or localhost');
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

function connect(admin: AdminConnection, overrides: Partial<AdminConnection>): Client {
  const { host, port, user, password, database } = { ...admin, ...overrides };
  return new Client({ host, port: Number(port), user, password, database });
}

async function withClient<T>(client: Client, run: (client: Client) => Promise<T>): Promise<T> {
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function scriptEnv(admin: AdminConnection, qaPassword: string): Record<string, string> {
  return {
    INFORMED_NEWS_QA_PASSWORD: qaPassword,
    PGHOST: admin.host,
    PGPORT: admin.port,
    PGUSER: admin.user,
    PGPASSWORD: admin.password,
    PGDATABASE: 'postgres',
  };
}

function leaksPassword(result: ScriptResult, password: string): boolean {
  return `${result.stdout}${result.stderr}`.includes(password);
}

function assertProvisioned(result: ScriptResult, password: string): void {
  assert.equal(result.status, 0, 'provision script exited non-zero');
  assert.equal(leaksPassword(result, password), false, 'script output contained the QA password');
  assert.equal(result.stdout, '');
}

const DATABASES = ['informed_news', 'informed_news_qa', 'postgres'] as const;
const ROLES = ['informed_news', 'informed_news_qa'] as const;

async function readSnapshot(admin: AdminConnection): Promise<unknown> {
  return withClient(connect(admin, {}), async (client) => {
    const roles = await client.query(
      `SELECT rolname, rolsuper, rolcanlogin, rolcreatedb, rolcreaterole,
              rolreplication, rolbypassrls
         FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`,
      [[...ROLES]],
    );
    const privileges: Record<string, boolean> = {};
    for (const role of ROLES) {
      for (const database of DATABASES) {
        const { rows } = await client.query<{ allowed: boolean }>(
          `SELECT has_database_privilege($1, $2, 'CONNECT') AS allowed`,
          [role, database],
        );
        privileges[`${role}->${database}`] = rows[0]?.allowed ?? false;
      }
    }
    const owners = await client.query(
      `SELECT d.datname, r.rolname AS owner
         FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba
        WHERE d.datname = ANY($1) ORDER BY d.datname`,
      [[...DATABASES]],
    );
    return { roles: roles.rows, privileges, owners: owners.rows };
  });
}

interface PublicGrant {
  database: string;
  privileges: string[];
}

async function readPublicGrants(admin: AdminConnection, databases: string[]): Promise<PublicGrant[]> {
  return withClient(connect(admin, {}), async (client) => {
    const grants: PublicGrant[] = [];
    for (const database of databases) {
      const { rows } = await client.query<{ privilege_type: string }>(
        `SELECT a.privilege_type
           FROM pg_database d,
                aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
          WHERE d.datname = $1 AND a.grantee = 0
          ORDER BY a.privilege_type`,
        [database],
      );
      grants.push({ database, privileges: rows.map((row) => row.privilege_type) });
    }
    return grants;
  });
}

async function restorePublicGrants(admin: AdminConnection, grants: PublicGrant[]): Promise<void> {
  await withClient(connect(admin, {}), async (client) => {
    for (const { database, privileges } of grants) {
      const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
        database,
      ]);
      if (rowCount === 0) continue;
      const quoted = `"${database.replaceAll('"', '""')}"`;
      await client.query(`REVOKE ALL ON DATABASE ${quoted} FROM PUBLIC`);
      if (privileges.length > 0) {
        await client.query(`GRANT ${privileges.join(', ')} ON DATABASE ${quoted} TO PUBLIC`);
      }
    }
  });
}

async function dropQa(admin: AdminConnection, dropLive: boolean): Promise<void> {
  await withClient(connect(admin, {}), async (client) => {
    await client.query('DROP DATABASE IF EXISTS informed_news_qa WITH (FORCE)');
    await client.query('DROP ROLE IF EXISTS informed_news_qa');
    if (dropLive) {
      await client.query('DROP DATABASE IF EXISTS informed_news WITH (FORCE)');
    }
  });
}

test('the provision script requires the QA password', () => {
  const result = runScript({ PATH: process.env.PATH });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), 'INFORMED_NEWS_QA_PASSWORD is required');
  assert.equal(result.stdout, '');
});

test('the provision script refuses to run with xtrace', () => {
  const result = runScript({ INFORMED_NEWS_QA_PASSWORD: QA_PASSWORD }, ['-x']);
  assert.equal(result.status, 1);
  assert.ok(`${result.stdout}${result.stderr}`.includes('refusing to run with xtrace'));
  assert.equal(leaksPassword(result, QA_PASSWORD), false, 'script output contained the QA password');
});

function sqlQuoted(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "''");
}

test('a failing psql never echoes the QA password, raw or SQL-quoted', (t: TestContext) => {
  const secret = "ci-qa-o'brien\\x";
  const fakeBin = mkdtempSync(join(tmpdir(), 'fake-psql-'));
  t.after(() => rmSync(fakeBin, { recursive: true, force: true }));
  const fakePsql = join(fakeBin, 'psql');
  writeFileSync(
    fakePsql,
    [
      '#!/bin/sh',
      'if [ "$1" = "-V" ]; then echo "psql (PostgreSQL) 17.2"; exit 0; fi',
      'cat >/dev/null',
      'printf \'%s\\n\' "$FAKE_PSQL_STDERR" >&2',
      'exit 3',
      '',
    ].join('\n'),
  );
  chmodSync(fakePsql, 0o755);

  const stderr = [
    `ERROR:  permission denied to create role`,
    `CONTEXT:  SQL statement "CREATE ROLE informed_news_qa PASSWORD E'${sqlQuoted(secret)}'"`,
    `raw ${secret} again ${secret}`,
  ].join('\n');
  const result = runScript({
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
    INFORMED_NEWS_QA_PASSWORD: secret,
    FAKE_PSQL_STDERR: stderr,
  });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('permission denied to create role'));
  assert.equal(result.stderr.includes(secret), false, 'script output contained the raw QA password');
  assert.equal(
    result.stderr.includes(sqlQuoted(secret)),
    false,
    'script output contained the SQL-quoted QA password',
  );
  assert.equal(
    result.stderr.includes(sqlQuoted(secret).replaceAll('\\', '')),
    false,
    'script output contained a partial QA password',
  );
  assert.ok(result.stderr.includes('***'));
});

test('a role statement that fails in Postgres prints no password or SQL context', async (t: TestContext) => {
  const admin = readAdminConnection();
  const aclBefore = await readPublicGrants(admin, ['postgres']);
  const probe = 'informed_news_qa_probe';
  const probePassword = 'ci-probe-dummy';
  await withClient(connect(admin, {}), async (client) => {
    await client.query(`DROP ROLE IF EXISTS ${probe}`);
    await client.query(`CREATE ROLE ${probe} LOGIN NOSUPERUSER NOCREATEROLE PASSWORD '${probePassword}'`);
  });
  t.after(async () => {
    await withClient(connect(admin, {}), (client) => client.query(`DROP ROLE IF EXISTS ${probe}`));
    await restorePublicGrants(admin, aclBefore);
  });

  const result = runScript({
    ...scriptEnv(admin, QA_PASSWORD),
    PGUSER: probe,
    PGPASSWORD: probePassword,
    PGDATABASE: admin.database,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /permission denied to create role/);
  assert.equal(leaksPassword(result, QA_PASSWORD), false, 'script output contained the QA password');
  assert.equal(
    leaksPassword(result, sqlQuoted(QA_PASSWORD)),
    false,
    'script output contained the SQL-quoted QA password',
  );
  assert.equal(/CONTEXT:/.test(result.stderr), false, 'script output contained SQL context');
});

test('provisioning gives QA only its own database and reruns cleanly', async (t: TestContext) => {
  const admin = readAdminConnection();

  const liveExisted = await withClient(connect(admin, {}), async (client) => {
    const { rowCount } = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = 'informed_news'`,
    );
    return rowCount === 1;
  });
  const aclBefore = await readPublicGrants(
    admin,
    liveExisted ? ['postgres', 'informed_news'] : ['postgres'],
  );
  t.after(async () => {
    await dropQa(admin, !liveExisted);
    await restorePublicGrants(admin, aclBefore);
  });
  await dropQa(admin, false);

  const first = runScript(scriptEnv(admin, QA_PASSWORD));
  assertProvisioned(first, QA_PASSWORD);

  const snapshot = await readSnapshot(admin);
  const qaRole = (snapshot as { roles: Record<string, unknown>[] }).roles.find(
    (row) => row.rolname === 'informed_news_qa',
  );
  assert.ok(qaRole, 'informed_news_qa was not created');
  assert.equal(qaRole.rolsuper, false);
  assert.equal(qaRole.rolcanlogin, true);
  assert.equal(qaRole.rolcreatedb, false);
  assert.equal(qaRole.rolcreaterole, false);
  const { privileges } = snapshot as { privileges: Record<string, boolean> };
  assert.equal(privileges['informed_news_qa->informed_news'], false);
  assert.equal(privileges['informed_news->informed_news'], true);
  assert.equal(privileges['informed_news_qa->informed_news_qa'], true);
  assert.equal(privileges['informed_news_qa->postgres'], false);
  assert.equal(privileges['informed_news->postgres'], true);

  const refusal = await withClient(
    connect(admin, { user: 'informed_news_qa', password: QA_PASSWORD, database: 'informed_news' }),
    async () => null,
  ).then(
    () => {
      assert.fail('informed_news_qa connected to informed_news');
    },
    (error: unknown) => error,
  );
  assert.ok(refusal instanceof Error);
  assert.equal((refusal as Error & { code?: string }).code, '42501');
  assert.equal(refusal.message.includes(QA_PASSWORD), false, 'connection error contained the QA password');

  await withClient(
    connect(admin, { user: 'informed_news_qa', password: QA_PASSWORD, database: 'informed_news_qa' }),
    async (client) => {
      await client.query('CREATE TABLE qa_role_probe (id integer)');
      await client.query('INSERT INTO qa_role_probe (id) VALUES (1)');
      const { rows } = await client.query<{ id: number }>('SELECT id FROM qa_role_probe');
      assert.deepEqual(rows, [{ id: 1 }]);
      await client.query('DROP TABLE qa_role_probe');
    },
  );

  await withClient(connect(admin, { database: 'informed_news' }), async (client) => {
    const { rows } = await client.query<{ one: number }>('SELECT 1 AS one');
    assert.equal(rows[0]?.one, 1);
  });

  const second = runScript(scriptEnv(admin, QA_PASSWORD));
  assertProvisioned(second, QA_PASSWORD);
  assert.deepEqual(await readSnapshot(admin), snapshot);

  const third = runScript(scriptEnv(admin, OTHER_QA_PASSWORD));
  assertProvisioned(third, OTHER_QA_PASSWORD);
  assert.deepEqual(await readSnapshot(admin), snapshot);
  await withClient(
    connect(admin, {
      user: 'informed_news_qa',
      password: OTHER_QA_PASSWORD,
      database: 'informed_news_qa',
    }),
    async (client) => {
      const { rows } = await client.query<{ one: number }>('SELECT 1 AS one');
      assert.equal(rows[0]?.one, 1);
    },
  );

  const restored = runScript(scriptEnv(admin, QA_PASSWORD));
  assertProvisioned(restored, QA_PASSWORD);
  assert.deepEqual(await readSnapshot(admin), snapshot);
});
