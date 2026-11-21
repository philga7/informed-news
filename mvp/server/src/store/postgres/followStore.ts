import type { Pool } from 'pg';
import { DashboardStoreError, asInstant, pgErrorCode, requiredText } from './storeSupport.js';
import { followState, type FollowState } from './vocabulary.js';

/**
 * Per-user follow and hide for stories and topics (NEWS-254). One state per
 * user and subject; clearing removes it. It changes only what that user sees.
 * Topics live outside Postgres, so a topic id is not checked against a table.
 * What following changes, and which screens use it, is still open
 * (docs/DECISIONS.md, NEWS-252 entry).
 */

export type FollowSubject = { kind: 'story'; storyId: string } | { kind: 'topic'; topicId: string };

export type FollowRecord = {
  userId: string;
  subject: FollowSubject;
  state: FollowState;
  /** UTC ISO time. */
  updatedAt: string;
};

type FollowRow = {
  user_id: string;
  story_id: string | null;
  topic_id: string | null;
  state: string;
  updated_at: Date;
};

const FOREIGN_KEY_VIOLATION = '23503';
const FOLLOW_COLUMNS = 'user_id, story_id, topic_id, state, updated_at';

function subjectKey(subject: FollowSubject): { storyId: string | null; topicId: string | null } {
  switch (subject.kind) {
    case 'story':
      return { storyId: requiredText(subject.storyId, 'storyId'), topicId: null };
    case 'topic':
      return { storyId: null, topicId: requiredText(subject.topicId, 'topicId') };
    default: {
      const unexpected: never = subject;
      throw new DashboardStoreError(`unexpected follow subject ${JSON.stringify(unexpected)}`);
    }
  }
}

function toRecord(row: FollowRow): FollowRecord {
  let subject: FollowSubject;
  if (row.story_id !== null) subject = { kind: 'story', storyId: row.story_id };
  else if (row.topic_id !== null) subject = { kind: 'topic', topicId: row.topic_id };
  else throw new DashboardStoreError('follow row has no subject');
  return {
    userId: row.user_id,
    subject,
    state: followState(row.state),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Follow or hide a story or topic for one user, replacing any earlier state. */
export async function setFollowState(
  pool: Pool,
  userId: string,
  subject: FollowSubject,
  state: string,
  at: string = new Date().toISOString(),
): Promise<FollowRecord> {
  const user = requiredText(userId, 'userId');
  const key = subjectKey(subject);
  const checked = followState(state);
  const when = asInstant(at, 'updatedAt');
  try {
    const result = await pool.query<FollowRow>(
      `INSERT INTO user_follows (user_id, story_id, topic_id, state, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, story_id, topic_id)
       DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at
       RETURNING ${FOLLOW_COLUMNS}`,
      [user, key.storyId, key.topicId, checked, when],
    );
    const row = result.rows[0];
    if (!row) throw new DashboardStoreError('follow state was not written');
    return toRecord(row);
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new DashboardStoreError('follow state refers to a missing user or story', {
        cause: error,
      });
    }
    throw error;
  }
}

/** Remove the user's follow or hide for a subject. Returns false when there was none. */
export async function clearFollowState(
  pool: Pool,
  userId: string,
  subject: FollowSubject,
): Promise<boolean> {
  const user = requiredText(userId, 'userId');
  const key = subjectKey(subject);
  const result = await pool.query(
    `DELETE FROM user_follows
     WHERE user_id = $1 AND story_id IS NOT DISTINCT FROM $2 AND topic_id IS NOT DISTINCT FROM $3`,
    [user, key.storyId, key.topicId],
  );
  return result.rowCount === 1;
}

/** Every follow and hide the user has: stories first, then topics, each by id. */
export async function listFollowStates(pool: Pool, userId: string): Promise<FollowRecord[]> {
  const result = await pool.query<FollowRow>(
    `SELECT ${FOLLOW_COLUMNS} FROM user_follows WHERE user_id = $1
     ORDER BY story_id IS NULL, story_id, topic_id`,
    [requiredText(userId, 'userId')],
  );
  return result.rows.map(toRecord);
}
