import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readLocalSkillsFromFile } from './parse-local-skills.mjs';

const execFile = promisify(execFileCallback);
const DEFAULT_USER_AGENT = 'informed-news-update-skills-checker';

function usage() {
  return `Usage: node check.mjs --repo-root <path> [--json] [--skill <name>] [--offline]`;
}

function isTruthy(value) {
  if (value == null) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseArgs(argv, env = process.env) {
  let repoRoot = null;
  let json = false;
  let skill = null;
  let offline = isTruthy(env.UPDATE_SKILLS_OFFLINE);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--offline') {
      offline = true;
      continue;
    }

    if (arg === '--skill') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--skill requires a name');
      }
      skill = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--skill=')) {
      skill = arg.slice('--skill='.length);
      if (!skill) {
        throw new Error('--skill requires a name');
      }
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

  return { repoRoot, json, skill, offline };
}

async function readJsonFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
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

function normalizeSkillDirFromLock(lockEntry) {
  const skillDir = path.posix.dirname(lockEntry.skillPath);
  return skillDir === '.' ? '' : skillDir;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function listFilesRecursive(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(rootDir, absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function readDirectorySnapshot(rootDir) {
  const files = await listFilesRecursive(rootDir);
  const snapshot = new Map();

  for (const relativePath of files) {
    const absolutePath = path.join(rootDir, relativePath);
    const content = await readFile(absolutePath);
    snapshot.set(relativePath, {
      sha256: sha256(content),
      content,
    });
  }

  return snapshot;
}

function makeGitHubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': process.env.UPDATE_SKILLS_USER_AGENT || DEFAULT_USER_AGENT,
  };
}

async function fetchJson(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable in this Node runtime');
  }

  const response = await fetchImpl(url, { headers: makeGitHubHeaders() });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const suffix = body ? `: ${body.slice(0, 200)}` : '';
    throw new Error(`GitHub request failed (${response.status} ${response.statusText})${suffix}`);
  }

  return response.json();
}

async function fetchBuffer(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable in this Node runtime');
  }

  const response = await fetchImpl(url, { headers: makeGitHubHeaders() });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const suffix = body ? `: ${body.slice(0, 200)}` : '';
    throw new Error(`GitHub download failed (${response.status} ${response.statusText})${suffix}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function encodeRepoPath(repoPath) {
  return repoPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function downloadGitHubDirectory({
  source,
  skillDir,
  ref,
  targetDir,
  fetchImpl = globalThis.fetch,
}) {
  const encodedPath = encodeRepoPath(skillDir);
  const url = `https://api.github.com/repos/${source}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  const payload = await fetchJson(url, fetchImpl);
  const entries = Array.isArray(payload) ? payload : [payload];

  if (entries.length === 0) {
    throw new Error(`Upstream skill directory is empty: ${skillDir}`);
  }

  for (const entry of entries) {
    if (entry.type === 'dir') {
      const relativeDir = path.posix.relative(skillDir, entry.path);
      const nestedTargetDir =
        relativeDir && relativeDir !== '.'
          ? path.join(targetDir, ...relativeDir.split('/'))
          : targetDir;
      await mkdir(nestedTargetDir, { recursive: true });
      await downloadGitHubDirectory({
        source,
        skillDir: entry.path,
        ref,
        targetDir: nestedTargetDir,
        fetchImpl,
      });
      continue;
    }

    if (entry.type !== 'file') {
      continue;
    }

    const relativePath = path.posix.relative(skillDir, entry.path);
    const outputPath = path.join(targetDir, ...relativePath.split('/'));
    await mkdir(path.dirname(outputPath), { recursive: true });

    if (!entry.download_url) {
      throw new Error(`GitHub did not provide a download URL for ${entry.path}`);
    }

    const content = await fetchBuffer(entry.download_url, fetchImpl);
    await writeFile(outputPath, content);
  }
}

