/** Shared open state for the Add-story modal (Header + StoryList empty state). */
export const briefSeedModalState = $state({
	isOpen: false,
});

export function openBriefSeedModal(): void {
	briefSeedModalState.isOpen = true;
}

export function closeBriefSeedModal(): void {
	briefSeedModalState.isOpen = false;
}
