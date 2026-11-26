import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DashboardStoreError, inTransaction, pgErrorCode, requiredText } from './storeSupport.js';

/**
 * Agents (NEWS-263): each program that posts through the ingest contract has
 * its own token, stored as a hash, and can be turned off on its own. Agents
 * are made by the operator command (`npm run agents`), never through a route.
 */

export type AgentRecord = {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
};

type AgentRow = { id: string; name: string; enabled: boolean; created_at: Date };

const UNIQUE_VIOLATION = '23505';

function fromRow(row: AgentRow): AgentRecord {
  return { id: row.id, name: row.name, enabled: row.enabled, createdAt: row.created_at.toISOString() };
}

export async function createAgent(
  db: Pool | PoolClient,
  input: { name: string; tokenHash: string },
): Promise<AgentRecord> {
  const name = requiredText(input.name, 'name');
  try {
    const result = await db.query<AgentRow>(
      `INSERT INTO agents (id, name, token_hash, enabled, created_at) VALUES ($1, $2, $3, true, now())
       RETURNING id, name, enabled, created_at`,
      [randomUUID(), name, input.tokenHash],
    );
    return fromRow(result.rows[0] as AgentRow);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      throw new DashboardStoreError(`an agent named ${name} already exists`, { reason: 'conflict' });
    }
    throw error;
  }
}

export async function listAgents(pool: Pool): Promise<AgentRecord[]> {
  const result = await pool.query<AgentRow>(
    'SELECT id, name, enabled, created_at FROM agents ORDER BY created_at, name',
  );
  return result.rows.map(fromRow);
}

export async function findAgentByName(pool: Pool, name: string): Promise<AgentRecord | null> {
  const result = await pool.query<AgentRow>(
    'SELECT id, name, enabled, created_at FROM agents WHERE lower(name) = lower($1)',
    [name.trim()],
  );
  const row = result.rows[0];
  return row ? fromRow(row) : null;
}

/** The agent a token hash belongs to, with its stored hash, or null. Disabled agents are returned too. */
export async function findAgentByTokenHash(
  pool: Pool,
  tokenHash: string,
): Promise<(AgentRecord & { tokenHash: string }) | null> {
  const result = await pool.query<AgentRow & { token_hash: string }>(
    'SELECT id, name, enabled, created_at, token_hash FROM agents WHERE token_hash = $1',
    [tokenHash],
  );
  const row = result.rows[0];
  return row ? { ...fromRow(row), tokenHash: row.token_hash } : null;
}

/** Turns an agent off for good: its token stops working at once. Its rows keep naming it. */
export async function disableAgent(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query('UPDATE agents SET enabled = false WHERE id = $1 AND enabled', [id]);
  return result.rowCount === 1;
}

/** Replaces an agent's token hash: the old token stops working at once. Does not re-enable. */
export async function setAgentTokenHash(pool: Pool, id: string, tokenHash: string): Promise<boolean> {
  const result = await pool.query('UPDATE agents SET token_hash = $2 WHERE id = $1', [id, tokenHash]);
  return result.rowCount === 1;
}

/** Tables whose rows record a writer, in the order a claim reports them. */
export const WRITTEN_TABLES = [
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
] as const;

export type ClaimCounts = Record<(typeof WRITTEN_TABLES)[number], number>;

/**
 * Gives every row with no writer, and every story with no creator, to one
 * agent: the rows written under INGEST_TOKEN before agents existed. Run once,
 * inside the caller's transaction, when the operator adds that agent.
 */
export async function claimUnattributed(client: PoolClient, agentId: string): Promise<ClaimCounts> {
  const counts = {} as ClaimCounts;
  for (const table of WRITTEN_TABLES) {
    const creator = table === 'stories' ? ', created_by_agent_id = $1' : '';
    const result = await client.query(
      `UPDATE ${table} SET written_by_agent_id = $1${creator}
       WHERE written_by_agent_id IS NULL AND written_by_user_id IS NULL`,
      [agentId],
    );
    counts[table] = result.rowCount ?? 0;
  }
  return counts;
}

/** Gives every unattributed row to an existing agent, in one transaction. */
export async function claimForAgent(pool: Pool, agentId: string): Promise<ClaimCounts> {
  return inTransaction(pool, (client) => claimUnattributed(client, agentId));
}

/** Adds an agent, and when asked, gives it every unattributed row, in one transaction. */
export async function addAgent(
  pool: Pool,
  input: { name: string; tokenHash: string; claimUnattributed?: boolean },
): Promise<{ agent: AgentRecord; claimed: ClaimCounts | null }> {
  return inTransaction(pool, async (client) => {
    const agent = await createAgent(client, input);
    const claimed = input.claimUnattributed ? await claimUnattributed(client, agent.id) : null;
    return { agent, claimed };
  });
}
