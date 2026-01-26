/**
 * X.com Tweet Checkbox Component
 * 
 * Injects checkboxes into embedded timeline tweets for selection.
 * Uses MutationObserver to detect new tweets loaded in the timeline.
 */

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { TweetData, SelectedTweet } from '../../types/xcom';
import { parseTweetFromElement, findTweetElements, getTweetId } from '../../utils/xcomTweetParser';

// ============================================================================
// CONSTANTS
// ============================================================================

const CHECKBOX_CONTAINER_CLASS = 'xcom-tweet-checkbox-container';
const CHECKBOX_INJECTED_ATTR = 'data-xcom-checkbox-injected';

// ============================================================================
// TYPES
// ============================================================================

interface XcomTweetCheckboxProps {
  /** Container element containing the embedded timeline */
  containerRef: React.RefObject<HTMLElement>;
  /** Currently selected tweets */
  selectedTweets: Map<string, SelectedTweet>;
  /** Callback when a tweet is selected/deselected */
  onTweetToggle: (tweet: SelectedTweet) => void;
  /** Whether selection is enabled */
  enabled?: boolean;
}

interface CheckboxPortal {
  id: string;
  element: HTMLDivElement;
  tweet: TweetData;
}

// ============================================================================
// CHECKBOX INJECTION LOGIC
// ============================================================================

/**
 * Create a checkbox container element to inject into a tweet
 */
function createCheckboxContainer(tweetId: string): HTMLDivElement {
  const container = document.createElement('div');
  container.className = CHECKBOX_CONTAINER_CLASS;
  container.setAttribute('data-tweet-id', tweetId);
  container.style.cssText = `
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 4px;
    padding: 4px;
    cursor: pointer;
  `;
  return container;
}

/**
 * Inject checkbox container into a tweet element
 */
function injectCheckboxIntoTweet(
  tweetElement: Element,
  tweetData: TweetData
): HTMLDivElement | null {
  // Check if already injected
  if (tweetElement.getAttribute(CHECKBOX_INJECTED_ATTR)) {
    return null;
  }

  // Ensure tweet element has relative positioning for absolute positioned checkbox
  const computedStyle = window.getComputedStyle(tweetElement);
  if (computedStyle.position === 'static') {
    (tweetElement as HTMLElement).style.position = 'relative';
  }

  const tweetId = getTweetId(tweetData);
  const container = createCheckboxContainer(tweetId);

  // Insert at the beginning of the tweet element
  tweetElement.insertBefore(container, tweetElement.firstChild);
  tweetElement.setAttribute(CHECKBOX_INJECTED_ATTR, 'true');

  return container;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Component that manages checkbox injection into embedded timeline tweets
 */
export function XcomTweetCheckbox({
  containerRef,
  selectedTweets,
  onTweetToggle,
  enabled = true,
}: XcomTweetCheckboxProps) {
  const portalsRef = useRef<CheckboxPortal[]>([]);
  const observerRef = useRef<MutationObserver | null>(null);

  /**
   * Process tweets and inject checkboxes
   */
  const processTweets = useCallback(() => {
    if (!containerRef.current || !enabled) return;

    // Find all tweet elements in the container
    const container = containerRef.current;
    
    // Look for the Twitter widget iframe
    const iframe = container.querySelector('iframe.twitter-timeline');
    
    // If there's an iframe, we can't directly access its content due to cross-origin restrictions
    // Twitter embeds use cross-origin iframes, so we need to work with what's accessible
    // For now, we'll look for tweets in the container itself
    
    const tweetElements = findTweetElements(container);
    const newPortals: CheckboxPortal[] = [];

    tweetElements.forEach((tweetElement) => {
      // Parse tweet data
      const tweetData = parseTweetFromElement(tweetElement);
      if (!tweetData) return;

      const tweetId = getTweetId(tweetData);

      // Check if checkbox already exists
      const existing = portalsRef.current.find((p) => p.id === tweetId);
      if (existing) {
        newPortals.push(existing);
        return;
      }

      // Inject new checkbox container
      const checkboxContainer = injectCheckboxIntoTweet(tweetElement, tweetData);
      if (checkboxContainer) {
        newPortals.push({
          id: tweetId,
          element: checkboxContainer,
          tweet: tweetData,
        });
      }
    });

    // Update portals ref
    portalsRef.current = newPortals;
  }, [containerRef, enabled]);

  /**
   * Set up MutationObserver to detect new tweets
   */
  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    // Initial processing
    processTweets();

    // Set up observer for dynamic content
    observerRef.current = new MutationObserver((mutations) => {
      // Check if any mutations added new nodes
      const hasNewNodes = mutations.some(
        (mutation) => mutation.addedNodes.length > 0
      );
      if (hasNewNodes) {
        // Debounce processing
        setTimeout(processTweets, 100);
      }
    });

    observerRef.current.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [containerRef, enabled, processTweets]);

  /**
   * Handle checkbox click
   */
  const handleCheckboxClick = useCallback(
    (portal: CheckboxPortal) => {
      const tweetId = portal.id;
      const isSelected = selectedTweets.has(tweetId);

      const selectedTweet: SelectedTweet = {
        ...portal.tweet,
        id: tweetId,
        combineWithOthers: false,
      };

      onTweetToggle(selectedTweet);
    },
    [selectedTweets, onTweetToggle]
  );

  // Render checkboxes via portals
  if (!enabled) return null;

  return (
    <>
      {portalsRef.current.map((portal) => {
        const isSelected = selectedTweets.has(portal.id);
        
        return createPortal(
          <label
            className="flex items-center cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleCheckboxClick(portal);
            }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleCheckboxClick(portal)}
              className="w-4 h-4 rounded border-stone-600 bg-stone-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            />
            <span className="ml-1.5 text-xs text-white font-medium">
              Select
            </span>
          </label>,
          portal.element
        );
      })}
    </>
  );
}

// ============================================================================
// STANDALONE CHECKBOX HOOK
// ============================================================================

/**
 * Hook for managing tweet selection state
 */
export function useTweetSelection() {
  const selectedTweets = useRef<Map<string, SelectedTweet>>(new Map());
  
  const toggleTweet = useCallback((tweet: SelectedTweet) => {
    const current = selectedTweets.current;
    if (current.has(tweet.id)) {
      current.delete(tweet.id);
    } else {
      current.set(tweet.id, tweet);
    }
    // Return a new Map to trigger re-render
    return new Map(current);
  }, []);

  const clearSelection = useCallback(() => {
    selectedTweets.current.clear();
    return new Map<string, SelectedTweet>();
  }, []);

  const getSelectedTweets = useCallback(() => {
    return Array.from(selectedTweets.current.values());
  }, []);

  return {
    selectedTweets: selectedTweets.current,
    toggleTweet,
    clearSelection,
    getSelectedTweets,
  };
}
