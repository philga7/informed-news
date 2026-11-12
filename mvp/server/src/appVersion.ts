import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** The release version does not change while the process is running. */
const versionByStart = new Map<string, string>();

/**
 * Version from the nearest parent `package.json` named `informed-news`.
 * A missing, unreadable, or non-matching file is skipped. None → `unknown`.
 * Each start directory is walked once.
 */
export function readAppVersion(startDir: string = MODULE_DIR): string {
  const start = path.resolve(startDir);
  const cached = versionByStart.get(start);
  if (cached !== undefined) return cached;
  const version = walkForVersion(start);
  versionByStart.set(start, version);
  return version;
}

function walkForVersion(start: string): string {
  let dir = start;
  const root = path.parse(dir).root;
  for (;;) {
    const version = versionFromPackageJson(path.join(dir, 'package.json'));
    if (version !== null) return version;
    if (dir === root) return 'unknown';
    dir = path.dirname(dir);
  }
}

function versionFromPackageJson(file: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as { name?: unknown; version?: unknown };
    if (record.name !== 'informed-news') return null;
    if (typeof record.version !== 'string' || record.version.length === 0) return null;
    return record.version;
  } catch {
    return null;
  }
}
