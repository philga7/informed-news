import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildInventory, formatTextReport } from '../scripts/check.mjs';
import { recordOverride } from '../scripts/record-override.mjs';

const execFile = promisify(execFileCallback);
const scriptsDir = path.join(process.cwd(), '.cursor', 'skills', 'update-skills', 'scripts');

const UPSTREAM_SKILL = `# Demo Skill

## Setup

- Read the plan.

## Waiting

- Wait in bounded stretches.

## Finish

- Report results.
`;

const LOCAL_EDIT = UPSTREAM_SKILL.replace(
  '- Wait in bounded stretches.',
  '- End your turn; never wait on a timer.'
);

async function writeFiles(rootDir, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
}

async function createSandbox({ upstreamSkill = UPSTREAM_SKILL, localSkill = LOCAL_EDIT } = {}) {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), 'update-skills-overrides-'));
  const repoRoot = path.join(sandboxRoot, 'repo');
  const fixturesRoot = path.join(sandboxRoot, 'fixtures');

  await writeFiles(repoRoot, {
    'skills-lock.json': JSON.stringify({
      version: 1,
      skills: {
        'demo-skill': {
          source: 'example/skills',
          sourceType: 'github',
          skillPath: 'skills/demo-skill/SKILL.md',
          computedHash: 'unused-for-test',
        },
      },
    }),
    'docs/AGENT_SKILLS.md': '## Repo-local skills\n\n- `update-skills` - repo-local\n',
    '.cursor/skills/demo-skill/SKILL.md': localSkill,
  });
  await writeFiles(fixturesRoot, { 'upstream/demo-skill/SKILL.md': upstreamSkill });

  return { repoRoot, fixturesRoot };
}

async function setUpstream(fixturesRoot, content) {
  await writeFile(path.join(fixturesRoot, 'upstream', 'demo-skill', 'SKILL.md'), content);
}

async function check(repoRoot, fixturesRoot) {
  const report = await buildInventory(repoRoot, { skill: 'demo-skill', offline: true, fixturesRoot });
  return { item: report.inventory[0], text: formatTextReport(report) };
}

test('without an override, a local edit reports as outdated', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox();
  const { item } = await check(repoRoot, fixturesRoot);
  assert.equal(item.comparison, 'outdated');
  assert.equal(item.localOverride, undefined);
});

test('a recorded override makes the edited skill report as current', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox();
  const written = await recordOverride(repoRoot, 'demo-skill', { fixturesRoot, offline: true });
  assert.equal(written, path.join(repoRoot, 'skills-overrides', 'demo-skill.patch'));
  assert.match(await readFile(written, 'utf8'), /\+- End your turn; never wait on a timer\./);

  const { item, text } = await check(repoRoot, fixturesRoot);
  assert.equal(item.comparison, 'current');
  assert.equal(item.localOverride, 'skills-overrides/demo-skill.patch');
  assert.match(text, /demo-skill: locked \(current, local override skills-overrides\/demo-skill\.patch\)/);
});

test('upstream changes elsewhere still report as outdated, diffed past the override', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox();
  await recordOverride(repoRoot, 'demo-skill', { fixturesRoot, offline: true });
  await setUpstream(fixturesRoot, UPSTREAM_SKILL.replace('- Report results.', '- Report results with evidence.'));

  const { item, text } = await check(repoRoot, fixturesRoot);
  assert.equal(item.comparison, 'outdated');
  const summary = item.skillSummaryLines.join('\n');
  assert.match(summary, /Report results with evidence/);
  assert.doesNotMatch(summary, /bounded stretches|never wait on a timer/);
  assert.match(text, /Diff below is against upstream with the local override applied\./);
});

test('upstream changes to the overridden lines report an override conflict', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox();
  await recordOverride(repoRoot, 'demo-skill', { fixturesRoot, offline: true });
  await setUpstream(fixturesRoot, UPSTREAM_SKILL.replace('- Wait in bounded stretches.', '- Poll every minute.'));

  const { item, text } = await check(repoRoot, fixturesRoot);
  assert.equal(item.comparison, 'override-conflict');
  assert.match(item.reason, /Local override no longer applies to upstream/);
  assert.match(text, /Reason: Local override no longer applies/);
});

