import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import type { Pool } from 'pg';
import { hashPassword } from '../auth/accounts.js';
import {
  createUser,
  disableUser,
  findUserByEmail,
  listUsers,
  setUserPasswordHash,
} from '../store/postgres/userStore.js';

/**
 * Operator commands for invite-only accounts (NEWS-254):
 *
 *   add --email <email> --name <display name> [--password-stdin]
 *   list
 *   disable --email <email>
 *   set-password --email <email> [--password-stdin]
 *
 * Without --password-stdin a password is generated and printed once.
 */

export type UsersCliIo = {
  out: (line: string) => void;
  err: (line: string) => void;
  /** The whole of standard input, for --password-stdin. */
  readStdin: () => Promise<string>;
  /** Defaults to bcrypt; tests pass a fast stand-in. */
  hash?: (password: string) => Promise<string>;
  /** Defaults to 18 random bytes, base64url. */
  generatePassword?: () => string;
};

export const USERS_USAGE = [
  'Usage: npm run users --prefix mvp/server -- <command>',
  '  add --email <email> --name <display name> [--password-stdin]',
  '  list',
  '  disable --email <email>',
  '  set-password --email <email> [--password-stdin]',
  'Without --password-stdin a password is generated and printed once.',
  'set-password signs out every session made with the old password.',
].join('\n');

const MIN_PASSWORD_LENGTH = 12;

class UsageError extends Error {}

async function choosePassword(
  fromStdin: boolean,
  io: UsersCliIo,
): Promise<{ password: string; generated: boolean }> {
  if (!fromStdin) {
    const generate = io.generatePassword ?? (() => randomBytes(18).toString('base64url'));
    return { password: generate(), generated: true };
  }
  // One trailing newline is what `echo` or a heredoc adds; it is not part of it.
  const password = (await io.readStdin()).replace(/\r?\n$/, '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new UsageError(`a password needs at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return { password, generated: false };
}

function required(value: string | undefined, flag: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) throw new UsageError(`${flag} is required`);
  return trimmed;
}

/** Runs one command. Returns the process exit code. */
export async function runUsersCli(argv: string[], pool: Pool, io: UsersCliIo): Promise<number> {
  const hash = io.hash ?? hashPassword;
  try {
    const [command, ...rest] = argv;
    const { values } = parseArgs({
      args: rest,
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        'password-stdin': { type: 'boolean', default: false },
      },
      strict: true,
    });
    switch (command) {
      case 'add': {
        const email = required(values.email, '--email');
        const name = required(values.name, '--name');
        const { password, generated } = await choosePassword(values['password-stdin'] === true, io);
        const user = await createUser(pool, {
          email,
          displayName: name,
          passwordHash: await hash(password),
        });
        io.out(`Added ${user.email} (${user.displayName}), id ${user.id}`);
        if (generated) io.out(`Password (shown once): ${password}`);
        return 0;
      }
      case 'list': {
        const users = await listUsers(pool);
        if (users.length === 0) io.out('No accounts.');
        for (const user of users) {
          const status = user.disabledAt === null ? 'active' : `disabled ${user.disabledAt}`;
          io.out(`${user.email}\t${user.displayName}\t${status}\tcreated ${user.createdAt}`);
        }
        return 0;
      }
      case 'disable': {
        const email = required(values.email, '--email');
        const user = await findUserByEmail(pool, email);
        if (!user) {
          io.err(`No account for ${email}`);
          return 1;
        }
        const disabled = await disableUser(pool, user.id);
        io.out(`Disabled ${user.email} at ${disabled?.disabledAt ?? 'unknown time'}`);
        return 0;
      }
      case 'set-password': {
        const email = required(values.email, '--email');
        const user = await findUserByEmail(pool, email);
        if (!user) {
          io.err(`No account for ${email}`);
          return 1;
        }
        const { password, generated } = await choosePassword(values['password-stdin'] === true, io);
        await setUserPasswordHash(pool, user.id, await hash(password));
        io.out(`Set a new password for ${user.email}`);
        if (generated) io.out(`Password (shown once): ${password}`);
        return 0;
      }
      default:
        throw new UsageError(command ? `unknown command ${command}` : 'a command is required');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(message);
    if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
      io.err(USERS_USAGE);
      return 2;
    }
    return 1;
  }
}
