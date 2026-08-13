/**
 * X.com Tweet Parser Utility
 * 
 * Parses tweet data from embedded timeline DOM elements.
 * Used by Phase 10 tweet selection feature.
 */

import type { TweetData } from '../types/xcom';

// ============================================================================
// SELECTORS
// ============================================================================

/**
 * CSS selectors for Twitter widget DOM elements.
 * These may need adjustment if Twitter changes their widget structure.
 */
const SELECTORS = {
  /** Tweet container in embedded timeline */
  tweetContainer: '.timeline-Tweet',
  /** Tweet text content */
  tweetText: '.timeline-Tweet-text',
  /** Tweet author info container */
  tweetAuthor: '.TweetAuthor',
  /** Author screen name (username) */
  authorScreenName: '.TweetAuthor-screenName',
  /** Tweet permalink/timestamp link */
  tweetPermalink: '.timeline-Tweet-timestamp',
  /** Media container */
  mediaContainer: '.timeline-Tweet-media',
  /** Individual media items */
  mediaItem: '.MediaCard-media',
  /** Video player container */
  videoPlayer: '.MediaCard-video',
  /** Tweet action bar (for additional context) */
  tweetActions: '.timeline-Tweet-actions',
  /** Alternative selectors for newer widget versions */
  altTweetContainer: '[data-tweet-id]',
  altTweetText: '[data-testid="tweetText"]',
} as const;

// ============================================================================
// PARSER FUNCTIONS
// ============================================================================

/**
 * Parse the author username from a tweet element
 */
