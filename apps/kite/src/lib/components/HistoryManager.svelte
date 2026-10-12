<script lang="ts">
import { browser } from '$app/environment';
import { goto, replaceState } from '$app/navigation';
import { page } from '$app/state';
import { categorySettings, displaySettings, languageSettings } from '$lib/data/settings.svelte.js';
import { dataService } from '$lib/services/dataService';
import { type NavigationParams, UrlNavigationService } from '$lib/services/urlNavigationService';

interface Props {
	batchId: string;
	dateSlug?: string | null;
	batchCreatedAt?: string | null;
	categoryId: string;
	storyIndex?: number | null;
	stories?: any[]; // Array of stories for finding story by index
	isLatestBatch?: boolean;
	isSharedView?: boolean; // Make this a bindable prop
	onNavigate?: (params: NavigationParams) => void;
}

let {
	batchId = $bindable(),
	dateSlug = $bindable(null),
	batchCreatedAt = $bindable(null),
	categoryId = $bindable(),
	storyIndex = $bindable(null),
	stories = [],
	isLatestBatch = false,
	isSharedView = $bindable(false), // Bind to parent state
	onNavigate,
}: Props = $props();

// Track the last URL we've fully processed. Plain let (not $state): writing it
// must not re-enter this component's navigation $effect (NEWS-144).
let lastProcessedUrl = '';

/** Path + query + hash — same shape as buildUrl / replaceState (not url.href). */
function pathUrl(url: URL): string {
	return url.pathname + url.search + url.hash;
}

/** Live address-bar path. replaceState updates this synchronously; SvelteKit's
 *  page.url can lag by a tick and would otherwise re-process the old shared URL. */
function livePathUrl(): string {
	return pathUrl(new URL(window.location.href));
}

// Build URL based on current state
// Language settings are stored in localStorage, not in URL
function buildUrl(params?: Partial<NavigationParams>): string {
	// Determine which batch identifier to use: dateSlug (if available) or UUID
	let batchIdentifier = params?.batchId !== undefined ? params.batchId : batchId;

	// Prefer date slug over UUID when available and not using /latest prefix
	if (dateSlug && !displaySettings.useLatestUrls) {
		batchIdentifier = dateSlug;
	}

	const targetStoryIndex = params?.storyIndex !== undefined ? params.storyIndex : storyIndex;

	// Get story data if we have a story index
	let story = null;
	if (targetStoryIndex !== null && targetStoryIndex !== undefined && stories.length > 0) {
		story = stories[targetStoryIndex];
		console.log('🔍 [HistoryManager] Looking up story:', {
			targetStoryIndex,
			storiesLength: stories.length,
			foundStory: story?.title,
			clusterId: story?.cluster_number,
		});
	}

	// In single page mode with no story on latest batch, don't include category in URL
	// But for historical batches or sequential mode, always include category
	const effectiveCategoryId = params?.categoryId !== undefined ? params.categoryId : categoryId;
	const isSinglePageMode = categorySettings.singlePageMode !== 'disabled';
	const isSequentialMode = categorySettings.singlePageMode === 'sequential';
	const shouldIncludeCategory =
		story !== null || !isSinglePageMode || !isLatestBatch || isSequentialMode;

	const navigationParams: NavigationParams = {
		batchId: batchIdentifier,
		batchDateSlug: dateSlug || undefined,
		categoryId: shouldIncludeCategory ? effectiveCategoryId : undefined,
		storyIndex: targetStoryIndex,
		// Include story data for new URL format
		clusterId: story?.cluster_number,
		storyTitle: story?.title,
		// Preserve shared view state
		isShared: params?.isShared !== undefined ? params.isShared : isSharedView,
	};

	// Use /latest URLs for the actual latest batch
	// isLatestBatch already indicates whether we're on the latest batch or not
	const useLatestPrefix = isLatestBatch;

	return UrlNavigationService.buildUrl(
		navigationParams,
		undefined, // No language in URL
		useLatestPrefix,
		batchCreatedAt,
	);
}

// Preserve overlay query params (e.g. ?view=chaos) that live outside the navigation model
function preserveOverlayParams(newUrl: string): string {
	const viewParam = new URL(window.location.href).searchParams.get('view');
	if (viewParam) {
		const separator = newUrl.includes('?') ? '&' : '?';
		return `${newUrl}${separator}view=${viewParam}`;
	}
	return newUrl;
}

