import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Atomic write: pretty JSON + trailing newline to a temp file in the same directory, then rename. */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tmpPath, filePath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

const writeChains = new Map<string, Promise<unknown>>();

/**
 * Run `work` after every earlier job queued for the same resolved path, so read-modify-write cycles
 * don't interleave. A rejected job rejects its caller but doesn't block later jobs.
 * `work` must not queue another job for the same file and await it (it would wait on itself).
 */
export function enqueueFileWrite<T>(filePath: string, work: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(work);
  const settled = next.catch(() => undefined);
  writeChains.set(key, settled);
  void settled.then(() => {
    if (writeChains.get(key) === settled) writeChains.delete(key);
  });
  return next;
}
