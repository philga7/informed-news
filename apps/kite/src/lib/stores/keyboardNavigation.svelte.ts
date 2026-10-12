/**
 * Keyboard navigation store for vim-like shortcuts
 * Supports j/k navigation, enter to expand/collapse, m to mark as read, ? for help
 */

interface KeyboardNavigationState {
	enabled: boolean;
	selectedIndex: number;
	totalStories: number;
	showHelp: boolean;
}

class KeyboardNavigationStore {
	private state = $state<KeyboardNavigationState>({
		enabled: true,
		selectedIndex: -1, // -1 means no selection
		totalStories: 0,
		showHelp: false,
	});

	// Getters
	get enabled() {
		return this.state.enabled;
	}

	get selectedIndex() {
		return this.state.selectedIndex;
	}

	get totalStories() {
		return this.state.totalStories;
	}

	get showHelp() {
		return this.state.showHelp;
	}

	get hasSelection() {
		return this.state.selectedIndex >= 0 && this.state.selectedIndex < this.state.totalStories;
	}

	// Setters
	setEnabled(enabled: boolean) {
		this.state.enabled = enabled;
	}

	/** The list changed under the selection: keep it on the same story key, or clear it if that story is gone. */
	followStories(previousKeys: string[], nextKeys: string[]) {
		const selectedKey = previousKeys[this.state.selectedIndex];
		this.state.totalStories = nextKeys.length;
		this.state.selectedIndex = selectedKey === undefined ? -1 : nextKeys.indexOf(selectedKey);
	}

	// Navigation methods
	selectNext() {
		if (this.state.totalStories === 0) return;

		if (this.state.selectedIndex < this.state.totalStories - 1) {
			this.state.selectedIndex++;
		}
	}

	selectPrevious() {
		if (this.state.totalStories === 0) return;

		if (this.state.selectedIndex > 0) {
			this.state.selectedIndex--;
		} else if (this.state.selectedIndex === -1 && this.state.totalStories > 0) {
			// If nothing selected, select first story
			this.state.selectedIndex = 0;
		}
	}

	selectStory(index: number) {
		if (index >= 0 && index < this.state.totalStories) {
			this.state.selectedIndex = index;
		}
	}

	clearSelection() {
		this.state.selectedIndex = -1;
	}

	// Help modal
	toggleHelp() {
		this.state.showHelp = !this.state.showHelp;
	}

	openHelp() {
		this.state.showHelp = true;
	}

	closeHelp() {
		this.state.showHelp = false;
	}

	// Reset state (e.g., when changing categories)
	reset() {
		this.state.selectedIndex = -1;
	}
}

export const keyboardNavigation = new KeyboardNavigationStore();
