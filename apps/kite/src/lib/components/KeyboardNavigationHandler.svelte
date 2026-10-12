<script lang="ts">
import { onMount, untrack } from 'svelte';
import { keyboardNavigation } from '$lib/stores/keyboardNavigation.svelte';
import { storyKey } from '$lib/topicBrief';
import type { Story } from '$lib/types';

interface Props {
	stories: Story[];
	currentCategory: string;
	categories: any[]; // Array of categories for navigation
	expandedStories: Record<string, boolean>;
	showSourceOverlay: boolean;
	wikipediaPopupVisible: boolean;
	settingsModalOpen: boolean;
	showSearchModal?: boolean;
	/** Indices into `stories` of the rendered cards in on-screen order (Informed News); omitted = the whole list. */
	navigationOrder?: number[];
	onStoryToggle: (storyId: string) => void;
	onToggleReadStatus?: (index: number) => void;
	onToggleSearchModal?: () => void;
	onCategoryChange?: (categoryId: string) => void;
}

let {
	stories,
	currentCategory,
	categories,
	expandedStories,
	showSourceOverlay,
	wikipediaPopupVisible,
	settingsModalOpen,
	showSearchModal = $bindable(false),
	navigationOrder,
	onStoryToggle,
	onToggleReadStatus,
	onToggleSearchModal,
	onCategoryChange,
}: Props = $props();

// Track last key press for gg combo
let lastKeyTime = 0;
let lastKey = '';

// Focus stays put on j / k so Enter / o / x / m act once; the live region names the selection.
const selectionAnnouncement = $derived(
	keyboardNavigation.hasSelection
		? `Selected story: ${stories[keyboardNavigation.selectedIndex]?.title ?? ''}`
		: '',
);

function selectStep(delta: 1 | -1) {
	if (!navigationOrder) {
		if (delta > 0) keyboardNavigation.selectNext();
		else keyboardNavigation.selectPrevious();
		return;
	}
	if (navigationOrder.length === 0) return;
	const position = navigationOrder.indexOf(keyboardNavigation.selectedIndex);
	const next =
		position === -1 ? 0 : Math.min(Math.max(position + delta, 0), navigationOrder.length - 1);
	keyboardNavigation.selectStory(navigationOrder[next]);
}

function selectEdge(edge: 'first' | 'last') {
	const order = navigationOrder ?? stories.map((_, index) => index);
	if (order.length === 0) return;
	keyboardNavigation.selectStory(edge === 'first' ? order[0] : order[order.length - 1]);
}

function scrollToSelectedStory() {
	if (!keyboardNavigation.hasSelection) return;

	// Use setTimeout to ensure DOM has updated
	setTimeout(() => {
		const storyElement = document.querySelector(
			`[data-story-index="${keyboardNavigation.selectedIndex}"]`,
		);
		if (storyElement) {
			storyElement.scrollIntoView({
				behavior: 'smooth',
				block: 'center',
			});
		}
	}, 50);
}

