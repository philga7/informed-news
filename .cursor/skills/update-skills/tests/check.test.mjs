import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory, formatTextReport } from '../scripts/check.mjs';

async function writeFiles(rootDir, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
}

test('buildInventory reports outdated skills with summary and other changed paths', async () => {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), 'update-skills-test-'));
  const repoRoot = path.join(sandboxRoot, 'repo');
  const upstreamRoot = path.join(sandboxRoot, 'upstream', 'demo-skill');

  await writeFiles(repoRoot, {
    'skills-lock.json': JSON.stringify(
      {
        version: 1,
        skills: {
          'demo-skill': {
            source: 'example/skills',
            sourceType: 'github',
            skillPath: 'skills/demo-skill/SKILL.md',
            computedHash: 'unused-for-test',
          },
        },
      },
      null,
      2
    ),
    'docs/AGENT_SKILLS.md': `## Repo-local skills

- \`update-skills\` - repo-local
`,
    '.cursor/skills/demo-skill/SKILL.md': `# Demo Skill

## Workflow

- Read the current repository state first.
- Stop after reporting drift.
`,
    '.cursor/skills/demo-skill/changed.txt': 'local version\n',
    '.cursor/skills/demo-skill/local-only.txt': 'remove me upstream\n',
  });

  await writeFiles(upstreamRoot, {
    'SKILL.md': `# Demo Skill

## Workflow

- Read the current repository state first.
- Summarize instruction drift in 5 to 15 lines.
- Stop after reporting drift.
`,
    'changed.txt': 'upstream version\n',
    'upstream-only.txt': 'new upstream file\n',
  });

  const report = await buildInventory(repoRoot, {
    skill: 'demo-skill',
    offline: true,
    resolveUpstreamSkillDir: async () => upstreamRoot,
  });

  assert.equal(report.inventory.length, 1);

  const [item] = report.inventory;
  assert.equal(item.status, 'locked');
  assert.equal(item.comparison, 'outdated');
  assert.equal(item.skillSummaryLines[0], 'SKILL.md summary:');
  assert.ok(item.skillSummaryLines.length >= 5 && item.skillSummaryLines.length <= 15);
  assert.match(item.skillSummaryLines[1], /Sections touched: Workflow/);
  assert.deepEqual(item.otherDifferences, [
    { path: 'changed.txt', type: 'changed' },
    { path: 'local-only.txt', type: 'removed' },
    { path: 'upstream-only.txt', type: 'added' },
  ]);

  const textReport = formatTextReport(report);
  assert.match(textReport, /SKILL\.md summary:/);
  assert.match(textReport, /Other changed paths:/);
  assert.match(textReport, /- changed: changed\.txt/);
  assert.match(textReport, /- removed: local-only\.txt/);
  assert.match(textReport, /- added: upstream-only\.txt/);
});

test('offline mode refuses live compares without fixtures', async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'update-skills-offline-'));

  await writeFiles(repoRoot, {
    'skills-lock.json': JSON.stringify(
      {
        version: 1,
        skills: {
          'demo-skill': {
            source: 'example/skills',
            sourceType: 'github',
            skillPath: 'skills/demo-skill/SKILL.md',
            computedHash: 'unused-for-test',
          },
        },
      },
      null,
      2
    ),
    'docs/AGENT_SKILLS.md': `## Repo-local skills

- \`update-skills\` - repo-local
`,
    '.cursor/skills/demo-skill/SKILL.md': '# Demo Skill\n',
  });

  await assert.rejects(
    () => buildInventory(repoRoot, { skill: 'demo-skill', offline: true }),
    /Offline mode refuses live GitHub compares without fixtures/
  );
});

test('buildInventory uses fixture upstream trees in offline mode', async () => {
  const fixturesRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'fixtures'
  );
  const report = await buildInventory(path.join(fixturesRoot, 'repo'), {
    offline: true,
    fixturesRoot,
  });

  assert.deepEqual(
    report.inventory.map((item) => ({
      name: item.name,
      status: item.status,
      comparison: item.comparison,
    })),
    [
      { name: 'current-match', status: 'locked', comparison: 'current' },
      { name: 'outdated-skill', status: 'locked', comparison: 'outdated' },
      { name: 'repo-local-skip', status: 'repo-local-skip', comparison: 'not-checked' },
    ]
  );
});
