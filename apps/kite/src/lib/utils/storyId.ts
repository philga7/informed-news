import type { Story } from "$lib/types";

/**
 * Generate a unique story identifier
 * This should be the single source of truth for story ID generation
 */
export function generateStoryId(
  story: Story,
  currentBatchId?: string,
  categoryId?: string,
): string {
  if (story.cluster_number !== undefined && currentBatchId && categoryId) {
    return `${currentBatchId}:${categoryId}:${story.cluster_number}`;
  }
  if (currentBatchId && categoryId) {
    return `${currentBatchId}:${categoryId}:title:${story.title.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_")}`;
  }
  // This should only happen during initial load before batch ID is set
  console.warn(
    "generateStoryId called before currentBatchId/categoryId is available:",
    story.title,
  );
  return `legacy:${story.title.slice(0, 50).replace(/[^a-zA-Z0-9]/g, "_")}`;
}
