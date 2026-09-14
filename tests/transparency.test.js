import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

describe('NEWS-32 public Transparency page', () => {
	it('defines funding, methodology, corrections, and team sections', () => {
		const src = readFileSync(
			join(root, 'apps/kite/src/lib/transparency.ts'),
			'utf8',
		);
		assert.match(src, /id: 'funding'/);
		assert.match(src, /id: 'methodology'/);
		assert.match(src, /id: 'corrections'/);
		assert.match(src, /id: 'team'/);
		assert.match(src, /AI-assisted/);
		assert.match(src, /not ground truth/i);
		assert.doesNotMatch(src, /we are an unbiased/i);
		assert.doesNotMatch(src, /perfectly unbiased/i);
		assert.match(src, /Sandiebeach LLC/);
		assert.match(src, /Phil Clapper/);
	});

	it('renders those sections on the public route without login gate', () => {
		const page = readFileSync(
			join(root, 'apps/kite/src/routes/transparency/+page.svelte'),
			'utf8',
		);
		assert.match(page, /TRANSPARENCY_SECTIONS/);
		assert.match(page, /id=\{section\.id\}/);
		assert.doesNotMatch(page, /requireApiSession/);
		assert.doesNotMatch(page, /informedcrew\.atlassian\.net\/browse\/NEWS-32/);
	});

	it('keeps methodology hard rejects in copy', () => {
		const src = readFileSync(
			join(root, 'apps/kite/src/lib/transparency.ts'),
			'utf8',
		);
		assert.match(src, /trust grids/i);
		assert.match(src, /claim verdict/i);
		assert.match(src, /spectrum/i);
		assert.match(src, /left–right/i);
	});
});
