import { SvelteMap } from 'svelte/reactivity';

/** A content-filter-blurred card that hasn't been revealed yet. */
export type BlurredStory = { keywords: string[]; reveal: () => void };

/**
 * Blurred story cards by story key, so keyboard selection can announce and reveal
 * one without reading out the title the blur hides.
 */
class BlurredStoriesStore {
	private cards = new SvelteMap<string, BlurredStory>();

	/** Returns the unregister function. */
	register(key: string, card: BlurredStory): () => void {
		this.cards.set(key, card);
		return () => {
			if (this.cards.get(key) === card) this.cards.delete(key);
		};
	}

	get(key: string): BlurredStory | undefined {
		return this.cards.get(key);
	}
}

export const blurredStories = new BlurredStoriesStore();

/** Live-region text for the keyboard-selected story; a blurred one is named by its filter keywords only. */
export function selectedStoryAnnouncement(
	title: string | undefined,
	blurredKeywords?: string[],
): string {
	if (!blurredKeywords) return `Selected story: ${title ?? ''}`;
	return `Selected story: ${blurredStoryAccessibleName(blurredKeywords)}`;
}

/** Accessible name for a content-filter-blurred card (no title or story text) — NEWS-148. */
export function blurredStoryAccessibleName(keywords: string[]): string {
	if (keywords.length === 0) return 'filtered';
	return `filtered (matches ${keywords.map((keyword) => `"${keyword}"`).join(', ')})`;
}
