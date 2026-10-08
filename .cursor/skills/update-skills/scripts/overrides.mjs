import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, unlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const OVERRIDES_DIRNAME = 'skills-overrides';

export function overridePatchPath(repoRoot, skillName) {
  return path.join(repoRoot, OVERRIDES_DIRNAME, `${skillName}.patch`);
}

export async function readOverridePatch(repoRoot, skillName) {
  try {
    return await readFile(overridePatchPath(repoRoot, skillName), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function makeScratchDir(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

// Patches are applied in a scratch copy outside any git repository: inside a
// repo, `git apply` resolves paths against the repo root instead of cwd.
export async function applyPatchToCopy(sourceDir, patchText) {
  const scratchRoot = await makeScratchDir('update-skills-override-');
  const targetDir = path.join(scratchRoot, 'skill');
  const patchFile = path.join(scratchRoot, 'override.patch');
  await cp(sourceDir, targetDir, { recursive: true });
  await writeFile(patchFile, patchText);

  const cleanup = async () => {
    await rm(scratchRoot, { recursive: true, force: true });
  };

  try {
    await execFile('git', ['apply', '-p1', '--whitespace=nowarn', patchFile], { cwd: targetDir });
  } catch (error) {
    await cleanup();
    const detail = String(error?.stderr || error?.message || error).trim();
    return { ok: false, reason: detail };
  }

  return { ok: true, dir: targetDir, cleanup };
}

// The checker compares file contents only, and GitHub downloads lose the
// executable bit, so permission changes must not become part of an override.
function dropModeOnlyChanges(patchText) {
  const sections = patchText.split(/^(?=diff --git )/m);
  return sections
    .map((section) => section.replace(/^(old|new) mode \d+\n/gm, ''))
    .filter((section) => /^(--- |Binary files |GIT binary patch|new file mode |deleted file mode )/m.test(section))
    .join('');
}

export async function generatePatch(upstreamDir, localDir) {
  const scratchRoot = await makeScratchDir('update-skills-record-');
  try {
    await cp(upstreamDir, path.join(scratchRoot, 'a'), { recursive: true });
    await cp(localDir, path.join(scratchRoot, 'b'), { recursive: true });
    try {
      await execFile('git', ['diff', '--no-index', '--no-prefix', '--binary', 'a', 'b'], {
        cwd: scratchRoot,
        maxBuffer: 16 * 1024 * 1024,
      });
      return '';
    } catch (error) {
      if (error?.code === 1 && typeof error.stdout === 'string') {
        return dropModeOnlyChanges(error.stdout);
      }
      throw error;
    }
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

export async function writeOverridePatch(repoRoot, skillName, patchText) {
  const patchPath = overridePatchPath(repoRoot, skillName);
  if (!patchText) {
    try {
      await unlink(patchPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
    return null;
  }

  await mkdir(path.dirname(patchPath), { recursive: true });
  await writeFile(patchPath, patchText);
  return patchPath;
}

export async function replaceDirContents(targetDir, sourceDir) {
  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true });
}

export async function pathExists(targetPath) {
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
