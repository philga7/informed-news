import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import axios from 'axios';
import type { NewsArticle, NewsSource, RSSFeedItem } from '../types/index.js';

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'content'],
      ['media:thumbnail', 'thumbnail', { keepArray: false }],
    ],
  },
});

/**
 * Preprocess RSS/XML content to fix common XML issues
 */
function preprocessXML(xmlText: string): string {
  // Fix unescaped ampersands that are not part of valid entities
  // Match & that is NOT followed by: amp;, lt;, gt;, quot;, apos;, #digits;, or #xhex;
  return xmlText.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/gi, '&amp;');
}

/**
 * Scrapes the actual third-party URL from article pages (e.g., Citizen Free Press).
 * Finds the first external link that doesn't contain the source domain.
 * @param pageURL URL of the article page to scrape
 * @param sourceDomain Domain of the source (e.g., 'citizenfreepress.com') to exclude from results
 * @param retryCount Current retry attempt (for recursive retries)
 * @returns Resolved original article URL or original URL if scraping fails
 */
async function scrapeOriginalURL(pageURL: string, sourceDomain: string, retryCount: number = 0): Promise<string> {
  const maxRetries = 1; // Retry once on timeout
  const timeout = 15000; // 15 seconds timeout (increased from 5 seconds)

  try {
    const { data } = await axios.get(pageURL, {
      headers: { 'User-Agent': 'News Aggregator Bot' },
      timeout, // Increased timeout for slower pages
    });

    const $ = cheerio.load(data);

    // Find the first external link that doesn't contain the source domain
    const externalLink = $('a')
      .filter((_, el) => {
        const href = $(el).attr('href');
        return !!href && !href.includes(sourceDomain);
      })
      .first()
      .attr('href');

    if (externalLink) {
      // Resolve relative URLs
      try {
        return new URL(externalLink, pageURL).href;
      } catch {
        return externalLink.startsWith('http') ? externalLink : pageURL;
      }
    }

    return pageURL; // Fallback to original link if no external link found
  } catch (error) {
    // Retry on timeout errors if we haven't exceeded max retries
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED' && retryCount < maxRetries) {
      console.warn(`Timeout while scraping ${pageURL}, retrying (attempt ${retryCount + 1}/${maxRetries + 1})...`);
      return scrapeOriginalURL(pageURL, sourceDomain, retryCount + 1);
    }

    // Log other errors but don't retry
    if (axios.isAxiosError(error)) {
      // Only log non-timeout errors to reduce noise (timeouts are expected for some slow pages)
      if (error.code !== 'ECONNABORTED') {
        console.error(`Axios Error while scraping ${pageURL}:`, error.message);
      }
    } else if (error instanceof AggregateError) {
      console.error(`AggregateError while scraping ${pageURL}:`, error.errors);
    } else {
      console.error(`Unexpected Error while scraping ${pageURL}:`, error);
    }

    return pageURL; // Return original URL on error
  }
}

/**
 * Follow redirects to get the final destination URL
 * @param url Initial URL that may redirect
 * @param maxRedirects Maximum number of redirects to follow (default: 10)
 * @returns Final destination URL after following all redirects
 */
async function followRedirects(url: string, maxRedirects: number = 10): Promise<string> {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount < maxRedirects) {
    try {
      const response = await fetch(currentUrl, {
        method: 'HEAD', // Use HEAD to avoid downloading full content
        redirect: 'manual', // Manually handle redirects
      });

      // If status is a redirect (301, 302, 307, 308)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          // No Location header, return current URL
          return currentUrl;
        }

        // Resolve relative redirect URLs
        try {
          currentUrl = new URL(location, currentUrl).href;
        } catch {
          // If URL parsing fails, return current URL
          return currentUrl;
        }

        redirectCount++;
      } else {
        // Not a redirect, return the final URL
        return currentUrl;
      }
    } catch (error) {
      // If fetch fails, return the current URL we have
      console.warn(`Error following redirect for ${url}:`, error);
      return currentUrl;
    }
  }

  // Max redirects reached, return the last URL we got
  return currentUrl;
}

/**
 * Extract RSS feed URL from HTML page
 */
function extractRSSFeedFromHTML(html: string, baseUrl: string): string | null {
  // Look for RSS feed links in HTML
  const rssLinkMatch = html.match(/<link[^>]*rel=["']alternate["'][^>]*type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["']/i);
  if (rssLinkMatch && rssLinkMatch[1]) {
    const feedUrl = rssLinkMatch[1];
    // Resolve relative URLs
    if (feedUrl.startsWith('http')) {
      return feedUrl;
    } else if (feedUrl.startsWith('/')) {
      const urlObj = new URL(baseUrl);
      return `${urlObj.protocol}//${urlObj.host}${feedUrl}`;
    } else {
      const urlObj = new URL(baseUrl);
      return `${urlObj.protocol}//${urlObj.host}/${feedUrl}`;
    }
  }
  return null;
}

/**
 * Resolve article URL using scraping or redirect following based on source configuration
 * @param articleUrl Original article URL from RSS feed
 * @param source Source configuration
 * @returns Resolved final URL
 */
