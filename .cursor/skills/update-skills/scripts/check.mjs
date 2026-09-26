import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { readLocalSkillsFromFile } from './parse-local-skills.mjs';

function usage() {
  return `Usage: node check.mjs --repo-root <path> [--json]`;
}

function parseArgs(argv) {
  let repoRoot = null;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--repo-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--repo-root requires a path');
      }
      repoRoot = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--repo-root=')) {
      repoRoot = arg.slice('--repo-root='.length);
      if (!repoRoot) {
        throw new Error('--repo-root requires a path');
      }
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!repoRoot) {
    throw new Error('--repo-root is required');
  }

  return { repoRoot, json };
}

async function readJsonFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function listTopLevelSkillDirs(skillsRoot) {
  try {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function classifySkill(name, lockNames, localNames) {
  if (localNames.has(name)) {
    return 'repo-local-skip';
  }

  if (lockNames.has(name)) {
    return 'locked';
  }

  return 'unlocked-dir';
}

async function buildInventory(repoRoot) {
  const lockfilePath = path.join(repoRoot, 'skills-lock.json');
  const docsPath = path.join(repoRoot, 'docs', 'AGENT_SKILLS.md');
  const skillsRoot = path.join(repoRoot, '.cursor', 'skills');

  const lockfile = await readJsonFile(lockfilePath);
  const localSkills = new Set(await readLocalSkillsFromFile(docsPath));
  const lockNames = new Set(Object.keys(lockfile.skills ?? {}));
  const dirNames = new Set(await listTopLevelSkillDirs(skillsRoot));

  const names = [...new Set([...lockNames, ...dirNames])].sort((left, right) =>
    left.localeCompare(right)
  );

  const inventory = names.map((name) => ({
    name,
    status: classifySkill(name, lockNames, localSkills),
    comparison: 'not-checked',
  }));

  return {
    repoRoot,
    lockfilePath,
    docsPath,
    localSkills: [...localSkills],
    inventory,
  };
}

function formatTextReport(report) {
  const lines = [];
  lines.push(`Repo root: ${report.repoRoot}`);
  lines.push(`Repo-local skills: ${report.localSkills.join(', ') || '(none)'}`);
  lines.push('Inventory:');

  for (const item of report.inventory) {
    lines.push(`- ${item.name}: ${item.status} (${item.comparison})`);
  }

  return lines.join('\n');
}

async function main() {
  let parsed;

  try {
    parsed = parseArgs(process.argv.slice(2));
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

  try {
    const report = await buildInventory(path.resolve(parsed.repoRoot));
    if (parsed.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(formatTextReport(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

await main();
