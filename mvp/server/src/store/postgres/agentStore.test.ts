import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { hashAgentToken } from '../../ingest/agentToken.js';
import { scratchSchemaPool } from '../../testing/dashboardTestDb.js';
import {
  addAgent,
  claimForAgent,
  disableAgent,
  findAgentByName,
  findAgentByTokenHash,
  listAgents,
  setAgentTokenHash,
} from './agentStore.js';
import { createStory, ensureDashboardSchema } from './dashboardStore.js';
import { putCfpDayNote, putEntry, putMorningItem, putStory } from './ingestStore.js';
import { DashboardStoreError } from './storeSupport.js';
import { createUser } from './userStore.js';
import { writerParams } from './writer.js';

async function scratch(t: TestContext): Promise<Pool> {
  const { pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(drop);
  await ensureDashboardSchema(pool);
  return pool;
}

const hash = (n: number) => hashAgentToken(`token-${n}`);

type WriterCols = { written_by_agent_id: string | null; written_by_user_id: string | null };

async function writer(pool: Pool, sql: string, params: unknown[] = []): Promise<WriterCols | undefined> {
  return (await pool.query<WriterCols>(sql, params)).rows[0];
}

test('agents: added, listed, found by name in any case and by hash, disabled for good, rotated', async (t) => {
  const pool = await scratch(t);
  const { agent, claimed } = await addAgent(pool, { name: 'Grok Bot', tokenHash: hash(1) });
  assert.equal(claimed, null);
  assert.equal(agent.enabled, true);
  await assert.rejects(addAgent(pool, { name: 'grok bot', tokenHash: hash(2) }), (error: unknown) => {
    assert.ok(error instanceof DashboardStoreError);
    assert.equal(error.reason, 'conflict');
    return true;
  });
  assert.deepEqual((await findAgentByName(pool, ' GROK BOT '))?.id, agent.id);
  assert.equal(await findAgentByName(pool, 'nobody'), null);
  assert.equal((await findAgentByTokenHash(pool, hash(1)))?.id, agent.id);
  assert.deepEqual((await listAgents(pool)).map((a) => a.name), ['Grok Bot']);

  assert.equal(await setAgentTokenHash(pool, agent.id, hash(3)), true);
  assert.equal(await findAgentByTokenHash(pool, hash(1)), null);
  assert.equal(await disableAgent(pool, agent.id), true);
  assert.equal(await disableAgent(pool, agent.id), false, 'already disabled');
  assert.equal((await findAgentByTokenHash(pool, hash(3)))?.enabled, false);
});

test('claim: every row with no writer, and every story with no creator, goes to the new agent', async (t) => {
  const pool = await scratch(t);
  const user = await createUser(pool, { email: 'u@example.com', passwordHash: 'h', displayName: 'U' });
  // Rows as the pre-v5 server wrote them, under INGEST_TOKEN: no writer.
  await pool.query(`INSERT INTO stories (id, role, title, status) VALUES ('s1', 'hub', 'Hub', 'active')`);
  await pool.query(`INSERT INTO story_sources (id, story_id, outlet) VALUES ('src1', 's1', 'Axios')`);
  await pool.query(
    `INSERT INTO story_entries (id, story_id, occurred_at, occurred_precision, headline, label)
     VALUES ('e1', 's1', '2026-11-23T00:00:00Z', 'day', 'Headline', 'reported')`,
  );
  await pool.query(`INSERT INTO cfp_day_notes (day, dropped) VALUES ('2026-11-25', 'x')`);
  // A row a user wrote is not claimed.
  await pool.query(`INSERT INTO cfp_day_notes (day, dropped, written_by_user_id) VALUES ('2026-11-26', 'y', $1)`, [
    user.id,
  ]);

  const { agent, claimed } = await addAgent(pool, { name: 'Grok Bot', tokenHash: hash(1), claimUnattributed: true });
  assert.deepEqual(claimed, {
    stories: 1,
    story_sources: 1,
    story_tags: 0,
    story_dates: 0,
    story_panels: 0,
    story_links: 0,
    story_categories: 0,
    story_entries: 1,
    breaking_items: 0,
    cfp_roundup_items: 0,
    cfp_day_notes: 1,
    morning_items: 0,
  });
  const story = await pool.query(`SELECT created_by_agent_id, written_by_agent_id FROM stories WHERE id = 's1'`);
  assert.deepEqual(story.rows, [{ created_by_agent_id: agent.id, written_by_agent_id: agent.id }]);
  assert.deepEqual(await writer(pool, `SELECT written_by_agent_id, written_by_user_id FROM cfp_day_notes WHERE day = '2026-11-26'`), {
    written_by_agent_id: null,
    written_by_user_id: user.id,
  });

  // A second agent claims nothing: everything has a writer now.
  const second = await addAgent(pool, { name: 'Other', tokenHash: hash(2), claimUnattributed: true });
  assert.ok(Object.values(second.claimed ?? {}).every((n) => n === 0));
});

test('claim: a name that is taken claims nothing, because the add rolls back', async (t) => {
  const pool = await scratch(t);
  await addAgent(pool, { name: 'Grok Bot', tokenHash: hash(1) });
  await pool.query(`INSERT INTO stories (id, role, title, status) VALUES ('s1', 'hub', 'Hub', 'active')`);
  await assert.rejects(addAgent(pool, { name: 'Grok Bot', tokenHash: hash(2), claimUnattributed: true }));
  const story = await pool.query(`SELECT written_by_agent_id FROM stories WHERE id = 's1'`);
  assert.deepEqual(story.rows, [{ written_by_agent_id: null }]);
});

test('writers: nested rows record their last changer, a story its creator and last writer', async (t) => {
  const pool = await scratch(t);
  const a = (await addAgent(pool, { name: 'A', tokenHash: hash(1) })).agent.id;
  const b = (await addAgent(pool, { name: 'B', tokenHash: hash(2) })).agent.id;
  const post = {
    id: 's1',
    role: 'hub' as const,
    title: 'Hub',
    status: 'active' as const,
    sources: [{ id: 'src1', outlet: 'Axios' }],
    dates: [{ id: 'd1', startsOn: '2026-12-01', label: 'Vote' }],
    tags: [{ slug: 'vote', name: '#vote' }],
  };
  assert.equal((await putStory(pool, { agentId: a }, post)).outcome, 'created');
  // B changes only the source: the source and the story's last writer move; the date and tag keep A.
  const changed = { ...post, sources: [{ id: 'src1', outlet: 'Axios (updated)' }] };
  assert.equal((await putStory(pool, { agentId: b }, changed)).outcome, 'updated');
  const by = (sql: string) => writer(pool, sql);
  assert.equal((await by(`SELECT written_by_agent_id, written_by_user_id FROM story_sources WHERE id = 'src1'`))?.written_by_agent_id, b);
  assert.equal((await by(`SELECT written_by_agent_id, written_by_user_id FROM story_dates WHERE id = 'd1'`))?.written_by_agent_id, a);
  assert.equal((await by(`SELECT written_by_agent_id, written_by_user_id FROM story_tags WHERE slug = 'vote'`))?.written_by_agent_id, a);
  const story = await pool.query(`SELECT created_by_agent_id, written_by_agent_id FROM stories WHERE id = 's1'`);
  assert.deepEqual(story.rows, [{ created_by_agent_id: a, written_by_agent_id: b }]);

  // A re-post that changes nothing keeps every writer.
  assert.equal((await putStory(pool, { agentId: a }, changed)).outcome, 'unchanged');
  const still = await pool.query(`SELECT written_by_agent_id FROM stories WHERE id = 's1'`);
  assert.deepEqual(still.rows, [{ written_by_agent_id: b }]);

  // An entry's new tag is created on the story by the entry's writer.
  await putEntry(pool, { agentId: a }, {
    id: 'e1',
    storyId: 's1',
    precision: 'day',
    occurredAt: '2026-11-26',
    headline: 'Update',
    label: 'reported',
    sources: [],
    tags: [{ slug: 'new-tag', name: '#new' }],
  });
  assert.equal((await by(`SELECT written_by_agent_id, written_by_user_id FROM story_tags WHERE slug = 'new-tag'`))?.written_by_agent_id, a);
  assert.equal((await by(`SELECT written_by_agent_id, written_by_user_id FROM story_entries WHERE id = 'e1'`))?.written_by_agent_id, a);
});

test('writers: a user can be the writer, and a write needs one', async (t) => {
  const pool = await scratch(t);
  const user = await createUser(pool, { email: 'u@example.com', passwordHash: 'h', displayName: 'U' });
  await createStory(pool, { userId: user.id }, { id: 's1', role: 'hub', hubId: null, title: 'Mine', status: 'active', ownerUserId: user.id });
  const story = await pool.query(
    `SELECT created_by_agent_id, created_by_user_id, written_by_agent_id, written_by_user_id FROM stories WHERE id = 's1'`,
  );
  assert.deepEqual(story.rows, [
    { created_by_agent_id: null, created_by_user_id: user.id, written_by_agent_id: null, written_by_user_id: user.id },
  ]);
  assert.throws(() => writerParams({ agentId: '' }), DashboardStoreError);
  assert.throws(() => writerParams({} as never), DashboardStoreError);
  // A writer that does not exist is refused by the database.
  await assert.rejects(
    createStory(pool, { agentId: 'nobody' }, { id: 's2', role: 'hub', hubId: null, title: 'T', status: 'active' }),
    (error: unknown) => {
      assert.ok(error instanceof DashboardStoreError);
      assert.equal(error.reason, 'missing');
      return true;
    },
  );
});

test('an unclaimed story is not changed until it is claimed; claim gives it to an existing agent', async (t) => {
  const pool = await scratch(t);
  const a = (await addAgent(pool, { name: 'A', tokenHash: hash(1) })).agent.id;
  await pool.query(`INSERT INTO stories (id, role, title, status) VALUES ('s1', 'hub', 'Hub', 'active')`);
  const post = { id: 's1', role: 'hub' as const, title: 'Hub', status: 'active' as const };
  // Posting it unchanged is fine; changing it, or adding a nested row, is a conflict, and nothing is written.
  assert.equal((await putStory(pool, { agentId: a }, post)).outcome, 'unchanged');
  for (const change of [{ ...post, title: 'Changed' }, { ...post, sources: [{ id: 'src1', outlet: 'Axios' }] }]) {
    await assert.rejects(putStory(pool, { agentId: a }, change), (error: unknown) => {
      assert.ok(error instanceof DashboardStoreError);
      assert.equal(error.reason, 'conflict');
      assert.match(error.message, /written before agents and is not claimed/);
      return true;
    });
  }
  const unchanged = await pool.query(`SELECT title FROM stories WHERE id = 's1'`);
  assert.deepEqual(unchanged.rows, [{ title: 'Hub' }]);
  assert.equal((await pool.query(`SELECT 1 FROM story_sources WHERE id = 'src1'`)).rowCount, 0);

  const claimed = await claimForAgent(pool, a);
  assert.equal(claimed.stories, 1);
  assert.equal((await putStory(pool, { agentId: a }, { ...post, title: 'Changed' })).outcome, 'updated');
});

test('writers: a CFP footer or Morning item posted again unchanged by another agent keeps its first writer', async (t) => {
  const pool = await scratch(t);
  const a = (await addAgent(pool, { name: 'A', tokenHash: hash(1) })).agent.id;
  const b = (await addAgent(pool, { name: 'B', tokenHash: hash(2) })).agent.id;
  const note = { day: '2026-11-26', stillWorking: 'x', dropped: null };
  assert.equal((await putCfpDayNote(pool, { agentId: a }, note)).outcome, 'created');
  assert.equal((await putCfpDayNote(pool, { agentId: b }, note)).outcome, 'unchanged');
  const cols = `SELECT written_by_agent_id, written_by_user_id FROM`;
  assert.equal((await writer(pool, `${cols} cfp_day_notes`))?.written_by_agent_id, a);
  assert.equal((await putCfpDayNote(pool, { agentId: b }, { ...note, dropped: 'y' })).outcome, 'updated');
  assert.equal((await writer(pool, `${cols} cfp_day_notes`))?.written_by_agent_id, b);

  const item = { id: 'm1', kind: 'bluf' as const, body: 'BLUF', link: null, postedAt: '2026-11-26T11:00:00Z' };
  assert.equal((await putMorningItem(pool, { agentId: a }, item)).outcome, 'created');
  assert.equal((await putMorningItem(pool, { agentId: b }, item)).outcome, 'unchanged');
  assert.equal((await writer(pool, `${cols} morning_items`))?.written_by_agent_id, a);
});
