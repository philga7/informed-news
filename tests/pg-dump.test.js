import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const script = join(root, 'scripts/pg-dump.sh');

describe('NEWS-224 nightly pg_dump', () => {
	it('refuses to run without the directory that already holds the JSON tarball', () => {
		const result = spawnSync(script, [], { encoding: 'utf8' });
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /usage: scripts\/pg-dump\.sh DIRECTORY/);
	});

	it('refuses a missing directory and writes no dump file', () => {
		const parent = mkdtempSync(join(tmpdir(), 'informed-news-dump-'));
		const missing = join(parent, 'does-not-exist');
		const result = spawnSync(script, [missing], { encoding: 'utf8' });
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /backup directory does not exist/);
		assert.deepEqual(readdirSync(parent), []);
	});

	it('names the dump beside the given directory and does not pick a VPS path', () => {
		const text = readFileSync(script, 'utf8');
		assert.match(text, /informed-news-\$\{day\}\.sql/);
		assert.match(text, /docker compose exec -T postgres pg_dump/);
		assert.match(text, /-U informed_news/);
		assert.doesNotMatch(text, /\/opt\/informed-news\/backups/);
		assert.doesNotMatch(text, /\/var\/backups/);
		assert.match(readFileSync(join(root, 'docs/RUNBOOK.md'), 'utf8'), /informed-news-YYYY-MM-DD\.sql/);
	});
});
