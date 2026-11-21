import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import {
  findUserByEmail,
  readUserWithPasswordHash,
  type UserWithPasswordHash,
} from '../store/postgres/userStore.js';

/**
 * User accounts for sign-in (NEWS-254). Built on the Postgres user store when
 * the server has a database; without one, accounts are off and sign-in works
 * as it did before (the single MVP password).
 */

/** What a signed-in request knows about its user. Never the hash. */
export type SessionUser = { id: string; email: string; displayName: string };

/**
 * A successful sign-in. `stamp` is kept in the session and changes when the
 * account's password changes, so a new password signs out older sessions.
 */
export type SignedIn = { user: SessionUser; stamp: string };

/**
 * Every method may throw when the database cannot be reached or its schema
 * cannot be applied. Callers decide what that means for the request.
 */
export interface Accounts {
  /**
   * Apply the dashboard schema once. After a failure, calls within
   * PREPARE_RETRY_MS fail at once with the same error; the next one tries again.
   */
  prepare(): Promise<void>;
  /** The active user for this email and password, or null for any failure. */
  signIn(email: string, password: string): Promise<SignedIn | null>;
  /** True when the env file names an operator account (OPERATOR_EMAIL). */
  readonly hasOperator: boolean;
  /**
   * The active operator account, or null when it is missing or disabled. The
   * password-only sign-in uses it until the new sign-in screen ships.
   */
  operator(): Promise<SignedIn | null>;
  /**
   * The user if it exists, is not disabled, and its password has not changed
   * since the session's stamp was issued; else null.
   */
  activeUser(id: string, stamp: string): Promise<SessionUser | null>;
}

const BCRYPT_ROUNDS = 12;
export const PREPARE_RETRY_MS = 10_000;

export function hashPassword(password: string): Promise<string> {
  if (password.length === 0) throw new Error('password is required');
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Derived from the stored hash; it reveals nothing usable about the password. */
function stampOf(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('base64url').slice(0, 22);
}

function signedIn(user: UserWithPasswordHash): SignedIn | null {
  if (user.disabledAt !== null) return null;
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    stamp: stampOf(user.passwordHash),
  };
}

export function createAccounts(
  pool: Pool,
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
): Accounts {
  const operatorEmail = env.OPERATOR_EMAIL?.trim() ?? '';

  // Compared against when the email is unknown, so an unknown email and a
  // wrong password take about the same time. Made now, not on first use, so
  // the first unknown email is not slower. Its password is never used.
  const decoy = bcrypt.hash('decoy-password-not-used', BCRYPT_ROUNDS);
  decoy.catch(() => undefined);

  let ready: Promise<void> | undefined;
  let failedAt = 0;
  function prepare(): Promise<void> {
    if (ready === undefined || (failedAt !== 0 && now() - failedAt >= PREPARE_RETRY_MS)) {
      failedAt = 0;
      const attempt = ensureDashboardSchema(pool);
      ready = attempt;
      attempt.catch(() => {
        if (ready === attempt) failedAt = now();
      });
    }
    return ready;
  }

  return {
    prepare,
    async signIn(email, password) {
      if (email.trim() === '' || password === '') return null;
      await prepare();
      const user = await findUserByEmail(pool, email);
      if (!user) {
        await bcrypt.compare(password, await decoy);
        return null;
      }
      const matches = await bcrypt.compare(password, user.passwordHash);
      return matches ? signedIn(user) : null;
    },
    hasOperator: operatorEmail !== '',
    async operator() {
      if (operatorEmail === '') return null;
      await prepare();
      const user = await findUserByEmail(pool, operatorEmail);
      return user ? signedIn(user) : null;
    },
    async activeUser(id, stamp) {
      await prepare();
      const user = await readUserWithPasswordHash(pool, id);
      const current = user ? signedIn(user) : null;
      return current && current.stamp === stamp ? current.user : null;
    },
  };
}
