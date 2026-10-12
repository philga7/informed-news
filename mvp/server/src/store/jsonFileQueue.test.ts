import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'json-file-queue-'));
}

test('writeJsonAtomic writes pretty JSON with a trailing newline, creating parent dirs, and leaves no tmp file', async () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'nested', 'store.json');
  await writeJsonAtomic(filePath, { a: 1, list: ['x'] });

  assert.equal(await readFile(filePath, 'utf8'), '{\n  "a": 1,\n  "list": [\n    "x"\n  ]\n}\n');
  assert.deepEqual(await readdir(path.dirname(filePath)), ['store.json']);
});

test('writeJsonAtomic rejects and removes its tmp file when the rename fails', async () => {
  const dir = tempDir();
  const filePath = path.join(dir, 'store.json');
  await mkdir(filePath);

  await assert.rejects(writeJsonAtomic(filePath, { a: 1 }));
  assert.deepEqual(await readdir(dir), ['store.json']);
});

test('enqueueFileWrite serializes read-modify-write cycles on the same file', async () => {
  const filePath = path.join(tempDir(), 'counter.json');
  await writeJsonAtomic(filePath, { count: 0 });
  const increment = () =>
    enqueueFileWrite(filePath, async () => {
      const { count } = JSON.parse(await readFile(filePath, 'utf8')) as { count: number };
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeJsonAtomic(filePath, { count: count + 1 });
      return count + 1;
    });

  const results = await Promise.all([increment(), increment(), increment()]);
  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { count: 3 });
});

test('a failed write rejects its caller without blocking the next write', async () => {
  const filePath = path.join(tempDir(), 'store.json');
  const failed = enqueueFileWrite(filePath, async () => {
    throw new Error('mutator failed');
  });
  const next = enqueueFileWrite(filePath, async () => {
    await writeJsonAtomic(filePath, { ok: true });
    return 'written';
  });

  await assert.rejects(failed, /mutator failed/);
  assert.equal(await next, 'written');
  assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')), { ok: true });
});

test('the queue is keyed by the resolved path, so a relative and an absolute path share it', async () => {
  const filePath = path.join(tempDir(), 'store.json');
  const relative = path.relative(process.cwd(), filePath);
  const order: string[] = [];

  await Promise.all([
    enqueueFileWrite(filePath, async () => {
      order.push('absolute start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('absolute end');
    }),
    enqueueFileWrite(relative, async () => {
      order.push('relative');
    }),
  ]);
  assert.deepEqual(order, ['absolute start', 'absolute end', 'relative']);
});
