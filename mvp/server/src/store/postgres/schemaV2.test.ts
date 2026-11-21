import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { ensureDashboardSchema } from './dashboardStore.js';
import { scratchSchemaPool } from '../../testing/dashboardTestDb.js';
import { CFP_STATUSES, ENTRY_LABELS, ENTRY_PRECISIONS, STORY_STATUSES } from './vocabulary.js';

const V2_MARKER = '-- Schema v2 (NEWS-240)';
const CHECK_VIOLATION = '23514';

/** The part of schema.sql that NEWS-224 shipped: everything above the v2 marker. */
function news224Sql(): string {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  const marker = sql.indexOf(V2_MARKER);
  assert.notEqual(marker, -1, 'schema.sql marks where v2 starts');
  return sql.slice(0, marker);
}

async function scratch(t: TestContext): Promise<{ pool: Pool; schema: string }> {
  const { pool, schema, drop } = await scratchSchemaPool(
    process.env.INFORMED_NEWS_TEST_DATABASE_URL,
  );
  t.after(drop);
  return { pool, schema };
}

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

/** Every column and every constraint in the schema, in a stable order. */
async function shape(
  pool: Pool,
  schema: string,
): Promise<{ columns: string[]; constraints: string[]; indexes: string[] }> {
  const columns = await pool.query<ColumnRow>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns WHERE table_schema = $1
     ORDER BY table_name, column_name`,
    [schema],
  );
  const constraints = await pool.query<{ line: string }>(
    `SELECT c.conrelid::regclass::text || ' ' || c.contype::text || ' ' || pg_get_constraintdef(c.oid) AS line
     FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = $1
     ORDER BY 1`,
    [schema],
  );
  const indexes = await pool.query<{ indexdef: string }>(
    'SELECT indexdef FROM pg_indexes WHERE schemaname = $1 ORDER BY indexname',
    [schema],
  );
  return {
    columns: columns.rows.map(
      (row) =>
        `${row.table_name}.${row.column_name} ${row.data_type} null=${row.is_nullable} default=${row.column_default}`,
    ),
    constraints: constraints.rows.map((row) => row.line),
    indexes: indexes.rows.map((row) => row.indexdef.replaceAll(`${schema}.`, '')),
  };
}

async function rejectsWith(code: string, run: () => Promise<unknown>): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

const HUB = `INSERT INTO stories (id, role, hub_id, title, status) VALUES ('s1', 'hub', NULL, 'Hub', 'active')`;

function entrySql(id: string, label: string, at = '2026-11-14T15:04:00Z', precision = 'time'): string {
  return `INSERT INTO story_entries (id, story_id, occurred_at, occurred_precision, headline, label, body)
          VALUES ('${id}', 's1', '${at}', '${precision}', 'Headline', '${label}', 'Body')`;
}

test('v2 applies on top of empty NEWS-224 tables and ends in the same shape as a fresh database', async (t) => {
  const upgraded = await scratch(t);
  await upgraded.pool.query(news224Sql());
  const before = await shape(upgraded.pool, upgraded.schema);
  assert.ok(!before.columns.some((column) => column.startsWith('stories.status ')));
  await ensureDashboardSchema(upgraded.pool);

  const fresh = await scratch(t);
  await ensureDashboardSchema(fresh.pool);

  const upgradedShape = await shape(upgraded.pool, upgraded.schema);
  assert.deepEqual(upgradedShape, await shape(fresh.pool, fresh.schema));
  assert.ok(upgradedShape.columns.some((column) => column.startsWith('stories.status text null=NO')));
  assert.ok(upgradedShape.columns.some((column) => column.startsWith('cfp_roundup_items.url text null=YES')));
});

test('applying v2 a second time changes nothing', async (t) => {
  const { pool, schema } = await scratch(t);
  await ensureDashboardSchema(pool);
  const once = await shape(pool, schema);
  await pool.query(HUB);
  await ensureDashboardSchema(pool);
  await ensureDashboardSchema(pool);
  assert.deepEqual(await shape(pool, schema), once);
  const kept = await pool.query('SELECT id FROM stories');
  assert.equal(kept.rowCount, 1);
});

test('v2 fails over NEWS-224 rows and leaves the database as it was', async (t) => {
  const { pool, schema } = await scratch(t);
  await pool.query(news224Sql());
  await pool.query(`INSERT INTO stories (id, role, hub_id, title) VALUES ('old', 'hub', NULL, 'Old')`);
  const before = await shape(pool, schema);

  await assert.rejects(ensureDashboardSchema(pool), {
    name: 'DashboardStoreError',
    message: /schema v2 cannot be applied: a NEWS-224 table holds rows/,
  });

  assert.deepEqual(await shape(pool, schema), before);
  const kept = await pool.query<{ title: string }>('SELECT title FROM stories');
  assert.deepEqual(kept.rows, [{ title: 'Old' }]);
});

test('every time column is timestamptz and nothing stores a tone', async (t) => {
  const { pool, schema } = await scratch(t);
  await ensureDashboardSchema(pool);
  const columns = await pool.query<ColumnRow>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns WHERE table_schema = $1`,
    [schema],
  );
  const times = columns.rows.filter((row) => row.data_type.startsWith('time'));
  assert.deepEqual(
    times.map((row) => `${row.table_name}.${row.column_name}`).sort(),
    [
      'breaking_items.occurred_at',
      'cfp_roundup_items.roundup_at',
      'morning_items.posted_at',
      'read_markers.last_opened_at',
      'read_markers.read_up_to',
      'stories.last_checked_at',
      'stories.next_check_at',
      'stories.now_updated_at',
      'story_entries.occurred_at',
      'story_entries.occurred_until',
      'user_follows.updated_at',
      'users.created_at',
      'users.disabled_at',
    ],
  );
  for (const row of times) {
    assert.equal(row.data_type, 'timestamp with time zone', `${row.table_name}.${row.column_name}`);
  }
  assert.deepEqual(
    columns.rows.filter((row) => /tone|colou?r/.test(row.column_name)),
    [],
  );
});

