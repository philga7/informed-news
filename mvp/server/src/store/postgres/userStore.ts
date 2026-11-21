import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DashboardStoreError, asInstant, pgErrorCode, requiredText } from './storeSupport.js';

/**
 * Invite-only user accounts (NEWS-254). The store keeps a password hash and
 * never sees a password: hashing and checking live in `auth/accounts.ts`.
 */

export type UserRecord = {
  id: string;
  /** Trimmed and lowercased. Unique regardless of case. */
  email: string;
  displayName: string;
  /** UTC ISO time. */
  createdAt: string;
  /** UTC ISO time, or null for an active account. */
  disabledAt: string | null;
};

/** A user with the stored hash, for sign-in only. */
export type UserWithPasswordHash = UserRecord & { passwordHash: string };

export type UserInput = {
  email: string;
  displayName: string;
  passwordHash: string;
  /** Defaults to now. Must carry a zone. */
  createdAt?: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: Date;
  disabled_at: Date | null;
};

const UNIQUE_VIOLATION = '23505';
const USER_COLUMNS = 'id, email, password_hash, display_name, created_at, disabled_at';

/** An email as the store keeps it. Only a basic shape check: one @, no spaces. */
export function normalizeEmail(value: string): string {
  const email = requiredText(value, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new DashboardStoreError('email must look like name@host');
  }
  return email;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
    disabledAt: row.disabled_at === null ? null : row.disabled_at.toISOString(),
  };
}

export async function createUser(pool: Pool, input: UserInput): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  const displayName = requiredText(input.displayName, 'displayName');
  const passwordHash = requiredText(input.passwordHash, 'passwordHash');
  const createdAt =
    input.createdAt === undefined
      ? new Date().toISOString()
      : asInstant(input.createdAt, 'createdAt');
  const id = randomUUID();
  try {
    await pool.query(
      `INSERT INTO users (${USER_COLUMNS}) VALUES ($1, $2, $3, $4, $5, NULL)`,
      [id, email, passwordHash, displayName, createdAt],
    );
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      throw new DashboardStoreError(`a user with email ${email} already exists`, { cause: error });
    }
    throw error;
  }
  return { id, email, displayName, createdAt, disabledAt: null };
}

export async function readUser(pool: Pool, id: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/** By id, with the stored hash, for checking a session. Includes disabled users. */
export async function readUserWithPasswordHash(
  pool: Pool,
  id: string,
): Promise<UserWithPasswordHash | null> {
  const result = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? { ...toRecord(row), passwordHash: row.password_hash } : null;
}

/** Case-insensitive. Returns the hash too, for sign-in. Includes disabled users. */
export async function findUserByEmail(
  pool: Pool,
  email: string,
): Promise<UserWithPasswordHash | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = $1`,
    [trimmed],
  );
  const row = result.rows[0];
  return row ? { ...toRecord(row), passwordHash: row.password_hash } : null;
}

/** Every account, oldest first. */
export async function listUsers(pool: Pool): Promise<UserRecord[]> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY created_at, email`,
  );
  return result.rows.map(toRecord);
}

/**
 * Disable an account. It can no longer sign in, and a session it already holds
 * is refused on its next request. Disabling twice keeps the first time.
 * Returns the account, or null when there is none with that id.
 */
export async function disableUser(
  pool: Pool,
  id: string,
  at: string = new Date().toISOString(),
): Promise<UserRecord | null> {
  const when = asInstant(at, 'disabledAt');
  const result = await pool.query<UserRow>(
    `UPDATE users SET disabled_at = COALESCE(disabled_at, $2) WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [id, when],
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Replace an account's password hash. Sessions signed in with the old password
 * stop working on their next request (`auth/accounts.ts`). Returns false when there is no such account. */
export async function setUserPasswordHash(
  pool: Pool,
  id: string,
  passwordHash: string,
): Promise<boolean> {
  const hash = requiredText(passwordHash, 'passwordHash');
  const result = await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, hash]);
  return result.rowCount === 1;
}
