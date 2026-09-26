import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');
const fixturesRoot = path.join(skillRoot, 'fixtures');
const repoRoot = path.join(fixturesRoot, 'repo');
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const originalExecFile = childProcess.execFile;
const spawnedCommands = [];

function formatCommand(file, args = []) {
  return [file, ...args].join(' ');
}

function isApplyInvocation(file, args = []) {
  return (
    path.basename(file) === 'apply.sh' ||
    args.some((arg) => typeof arg === 'string' && arg.includes('apply.sh'))
  );
}

function patchedExecFile(file, args, options, callback) {
  const normalizedArgs = Array.isArray(args) ? args : [];
  const normalizedCallback =
    typeof args === 'function' ? args : typeof options === 'function' ? options : callback;

  spawnedCommands.push(formatCommand(file, normalizedArgs));

  if (isApplyInvocation(file, normalizedArgs)) {
    const error = new Error(`Fixture runner observed forbidden apply invocation: ${file}`);
    if (typeof normalizedCallback === 'function') {
      process.nextTick(() => normalizedCallback(error));
      return { kill() {} };
    }

    throw error;
  }

  return originalExecFile.call(childProcess, file, args, options, callback);
}

childProcess.execFile = patchedExecFile;
syncBuiltinESMExports();

try {
  const { buildInventory, formatTextReport } = await import('../scripts/check.mjs');
  const report = await buildInventory(repoRoot, {
    fixturesRoot,
    offline: false,
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

  const outdatedSkill = report.inventory.find((item) => item.name === 'outdated-skill');
  assert.ok(outdatedSkill, 'expected outdated-skill fixture result');
  assert.match(outdatedSkill.skillSummaryLines.join('\n'), /Sections touched: Workflow/);
  assert.deepEqual(outdatedSkill.otherDifferences, [{ path: 'local-only.txt', type: 'removed' }]);

  const textReport = formatTextReport(report);
  assert.match(textReport, /current-match: locked \(current\)/);
  assert.match(textReport, /outdated-skill: locked \(outdated\)/);
  assert.match(textReport, /repo-local-skip: repo-local-skip \(not-checked\)/);
  assert.match(textReport, /- removed: local-only\.txt/);

  assert.ok(
    spawnedCommands.some((command) => command.startsWith('git diff ')),
    'fixture runner spy should observe internal child-process work'
  );
  assert.ok(
    spawnedCommands.every((command) => !command.includes('apply.sh')),
    'fixture runner must not invoke apply.sh'
  );

  console.log('Fixture runner passed.');
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  childProcess.execFile = originalExecFile;
  syncBuiltinESMExports();
}
