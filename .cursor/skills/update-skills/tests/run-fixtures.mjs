import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');
const checkScript = path.join(skillRoot, 'scripts', 'check.mjs');
const fixturesRoot = path.join(skillRoot, 'fixtures');
const repoRoot = path.join(fixturesRoot, 'repo');
const commands = [];

async function runNode(args) {
  commands.push(['node', ...args].join(' '));
  return execFile(process.execPath, args, {
    cwd: path.resolve(skillRoot, '..', '..', '..'),
    env: {
      ...process.env,
      UPDATE_SKILLS_OFFLINE: '0',
    },
  });
}

try {
  const { stdout: jsonStdout } = await runNode([
    checkScript,
    '--repo-root',
    repoRoot,
    '--fixtures',
    fixturesRoot,
    '--json',
  ]);
  const report = JSON.parse(jsonStdout);

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

  const outdatedSkill = report.inventory.find((item) => item.name === 'outdated-skill');
  assert.ok(outdatedSkill, 'expected outdated-skill fixture result');
  assert.match(outdatedSkill.skillSummaryLines.join('\n'), /Sections touched: Workflow/);
  assert.deepEqual(outdatedSkill.otherDifferences, [{ path: 'local-only.txt', type: 'removed' }]);

  const { stdout: textStdout } = await runNode([
    checkScript,
    '--repo-root',
    repoRoot,
    '--fixtures',
    fixturesRoot,
  ]);

  assert.match(textStdout, /current-match: locked \(current\)/);
  assert.match(textStdout, /outdated-skill: locked \(outdated\)/);
  assert.match(textStdout, /repo-local-skip: repo-local-skip \(not-checked\)/);
  assert.match(textStdout, /- removed: local-only\.txt/);
  assert.ok(
    commands.every((command) => !command.includes('apply.sh')),
    'fixture runner must not invoke apply.sh'
  );

  console.log('Fixture runner passed.');
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