async function materializeGitHubSkillDir(lockEntry, options = {}) {
  if (lockEntry.sourceType !== 'github') {
    throw new Error(`Unsupported sourceType: ${lockEntry.sourceType}`);
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const skillDir = normalizeSkillDirFromLock(lockEntry);
  const repo = await fetchJson(`https://api.github.com/repos/${lockEntry.source}`, fetchImpl);
  const defaultBranch = repo.default_branch;

  if (!defaultBranch) {
    throw new Error(`Missing default branch for ${lockEntry.source}`);
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'update-skills-upstream-'));
  await downloadGitHubDirectory({
    source: lockEntry.source,
    skillDir,
    ref: defaultBranch,
    targetDir: tempRoot,
    fetchImpl,
  });

  return {
    dir: tempRoot,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

function sectionLabelFromLine(line) {
  const text = line.replace(/^[-+ ]/, '').trim();

  if (!text || text === '---') {
    return null;
  }

  const headingMatch = text.match(/^#{1,6}\s+(.+)$/);
  return headingMatch ? headingMatch[1].trim() : null;
}

function normalizeSummaryText(text) {
  const normalized = text
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized === '---') {
    return null;
  }

  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function addUniqueText(target, text, limit = 3) {
  const normalized = normalizeSummaryText(text);
  if (!normalized || target.includes(normalized) || target.length >= limit) {
    return;
  }

  target.push(normalized);
}

function parseMarkdownSections(text) {
  const sections = new Map();
  let currentSection = 'frontmatter / introduction';
  sections.set(currentSection, []);

  for (const line of text.split('\n')) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
    }

    sections.get(currentSection).push(line);
  }

  return sections;
}

async function buildUnifiedDiff(localPath, upstreamPath) {
  try {
    const { stdout } = await execFile('git', [
      'diff',
      '--no-index',
      '--unified=1',
      '--',
      localPath,
      upstreamPath,
    ]);
    return stdout;
  } catch (error) {
    if (typeof error?.stdout === 'string') {
      return error.stdout;
    }

    return '';
  }
}

async function summarizeSkillMarkdown(localPath, upstreamPath) {
  const [localText, upstreamText, diffText] = await Promise.all([
    readFile(localPath, 'utf8'),
    readFile(upstreamPath, 'utf8'),
    buildUnifiedDiff(localPath, upstreamPath),
  ]);

  if (localText === upstreamText) {
    return ['SKILL.md summary:', '- No instruction changes detected.'];
  }

  const touchedSections = new Set();
  const addedExamples = [];
  const removedExamples = [];
  const localSections = parseMarkdownSections(localText);
  const upstreamSections = parseMarkdownSections(upstreamText);
  let currentSection = 'frontmatter / introduction';
  let addedCount = 0;
  let removedCount = 0;

  for (const sectionName of new Set([...localSections.keys(), ...upstreamSections.keys()])) {
    const localSection = (localSections.get(sectionName) ?? []).join('\n');
    const upstreamSection = (upstreamSections.get(sectionName) ?? []).join('\n');
    if (localSection !== upstreamSection) {
      touchedSections.add(sectionName);
    }
  }

  for (const line of diffText.split('\n')) {
    if (
      !line ||
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('@@')
    ) {
      continue;
    }

    const sectionLabel = sectionLabelFromLine(line);
    if (sectionLabel) {
      currentSection = sectionLabel;
    }

    if (
      (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) &&
      !touchedSections.size
    ) {
      touchedSections.add(currentSection);
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedCount += 1;
      addUniqueText(addedExamples, line.slice(1));
      continue;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      removedCount += 1;
      addUniqueText(removedExamples, line.slice(1));
    }
  }

  const sectionText =
    touchedSections.size > 0
      ? [...touchedSections].slice(0, 4).join(', ')
      : 'frontmatter / introduction';

  return [
    'SKILL.md summary:',
    `- Sections touched: ${sectionText}.`,
    `- Upstream adds ${addedCount} changed line(s) and removes ${removedCount} changed line(s).`,
    `- Added guidance examples: ${
      addedExamples.join('; ') || 'No clear added guidance beyond wording changes.'
    }`,
    `- Removed or replaced guidance: ${
      removedExamples.join('; ') || 'No clear removed guidance beyond wording changes.'
    }`,
  ];
}

function buildOtherDifferences(localSnapshot, upstreamSnapshot) {
  const paths = [...new Set([...localSnapshot.keys(), ...upstreamSnapshot.keys()])]
    .filter((relativePath) => relativePath !== 'SKILL.md')
    .sort((left, right) => left.localeCompare(right));

  return paths.flatMap((relativePath) => {
    const localFile = localSnapshot.get(relativePath);
    const upstreamFile = upstreamSnapshot.get(relativePath);

    if (!localFile && upstreamFile) {
      return [{ path: relativePath, type: 'added' }];
    }

    if (localFile && !upstreamFile) {
      return [{ path: relativePath, type: 'removed' }];
    }

    if (localFile.sha256 !== upstreamFile.sha256) {
      return [{ path: relativePath, type: 'changed' }];
    }

    return [];
  });
}

async function compareSkillDirs(localSkillDir, upstreamSkillDir) {
  if (!(await pathExists(localSkillDir))) {
    return {
      comparison: 'missing-local',
      reason: `Missing local skill directory: ${localSkillDir}`,
    };
  }

  const [localSnapshot, upstreamSnapshot] = await Promise.all([
    readDirectorySnapshot(localSkillDir),
    readDirectorySnapshot(upstreamSkillDir),
  ]);

  const otherDifferences = buildOtherDifferences(localSnapshot, upstreamSnapshot);
  const hasLocalSkillFile = localSnapshot.has('SKILL.md');
  const hasUpstreamSkillFile = upstreamSnapshot.has('SKILL.md');
  let skillDiffers = false;
  let skillSummaryLines = ['SKILL.md summary:', '- SKILL.md is missing from one side of the compare.'];

  if (hasLocalSkillFile && hasUpstreamSkillFile) {
    skillDiffers = localSnapshot.get('SKILL.md').sha256 !== upstreamSnapshot.get('SKILL.md').sha256;
    if (skillDiffers) {
      skillSummaryLines = await summarizeSkillMarkdown(
        path.join(localSkillDir, 'SKILL.md'),
        path.join(upstreamSkillDir, 'SKILL.md')
      );
    }
  } else {
    skillDiffers = hasLocalSkillFile !== hasUpstreamSkillFile;
  }

  if (!skillDiffers && otherDifferences.length === 0) {
    return { comparison: 'current' };
  }

  return {
    comparison: 'outdated',
    skillSummaryLines,
    otherDifferences,
  };
}

async function resolveUpstreamSkillDir(lockEntry, options = {}) {
  if (typeof options.resolveUpstreamSkillDir === 'function') {
    const resolvedDir = await options.resolveUpstreamSkillDir(lockEntry, options);
    return { dir: resolvedDir, cleanup: async () => {} };
  }

  if (options.offline) {
    throw new Error('Offline mode refuses live GitHub compares without fixtures');
  }

  return materializeGitHubSkillDir(lockEntry, options);
}

export async function buildInventory(repoRoot, options = {}) {
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

  let inventory = names.map((name) => ({
    name,
    status: classifySkill(name, lockNames, localSkills),
    comparison: 'not-checked',
  }));

  if (options.skill) {
    inventory = inventory.filter((item) => item.name === options.skill);
    if (inventory.length === 0) {
      throw new Error(`Unknown skill: ${options.skill}`);
    }
  }

  if (
    options.offline &&
    typeof options.resolveUpstreamSkillDir !== 'function' &&
    inventory.some((item) => item.status === 'locked')
  ) {
    throw new Error('Offline mode refuses live GitHub compares without fixtures');
  }

  for (const item of inventory) {
    if (item.status !== 'locked') {
      continue;
    }

    const lockEntry = lockfile.skills?.[item.name];
    let upstreamRef = null;

    try {
      upstreamRef = await resolveUpstreamSkillDir(lockEntry, options);
      Object.assign(item, await compareSkillDirs(path.join(skillsRoot, item.name), upstreamRef.dir));
    } catch (error) {
      item.comparison = 'check-failed';
      item.reason = error instanceof Error ? error.message : String(error);
    } finally {
      if (upstreamRef?.cleanup) {
        await upstreamRef.cleanup();
      }
    }
  }

  return {
    repoRoot,
    lockfilePath,
    docsPath,
    localSkills: [...localSkills],
    inventory,
  };
}

export function formatTextReport(report) {
  const lines = [];
  lines.push(`Repo root: ${report.repoRoot}`);
  lines.push(`Repo-local skills: ${report.localSkills.join(', ') || '(none)'}`);
  lines.push('Inventory:');

  for (const item of report.inventory) {
    lines.push(`- ${item.name}: ${item.status} (${item.comparison})`);

    if (item.comparison === 'outdated') {
      for (const summaryLine of item.skillSummaryLines ?? []) {
        lines.push(`  ${summaryLine}`);
      }

      lines.push('  Other changed paths:');
      if ((item.otherDifferences ?? []).length === 0) {
        lines.push('  - (none)');
      } else {
        for (const difference of item.otherDifferences) {
          lines.push(`  - ${difference.type}: ${difference.path}`);
        }
      }
    }

    if (
      (item.comparison === 'check-failed' || item.comparison === 'missing-local') &&
      item.reason
    ) {
      lines.push(`  Reason: ${item.reason}`);
    }
  }

  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let parsed;

  try {
    parsed = parseArgs(argv, env);
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
    const report = await buildInventory(path.resolve(parsed.repoRoot), parsed);
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await main();
}
