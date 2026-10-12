import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runWithTempDataDir } from './withTempDataDir.js';

const REAL_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../data',
);

function runNode(script: string, env: NodeJS.ProcessEnv = process.env) {
  return runWithTempDataDir(process.execPath, ['-e', script], { env, captureOutput: true });
}

test('runWithTempDataDir gives the command a fresh empty MVP_DATA_DIR, not mvp/data or an inherited override', async () => {
  const result = await runNode(
    `const fs = require('node:fs');
     const dir = process.env.MVP_DATA_DIR;
     process.stdout.write(JSON.stringify({ dir, entries: fs.readdirSync(dir) }));`,
    { ...process.env, MVP_DATA_DIR: REAL_DATA_DIR },
  );

  const seen = JSON.parse(result.stdout) as { dir: string; entries: string[] };
  assert.equal(result.code, 0);
  assert.notEqual(path.resolve(seen.dir), REAL_DATA_DIR);
  assert.deepEqual(seen.entries, []);
});

test('runWithTempDataDir fails a passing command that leaves files in the data dir and names them', async () => {
  const result = await runNode(
    `const fs = require('node:fs');
     const path = require('node:path');
     const dir = process.env.MVP_DATA_DIR;
     fs.writeFileSync(path.join(dir, 'articles.json'), '[]');
     fs.mkdirSync(path.join(dir, 'nested'));
     fs.writeFileSync(path.join(dir, 'nested', 'triage.json'), '{}');`,
  );

  assert.notEqual(result.code, 0);
  assert.deepEqual(result.leaked, ['articles.json', 'nested/triage.json']);
});

test('runWithTempDataDir forwards a failing exit code and removes the temp dir', async () => {
  const result = await runNode(
    `const fs = require('node:fs');
     const path = require('node:path');
     fs.writeFileSync(path.join(process.env.MVP_DATA_DIR, 'meta.json'), '{}');
     process.stdout.write(process.env.MVP_DATA_DIR);
     process.exit(3);`,
  );

  assert.equal(result.code, 3);
  assert.equal(existsSync(result.stdout), false);
});

test('runWithTempDataDir passes when the command leaves the data dir empty', async () => {
  const result = await runNode(`require('node:fs').readdirSync(process.env.MVP_DATA_DIR);`);

  assert.equal(result.code, 0);
  assert.deepEqual(result.leaked, []);
});
