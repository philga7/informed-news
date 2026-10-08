import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveUpstreamSkillDir } from './check.mjs';
import { OVERRIDES_DIRNAME, generatePatch, pathExists, writeOverridePatch } from './overrides.mjs';

function usage() {
  return `Usage: node record-override.mjs --repo-root <path> [--fixtures <path>] <skill> [<skill>...]

Records the difference between upstream and the local copy of each skill as
${OVERRIDES_DIRNAME}/<skill>.patch. Run it when the skill is otherwise current
with upstream; anything else that differs would be captured as an override too.`;
}

function parseArgs(argv) {
  let repoRoot = null;
  let fixturesRoot = null;
  const skills = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg === '--repo-root' || arg === '--fixtures') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a path`);
      }
      if (arg === '--repo-root') {
        repoRoot = value;
      } else {
        fixturesRoot = value;
      }
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    skills.push(arg);
  }

  if (!repoRoot) {
    throw new Error('--repo-root is required');
  }
  if (skills.length === 0) {
    throw new Error('At least one skill name is required');
  }

  return { repoRoot, fixturesRoot, skills };
}

export async function recordOverride(repoRoot, skillName, options = {}) {
  const lockfile = JSON.parse(await readFile(path.join(repoRoot, 'skills-lock.json'), 'utf8'));
  const lockEntry = lockfile.skills?.[skillName];
  if (!lockEntry) {
    throw new Error(`Unknown skill in skills-lock.json: ${skillName}`);
  }

  const localDir = path.join(repoRoot, '.cursor', 'skills', skillName);
  if (!(await pathExists(localDir))) {
    throw new Error(`Missing local skill directory: ${localDir}`);
  }

  const upstreamRef = await resolveUpstreamSkillDir(lockEntry, skillName, options);
  try {
    const patchText = await generatePatch(upstreamRef.dir, localDir);
    return writeOverridePatch(repoRoot, skillName, patchText);
  } finally {
    await upstreamRef.cleanup();
  }
}

export async function main(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const repoRoot = path.resolve(parsed.repoRoot);
  const options = parsed.fixturesRoot
    ? { fixturesRoot: path.resolve(parsed.fixturesRoot), offline: true }
    : {};

  for (const skillName of parsed.skills) {
    try {
      const written = await recordOverride(repoRoot, skillName, options);
      console.log(
        written
          ? `${skillName}: recorded ${path.relative(repoRoot, written)}`
          : `${skillName}: matches upstream; no override recorded (any old patch removed)`
      );
    } catch (error) {
      console.error(`${skillName}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}

const isMain =
  process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  await main();
}
