import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('NEWS-109 .dockerignore keeps secrets and scratch dirs out of the image', () => {
	it('contains the required patterns as their own lines', () => {
		const contents = readFileSync(join(root, '.dockerignore'), 'utf8');
		const lines = contents.split('\n');
		const requiredPatterns = [
			'**/.env',
			'**/.env.*',
			'!**/.env.example',
			'mvp/data',
			'**/node_modules',
			'.git',
		];
		for (const pattern of requiredPatterns) {
			const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const lineAnchored = new RegExp(`^${escaped}$`, 'm');
			assert.match(lines.join('\n'), lineAnchored, `missing required line: ${pattern}`);
		}
	});

	it('excludes local SSH keys and the scratch .superpowers dir', () => {
		const contents = readFileSync(join(root, '.dockerignore'), 'utf8');
		const lines = contents.split('\n').map((line) => line.trim());
		assert.ok(lines.includes('informed_news'), 'missing informed_news key line');
		assert.ok(lines.includes('informed_news.pub'), 'missing informed_news.pub key line');
		assert.ok(lines.includes('.superpowers'), 'missing .superpowers scratch dir line');
	});
});
