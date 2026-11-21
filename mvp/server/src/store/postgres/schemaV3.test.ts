import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { DASHBOARD_SCHEMA_VERSION, ensureDashboardSchema } from './dashboardStore.js';
import { scratchSchemaPool } from '../../testing/dashboardTestDb.js';
import { FOLLOW_STATES, TRACKER_KINDS } from './vocabulary.js';

const V3_MARKER = '-- Schema v3 (NEWS-254)';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

/**
 * The hash of schema.sql at each version since the version row (NEWS-254).
 * When schema.sql changes, bump DASHBOARD_SCHEMA_VERSION and add a line here.
 * Never edit an earlier line: each version has its own hash.
 */
const SCHEMA_HASHES: Record<number, string> = {
  3: 'a778c356de493885838be3361ba9f8c6dd9a2d096f87f707deb453166413dbe6',
};

function schemaSql(): string {
  return readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
}

/** Everything schema v2 (NEWS-240) shipped: the file above the v3 marker. */
function v2Sql(): string {
  const sql = schemaSql();
  const marker = sql.indexOf(V3_MARKER);
  assert.notEqual(marker, -1, 'schema.sql marks where v3 starts');
  return sql.slice(0, marker);
}

async function scratch(t: TestContext): Promise<Pool> {
  const { pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(drop);
  return pool;
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const result = await pool.query<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [table],
  );
  return result.rows[0]?.present === true;
}

async function recordedVersion(pool: Pool): Promise<number[]> {
  const result = await pool.query<{ version: number }>('SELECT version FROM dashboard_schema_version');
  return result.rows.map((row) => row.version);
}

async function rejectsWith(code: string, run: () => Promise<unknown>): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

const USER = `INSERT INTO users (id, email, password_hash, display_name, created_at)
              VALUES ('u1', 'a@example.com', 'hash', 'A', '2026-11-20T00:00:00Z')`;
const HUB = `INSERT INTO stories (id, role, hub_id, title, status) VALUES ('s1', 'hub', NULL, 'Hub', 'active')`;

test('schema.sql is pinned to the schema version: an edit needs a version bump', () => {
  // Line endings are normalised so a CRLF checkout hashes the same.
  const sha256 = createHash('sha256').update(schemaSql().replaceAll('\r\n', '\n')).digest('hex');
  const versions = Object.keys(SCHEMA_HASHES).map(Number);
  assert.equal(
    Math.max(...versions),
    DASHBOARD_SCHEMA_VERSION,
    'SCHEMA_HASHES has a line for DASHBOARD_SCHEMA_VERSION and none past it',
  );
  assert.equal(
    new Set(Object.values(SCHEMA_HASHES)).size,
    versions.length,
    'each version has a hash of its own',
  );
  assert.equal(
    sha256,
    SCHEMA_HASHES[DASHBOARD_SCHEMA_VERSION],
    'schema.sql changed: bump DASHBOARD_SCHEMA_VERSION and add its hash to SCHEMA_HASHES',
  );
});

test('a fresh database records the current schema version in one row', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  assert.deepEqual(await recordedVersion(pool), [DASHBOARD_SCHEMA_VERSION]);
  await ensureDashboardSchema(pool);
  assert.deepEqual(await recordedVersion(pool), [DASHBOARD_SCHEMA_VERSION]);
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query('INSERT INTO dashboard_schema_version (id, version) VALUES (false, 1)'),
  );
});

test('v3 applies over a schema v2 database with rows and keeps them', async (t) => {
  const pool = await scratch(t);
  await pool.query(v2Sql());
  await pool.query(HUB);
  assert.equal(await tableExists(pool, 'users'), false);

  await ensureDashboardSchema(pool);

  assert.equal(await tableExists(pool, 'users'), true);
  assert.equal(await tableExists(pool, 'read_markers'), true);
  assert.equal(await tableExists(pool, 'user_follows'), true);
  const kept = await pool.query<{ id: string; owner_user_id: string | null }>(
    'SELECT id, owner_user_id FROM stories',
  );
  assert.deepEqual(kept.rows, [{ id: 's1', owner_user_id: null }]);
  assert.deepEqual(await recordedVersion(pool), [DASHBOARD_SCHEMA_VERSION]);
});

test('a database whose version row is current runs nothing', async (t) => {
  const pool = await scratch(t);
  await pool.query(v2Sql());
  await pool.query(
    'CREATE TABLE dashboard_schema_version (id boolean PRIMARY KEY DEFAULT true CHECK (id), version integer NOT NULL)',
  );
  await pool.query('INSERT INTO dashboard_schema_version (version) VALUES ($1)', [
    DASHBOARD_SCHEMA_VERSION,
  ]);
  await ensureDashboardSchema(pool);
  assert.equal(await tableExists(pool, 'users'), false, 'nothing was applied');
});

test('an older version row is brought up to date', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  await pool.query('UPDATE dashboard_schema_version SET version = 2');
  await ensureDashboardSchema(pool);
  assert.deepEqual(await recordedVersion(pool), [DASHBOARD_SCHEMA_VERSION]);
});

/** The values a column's CHECK allows, read from the catalog. */
async function checkedValues(pool: Pool, table: string, column: string): Promise<string[]> {
  const result = await pool.query<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'c' AND c.conrelid = $1::regclass AND a.attname = $2
       AND array_length(c.conkey, 1) = 1`,
    [table, column],
  );
  assert.equal(result.rowCount, 1, `${table}.${column} has one CHECK of its own`);
  return [...(result.rows[0]?.def ?? '').matchAll(/'([^']+)'::text/g)].map((match) => match[1] ?? '');
}

test('the tracker kinds and follow states in the schema are the lists in the code', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  assert.deepEqual(await checkedValues(pool, 'read_markers', 'tracker_kind'), [...TRACKER_KINDS]);
  assert.deepEqual(await checkedValues(pool, 'user_follows', 'state'), [...FOLLOW_STATES]);
});

test('the database refuses a private branch, a mis-keyed marker, and a second CFP marker', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  await pool.query(USER);
  await pool.query(HUB);

  await pool.query(
    `INSERT INTO stories (id, role, hub_id, title, status, owner_user_id) VALUES ('p1', 'hub', NULL, 'Mine', 'active', 'u1')`,
  );
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(
      `INSERT INTO stories (id, role, hub_id, title, status, owner_user_id) VALUES ('b1', 'branch', 's1', 'B', 'active', 'u1')`,
    ),
  );

  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(`INSERT INTO read_markers (user_id, tracker_kind, tracker_id) VALUES ('u1', 'story', NULL)`),
  );
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(`INSERT INTO read_markers (user_id, tracker_kind, tracker_id) VALUES ('u1', 'cfp', 's1')`),
  );
  await pool.query(`INSERT INTO read_markers (user_id, tracker_kind) VALUES ('u1', 'cfp')`);
  await rejectsWith(UNIQUE_VIOLATION, () =>
    pool.query(`INSERT INTO read_markers (user_id, tracker_kind) VALUES ('u1', 'cfp')`),
  );

  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(
      `INSERT INTO user_follows (user_id, story_id, topic_id, state, updated_at) VALUES ('u1', 's1', 'topic', 'follow', now())`,
    ),
  );
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(
      `INSERT INTO user_follows (user_id, story_id, topic_id, state, updated_at) VALUES ('u1', NULL, NULL, 'follow', now())`,
    ),
  );
  await rejectsWith(UNIQUE_VIOLATION, () =>
    pool.query(
      `INSERT INTO users (id, email, password_hash, display_name, created_at)
       VALUES ('u2', 'A@Example.com', 'hash', 'A2', now())`,
    ),
  );
});