async function resolveArticleURL(articleUrl: string, source: NewsSource): Promise<string> {
  // Extract source domain for scraping exclusion
  let sourceDomain = '';
  try {
    const sourceUrlObj = new URL(source.url);
    sourceDomain = sourceUrlObj.hostname.replace('www.', '');
  } catch {
    // If URL parsing fails, try to extract domain manually
    sourceDomain = source.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }

  // If scraping is enabled, try scraping first
  if (source.scrapeExternalUrl) {
    const scrapedUrl = await scrapeOriginalURL(articleUrl, sourceDomain);
    // If scraping found a different URL, use it; otherwise fallback to redirect following
    if (scrapedUrl !== articleUrl) {
      return scrapedUrl;
    }
    // If scraping didn't find external link, fallback to redirect following
    return followRedirects(articleUrl);
  }

  // If scraping is disabled, use redirect following
  return followRedirects(articleUrl);
}

/**
 * Parse RSS feed using rss-parser library
 * @param url RSS feed URL
 * @param source Optional source configuration for URL resolution
 */
export async function parseRSSFeed(url: string, source?: NewsSource): Promise<RSSFeedItem[]> {
  try {
    // Fetch raw response
    const rawResponse = await fetch(url);
    const rawText = await rawResponse.text();
    const contentType = rawResponse.headers.get('content-type') || '';
    
    // Detect if response is HTML instead of RSS
    const isHTML = rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html') || contentType.includes('text/html');
    
    // If HTML, try to extract RSS feed URL
    if (isHTML) {
      const rssFeedUrl = extractRSSFeedFromHTML(rawText, url);
      if (rssFeedUrl) {
        // Recursively fetch the actual RSS feed, preserving source config
        return parseRSSFeed(rssFeedUrl, source);
      } else {
        throw new Error('URL points to HTML page but no RSS feed link found. Please use the RSS feed URL directly (usually ends with /feed/ or /rss/).');
      }
    }
    
    // Preprocess XML to fix unescaped ampersands
    const preprocessedXML = preprocessXML(rawText);
    const feed = await parser.parseString(preprocessedXML);
    const items: RSSFeedItem[] = [];

    // Process items and resolve URLs (scraping or redirects) based on source configuration
    const itemsWithResolvedUrls = await Promise.all(
      feed.items.map(async (item) => {
        if (item.title && item.link) {
          // Resolve URL using scraping or redirect following based on source config
          const finalUrl = source
            ? await resolveArticleURL(item.link, source)
            : await followRedirects(item.link); // Fallback if no source provided
          
          // Type assertion to access potentially missing properties
          const itemAny = item as any;
          return {
            title: item.title,
            description: item.contentSnippet || item.content || itemAny.description || '',
            link: finalUrl, // Use the final resolved URL
            pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
            author: item.creator || itemAny.author || undefined,
            content: item.content || itemAny['content:encoded'] || undefined,
            thumbnail: itemAny.thumbnail?.$?.url || item.enclosure?.url || undefined,
          };
        }
        return null;
      })
    );

    // Filter out null items and add to results
    itemsWithResolvedUrls.forEach((item) => {
      if (item) {
        items.push(item);
      }
    });

    return items;
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    throw new Error(`Failed to parse RSS feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch and parse article from manual URL using web scraping
 */
export async function fetchFromManualUrl(url: string): Promise<Partial<NewsArticle>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'Untitled Article';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      '';

    const imageUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      undefined;

    const author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('[rel="author"]').text() ||
      undefined;

    const publishedDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('time[datetime]').attr('datetime') ||
      $('time').attr('datetime') ||
      new Date().toISOString();

    return {
      title: title.trim(),
      description: description.trim(),
      url,
      imageUrl,
      author,
      publishedAt: publishedDate,
    };
  } catch (error) {
    console.error('Error fetching manual URL:', error);
    throw new Error(`Failed to fetch article from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch news articles from a single source
 */
export async function fetchNewsFromSource(source: NewsSource): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  try {
    if (source.type === 'rss') {
      const items = await parseRSSFeed(source.url, source);

      items.forEach((item) => {
        articles.push({
          id: `${source.id}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          title: item.title,
          description: item.description,
          url: item.link,
          imageUrl: item.thumbnail || undefined,
          author: item.author || undefined,
          publishedAt: new Date(item.pubDate).toISOString(),
          source: source.name,
          sourceId: source.id,
          content: item.content || undefined,
          isRead: false,
          isFavorite: false,
          fetchedAt: new Date().toISOString(),
        });
      });
    } else if (source.type === 'manual' || source.type === 'scrape') {
      const articleData = await fetchFromManualUrl(source.url);

      articles.push({
        id: `${source.id}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        title: articleData.title || 'Untitled',
        description: articleData.description || '',
        url: articleData.url || source.url,
        imageUrl: articleData.imageUrl,
        author: articleData.author,
        publishedAt: articleData.publishedAt || new Date().toISOString(),
        source: source.name,
        sourceId: source.id,
        isRead: false,
        isFavorite: false,
        fetchedAt: new Date().toISOString(),
      });
    }

    return articles;
  } catch (error) {
    console.error(`Error fetching from source ${source.name}:`, error);
    throw error;
  }
}

/**
 * Fetch news from all enabled sources
 */
export async function fetchAllNews(sources: NewsSource[]): Promise<{
  articles: NewsArticle[];
  errors: { sourceId: string; message: string }[];
}> {
  const enabledSources = sources.filter((s) => s.enabled);
  const articles: NewsArticle[] = [];
  const errors: { sourceId: string; message: string }[] = [];

  await Promise.allSettled(
    enabledSources.map(async (source) => {
      try {
        const sourceArticles = await fetchNewsFromSource(source);
        articles.push(...sourceArticles);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ sourceId: source.id, message: errorMessage });
      }
    })
  );

  return { articles, errors };
}

