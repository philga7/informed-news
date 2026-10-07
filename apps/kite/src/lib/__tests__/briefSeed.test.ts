import { describe, expect, it } from 'vitest';
import {
	BRIEF_SEED_LOGIN_HINT,
	BRIEF_SEED_LOGIN_HREF,
	BRIEF_SEED_LOGIN_LINK_LABEL,
	BRIEF_SEED_TOPIC_BRIEF_NOTE,
	parseUrlsFromTextarea,
} from '$lib/briefSeed';

describe('seed login copy', () => {
	it('points the login link at Topics', () => {
		expect(BRIEF_SEED_LOGIN_LINK_LABEL).toBe('Log in on Topics');
		expect(BRIEF_SEED_LOGIN_HREF).toBe('/topics');
		expect(BRIEF_SEED_LOGIN_HINT).not.toMatch(/sign in/i);
	});
});

describe('BRIEF_SEED_TOPIC_BRIEF_NOTE', () => {
	it('says the story is saved but not shown in the topic Brief yet', () => {
		expect(BRIEF_SEED_TOPIC_BRIEF_NOTE).toMatch(/saved/);
		expect(BRIEF_SEED_TOPIC_BRIEF_NOTE).toMatch(/won't appear in the topic Brief yet/);
	});
});

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
