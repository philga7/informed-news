import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { hashAgentToken } from '../ingest/agentToken.js';
import { findAgentByName, findAgentByTokenHash } from '../store/postgres/agentStore.js';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { scratchSchemaPool } from '../testing/dashboardTestDb.js';
import { runAgentsCli, type AgentsCliIo } from './agentsCli.js';

async function scratch(t: TestContext): Promise<Pool> {
  const { pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(drop);
  await ensureDashboardSchema(pool);
  return pool;
}

function io(tokens: string[] = []): AgentsCliIo & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  let n = 0;
  return {
    lines,
    errors,
    out: (line) => lines.push(line),
    err: (line) => errors.push(line),
    generateToken: () => tokens[n++] ?? `inag_${'x'.repeat(43)}`,
  };
}

const TOKEN_1 = `inag_${'1'.repeat(43)}`;
const TOKEN_2 = `inag_${'2'.repeat(43)}`;

test('add prints the token once and stores only its hash', async (t) => {
  const pool = await scratch(t);
  const out = io([TOKEN_1]);
  assert.equal(await runAgentsCli(['add', '--name', 'Grok Bot'], pool, out), 0);
  assert.match(out.lines[0] ?? '', /^Added agent Grok Bot, id [0-9a-f-]{36}$/);
  assert.deepEqual(out.lines.slice(1), [`Token (shown once): ${TOKEN_1}`]);
  const stored = await pool.query<{ token_hash: string }>('SELECT token_hash FROM agents');
  assert.deepEqual(stored.rows, [{ token_hash: hashAgentToken(TOKEN_1) }]);

  const again = io([TOKEN_2]);
  assert.equal(await runAgentsCli(['add', '--name', 'grok bot'], pool, again), 1);
  assert.deepEqual(again.errors, ['an agent named grok bot already exists']);
});

test('add --claim-unattributed gives the new agent the rows written before agents, and prints the counts', async (t) => {
  const pool = await scratch(t);
  await pool.query(`INSERT INTO stories (id, role, title, status) VALUES ('s1', 'hub', 'Hub', 'active')`);
  await pool.query(
    `INSERT INTO breaking_items (id, occurred_at, headline, label) VALUES ('b1', now(), 'Ping', 'reported')`,
  );
  const out = io([TOKEN_1]);
  assert.equal(await runAgentsCli(['add', '--name', 'Grok Bot', '--claim-unattributed'], pool, out), 0);
  assert.equal(out.lines[2], 'Claimed 2 unattributed rows for Grok Bot:');
  assert.ok(out.lines.includes('  stories\t1'));
  assert.ok(out.lines.includes('  breaking_items\t1'));
  const agent = await findAgentByName(pool, 'Grok Bot');
  const story = await pool.query(`SELECT created_by_agent_id, written_by_agent_id FROM stories`);
  assert.deepEqual(story.rows, [{ created_by_agent_id: agent?.id, written_by_agent_id: agent?.id }]);
});

test('list, disable and rotate, by name in any case; rotate does not re-enable', async (t) => {
  const pool = await scratch(t);
  const empty = io();
  assert.equal(await runAgentsCli(['list'], pool, empty), 0);
  assert.deepEqual(empty.lines, ['No agents.']);

  await runAgentsCli(['add', '--name', 'Grok Bot'], pool, io([TOKEN_1]));
  const listed = io();
  await runAgentsCli(['list'], pool, listed);
  assert.match(listed.lines[0] ?? '', /^[0-9a-f-]{36}\tGrok Bot\tenabled\tcreated \d{4}-/);
  assert.ok(listed.lines.every((line) => !line.includes(hashAgentToken(TOKEN_1))), 'list never prints the hash');

  const rotated = io([TOKEN_2]);
  assert.equal(await runAgentsCli(['rotate', '--name', 'GROK BOT'], pool, rotated), 0);
  assert.deepEqual(rotated.lines, [
    'New token for Grok Bot; the old one no longer works',
    `Token (shown once): ${TOKEN_2}`,
  ]);
  assert.equal(await findAgentByTokenHash(pool, hashAgentToken(TOKEN_1)), null);
  assert.equal((await findAgentByTokenHash(pool, hashAgentToken(TOKEN_2)))?.enabled, true);

  const disabled = io();
  assert.equal(await runAgentsCli(['disable', '--name', 'grok bot'], pool, disabled), 0);
  assert.deepEqual(disabled.lines, ['Disabled agent Grok Bot: its token no longer works']);
  const afterDisable = io();
  await runAgentsCli(['list'], pool, afterDisable);
  assert.match(afterDisable.lines[0] ?? '', /\tdisabled\t/);

  const third = `inag_${'3'.repeat(43)}`;
  const again = io([third]);
  assert.equal(await runAgentsCli(['rotate', '--name', 'Grok Bot'], pool, again), 0);
  assert.ok(again.lines.includes('Grok Bot is disabled: the new token will not work either'));
  assert.equal((await findAgentByTokenHash(pool, hashAgentToken(third)))?.enabled, false);
});

test('unknown names, missing flags and unknown commands', async (t) => {
  const pool = await scratch(t);
  const missing = io();
  assert.equal(await runAgentsCli(['disable', '--name', 'nobody'], pool, missing), 1);
  assert.deepEqual(missing.errors, ['No agent named nobody']);
  const rotateMissing = io();
  assert.equal(await runAgentsCli(['rotate', '--name', 'nobody'], pool, rotateMissing), 1);

  const claimMissing = io();
  assert.equal(await runAgentsCli(['claim', '--name', 'nobody'], pool, claimMissing), 1);

  for (const argv of [['add'], ['claim'], ['frobnicate'], [], ['add', '--bogus'], ['list', '--claim-unattributed']]) {
    const out = io();
    assert.equal(await runAgentsCli(argv, pool, out), 2, argv.join(' '));
    assert.ok(out.errors.at(-1)?.startsWith('Usage: npm run agents'), argv.join(' '));
  }
});

test('claim gives an existing agent the rows written before agents', async (t) => {
  const pool = await scratch(t);
  await runAgentsCli(['add', '--name', 'Grok Bot'], pool, io([TOKEN_1]));
  await pool.query(`INSERT INTO stories (id, role, title, status) VALUES ('s1', 'hub', 'Hub', 'active')`);
  const out = io();
  assert.equal(await runAgentsCli(['claim', '--name', 'grok bot'], pool, out), 0);
  assert.equal(out.lines[0], 'Claimed 1 unattributed rows for Grok Bot:');
  const agent = await findAgentByName(pool, 'Grok Bot');
  const story = await pool.query(`SELECT created_by_agent_id FROM stories`);
  assert.deepEqual(story.rows, [{ created_by_agent_id: agent?.id }]);
});
