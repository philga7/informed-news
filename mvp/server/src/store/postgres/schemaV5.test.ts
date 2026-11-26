import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { scratchSchemaPool } from '../../testing/dashboardTestDb.js';
import { DASHBOARD_SCHEMA_VERSION, ensureDashboardSchema } from './dashboardStore.js';

const V5_MARKER = '-- Schema v5 (NEWS-263)';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** Everything up to schema v4 (NEWS-228): the file above the v5 marker. */
function v4Sql(): string {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  const marker = sql.indexOf(V5_MARKER);
  assert.notEqual(marker, -1, 'schema.sql marks where v5 starts');
  return sql.slice(0, marker);
}

async function scratch(t: TestContext): Promise<Pool> {
  const { pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(drop);
  return pool;
}

const HASH = 'a'.repeat(64);
const AGENT = (id: string, name: string, hash = HASH) =>
  `INSERT INTO agents (id, name, token_hash, created_at) VALUES ('${id}', '${name}', '${hash}', now())`;
const USER = `INSERT INTO users (id, email, password_hash, display_name, created_at)
              VALUES ('u1', 'a@example.com', 'hash', 'A', now())`;
const HUB = `INSERT INTO stories (id, role, hub_id, title, status) VALUES ('s1', 'hub', NULL, 'Hub', 'active')`;

/** Every table v5 gives written_by columns to. */
const WRITTEN_TABLES = [
  'stories',
  'story_sources',
  'story_tags',
  'story_dates',
  'story_panels',
  'story_links',
  'story_categories',
  'story_entries',
  'breaking_items',
  'cfp_roundup_items',
  'cfp_day_notes',
  'morning_items',
];

async function rejectsWith(code: string, run: Promise<unknown>, constraint?: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    if (constraint) assert.equal((error as { constraint?: string }).constraint, constraint);
    return true;
  });
}

test('v5 applies over a v4 database with rows, keeps them unattributed, and records the current version', async (t) => {
  const pool = await scratch(t);
  await pool.query(v4Sql());
  await pool.query('INSERT INTO dashboard_schema_version (version) VALUES (4)');
  await pool.query(HUB);
  await pool.query(
    `INSERT INTO breaking_items (id, occurred_at, headline, label) VALUES ('b1', now(), 'Ping', 'reported')`,
  );
  await ensureDashboardSchema(pool);

  const version = await pool.query<{ version: number }>('SELECT version FROM dashboard_schema_version');
  assert.deepEqual(version.rows, [{ version: DASHBOARD_SCHEMA_VERSION }]);
  const story = await pool.query(
    `SELECT created_by_agent_id, created_by_user_id, written_by_agent_id, written_by_user_id
     FROM stories WHERE id = 's1'`,
  );
  assert.deepEqual(story.rows, [
    { created_by_agent_id: null, created_by_user_id: null, written_by_agent_id: null, written_by_user_id: null },
  ]);
  const ping = await pool.query(`SELECT written_by_agent_id, written_by_user_id FROM breaking_items`);
  assert.deepEqual(ping.rows, [{ written_by_agent_id: null, written_by_user_id: null }]);
  // Applying it again changes nothing.
  await pool.query(v4Sql());
  await ensureDashboardSchema(pool);
});

test('v5: every written table has both writer columns, and at most one is set', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  const columns = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND column_name IN ('written_by_agent_id', 'written_by_user_id')`,
  );
  for (const table of WRITTEN_TABLES) {
    const names = columns.rows.filter((row) => row.table_name === table).map((row) => row.column_name).sort();
    assert.deepEqual(names, ['written_by_agent_id', 'written_by_user_id'], table);
  }
  assert.deepEqual(
    [...new Set(columns.rows.map((row) => row.table_name))].sort(),
    [...WRITTEN_TABLES].sort(),
    'no other table has writer columns',
  );

  await pool.query(AGENT('a1', 'Grok Bot'));
  await pool.query(USER);
  await rejectsWith(
    CHECK_VIOLATION,
    pool.query(
      `INSERT INTO cfp_day_notes (day, written_by_agent_id, written_by_user_id) VALUES ('2026-11-26', 'a1', 'u1')`,
    ),
    'cfp_day_notes_one_writer',
  );
  await rejectsWith(
    FOREIGN_KEY_VIOLATION,
    pool.query(`INSERT INTO cfp_day_notes (day, written_by_agent_id) VALUES ('2026-11-26', 'nobody')`),
  );
});

test('v5: a story has a creator exactly when it has a writer, and at most one of each', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  await pool.query(AGENT('a1', 'Grok Bot'));
  await pool.query(USER);
  const story = (id: string, creator: string, writer: string) =>
    pool.query(
      `INSERT INTO stories (id, role, title, status, ${creator}, ${writer}) VALUES ($1, 'hub', 'T', 'active', $2, $3)`,
      [id, creator.endsWith('agent_id') ? 'a1' : 'u1', writer.endsWith('agent_id') ? 'a1' : 'u1'],
    );
  await story('ok1', 'created_by_agent_id', 'written_by_user_id');
  await story('ok2', 'created_by_user_id', 'written_by_agent_id');
  await rejectsWith(
    CHECK_VIOLATION,
    pool.query(
      `INSERT INTO stories (id, role, title, status, written_by_agent_id) VALUES ('bad1', 'hub', 'T', 'active', 'a1')`,
    ),
    'stories_creator_with_writer',
  );
  await rejectsWith(
    CHECK_VIOLATION,
    pool.query(
      `INSERT INTO stories (id, role, title, status, created_by_agent_id, created_by_user_id, written_by_agent_id)
       VALUES ('bad2', 'hub', 'T', 'active', 'a1', 'u1', 'a1')`,
    ),
    'stories_one_creator',
  );
});

test('v5: agent names are unique whatever their case, token hashes are unique and hex', async (t) => {
  const pool = await scratch(t);
  await ensureDashboardSchema(pool);
  await pool.query(AGENT('a1', 'Grok Bot'));
  await rejectsWith(UNIQUE_VIOLATION, pool.query(AGENT('a2', 'grok bot', 'b'.repeat(64))));
  await rejectsWith(UNIQUE_VIOLATION, pool.query(AGENT('a3', 'Other')));
  await rejectsWith(CHECK_VIOLATION, pool.query(AGENT('a4', 'Short hash', 'abc')));
  await rejectsWith(CHECK_VIOLATION, pool.query(AGENT('a5', '   ', 'c'.repeat(64))));
  const row = await pool.query<{ enabled: boolean }>(`SELECT enabled FROM agents WHERE id = 'a1'`);
  assert.deepEqual(row.rows, [{ enabled: true }]);
});
