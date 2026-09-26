import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const repoRoot = process.cwd();
const applyScript = path.join(repoRoot, '.cursor', 'skills', 'update-skills', 'scripts', 'apply.sh');

async function createSandboxRepo() {
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), 'update-skills-apply-'));
  const sandboxRepo = path.join(sandboxRoot, 'repo');

  await mkdir(path.join(sandboxRepo, '.cursor', 'skills', 'update-skills', 'scripts'), {
    recursive: true,
  });
  await mkdir(path.join(sandboxRepo, 'docs'), { recursive: true });

  await copyFile(applyScript, path.join(sandboxRepo, '.cursor', 'skills', 'update-skills', 'scripts', 'apply.sh'));
  await copyFile(
    path.join(repoRoot, '.cursor', 'skills', 'update-skills', 'scripts', 'parse-local-skills.mjs'),
    path.join(sandboxRepo, '.cursor', 'skills', 'update-skills', 'scripts', 'parse-local-skills.mjs')
  );

  await writeFile(
    path.join(sandboxRepo, 'skills-lock.json'),
    JSON.stringify(
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
    )
  );

  await writeFile(
    path.join(sandboxRepo, 'docs', 'AGENT_SKILLS.md'),
    `## Repo-local skills

- \`news-ship-loop\` - repo-local
- \`update-skills\` - repo-local
`
  );

  return sandboxRepo;
}

test('apply helper refuses without approval flag', async () => {
  await assert.rejects(
    () => execFile('bash', [applyScript, 'find-skills'], { cwd: repoRoot }),
    /Refusing to apply skills without --i-was-approved/
  );
});

test('apply helper refuses repo-local skills even when approved', async () => {
  await assert.rejects(
    () => execFile('bash', [applyScript, '--i-was-approved', 'update-skills'], { cwd: repoRoot }),
    /Refusing to apply repo-local skill: update-skills/
  );
});

test('apply helper invokes npx and consolidates agents output', async () => {
  const sandboxRepo = await createSandboxRepo();
  const fakeBinDir = path.join(sandboxRepo, 'fake-bin');
  const logFile = path.join(sandboxRepo, 'npx.log');

  await mkdir(fakeBinDir, { recursive: true });
  await writeFile(
    path.join(fakeBinDir, 'npx'),
    `#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" > "$NPX_LOG"
mkdir -p .agents/skills/demo-skill
cat > .agents/skills/demo-skill/SKILL.md <<'EOF'
---
name: demo-skill
description: Demo skill
---
EOF
printf 'from agents output\n' > .agents/skills/demo-skill/extra.txt
`
  );
  await chmod(path.join(fakeBinDir, 'npx'), 0o755);

  const fakeEnv = {
    ...process.env,
    PATH: `${fakeBinDir}:${process.env.PATH}`,
    NPX_LOG: logFile,
  };

  await execFile(
    'bash',
    [
      path.join(sandboxRepo, '.cursor', 'skills', 'update-skills', 'scripts', 'apply.sh'),
      '--i-was-approved',
      'demo-skill',
    ],
    {
      cwd: sandboxRepo,
      env: fakeEnv,
    }
  );

  assert.match(await readFile(logFile, 'utf8'), /^skills add example\/skills --skill demo-skill -a cursor --copy -y$/m);
  assert.equal(
    await readFile(path.join(sandboxRepo, '.cursor', 'skills', 'demo-skill', 'SKILL.md'), 'utf8'),
    `---
name: demo-skill
description: Demo skill
---
`
  );
  assert.equal(
    await readFile(path.join(sandboxRepo, '.cursor', 'skills', 'demo-skill', 'extra.txt'), 'utf8'),
    'from agents output\n'
  );
  await assert.rejects(() => stat(path.join(sandboxRepo, '.agents')), /ENOENT/);
});
