import { describe, expect, it } from 'vitest';
import {
	blurredStoryAccessibleName,
	createGgDetector,
	createKeyboardSelection,
	enterTogglesSelection,
	selectedStoryAnnouncement,
} from './keyboard';

describe('createKeyboardSelection', () => {
	it('starts with no selection and j selects the first story', () => {
		const nav = createKeyboardSelection(['a', 'b', 'c']);
		expect(nav.selectedIndex).toBe(-1);
		expect(nav.hasSelection).toBe(false);
		nav.selectNext();
		expect(nav.selectedIndex).toBe(0);
	});

	it('j clamps at the end and k clamps at the start', () => {
		const nav = createKeyboardSelection(['a', 'b']);
		nav.selectNext();
		nav.selectNext();
		nav.selectNext();
		expect(nav.selectedIndex).toBe(1);
		nav.selectPrevious();
		nav.selectPrevious();
		expect(nav.selectedIndex).toBe(0);
	});

	it('k with no selection selects the first story', () => {
		const nav = createKeyboardSelection(['a', 'b']);
		nav.selectPrevious();
		expect(nav.selectedIndex).toBe(0);
	});

	it('G selects the last story and gg the first', () => {
		const nav = createKeyboardSelection(['a', 'b', 'c']);
		nav.selectEdge('last');
		expect(nav.selectedIndex).toBe(2);
		nav.selectEdge('first');
		expect(nav.selectedIndex).toBe(0);
	});

	it('does nothing on an empty list', () => {
		const nav = createKeyboardSelection([]);
		nav.selectNext();
		nav.selectPrevious();
		nav.selectEdge('last');
		expect(nav.selectedIndex).toBe(-1);
	});

	it('follows a navigationOrder of rendered cards', () => {
		const nav = createKeyboardSelection(['a', 'b', 'c', 'd'], [3, 1]);
		nav.selectNext();
		expect(nav.selectedIndex).toBe(3);
		nav.selectNext();
		expect(nav.selectedIndex).toBe(1);
		nav.selectNext();
		expect(nav.selectedIndex).toBe(1);
		nav.selectEdge('first');
		expect(nav.selectedIndex).toBe(3);
		nav.selectEdge('last');
		expect(nav.selectedIndex).toBe(1);
	});

	it('jumps to the first rendered card when the selection is not in the order', () => {
		const nav = createKeyboardSelection(['a', 'b', 'c'], [2, 1]);
		nav.select(0);
		nav.selectNext();
		expect(nav.selectedIndex).toBe(2);
	});

	it('followStories keeps the selection on the same story key', () => {
		const nav = createKeyboardSelection(['a', 'b', 'c']);
		nav.select(1);
		nav.followStories(['c', 'b', 'a']);
		expect(nav.selectedIndex).toBe(1);
		nav.followStories(['c', 'a']);
		expect(nav.selectedIndex).toBe(-1);
		expect(nav.hasSelection).toBe(false);
	});

	it('ignores out-of-range select and clears on request', () => {
		const nav = createKeyboardSelection(['a']);
		nav.select(5);
		expect(nav.selectedIndex).toBe(-1);
		nav.select(0);
		nav.clearSelection();
		expect(nav.selectedIndex).toBe(-1);
	});
});

describe('createGgDetector', () => {
	it('fires on a second g within the window only', () => {
		const gg = createGgDetector(500);
		expect(gg('g', 1000)).toBe(false);
		expect(gg('g', 1200)).toBe(true);
		expect(gg('g', 1300)).toBe(false);
	});

	it('does not fire when too slow or interrupted by another key', () => {
		const gg = createGgDetector(500);
		gg('g', 1000);
		expect(gg('g', 1600)).toBe(false);
		gg('j', 1650);
		expect(gg('g', 1700)).toBe(false);
	});
});

describe('live-region strings', () => {
	it('announces the selected story title', () => {
		expect(selectedStoryAnnouncement('Royal row deepens')).toBe(
			'Selected story: Royal row deepens',
		);
		expect(selectedStoryAnnouncement(undefined)).toBe('Selected story: ');
	});

	it('names a blurred card by its filter keywords only', () => {
		expect(selectedStoryAnnouncement('Secret title', ['spoiler', 'leak'])).toBe(
			'Selected story: filtered (matches "spoiler", "leak")',
		);
		expect(blurredStoryAccessibleName([])).toBe('filtered');
	});
});

describe('enterTogglesSelection', () => {
	const target = (matches: boolean) => ({ closest: () => (matches ? {} : null) });

	it('toggles the selected story when nothing interactive is focused', () => {
		expect(enterTogglesSelection(true, target(false))).toBe(true);
	});

	it('leaves Enter to a focused button or link', () => {
		expect(enterTogglesSelection(true, target(true))).toBe(false);
	});

	it('does nothing without a selection', () => {
		expect(enterTogglesSelection(false, target(false))).toBe(false);
	});

	it('uses the real focus selector against the DOM', () => {
		document.body.innerHTML = '<a href="/x"><span id="s"></span></a><p id="p"></p>';
		expect(enterTogglesSelection(true, document.getElementById('s'))).toBe(false);
		expect(enterTogglesSelection(true, document.getElementById('p'))).toBe(true);
	});
});
