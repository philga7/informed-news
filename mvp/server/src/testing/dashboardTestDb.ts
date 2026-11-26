import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hashAgentToken } from '../ingest/agentToken.js';
import type { Writer } from '../store/postgres/writer.js';

/** Test-only helpers for the dashboard store. Not used by app code. */

/** The test files read the URL from the environment and pass it in. */
function required(connectionString: string | undefined): string {
  const trimmed = connectionString?.trim();
  if (!trimmed) throw new Error('INFORMED_NEWS_TEST_DATABASE_URL is required');
  return trimmed;
}

export function testPool(connectionString: string | undefined): Pool {
  return new Pool({ connectionString: required(connectionString) });
}

/**
 * A pool whose tables live in a Postgres schema of their own, so a test can
 * build the NEWS-224 tables, break things, or inspect the catalog without
 * touching the tables the other test files share. `drop` removes the schema.
 */
export async function scratchSchemaPool(connectionString: string | undefined): Promise<{
  pool: Pool;
  schema: string;
  drop: () => Promise<void>;
}> {
  const schema = `scratch_${randomUUID().replaceAll('-', '')}`;
  const admin = testPool(connectionString);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({
    connectionString: required(connectionString),
    options: `-c search_path=${schema}`,
  });
  return {
    pool,
    schema,
    drop: async () => {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

/** The agent the store tests write as (NEWS-263). Its token is fixed and test-only. */
export const TEST_AGENT_ID = 'test-agent';
export const TEST_AGENT_TOKEN = `inag_${'T'.repeat(43)}`;
export const TEST_WRITER: Writer = { agentId: TEST_AGENT_ID };

/** Adds the test agent once; every write in the store tests names it. */
export async function ensureTestAgent(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO agents (id, name, token_hash, enabled, created_at) VALUES ($1, 'Test agent', $2, true, now())
     ON CONFLICT DO NOTHING`,
    [TEST_AGENT_ID, hashAgentToken(TEST_AGENT_TOKEN)],
  );
}