// Update URL without triggering navigation
export function updateUrl(params?: Partial<NavigationParams>) {
	if (!browser) return;

	const newUrl = preserveOverlayParams(buildUrl(params));
	const currentUrl = livePathUrl();

	if (params?.isShared !== undefined) {
		isSharedView = params.isShared;
	}

	if (newUrl !== currentUrl) {
		// Props sync can race a client nav into ?shared=1 while isSharedView is
		// still false. Don't strip that live shared query — leave it for the
		// navigation effect. Exit paths pass isShared:false and may clear it.
		const live = new URL(window.location.href);
		const strippingShared =
			params?.isShared !== false &&
			live.searchParams.get('shared') === '1' &&
			!newUrl.includes('shared=1') &&
			currentUrl !== lastProcessedUrl;
		if (!strippingShared) {
			replaceState(newUrl, {});
			// Record the rewrite so a later in-app link back to currentUrl is
			// handled again (NEWS-144). Use livePathUrl shape, not page.url.href.
			lastProcessedUrl = newUrl;
		}
	}
}

// Navigate to new URL with history entry
export function navigateTo(params: Partial<NavigationParams>) {
	if (!browser) return;

	const newUrl = preserveOverlayParams(buildUrl(params));

	// Only navigate if URL actually changed
	if (newUrl !== lastProcessedUrl) {
		lastProcessedUrl = newUrl;
		goto(newUrl);
	}
}

// Track if initial load has been processed
let initialLoadProcessed = $state(false);

// Handle initial page load and browser navigation
$effect(() => {
	if (!browser) return;
	// Subscribe to SvelteKit navigations; decide from the address bar (sync).
	page.url;
	const urlString = livePathUrl();
	const expectedUrl = buildUrl();

	// In sync: remember this path so updateUrl's rewrite is not the only way
	// lastProcessedUrl advances (pathUrl matches buildUrl's relative shape).
	if (urlString === expectedUrl) {
		lastProcessedUrl = urlString;
		return;
	}
	if (urlString === lastProcessedUrl) {
		return;
	}

	// This is a real navigation (from browser back/forward or external)
	lastProcessedUrl = urlString;

	// Parse the live URL (same source as urlString)
	const params = UrlNavigationService.parseUrl(new URL(window.location.href));

	// Update shared view state from URL
	const hasStory =
		(params.storyIndex !== null && params.storyIndex !== undefined) ||
		(params.clusterId !== null && params.clusterId !== undefined);

	if (params.isShared && hasStory) {
		isSharedView = true;
	} else if (params.isShared && !hasStory) {
		// If shared=1 but no story, clean it from URL
		isSharedView = false;
		const cleanUrl = new URL(window.location.href);
		cleanUrl.searchParams.delete('shared');
		const cleanedUrlString = cleanUrl.pathname + cleanUrl.search;
		lastProcessedUrl = cleanedUrlString;
		replaceState(cleanedUrlString, {});
		return; // Don't call onNavigate for this cleanup
	} else {
		isSharedView = false;
	}

	// Handle initial load
	if (!initialLoadProcessed) {
		initialLoadProcessed = true;
	}

	// Notify parent component about navigation
	const hasParams =
		params.batchId !== undefined ||
		params.categoryId !== undefined ||
		params.storyIndex !== undefined ||
		params.clusterId !== undefined ||
		params.dataLang !== undefined ||
		params.isShared !== undefined;

	if (hasParams && onNavigate) {
		onNavigate(params);
	}
});

// Track previous props to detect actual changes
let previousBatchId = $state<string>();
let previousCategoryId = $state<string>();
let previousStoryIndex = $state<number | null>();
let previousIsLatestBatch = $state<boolean>();

// Track previous values including stories count for format normalization
let previousStoriesCount = $state(0);

// Update URL when props change (but only call updateUrl, which is idempotent)
$effect(() => {
	if (!browser || !initialLoadProcessed) return;

	// Only update URL if props actually changed
	const batchChanged = batchId !== previousBatchId;
	const categoryChanged = categoryId !== previousCategoryId;
	const storyChanged = storyIndex !== previousStoryIndex;
	const latestBatchChanged = isLatestBatch !== previousIsLatestBatch;
	const storiesLoaded = stories.length > 0 && previousStoriesCount === 0;

	if (batchChanged || categoryChanged || storyChanged || latestBatchChanged || storiesLoaded) {
		previousBatchId = batchId;
		previousCategoryId = categoryId;
		previousStoryIndex = storyIndex;
		previousIsLatestBatch = isLatestBatch;
		previousStoriesCount = stories.length;

		// Don't update URL on initial stories load if we already have a story in the URL
		// This prevents overwriting article URLs with category URLs when loading from a direct link
		if (storiesLoaded && !storyChanged && !batchChanged && !categoryChanged) {
			const parsedUrl = UrlNavigationService.parseUrl(page.url);
			// Use != null (loose equality) to catch both null and undefined
			const hasStoryInUrl = parsedUrl.storyIndex != null || parsedUrl.clusterId != null;

			if (hasStoryInUrl || isSharedView) {
				// Don't update URL - keep the original story URL or shared view state
				return;
			}
		}

		// Update URL to reflect current state
		// updateUrl() is idempotent - it won't do anything if the URL is already correct
		updateUrl();
	}
});
</script>
