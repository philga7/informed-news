/** Shared article view (`?shared=1`) story lookup and copy (NEWS-140). */

import type { Story } from '$lib/types';

export const SHARED_STORY_NOT_FOUND =
	"The shared story couldn't be found, so you're seeing the latest stories.";

export interface SharedStoryTarget {
	expandedStories: Record<string, boolean>;
	sharedArticleIndex: number | null;
	sharedClusterId: number | null;
}

/** The story a shared link points at: the expanded story, else the URL index, else the cluster id. */
export function findSharedStory<T extends Story>(
	stories: T[],
	{ expandedStories, sharedArticleIndex, sharedClusterId }: SharedStoryTarget,
): T | undefined {
	const expandedStoryId = Object.keys(expandedStories).find((id) => expandedStories[id]);
	if (expandedStoryId) {
		return stories.find(
			(s) =>
				s.id === expandedStoryId ||
				s.cluster_number?.toString() === expandedStoryId ||
				s.title === expandedStoryId,
		);
	}
	if (sharedArticleIndex !== null && stories[sharedArticleIndex]) {
		return stories[sharedArticleIndex];
	}
	if (sharedClusterId !== null) {
		return stories.find((s) => s.cluster_number === sharedClusterId);
	}
	return undefined;
}