test('permission-only differences are not recorded as overrides', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox({ localSkill: UPSTREAM_SKILL });
  await writeFiles(repoRoot, { '.cursor/skills/demo-skill/run.sh': 'echo hi\n' });
  await writeFiles(fixturesRoot, { 'upstream/demo-skill/run.sh': 'echo hi\n' });
  await chmod(path.join(repoRoot, '.cursor', 'skills', 'demo-skill', 'run.sh'), 0o755);

  assert.equal(await recordOverride(repoRoot, 'demo-skill', { fixturesRoot, offline: true }), null);
});

test('recording a skill that matches upstream removes any old override', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox({ localSkill: UPSTREAM_SKILL });
  await writeFiles(repoRoot, { 'skills-overrides/demo-skill.patch': 'stale\n' });

  assert.equal(await recordOverride(repoRoot, 'demo-skill', { fixturesRoot, offline: true }), null);
  await assert.rejects(() => stat(path.join(repoRoot, 'skills-overrides', 'demo-skill.patch')), /ENOENT/);
});

async function installApplyScripts(repoRoot) {
  const targetDir = path.join(repoRoot, '.cursor', 'skills', 'update-skills', 'scripts');
  await mkdir(targetDir, { recursive: true });
  for (const name of ['apply.sh', 'check.mjs', 'overrides.mjs', 'parse-local-skills.mjs']) {
    await copyFile(path.join(scriptsDir, name), path.join(targetDir, name));
  }
  return path.join(targetDir, 'apply.sh');
}

async function fakeNpxWriting(repoRoot, content) {
  const fakeBinDir = path.join(repoRoot, '..', 'fake-bin');
  await mkdir(fakeBinDir, { recursive: true });
  await writeFile(path.join(repoRoot, '..', 'npx-skill.md'), content);
  await writeFile(
    path.join(fakeBinDir, 'npx'),
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p .agents/skills/demo-skill
cp ../npx-skill.md .agents/skills/demo-skill/SKILL.md
`
  );
  await chmod(path.join(fakeBinDir, 'npx'), 0o755);
  return fakeBinDir;
}

test('apply re-applies a recorded override after refreshing from upstream', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox();
  await recordOverride(repoRoot, 'demo-skill', { fixturesRoot, offline: true });
  const newUpstream = UPSTREAM_SKILL.replace('- Report results.', '- Report results with evidence.');
  await setUpstream(fixturesRoot, newUpstream);
  const applyScript = await installApplyScripts(repoRoot);
  const fakeBinDir = await fakeNpxWriting(repoRoot, newUpstream);

  const { stdout } = await execFile('bash', [applyScript, '--i-was-approved', 'demo-skill'], {
    cwd: repoRoot,
    env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH}`, UPDATE_SKILLS_FIXTURES: fixturesRoot },
  });

  assert.match(stdout, /Re-applied local override: skills-overrides\/demo-skill\.patch/);
  const refreshed = await readFile(path.join(repoRoot, '.cursor', 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
  assert.match(refreshed, /Report results with evidence/);
  assert.match(refreshed, /never wait on a timer/);
});

test('apply refuses up front when the override conflicts with upstream', async () => {
  const { repoRoot, fixturesRoot } = await createSandbox();
  await recordOverride(repoRoot, 'demo-skill', { fixturesRoot, offline: true });
  const conflicting = UPSTREAM_SKILL.replace('- Wait in bounded stretches.', '- Poll every minute.');
  await setUpstream(fixturesRoot, conflicting);
  const applyScript = await installApplyScripts(repoRoot);
  const fakeBinDir = await fakeNpxWriting(repoRoot, conflicting);

  await assert.rejects(
    () =>
      execFile('bash', [applyScript, '--i-was-approved', 'demo-skill'], {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH}`, UPDATE_SKILLS_FIXTURES: fixturesRoot },
      }),
    /Refusing to refresh demo-skill/
  );
  assert.equal(
    await readFile(path.join(repoRoot, '.cursor', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    LOCAL_EDIT
  );
});
