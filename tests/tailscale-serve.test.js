import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const scriptPath = join(root, 'scripts/tailscale-serve.sh');

const FIXED_STATUS = `https://vps.example.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3001
`;

function writeFakeTailscale(binDir, logPath) {
	const fakePath = join(binDir, 'tailscale');
	writeFileSync(
		fakePath,
		`#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${logPath.replace(/"/g, '\\"')}"
if [[ "$1" == "serve" && "$2" == "status" ]]; then
  cat <<'EOF'
${FIXED_STATUS}EOF
fi
`,
		{ mode: 0o755 },
	);
	chmodSync(fakePath, 0o755);
}

function runServeScript(envExtra = {}) {
	return spawnSync('bash', [scriptPath], {
		cwd: root,
		env: {
			...process.env,
			PATH: `${envExtra.binDir ?? ''}:${process.env.PATH}`,
			...envExtra,
		},
		encoding: 'utf8',
	});
}

describe('NEWS-111 Tailscale Serve setup script', () => {
	it('does not read TS_AUTHKEY, reset serve, or mention 0.0.0.0', () => {
		const source = readFileSync(scriptPath, 'utf8');
		assert.doesNotMatch(source, /TS_AUTHKEY/);
		assert.doesNotMatch(source, /serve reset/);
		assert.doesNotMatch(source, /0\.0\.0\.0/);
	});

	it('is idempotent: two runs use the same serve --bg target and print the same status', () => {
		const binDir = mkdtempSync(join(tmpdir(), 'tailscale-fake-'));
		const logPath = join(binDir, 'invocations.log');
		writeFakeTailscale(binDir, logPath);

		const first = runServeScript({ binDir });
		assert.equal(first.status, 0, first.stderr || first.stdout);
		const second = runServeScript({ binDir });
		assert.equal(second.status, 0, second.stderr || second.stdout);

		assert.equal(first.stdout, second.stdout);
		assert.equal(first.stdout, FIXED_STATUS);

		const log = readFileSync(logPath, 'utf8').trimEnd().split('\n');
		const serveBgLines = log.filter((line) => line.startsWith('serve --bg '));
		assert.deepEqual(serveBgLines, [
			'serve --bg http://127.0.0.1:3001',
			'serve --bg http://127.0.0.1:3001',
		]);
		assert.deepEqual(log, [
			'serve --bg http://127.0.0.1:3001',
			'serve status',
			'serve --bg http://127.0.0.1:3001',
			'serve status',
		]);
	});
});
