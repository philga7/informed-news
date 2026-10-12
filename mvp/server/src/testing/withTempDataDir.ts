import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type RunWithTempDataDirOptions = {
  env?: NodeJS.ProcessEnv;
  captureOutput?: boolean;
};

export type RunWithTempDataDirResult = {
  code: number;
  stdout: string;
  /** Paths the command left in the temp data dir; any entry fails the run. */
  leaked: string[];
};

/**
 * Run a command with `MVP_DATA_DIR` set to a fresh temp dir, replacing any
 * inherited value, so a test that forgets a store stub can't reach mvp/data.
 */
export async function runWithTempDataDir(
  command: string,
  args: string[],
  options: RunWithTempDataDirOptions = {},
): Promise<RunWithTempDataDirResult> {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'mvp-test-data-'));
  const child = spawn(command, args, {
    env: { ...(options.env ?? process.env), MVP_DATA_DIR: dataDir },
    stdio: options.captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });

  let stdout = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (childCode) => resolve(childCode ?? 1));
    });

    const leaked = await listLeaked(dataDir);
    const code = exitCode === 0 && leaked.length > 0 ? 1 : exitCode;
    return { code, stdout, leaked };
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

/** Files (and empty dirs, with a trailing slash) under `dir`, relative and sorted. */
async function listLeaked(dir: string, prefix = ''): Promise<string[]> {
  const leaked: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const inner = await listLeaked(path.join(dir, entry.name), rel);
      leaked.push(...(inner.length > 0 ? inner : [`${rel}/`]));
    } else {
      leaked.push(rel);
    }
  }
  return leaked.sort();
}

/** CLI: `withTempDataDir.ts <command> [...args]`, used by `npm test`. */
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('Usage: withTempDataDir.ts <command> [...args]');
    process.exit(2);
  }

  // Ctrl-C reaches the child through the process group; staying alive lets the
  // temp dir be removed after the child exits.
  process.on('SIGINT', () => {});

  const result = await runWithTempDataDir(command, args);
  if (result.leaked.length > 0) {
    console.error(
      `Tests left files in MVP_DATA_DIR; a test is missing a store stub or temp path:\n${result.leaked
        .map((p) => `  ${p}`)
        .join('\n')}`,
    );
  }
  process.exit(result.code);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
