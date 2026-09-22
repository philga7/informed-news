import { describe, expect, it } from 'vitest';
import { parseUrlsFromTextarea } from '$lib/briefSeed';

describe('parseUrlsFromTextarea', () => {
	it('splits lines and drops blanks', () => {
		expect(
			parseUrlsFromTextarea('https://a.example/x\n\n  https://b.example/y  \n'),
		).toEqual(['https://a.example/x', 'https://b.example/y']);
	});

	it('returns empty for blank input', () => {
		expect(parseUrlsFromTextarea('  \n  ')).toEqual([]);
	});
});
