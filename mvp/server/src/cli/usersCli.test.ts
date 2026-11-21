import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { runUsersCli, type UsersCliIo } from './usersCli.js';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { findUserByEmail } from '../store/postgres/userStore.js';
import { testPool } from '../testing/dashboardTestDb.js';

before(async () => {
  const pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  try {
    await ensureDashboardSchema(pool);
  } finally {
    await pool.end();
  }
});

function store(t: TestContext): Pool {
  const pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(() => pool.end());
  return pool;
}

function io(stdin = ''): UsersCliIo & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    out: (line) => lines.push(line),
    err: (line) => errors.push(line),
    readStdin: async () => stdin,
    hash: async (password) => `hashed:${password}`,
    generatePassword: () => 'generated-password-1234',
  };
}

function address(): string {
  return `cli-${randomUUID()}@example.com`;
}

test('add makes an account with a generated password, shown once', async (t) => {
  const pool = store(t);
  const email = address();
  const out = io();
  assert.equal(await runUsersCli(['add', '--email', email, '--name', 'Reader'], pool, out), 0);
  assert.match(out.lines[0] ?? '', new RegExp(`^Added ${email} \\(Reader\\), id `));
  assert.deepEqual(out.lines.slice(1), ['Password (shown once): generated-password-1234']);
  assert.equal((await findUserByEmail(pool, email))?.passwordHash, 'hashed:generated-password-1234');
});

test('add and set-password take a password from stdin and do not print it', async (t) => {
  const pool = store(t);
  const email = address();
  const out = io('a long enough password\n');
  assert.equal(
    await runUsersCli(['add', '--email', email, '--name', 'Reader', '--password-stdin'], pool, out),
    0,
  );
  assert.equal(out.lines.length, 1);
  assert.equal((await findUserByEmail(pool, email))?.passwordHash, 'hashed:a long enough password');

  const reset = io('another long password');
  assert.equal(
    await runUsersCli(['set-password', '--email', email.toUpperCase(), '--password-stdin'], pool, reset),
    0,
  );
  assert.deepEqual(reset.lines, [`Set a new password for ${email}`]);
  assert.equal((await findUserByEmail(pool, email))?.passwordHash, 'hashed:another long password');
});

test('a short stdin password, a missing flag, or an unknown command is a usage error', async (t) => {
  const pool = store(t);
  const short = io('short\n');
  assert.equal(
    await runUsersCli(['add', '--email', address(), '--name', 'R', '--password-stdin'], pool, short),
    2,
  );
  assert.match(short.errors[0] ?? '', /at least 12 characters/);
  const missing = io();
  assert.equal(await runUsersCli(['add', '--email', address()], pool, missing), 2);
  assert.match(missing.errors[0] ?? '', /--name is required/);
  const unknown = io();
  assert.equal(await runUsersCli(['remove'], pool, unknown), 2);
  assert.match(unknown.errors.join('\n'), /unknown command remove[\s\S]*Usage:/);
  const badFlag = io();
  assert.equal(await runUsersCli(['list', '--nope'], pool, badFlag), 2);
  assert.equal(await runUsersCli([], pool, io()), 2);
});

test('a duplicate email is refused', async (t) => {
  const pool = store(t);
  const email = address();
  await runUsersCli(['add', '--email', email, '--name', 'One'], pool, io());
  const second = io();
  assert.equal(await runUsersCli(['add', '--email', email.toUpperCase(), '--name', 'Two'], pool, second), 1);
  assert.match(second.errors[0] ?? '', /already exists/);
});

test('disable and list', async (t) => {
  const pool = store(t);
  const email = address();
  await runUsersCli(['add', '--email', email, '--name', 'Reader'], pool, io());
  const disabled = io();
  assert.equal(await runUsersCli(['disable', '--email', email], pool, disabled), 0);
  assert.match(disabled.lines[0] ?? '', new RegExp(`^Disabled ${email} at \\d{4}-`));
  const listed = io();
  assert.equal(await runUsersCli(['list'], pool, listed), 0);
  const line = listed.lines.find((row) => row.startsWith(`${email}\t`));
  assert.match(line ?? '', /\tReader\tdisabled \d{4}-.*\tcreated \d{4}-/);

  const nobody = io();
  assert.equal(await runUsersCli(['disable', '--email', address()], pool, nobody), 1);
  assert.match(nobody.errors[0] ?? '', /No account for/);
  assert.equal(await runUsersCli(['set-password', '--email', address()], pool, io()), 1);
});
