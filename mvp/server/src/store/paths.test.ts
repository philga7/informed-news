import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultDataDir = path.resolve(serverRoot, '../data');

function readDataDir(overrides: Record<string, string | undefined>): string {
  const env = { ...process.env };
  delete env.MVP_DATA_DIR;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', "import { DATA_DIR } from './src/store/paths.ts'; process.stdout.write(DATA_DIR);"],
    { cwd: serverRoot, env, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('data directory defaults to mvp/data beside the server', () => {
  assert.equal(readDataDir({}), defaultDataDir);
});

test('MVP_DATA_DIR overrides the data directory', () => {
  assert.equal(readDataDir({ MVP_DATA_DIR: '/tmp/informed-news-data-override' }), '/tmp/informed-news-data-override');
});

test('whitespace MVP_DATA_DIR keeps the default data directory', () => {
  assert.equal(readDataDir({ MVP_DATA_DIR: '   ' }), defaultDataDir);
});
