import { beforeEach, describe, expect, it } from 'vitest';
import { keyboardNavigation } from '../keyboardNavigation.svelte';

describe('keyboardNavigation.followStories', () => {
	beforeEach(() => {
		keyboardNavigation.followStories(['seed', 'a', 'b', 'c']);
		keyboardNavigation.clearSelection();
	});

	it('keeps the selection on the same story when a story above it is removed', () => {
		keyboardNavigation.selectStory(2);
		keyboardNavigation.followStories(['a', 'b', 'c']);
		expect(keyboardNavigation.selectedIndex).toBe(1);
		expect(keyboardNavigation.hasSelection).toBe(true);
	});

	it('keeps the selection on the same story when a story is added above it', () => {
		keyboardNavigation.selectStory(3);
		keyboardNavigation.followStories(['new', 'seed', 'a', 'b', 'c']);
		expect(keyboardNavigation.selectedIndex).toBe(4);
		expect(keyboardNavigation.totalStories).toBe(5);
	});

	it('clears the selection when the selected story is gone', () => {
		keyboardNavigation.selectStory(0);
		keyboardNavigation.followStories(['a', 'b', 'c']);
		expect(keyboardNavigation.hasSelection).toBe(false);
	});

	it('leaves no selection when there was none', () => {
		keyboardNavigation.followStories(['a', 'b', 'c']);
		expect(keyboardNavigation.hasSelection).toBe(false);
		expect(keyboardNavigation.totalStories).toBe(3);
	});
});