test('the database takes every value on the fixed lists and refuses anything else', async (t) => {
  const { pool } = await scratch(t);
  await ensureDashboardSchema(pool);
  await pool.query(HUB);

  for (const [index, status] of STORY_STATUSES.entries()) {
    await pool.query(
      `INSERT INTO stories (id, role, hub_id, title, status) VALUES ($1, 'hub', NULL, 'Hub', $2)`,
      [`status-${index}`, status],
    );
  }
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(`INSERT INTO stories (id, role, hub_id, title, status) VALUES ('s2', 'hub', NULL, 'Hub', 'working')`),
  );

  for (const [index, label] of ENTRY_LABELS.entries()) {
    await pool.query(entrySql(`entry-${index}`, label));
    await pool.query(
      `INSERT INTO breaking_items (id, occurred_at, headline, label) VALUES ($1, '2026-11-14T15:04:00Z', 'Headline', $2)`,
      [`breaking-${index}`, label],
    );
  }
  for (const ruledOut of ['debunked', 'rumor', 'verified', 'Official ruling', 'unconfirmed']) {
    await rejectsWith(CHECK_VIOLATION, () => pool.query(entrySql('bad-entry', ruledOut)));
    await rejectsWith(CHECK_VIOLATION, () =>
      pool.query(
        `INSERT INTO breaking_items (id, occurred_at, headline, label) VALUES ('bad-breaking', '2026-11-14T15:04:00Z', 'Headline', $1)`,
        [ruledOut],
      ),
    );
  }

  for (const [index, status] of [...CFP_STATUSES, null].entries()) {
    await pool.query(
      `INSERT INTO cfp_roundup_items (id, roundup_at, title, status) VALUES ($1, '2026-11-14T21:02:00Z', 'Item', $2)`,
      [`cfp-${index}`, status],
    );
  }
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(
      `INSERT INTO cfp_roundup_items (id, roundup_at, title, status) VALUES ('bad-cfp', '2026-11-14T21:02:00Z', 'Item', 'reported')`,
    ),
  );
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

test('the lists in the schema are exactly the lists in the code', async (t) => {
  const { pool } = await scratch(t);
  await ensureDashboardSchema(pool);
  assert.deepEqual(await checkedValues(pool, 'story_entries', 'label'), [...ENTRY_LABELS]);
  assert.deepEqual(await checkedValues(pool, 'breaking_items', 'label'), [...ENTRY_LABELS]);
  assert.deepEqual(await checkedValues(pool, 'stories', 'status'), [...STORY_STATUSES]);
  assert.deepEqual(await checkedValues(pool, 'cfp_roundup_items', 'status'), [...CFP_STATUSES]);
  assert.deepEqual(await checkedValues(pool, 'story_entries', 'occurred_precision'), [
    ...ENTRY_PRECISIONS,
  ]);
});

test('the database refuses a day entry off UTC midnight and a range that ends before it starts', async (t) => {
  const { pool } = await scratch(t);
  await ensureDashboardSchema(pool);
  await pool.query(HUB);

  await pool.query(entrySql('day-ok', 'reported', '2026-11-03T00:00:00Z', 'day'));
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(entrySql('day-bad', 'reported', '2026-11-03T05:00:00Z', 'day')),
  );
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(entrySql('precision-bad', 'reported', '2026-11-03T00:00:00Z', 'week')),
  );
  await rejectsWith(CHECK_VIOLATION, () =>
    pool.query(
      `INSERT INTO story_entries (id, story_id, occurred_at, occurred_until, occurred_precision, headline, label, body)
       VALUES ('range-bad', 's1', '2026-11-04T00:00:00Z', '2026-11-03T00:00:00Z', 'day', 'Headline', 'reported', 'Body')`,
    ),
  );
});
