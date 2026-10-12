/** Shared article view (`?shared=1`): whether the linked story exists, and the not-found copy (NEWS-140). */

import type { NavigationParams } from '$lib/services/urlNavigationService';
import type { Story } from '$lib/types';

export const SHARED_STORY_NOT_FOUND =
	"The shared story couldn't be found, so you're seeing the latest stories.";

/** Same order as the URL navigation lookup: cluster id first, then story index. */
export function sharedStoryInList(
	stories: Story[],
	{ clusterId, storyIndex }: Pick<NavigationParams, 'clusterId' | 'storyIndex'>,
): boolean {
	if (clusterId !== null && clusterId !== undefined) {
		return stories.some((story) => story.cluster_number === clusterId);
	}
	if (storyIndex !== null && storyIndex !== undefined) {
		return stories[storyIndex] !== undefined;
	}
	return false;
}
