import { describe, expect, it } from 'vitest';
import {
	createGgDetector,
	createKeyboardSelection,
	enterTogglesSelection,
	selectedStoryAnnouncement,
} from './keyboard';

/**
 * Host contract: `followStories(keys, navigationOrder)`, then `selectNext` /
 * `selectPrevious` / `selectEdge`. `select(index)` ignores navigation order.
 */
describe('brief keyboard host', () => {
	it('j then j on navigation order [2, 0] lands on index 0', () => {
		const nav = createKeyboardSelection(['a', 'b', 'c'], [2, 0]);
		const gg = createGgDetector();
		expect(gg('j', 1_000)).toBe(false);
		nav.selectNext();
		expect(nav.selectedIndex).toBe(2);
		nav.selectNext();
		expect(nav.selectedIndex).toBe(0);
		expect(selectedStoryAnnouncement('c')).toBe('Selected story: c');
		expect(enterTogglesSelection(nav.hasSelection, { closest: () => null })).toBe(true);
	});

	it('followStories after a removal above the selection keeps the same key', () => {
		const keys = ['a', 'b', 'c'];
		const nav = createKeyboardSelection(keys, [0, 1, 2]);
		nav.selectNext();
		nav.selectNext();
		expect(keys[nav.selectedIndex]).toBe('b');
		const nextKeys = ['b', 'c'];
		nav.followStories(nextKeys, [0, 1]);
		expect(nextKeys[nav.selectedIndex]).toBe('b');
		expect(nav.hasSelection).toBe(true);
	});

	it('duplicate keys follow the first index', () => {
		const nav = createKeyboardSelection(['a', 'a', 'b']);
		nav.selectNext();
		nav.selectNext();
		expect(nav.selectedIndex).toBe(1);
		nav.followStories(['a', 'b', 'a']);
		expect(nav.selectedIndex).toBe(0);
	});
});
