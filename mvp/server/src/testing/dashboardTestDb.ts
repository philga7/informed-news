import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

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