function parseAuthorUsername(tweetElement: Element): string {
  // Try standard selector first
  const screenNameEl = tweetElement.querySelector(SELECTORS.authorScreenName);
  if (screenNameEl) {
    const text = screenNameEl.textContent?.trim() || '';
    // Remove @ prefix if present
    return text.startsWith('@') ? text.slice(1) : text;
  }

  // Try to extract from data attribute
  const authorLink = tweetElement.querySelector('a[href*="twitter.com/"]');
  if (authorLink) {
    const href = authorLink.getAttribute('href') || '';
    const match = href.match(/twitter\.com\/([^/]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Fallback: extract from tweet URL if present
  const permalink = tweetElement.querySelector(SELECTORS.tweetPermalink);
  if (permalink) {
    const href = permalink.getAttribute('href') || '';
    const match = href.match(/twitter\.com\/([^/]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return 'unknown';
}

/**
 * Parse the tweet text content from a tweet element
 */
function parseTweetText(tweetElement: Element): string {
  // Try standard selector
  const textEl = tweetElement.querySelector(SELECTORS.tweetText);
  if (textEl) {
    return textEl.textContent?.trim() || '';
  }

  // Try alternative selector
  const altTextEl = tweetElement.querySelector(SELECTORS.altTweetText);
  if (altTextEl) {
    return altTextEl.textContent?.trim() || '';
  }

  return '';
}

/**
 * Parse the tweet URL from a tweet element
 */
function parseTweetUrl(tweetElement: Element): string {
  // Try permalink timestamp link
  const permalink = tweetElement.querySelector(SELECTORS.tweetPermalink);
  if (permalink) {
    const href = permalink.getAttribute('href');
    if (href) {
      // Ensure full URL
      if (href.startsWith('http')) {
        return href;
      }
      return `https://twitter.com${href.startsWith('/') ? '' : '/'}${href}`;
    }
  }

  // Try data attribute
  const tweetId = tweetElement.getAttribute('data-tweet-id');
  if (tweetId) {
    const username = parseAuthorUsername(tweetElement);
    return `https://twitter.com/${username}/status/${tweetId}`;
  }

  // Try to find any link to a status
  const statusLink = tweetElement.querySelector('a[href*="/status/"]');
  if (statusLink) {
    const href = statusLink.getAttribute('href') || '';
    if (href.startsWith('http')) {
      return href;
    }
    return `https://twitter.com${href.startsWith('/') ? '' : '/'}${href}`;
  }

  return '';
}

/**
 * Parse the tweet timestamp from a tweet element
 */
function parseTweetTimestamp(tweetElement: Element): Date | undefined {
  // Try datetime attribute on timestamp link
  const permalink = tweetElement.querySelector(SELECTORS.tweetPermalink);
  if (permalink) {
    const datetime = permalink.getAttribute('datetime');
    if (datetime) {
      const date = new Date(datetime);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Try to parse from title attribute
    const title = permalink.getAttribute('title');
    if (title) {
      const date = new Date(title);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // Try time element
  const timeEl = tweetElement.querySelector('time');
  if (timeEl) {
    const datetime = timeEl.getAttribute('datetime');
    if (datetime) {
      const date = new Date(datetime);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  return undefined;
}

/**
 * Parse media URLs from a tweet element
 */
function parseMediaUrls(tweetElement: Element): string[] {
  const urls: string[] = [];

  // Find media container
  const mediaContainer = tweetElement.querySelector(SELECTORS.mediaContainer);
  if (!mediaContainer) {
    return urls;
  }

  // Find image sources
  const images = mediaContainer.querySelectorAll('img');
  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (src && !src.includes('profile_images')) {
      urls.push(src);
    }
  });

  // Find video posters/sources
  const videos = mediaContainer.querySelectorAll('video');
  videos.forEach((video) => {
    const poster = video.getAttribute('poster');
    if (poster) {
      urls.push(poster);
    }
    const source = video.querySelector('source');
    if (source) {
      const src = source.getAttribute('src');
      if (src) {
        urls.push(src);
      }
    }
  });

  return urls;
}

/**
 * Parse video links from a tweet element
 */
function parseVideoLinks(tweetElement: Element): string[] {
  const links: string[] = [];

  // Find video player elements
  const videoPlayers = tweetElement.querySelectorAll(SELECTORS.videoPlayer);
  videoPlayers.forEach((player) => {
    const video = player.querySelector('video');
    if (video) {
      const source = video.querySelector('source');
      if (source) {
        const src = source.getAttribute('src');
        if (src) {
          links.push(src);
        }
      }
    }
  });

  // Also check for native video elements
  const videos = tweetElement.querySelectorAll('video source');
  videos.forEach((source) => {
    const src = source.getAttribute('src');
    if (src && !links.includes(src)) {
      links.push(src);
    }
  });

  return links;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse tweet data from a tweet DOM element
 */
export function parseTweetFromElement(tweetElement: Element): TweetData | null {
  const text = parseTweetText(tweetElement);
  const authorUsername = parseAuthorUsername(tweetElement);
  const tweetUrl = parseTweetUrl(tweetElement);

  // Require at least URL and either text or author
  if (!tweetUrl || (!text && authorUsername === 'unknown')) {
    return null;
  }

  const tweetData: TweetData = {
    text,
    authorUsername,
    tweetUrl,
  };

  // Add optional fields if available
  const timestamp = parseTweetTimestamp(tweetElement);
  if (timestamp) {
    tweetData.timestamp = timestamp;
  }

  const mediaUrls = parseMediaUrls(tweetElement);
  if (mediaUrls.length > 0) {
    tweetData.mediaUrls = mediaUrls;
  }

  const videoLinks = parseVideoLinks(tweetElement);
  if (videoLinks.length > 0) {
    tweetData.videoLinks = videoLinks;
  }

  // Add metadata with raw element info for debugging
  tweetData.metadata = {
    parsedAt: new Date().toISOString(),
    elementClasses: tweetElement.className,
    hasMedia: mediaUrls.length > 0,
    hasVideo: videoLinks.length > 0,
  };

  return tweetData;
}

/**
 * Find all tweet elements within a container
 */
export function findTweetElements(container: Element | Document): Element[] {
  const tweets: Element[] = [];

  // Try standard selector
  const standardTweets = container.querySelectorAll(SELECTORS.tweetContainer);
  standardTweets.forEach((tweet) => tweets.push(tweet));

  // If no standard tweets found, try alternative selector
  if (tweets.length === 0) {
    const altTweets = container.querySelectorAll(SELECTORS.altTweetContainer);
    altTweets.forEach((tweet) => tweets.push(tweet));
  }

  return tweets;
}

/**
 * Parse all tweets from a container element
 */
export function parseAllTweetsFromContainer(container: Element | Document): TweetData[] {
  const elements = findTweetElements(container);
  const tweets: TweetData[] = [];

  elements.forEach((element) => {
    const tweetData = parseTweetFromElement(element);
    if (tweetData) {
      tweets.push(tweetData);
    }
  });

  return tweets;
}

/**
 * Generate a unique ID for a tweet based on its URL
 */
export function getTweetId(tweet: TweetData): string {
  // Extract status ID from URL
  const match = tweet.tweetUrl.match(/status\/(\d+)/);
  if (match && match[1]) {
    return match[1];
  }
  // Fallback: use hash of URL
  return btoa(tweet.tweetUrl).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
}

/**
 * Format tweet as Source Record title
 */
export function formatTweetAsTitle(tweet: TweetData, maxLength: number = 80): string {
  if (tweet.text) {
    const truncated = tweet.text.length > maxLength 
      ? tweet.text.slice(0, maxLength - 3) + '...'
      : tweet.text;
    return truncated;
  }
  return `Tweet by @${tweet.authorUsername}`;
}

/**
 * Format tweet as Source Record content
 */
export function formatTweetAsContent(tweet: TweetData): string {
  const parts: string[] = [];

  // Add tweet text
  if (tweet.text) {
    parts.push(tweet.text);
  }

  // Add metadata section
  parts.push('');
  parts.push('---');
  parts.push(`**Author:** @${tweet.authorUsername}`);
  parts.push(`**URL:** ${tweet.tweetUrl}`);
  
  if (tweet.timestamp) {
    parts.push(`**Posted:** ${tweet.timestamp.toISOString()}`);
  }

  // Add media info if present
  if (tweet.mediaUrls && tweet.mediaUrls.length > 0) {
    parts.push(`**Media:** ${tweet.mediaUrls.length} image(s)/media`);
  }

  if (tweet.videoLinks && tweet.videoLinks.length > 0) {
    parts.push(`**Video:** ${tweet.videoLinks.length} video(s)`);
  }

  return parts.join('\n');
}

/**
 * Format multiple tweets as combined Source Record content
 */
export function formatMultipleTweetsAsContent(tweets: TweetData[]): string {
  const parts: string[] = [];

  tweets.forEach((tweet, index) => {
    if (index > 0) {
      parts.push('');
      parts.push('---');
      parts.push('');
    }

    parts.push(`## Tweet ${index + 1} by @${tweet.authorUsername}`);
    parts.push('');
    
    if (tweet.text) {
      parts.push(tweet.text);
    }
    
    parts.push('');
    parts.push(`**URL:** ${tweet.tweetUrl}`);
    
    if (tweet.timestamp) {
      parts.push(`**Posted:** ${tweet.timestamp.toISOString()}`);
    }
  });

  return parts.join('\n');
}
