/**
 * SPA Brief keyboard and live-region helpers (NEWS-199) — consumed by NEWS-200.
 *
 * Plain TypeScript, no Svelte runes and no vitest/fetchMock imports. Import this module
 * directly (`$lib/brief/keyboard`), never through the `$lib/brief` barrel, which pulls in
 * test-only helpers. Ported behaviour comes from apps/kite `keyboardNavigation`,
 * `KeyboardNavigationHandler` and `selectedStoryAnnouncement`.
 *
 * Signatures for NEWS-200:
 *
 *   createKeyboardSelection(storyKeys: string[], navigationOrder?: number[]): KeyboardSelection
 *     .selectedIndex / .hasSelection / .totalStories   (-1 = no selection)
 *     .selectNext() (j)  .selectPrevious() (k)  .selectEdge('first' | 'last') (gg / G)
 *     .select(index)  .clearSelection()
 *     .followStories(keys, navigationOrder?)  keeps selection on the same story key
 *     navigationOrder = indices of rendered cards in on-screen order; omitted = all stories.
 *
 *   createGgDetector(windowMs = 500): (key: string, now: number) => boolean
 *     feed every keydown key; true on the second consecutive 'g' inside the window.
 *
 *   selectedStoryAnnouncement(title, blurredKeywords?): string   -> polite live-region text
 *   blurredStoryAccessibleName(keywords): string                 -> blurred card name
 *
 *   enterTogglesSelection(hasSelection, target): boolean
 *     false when focus is on a button/link, which keeps its own Enter.
 */

export const NO_SELECTION = -1;

export const INTERACTIVE_SELECTOR = 'button, a[href], [role="button"], [role="link"]';

export interface KeyboardSelection {
	readonly selectedIndex: number;
	readonly totalStories: number;
	readonly hasSelection: boolean;
	selectNext(): void;
	selectPrevious(): void;
	selectEdge(edge: 'first' | 'last'): void;
	select(index: number): void;
	clearSelection(): void;
	followStories(storyKeys: string[], navigationOrder?: number[]): void;
}

export function createKeyboardSelection(
	initialKeys: string[],
	initialOrder?: number[],
): KeyboardSelection {
	let keys = [...initialKeys];
	let order: number[] | undefined = initialOrder && [...initialOrder];
	let selected = NO_SELECTION;

	const effectiveOrder = () => order ?? keys.map((_, index) => index);

	function step(delta: 1 | -1) {
		const list = effectiveOrder();
		if (list.length === 0) return;
		const position = list.indexOf(selected);
		const next =
			position === -1 ? 0 : Math.min(Math.max(position + delta, 0), list.length - 1);
		selected = list[next];
	}

	return {
		get selectedIndex() {
			return selected;
		},
		get totalStories() {
			return keys.length;
		},
		get hasSelection() {
			return selected >= 0 && selected < keys.length;
		},
		selectNext: () => step(1),
		selectPrevious: () => step(-1),
		selectEdge(edge) {
			const list = effectiveOrder();
			if (list.length === 0) return;
			selected = edge === 'first' ? list[0] : list[list.length - 1];
		},
		select(index) {
			if (index >= 0 && index < keys.length) selected = index;
		},
		clearSelection() {
			selected = NO_SELECTION;
		},
		followStories(storyKeys, navigationOrder) {
			const selectedKey = keys[selected];
			keys = [...storyKeys];
			order = navigationOrder && [...navigationOrder];
			selected = selectedKey === undefined ? NO_SELECTION : keys.indexOf(selectedKey);
		},
	};
}

export function createGgDetector(windowMs = 500): (key: string, now: number) => boolean {
	let lastKey = '';
	let lastTime = 0;
	return (key, now) => {
		if (key === 'g' && lastKey === 'g' && now - lastTime < windowMs) {
			lastKey = '';
			return true;
		}
		lastKey = key;
		lastTime = now;
		return false;
	};
}

/** Accessible name for a content-filter-blurred card (no title or story text). */
export function blurredStoryAccessibleName(keywords: string[]): string {
	if (keywords.length === 0) return 'filtered';
	return `filtered (matches ${keywords.map((keyword) => `"${keyword}"`).join(', ')})`;
}

/** Polite live-region text for the keyboard-selected story; a blurred one is named by keywords only. */
export function selectedStoryAnnouncement(
	title: string | undefined,
	blurredKeywords?: string[],
): string {
	if (!blurredKeywords) return `Selected story: ${title ?? ''}`;
	return `Selected story: ${blurredStoryAccessibleName(blurredKeywords)}`;
}

/** Enter toggles the selected story unless a focused button or link should handle it itself. */
export function enterTogglesSelection(
	hasSelection: boolean,
	target: { closest(selector: string): unknown } | null,
): boolean {
	if (!hasSelection) return false;
	return !target?.closest(INTERACTIVE_SELECTOR);
}
