import { describe, expect, it } from 'vitest';
import type { Story } from '$lib/types';
import { sharedStoryInList } from '$lib/sharedStory';

const stories = [
	{ title: 'First', cluster_number: 7 },
	{ title: 'Second', cluster_number: 3 },
] as Story[];

describe('sharedStoryInList (NEWS-140)', () => {
	it('finds a story index inside the list and misses one past its end', () => {
		expect(sharedStoryInList(stories, { storyIndex: 1 })).toBe(true);
		expect(sharedStoryInList(stories, { storyIndex: 2 })).toBe(false);
		expect(sharedStoryInList([], { storyIndex: 0 })).toBe(false);
	});

	it('looks a cluster id up by cluster number, ahead of the index', () => {
		expect(sharedStoryInList(stories, { clusterId: 7 })).toBe(true);
		expect(sharedStoryInList(stories, { clusterId: 1 })).toBe(false);
		expect(sharedStoryInList(stories, { clusterId: 99, storyIndex: 0 })).toBe(false);
	});

	it('misses when the link names no story', () => {
		expect(sharedStoryInList(stories, { storyIndex: null, clusterId: null })).toBe(false);
	});
});
