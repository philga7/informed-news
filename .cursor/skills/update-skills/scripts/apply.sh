#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: apply.sh --i-was-approved <skill> [<skill>...]

Applies approved skill refreshes and consolidates any .agents/skills output
back into .cursor/skills/.
EOF
}

approved=0
skills=()

for arg in "$@"; do
  case "$arg" in
    --i-was-approved)
      approved=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown flag: $arg" >&2
      usage >&2
      exit 64
      ;;
    *)
      skills+=("$arg")
      ;;
  esac
done

if [[ "$approved" -ne 1 ]]; then
  echo "Refusing to apply skills without --i-was-approved." >&2
  exit 64
fi

if [[ "${#skills[@]}" -eq 0 ]]; then
  echo "No skill names provided." >&2
  usage >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

node --input-type=module - "$REPO_ROOT" "${skills[@]}" <<'NODE'
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = process.argv[2];
const requestedSkills = process.argv.slice(3);
const lockfilePath = path.join(repoRoot, 'skills-lock.json');
const docsPath = path.join(repoRoot, 'docs', 'AGENT_SKILLS.md');
const parseLocalSkillsPath = path.join(
  repoRoot,
  '.cursor',
  'skills',
  'update-skills',
  'scripts',
  'parse-local-skills.mjs'
);

const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'));
const { parseLocalSkills } = await import(pathToFileURL(parseLocalSkillsPath).href);
const parsedLocalSkills = parseLocalSkills(await readFile(docsPath, 'utf8'));

if (parsedLocalSkills.length === 0) {
  throw new Error('Could not parse repo-local skills from docs/AGENT_SKILLS.md; refusing to apply.');
}

const localSkillNames = new Set(['news-ship-loop', 'update-skills', ...parsedLocalSkills]);

for (const skillName of requestedSkills) {
  if (localSkillNames.has(skillName)) {
    throw new Error(`Refusing to apply repo-local skill: ${skillName}`);
  }
}

const groupedBySource = new Map();

for (const skillName of requestedSkills) {
  const entry = lockfile.skills?.[skillName];
  if (!entry) {
    throw new Error(`Unknown skill in skills-lock.json: ${skillName}`);
  }

  const source = entry.source;
  if (!source) {
    throw new Error(`Missing source for skill: ${skillName}`);
  }

  if (!groupedBySource.has(source)) {
    groupedBySource.set(source, []);
  }

  groupedBySource.get(source).push(skillName);
}

for (const [source, skillNames] of groupedBySource) {
  const args = ['skills', 'add', source];
  for (const skillName of skillNames) {
    args.push('--skill', skillName);
  }
  args.push('-a', 'cursor', '--copy', '-y');

  const result = spawnSync('npx', args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Skills CLI failed for ${skillNames.join(', ')}`);
  }
}

const agentsSkillsDir = path.join(repoRoot, '.agents', 'skills');
const cursorSkillsDir = path.join(repoRoot, '.cursor', 'skills');

try {
  const entries = await readdir(agentsSkillsDir, { withFileTypes: true });
  if (entries.length > 0) {
    await mkdir(cursorSkillsDir, { recursive: true });
  }

  for (const entry of entries) {
    const sourcePath = path.join(agentsSkillsDir, entry.name);
    const destinationPath = path.join(cursorSkillsDir, entry.name);
    await cp(sourcePath, destinationPath, { recursive: true, force: true });
  }

  await rm(path.join(repoRoot, '.agents'), { recursive: true, force: true });
} catch (error) {
  if (error?.code !== 'ENOENT') {
    throw error;
  }
}

console.log(`Applied skills: ${requestedSkills.join(', ')}`);
NODE
