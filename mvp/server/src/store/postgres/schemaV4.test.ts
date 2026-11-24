import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { scratchSchemaPool } from '../../testing/dashboardTestDb.js';
import { DASHBOARD_SCHEMA_VERSION, ensureDashboardSchema } from './dashboardStore.js';

const V4_MARKER = '-- Schema v4 (NEWS-228)';
const CHECK_VIOLATION = '23514';

/** Everything up to schema v3 (NEWS-254): the file above the v4 marker. */
function v3Sql(): string {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  const marker = sql.indexOf(V4_MARKER);
  assert.notEqual(marker, -1, 'schema.sql marks where v4 starts');
  return sql.slice(0, marker);
}

async function scratch(t: TestContext): Promise<Pool> {
  const { pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(drop);
  return pool;
}

const HUB = `INSERT INTO stories (id, role, hub_id, title, status) VALUES ('s1', 'hub', NULL, 'Hub', 'active')`;
const ENTRY = (id: string, body: string | null) =>
  `INSERT INTO story_entries (id, story_id, occurred_at, occurred_precision, headline, label, body)
   VALUES ('${id}', 's1', '2026-11-23T00:00:00Z', 'day', 'Headline', 'reported', ${body === null ? 'NULL' : `'${body}'`})`;

test('v4 applies over a v3 database with rows, keeps them, and records version 4', async (t) => {
  const pool = await scratch(t);
  await pool.query(v3Sql());
  await pool.query('INSERT INTO dashboard_schema_version (version) VALUES (3)');
  await pool.query(HUB);
  await pool.query(ENTRY('e1', 'Kept body'));
  await pool.query(
    `INSERT INTO story_entry_sources (id, entry_id, url, label) VALUES ('c1', 'e1', 'https://example.com', 'Wire')`,
  );
  await assert.rejects(pool.query(ENTRY('e0', null)), { code: '23502' });

  await ensureDashboardSchema(pool);

  assert.equal(DASHBOARD_SCHEMA_VERSION, 4);
  const version = await pool.query<{ version: number }>('SELECT version FROM dashboard_schema_version');
  assert.deepEqual(version.rows, [{ version: 4 }]);
  const kept = await pool.query<{ body: string }>(`SELECT body FROM story_entries WHERE id = 'e1'`);
  assert.deepEqual(kept.rows, [{ body: 'Kept body' }]);
  await ensureDashboardSchema(pool);
});

test('v4: an entry may have no body, and a citation needs a URL unless it names a source row', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  await pool.query(HUB);
  await pool.query(ENTRY('e1', null));
  await pool.query(
    `INSERT INTO story_sources (id, story_id, outlet) VALUES ('src1', 's1', 'Axios')`,
  );
  await pool.query(
    `INSERT INTO story_entry_sources (id, entry_id, url, label, source_id) VALUES ('c1', 'e1', NULL, 'Axios', 'src1')`,
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO story_entry_sources (id, entry_id, url, label) VALUES ('c2', 'e1', NULL, 'Wire')`,
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, CHECK_VIOLATION);
      assert.equal((error as { constraint?: string }).constraint, 'story_entry_sources_url_or_source');
      return true;
    },
  );
});
