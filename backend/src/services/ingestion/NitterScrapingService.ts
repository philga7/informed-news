/**
 * Nitter Scraping Service
 * 
 * Scrapes tweets from Nitter HTML pages and normalizes them
 * into SourceRecordDTO format for the OSINT schema.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseNitterDate } from '../../utils/dateParser.js';
import { geographicExtractionService } from '../geographicExtractionService.js';
import type { IngestionService, SourceRecordDTO } from '../../types/ingestion.js';

interface NitterScrapingConfig {
  sourceId: string;
  nitterUrl: string;
}

interface ParsedTweet {
  username: string;
  fullname: string;
  content: string;
  date: Date | null;
  tweetUrl: string;
  isRetweet: boolean;
  retweetedBy?: string;
  stats: {
    comments: number;
    retweets: number;
    likes: number;
    views: number;
  };
  hasQuote: boolean;
  quoteTweetUrl?: string;
  quoteTweetContent?: string;
}

export class NitterScrapingService implements IngestionService {
  private config: NitterScrapingConfig;
  private baseUrl: string;

  constructor(config: NitterScrapingConfig) {
    this.config = config;
    // Extract base URL (protocol + hostname) from nitterUrl
    try {
      const url = new URL(config.nitterUrl);
      this.baseUrl = `${url.protocol}//${url.host}`;
    } catch (error) {
      // Fallback: try to extract manually
      const match = config.nitterUrl.match(/^(https?:\/\/[^\/]+)/);
      this.baseUrl = match ? match[1] : config.nitterUrl;
    }
  }

  /**
   * Detect language from content (basic heuristic)
   * Similar to RssIngestionService
   */
  private detectLanguage(text: string): string {
    const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a'];
    const lowerText = text.toLowerCase();
    const englishCount = englishWords.filter(word => lowerText.includes(` ${word} `)).length;
    
    return englishCount >= 3 ? 'en' : 'unknown';
  }


  /**
   * Extract tweet statistics from tweet-stats element
   */
  private extractStats($: cheerio.CheerioAPI, statsElement: any): {
    comments: number;
    retweets: number;
    likes: number;
    views: number;
  } {
    const stats = {
      comments: 0,
      retweets: 0,
      likes: 0,
      views: 0,
    };

    const statSpans = $(statsElement).find('.tweet-stat');
    statSpans.each((_, statEl) => {
      const text = $(statEl).text().trim();
      const iconContainer = $(statEl).find('.icon-container');
      
      // Check which icon is present
      if (iconContainer.find('.icon-comment').length > 0) {
        // Comments - handle numbers with commas (e.g., "2,293")
        const match = text.match(/([\d,]+)/);
        if (match) stats.comments = parseInt(match[1].replace(/,/g, ''), 10);
      } else if (iconContainer.find('.icon-retweet').length > 0) {
        // Retweets
        const match = text.match(/([\d,]+)/);
        if (match) stats.retweets = parseInt(match[1].replace(/,/g, ''), 10);
      } else if (iconContainer.find('.icon-heart').length > 0) {
        // Likes
        const match = text.match(/([\d,]+)/);
        if (match) stats.likes = parseInt(match[1].replace(/,/g, ''), 10);
      } else if (iconContainer.find('.icon-views').length > 0) {
        // Views
        const match = text.match(/([\d,]+)/);
        if (match) stats.views = parseInt(match[1].replace(/,/g, ''), 10);
      }
    });

    return stats;
  }

  /**
   * Parse a single tweet element into ParsedTweet
   */
  private parseTweet($: cheerio.CheerioAPI, tweetElement: any): ParsedTweet | null {
    try {
      const $tweet = $(tweetElement);

      // Extract tweet link and URL
      const tweetLink = $tweet.find('.tweet-link').attr('href');
      if (!tweetLink) {
        return null; // Skip if no tweet link
      }

      // Build full tweet URL
      const tweetUrl = tweetLink.startsWith('http')
        ? tweetLink
        : `${this.baseUrl}${tweetLink}`;

      // Extract username
      const usernameLink = $tweet.find('.username').first();
      const username = usernameLink.text().trim().replace('@', '') || 'unknown';

      // Extract full name
      const fullnameLink = $tweet.find('.fullname').first();
      const fullname = fullnameLink.text().trim() || username;

      // Extract content
      const contentElement = $tweet.find('.tweet-content.media-body');
      let content = contentElement.text().trim() || '';

      // Check for retweet
      const retweetHeader = $tweet.find('.retweet-header');
      const isRetweet = retweetHeader.length > 0;
      let retweetedBy: string | undefined;
      if (isRetweet) {
        const retweetText = retweetHeader.text().trim();
        // Extract username from "Username retweeted" format
        const match = retweetText.match(/^(.+?)\s+retweeted$/i);
        if (match) {
          retweetedBy = match[1].trim();
        }
      }

      // Extract date
      const dateLink = $tweet.find('.tweet-date > a').first();
      const dateTitle = dateLink.attr('title') || dateLink.text().trim();
      const date = parseNitterDate(dateTitle) || new Date(); // Fallback to current date

      // Extract stats
      const statsElement = $tweet.find('.tweet-stats').first();
      const stats = statsElement.length > 0
        ? this.extractStats($, statsElement[0])
        : { comments: 0, retweets: 0, likes: 0, views: 0 };

      // Check for quote tweet
      const quoteElement = $tweet.find('.quote.quote-big');
      const hasQuote = quoteElement.length > 0;
      let quoteTweetUrl: string | undefined;
      let quoteTweetContent: string | undefined;

      if (hasQuote) {
        const quoteLink = quoteElement.find('.quote-link').attr('href');
        if (quoteLink) {
          quoteTweetUrl = quoteLink.startsWith('http')
            ? quoteLink
            : `${this.baseUrl}${quoteLink}`;
        }
        const quoteText = quoteElement.find('.quote-text');
        quoteTweetContent = quoteText.text().trim();
        
        // Append quote tweet content to main content
        if (quoteTweetContent) {
          content += `\n\n[Quote tweet: ${quoteTweetContent}]`;
        }
      }

      return {
        username,
        fullname,
        content,
        date,
        tweetUrl,
        isRetweet,
        retweetedBy,
        stats,
        hasQuote,
        quoteTweetUrl,
        quoteTweetContent,
      };
    } catch (error) {
      console.error('Error parsing tweet:', error);
      return null;
    }
  }

  /**
   * Check if the response is a bot protection/challenge page
   */
  private isBotProtectionPage(html: string, statusCode: number): boolean {
    if (statusCode === 503) {
      return true;
    }
    
    // Check for common bot protection indicators
    const indicators = [
      'Verifying your browser',
      'Just a moment',
      'Checking your browser',
      'Please wait',
      'cloudflare',
      'challenge-platform',
    ];
    
    const lowerHtml = html.toLowerCase();
    return indicators.some(indicator => lowerHtml.includes(indicator.toLowerCase()));
  }

  /**
   * Fetch and normalize Nitter HTML page into SourceRecordDTOs
   */
  async fetchAndNormalize(): Promise<SourceRecordDTO[]> {
    try {
      console.log(`      🔗 Fetching Nitter page from: ${this.config.nitterUrl}`);

      // Fetch HTML page
      let response;
      try {
        response = await axios.get(this.config.nitterUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          timeout: 15000,
          validateStatus: (status) => status < 600, // Don't throw on 503
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          response = error.response;
        } else {
          throw error;
        }
      }

      const html = response.data || '';
      const statusCode = response.status || 500;

      // Check for bot protection
      if (this.isBotProtectionPage(html, statusCode)) {
        throw new Error(
          'Nitter instance is blocking automated requests with bot protection (Cloudflare challenge). ' +
          'This requires JavaScript execution to bypass. Consider: ' +
          '1) Using a different Nitter instance, ' +
          '2) Using a headless browser solution (Puppeteer/Playwright), or ' +
          '3) Using the RSS feed URL if available (though many instances disable RSS).'
        );
      }

      // Check for other error status codes
      if (statusCode >= 400) {
        throw new Error(`Nitter instance returned HTTP ${statusCode}: ${response.statusText || 'Error'}`);
      }

      const $ = cheerio.load(html);

      // Find all tweet items
      const tweetElements = $('.timeline-item');
      console.log(`      📰 Found ${tweetElements.length} tweet(s) on page`);

      const dtos: SourceRecordDTO[] = [];

      tweetElements.each((_, element) => {
        const parsedTweet = this.parseTweet($, element);
        
        if (!parsedTweet) {
          return; // Skip if parsing failed
        }

        // Build title (truncate content if needed)
        const titleMaxLength = 200;
        const titleContent = parsedTweet.content.length > titleMaxLength
          ? `${parsedTweet.content.substring(0, titleMaxLength)}...`
          : parsedTweet.content;
        const title = `@${parsedTweet.username}: ${titleContent}`;

        // Detect language and geographic indicators
        const fullText = `${parsedTweet.content} ${parsedTweet.quoteTweetContent || ''}`;
        const language = this.detectLanguage(fullText);
        const geographicResult = geographicExtractionService.extractLocations(fullText);
        const geographicIndicators = geographicResult.locations;

        // Build raw metadata
        const rawMetadata: Record<string, any> = {
          username: parsedTweet.username,
          fullname: parsedTweet.fullname,
          is_retweet: parsedTweet.isRetweet,
          stats: parsedTweet.stats,
          has_quote: parsedTweet.hasQuote,
          nitter_instance: this.baseUrl,
          source_url: this.config.nitterUrl,
        };

        if (parsedTweet.retweetedBy) {
          rawMetadata.retweeted_by = parsedTweet.retweetedBy;
        }

        if (parsedTweet.quoteTweetUrl) {
          rawMetadata.quote_tweet_url = parsedTweet.quoteTweetUrl;
        }

        const dto: SourceRecordDTO = {
          source_id: this.config.sourceId,
          title,
          url: parsedTweet.tweetUrl,
          content: parsedTweet.content || undefined,
          published_at: parsedTweet.date || undefined,
          language,
          geographic_indicators: geographicIndicators.length > 0 ? geographicIndicators : undefined,
          raw_metadata: rawMetadata,
        };

        dtos.push(dto);
      });

      console.log(`      ✅ Parsed ${dtos.length} tweet(s) successfully`);
      return dtos;
    } catch (error) {
      console.error('Nitter scraping error:', error);
      throw new Error(`Failed to scrape Nitter page: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

