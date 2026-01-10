/**
 * X.com Profile Scraper
 * 
 * Uses Playwright with stealth plugins to scrape tweets from X.com profiles.
 * Implements human-like behavior with scrolling and waiting.
 */

import { chromium } from 'playwright-extra';
import type { ElementHandle } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createLogger } from './utils.js';
import { checkRateLimit, waitForDelay } from './utils.js';
import * as path from 'path';

const logger = createLogger('scraper');

// Apply stealth plugin
chromium.use(StealthPlugin());

const SESSION_FILE = path.join(process.cwd(), 'sessions', 'auth.json');

export interface Tweet {
  title: string;
  content: string;
  url: string;
  published_at: string;
  raw_metadata?: {
    engagement?: {
      likes?: number;
      retweets?: number;
      replies?: number;
      views?: number;
    };
    author?: string;
    tweet_id?: string;
  };
}

export interface ScrapeResult {
  success: boolean;
  tweets?: Tweet[];
  error?: string;
}

/**
 * Extract tweet data from a tweet element
 */
async function extractTweetData(element: ElementHandle, username: string): Promise<Tweet | null> {
  try {
    // Get tweet text content
    const textElement = await element.$('[data-testid="tweetText"]');
    if (!textElement) {
      return null;
    }

    const content = await textElement.textContent() || '';
    
    // Get tweet URL (link to the tweet)
    const timeElement = await element.$('time');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const timeParent = timeElement ? await timeElement.evaluateHandle((el: any) => el.closest('a')) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tweetUrl = timeParent 
      ? await timeParent.evaluate((el: any) => el.href as string)
      : null;

    if (!tweetUrl) {
      return null;
    }

    // Extract tweet ID from URL
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;

    // Get published date
    const publishedAt = timeElement 
      ? await timeElement.getAttribute('datetime') || new Date().toISOString()
      : new Date().toISOString();

    // Extract engagement metrics
    const engagement: NonNullable<Tweet['raw_metadata']>['engagement'] = {};

    // Try to get like count
    const likeButton = await element.$('[data-testid="like"]');
    if (likeButton) {
      const likeText = await likeButton.textContent();
      const likeMatch = likeText?.match(/(\d+(?:\.\d+)?[KMB]?)/);
      if (likeMatch) {
        engagement.likes = parseEngagementNumber(likeMatch[1]);
      }
    }

    // Try to get retweet count
    const retweetButton = await element.$('[data-testid="retweet"]');
    if (retweetButton) {
      const retweetText = await retweetButton.textContent();
      const retweetMatch = retweetText?.match(/(\d+(?:\.\d+)?[KMB]?)/);
      if (retweetMatch) {
        engagement.retweets = parseEngagementNumber(retweetMatch[1]);
      }
    }

    // Try to get reply count
    const replyButton = await element.$('[data-testid="reply"]');
    if (replyButton) {
      const replyText = await replyButton.textContent();
      const replyMatch = replyText?.match(/(\d+(?:\.\d+)?[KMB]?)/);
      if (replyMatch) {
        engagement.replies = parseEngagementNumber(replyMatch[1]);
      }
    }

    // Try to get view count (may not always be visible)
    const viewElement = await element.$('text=/\\d+\\s*Views?/i');
    if (viewElement) {
      const viewText = await viewElement.textContent();
      const viewMatch = viewText?.match(/(\d+(?:\.\d+)?[KMB]?)/);
      if (viewMatch) {
        engagement.views = parseEngagementNumber(viewMatch[1]);
      }
    }

    // Create title from first 100 characters of content
    const title = content.length > 100 ? content.substring(0, 100) + '...' : content;

    return {
      title,
      content,
      url: tweetUrl,
      published_at: publishedAt,
      raw_metadata: {
        engagement: Object.keys(engagement).length > 0 ? engagement : undefined,
        author: username,
        tweet_id: tweetId || undefined,
      },
    };
  } catch (error) {
    logger.warn('Failed to extract tweet data', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Parse engagement numbers (handles K, M, B suffixes)
 */
function parseEngagementNumber(text: string): number {
  const num = parseFloat(text);
  if (text.toUpperCase().includes('K')) {
    return Math.floor(num * 1000);
  }
  if (text.toUpperCase().includes('M')) {
    return Math.floor(num * 1000000);
  }
  if (text.toUpperCase().includes('B')) {
    return Math.floor(num * 1000000000);
  }
  return Math.floor(num);
}

/**
 * Scrape tweets from an X.com profile
 * 
 * @param username - X.com username (without @)
 * @param maxTweets - Maximum number of tweets to scrape (default: 50)
 */
export async function scrapeProfile(
  username: string,
  maxTweets: number = 50
): Promise<ScrapeResult> {
  logger.info(`Starting scrape for profile: ${username}`, { maxTweets });

  // Check rate limit before scraping
  await checkRateLimit();

  // Validate username format
  const cleanUsername = username.replace('@', '').trim();
  if (!cleanUsername) {
    return {
      success: false,
      error: 'Invalid username',
    };
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    // Load session if available
    let context;
    try {
      context = await browser.newContext({
        storageState: SESSION_FILE,
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      logger.info('Loaded existing session');
    } catch (error) {
      logger.warn('Failed to load session, creating new context', {
        error: error instanceof Error ? error.message : String(error),
      });
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
    }

    const page = await context.newPage();

    // Navigate to profile
    const profileUrl = `https://x.com/${cleanUsername}`;
    logger.info(`Navigating to profile: ${profileUrl}`);
    
    await page.goto(profileUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for tweets to load
    logger.info('Waiting for tweets to load');
    try {
      await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 });
    } catch (error) {
      // Check if profile exists or is private
      const bodyText = await page.textContent('body').catch(() => null);
      if (bodyText && (bodyText.includes('This account doesn\'t exist') || bodyText.includes('doesn\'t exist'))) {
        return {
          success: false,
          error: 'Profile does not exist',
        };
      }
      if (bodyText && (bodyText.includes('protected') || bodyText.includes('private'))) {
        return {
          success: false,
          error: 'Profile is private',
        };
      }
      return {
        success: false,
        error: 'Failed to load tweets',
      };
    }

    // Check for rate limiting or captcha
    const pageContent = await page.textContent('body').catch(() => null);
    if (pageContent && (pageContent.includes('rate limit') || pageContent.includes('Too many requests'))) {
      logger.error('Rate limit detected on X.com');
      return {
        success: false,
        error: 'Rate limit detected',
      };
    }
    if (pageContent && (pageContent.includes('captcha') || pageContent.includes('verify'))) {
      logger.error('Captcha detected on X.com');
      return {
        success: false,
        error: 'Captcha detected - manual intervention required',
      };
    }

    const tweets: Tweet[] = [];
    const seenUrls = new Set<string>();
    let scrollAttempts = 0;
    const maxScrollAttempts = 10; // Limit scrolling to avoid infinite loops

    // Scroll and collect tweets
    while (tweets.length < maxTweets && scrollAttempts < maxScrollAttempts) {
      // Get all tweet elements on current page
      const tweetElements = await page.$$('[data-testid="tweet"]');
      logger.info(`Found ${tweetElements.length} tweet elements on page`);

      // Extract data from each tweet
      for (const element of tweetElements) {
        if (tweets.length >= maxTweets) {
          break;
        }

        const tweetData = await extractTweetData(element, cleanUsername);
        if (tweetData && !seenUrls.has(tweetData.url)) {
          tweets.push(tweetData);
          seenUrls.add(tweetData.url);
          logger.debug(`Extracted tweet: ${tweetData.url}`, {
            contentLength: tweetData.content.length,
          });
        }
      }

      // Scroll down to load more tweets
      if (tweets.length < maxTweets) {
        logger.info(`Scrolling to load more tweets (${tweets.length}/${maxTweets})`);
        await page.evaluate(() => {
          // This runs in browser context where window exists
          // @ts-expect-error - window exists in browser context of page.evaluate()
          window.scrollBy(0, window.innerHeight || 1080);
        });

        // Wait for new tweets to load (human-like delay)
        await page.waitForTimeout(2000 + Math.random() * 3000); // 2-5 seconds

        // Wait for network to be idle
        try {
          await page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch {
          // Continue even if networkidle times out
        }

        scrollAttempts++;
      }
    }

    logger.info(`Scraping complete: ${tweets.length} tweets collected`, {
      username: cleanUsername,
      maxTweets,
    });

    // Wait before closing (rate limiting)
    await waitForDelay();

    return {
      success: true,
      tweets,
    };
  } catch (error) {
    logger.error('Scraping error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      username: cleanUsername,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser.close();
  }
}