function handleGlobalKeyDown(event: KeyboardEvent) {
	// Don't handle shortcuts if user is typing in an input/textarea or if modals are open (except help)
	const target = event.target as HTMLElement;
	const isInputFocused =
		target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

	// Allow Escape and ? even when inputs are focused
	const allowWhenInputFocused = event.key === 'Escape' || event.key === '?';

	if (isInputFocused && !allowWhenInputFocused) {
		return;
	}

	// Cmd+K or Ctrl+K to toggle search
	if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
		event.preventDefault();
		if (onToggleSearchModal) {
			onToggleSearchModal();
		} else {
			showSearchModal = !showSearchModal;
		}
		return;
	}

	// Handle ? to toggle help (works everywhere)
	if (event.key === '?') {
		event.preventDefault();
		keyboardNavigation.toggleHelp();
		return;
	}

	// Don't handle vim-like shortcuts if certain modals are open
	if (settingsModalOpen || showSourceOverlay || wikipediaPopupVisible) {
		return;
	}

	// Close help with Escape
	if (event.key === 'Escape' && keyboardNavigation.showHelp) {
		event.preventDefault();
		keyboardNavigation.closeHelp();
		return;
	}

	// Clear selection with Escape
	if (event.key === 'Escape' && keyboardNavigation.hasSelection) {
		event.preventDefault();
		keyboardNavigation.clearSelection();
		return;
	}

	// h - Previous category (don't trigger if modifier keys are pressed)
	if (
		event.key === 'h' &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.altKey &&
		!event.shiftKey &&
		onCategoryChange &&
		categories.length > 0
	) {
		event.preventDefault();
		const currentIndex = categories.findIndex((cat) => cat.id === currentCategory);
		if (currentIndex > 0) {
			onCategoryChange(categories[currentIndex - 1].id);
		} else if (currentIndex === 0) {
			// Wrap around to last category
			onCategoryChange(categories[categories.length - 1].id);
		}
		return;
	}

	// l - Next category (don't trigger if modifier keys are pressed)
	if (
		event.key === 'l' &&
		!event.ctrlKey &&
		!event.metaKey &&
		!event.altKey &&
		!event.shiftKey &&
		onCategoryChange &&
		categories.length > 0
	) {
		event.preventDefault();
		const currentIndex = categories.findIndex((cat) => cat.id === currentCategory);
		if (currentIndex >= 0 && currentIndex < categories.length - 1) {
			onCategoryChange(categories[currentIndex + 1].id);
		} else if (currentIndex === categories.length - 1) {
			// Wrap around to first category
			onCategoryChange(categories[0].id);
		}
		return;
	}

	// Don't handle story navigation shortcuts on OnThisDay page
	if (currentCategory === 'onthisday') {
		return;
	}

	// Handle gg (go to first story)
	const now = Date.now();
	if (event.key === 'g') {
		if (lastKey === 'g' && now - lastKeyTime < 500) {
			event.preventDefault();
			selectEdge('first');
			lastKey = '';
			scrollToSelectedStory();
			return;
		}
		lastKey = 'g';
		lastKeyTime = now;
		return;
	}
	lastKey = event.key;

	// j - Next story
	if (event.key === 'j') {
		event.preventDefault();
		selectStep(1);
		scrollToSelectedStory();
		return;
	}

	// k - Previous story
	if (event.key === 'k') {
		event.preventDefault();
		selectStep(-1);
		scrollToSelectedStory();
		return;
	}

	// G - Go to last story
	if (event.key === 'G') {
		event.preventDefault();
		selectEdge('last');
		scrollToSelectedStory();
		return;
	}

	// Enter - Expand/collapse selected story; a focused button or link keeps its own Enter
	if (
		event.key === 'Enter' &&
		keyboardNavigation.hasSelection &&
		!target.closest('button, a[href], [role="button"], [role="link"]')
	) {
		event.preventDefault();
		const story = stories[keyboardNavigation.selectedIndex];
		if (story) {
			onStoryToggle(story.id || story.cluster_number?.toString() || story.title);
		}
		return;
	}

	// o - Open (expand) selected story
	if (event.key === 'o' && keyboardNavigation.hasSelection) {
		event.preventDefault();
		const story = stories[keyboardNavigation.selectedIndex];
		if (story) {
			const storyId = story.id || story.cluster_number?.toString() || story.title;
			if (!expandedStories[storyId]) {
				onStoryToggle(storyId);
			}
		}
		return;
	}

	// x - Close (collapse) selected story
	if (event.key === 'x' && keyboardNavigation.hasSelection) {
		event.preventDefault();
		const story = stories[keyboardNavigation.selectedIndex];
		if (story) {
			const storyId = story.id || story.cluster_number?.toString() || story.title;
			if (expandedStories[storyId]) {
				onStoryToggle(storyId);
			}
		}
		return;
	}

	// m - Mark as read/unread
	if (event.key === 'm' && keyboardNavigation.hasSelection && onToggleReadStatus) {
		event.preventDefault();
		onToggleReadStatus(keyboardNavigation.selectedIndex);
		return;
	}
}

onMount(() => {
	window.addEventListener('keydown', handleGlobalKeyDown);
	return () => window.removeEventListener('keydown', handleGlobalKeyDown);
});

// Pre, so the live region below never renders the story that took the selected index
$effect.pre(() => {
	const keys = stories.map(storyKey);
	untrack(() => keyboardNavigation.followStories(keys));
});

// Reset keyboard navigation when changing categories
$effect(() => {
	if (currentCategory) {
		keyboardNavigation.reset();
	}
});
</script>

<!-- No visual output: keyboard event handling plus a screen-reader-only selection announcement -->
<div class="sr-only" role="status" aria-live="polite" data-testid="keyboard-selection-announcer">
	{selectionAnnouncement}
</div>
