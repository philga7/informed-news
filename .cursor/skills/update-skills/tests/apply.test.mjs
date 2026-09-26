import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFile = promisify(execFileCallback);
const repoRoot = process.cwd();
const applyScript = path.join(repoRoot, '.cursor', 'skills', 'update-skills', 'scripts', 'apply.sh');

test('apply helper refuses without approval flag', async () => {
  await assert.rejects(
    () => execFile('bash', [applyScript, 'find-skills'], { cwd: repoRoot }),
    /Refusing to apply skills without --i-was-approved/
  );
});

test('apply helper refuses repo-local skills even when approved', async () => {
  await assert.rejects(
    () => execFile('bash', [applyScript, '--i-was-approved', 'update-skills'], { cwd: repoRoot }),
    /Refusing to apply repo-local skill: update-skills/
  );
});
