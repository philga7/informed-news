/**
 * RSS Ingestion Service
 * 
 * Wraps existing RSS feed parsing logic and normalizes
 * RSS items into SourceRecordDTO format for the OSINT schema.
 * 
 * Optionally extracts full article content from URLs for better AI analysis.
 */

import { parseRSSFeed } from '../feedFetcher.js';
import { contentExtractor } from './ContentExtractor.js';
import type { NewsSource } from '../../types/index.js';
import type { IngestionService, SourceRecordDTO } from '../../types/ingestion.js';

interface RssIngestionConfig {
  sourceId: string;
  feedUrl: string;
  scrapeExternalUrl?: boolean;
  extractFullContent?: boolean; // Extract full article content from URLs
}

export class RssIngestionService implements IngestionService {
  private config: RssIngestionConfig;

  constructor(config: RssIngestionConfig) {
    this.config = config;
  }

  /**
   * Detect language from content (basic heuristic)
   * Can be enhanced with proper language detection libraries
   */
  private detectLanguage(text: string): string {
    // Simple heuristic: check for common English words
    const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a'];
    const lowerText = text.toLowerCase();
    const englishCount = englishWords.filter(word => lowerText.includes(` ${word} `)).length;
    
    return englishCount >= 3 ? 'en' : 'unknown';
  }

  /**
   * Extract geographic indicators from content
   * Basic implementation - can be enhanced with NER libraries
   */
  private extractGeographicIndicators(text: string): string[] {
    const indicators: string[] = [];
    const commonPlaces = [
      'United States', 'USA', 'America', 'UK', 'United Kingdom', 
      'China', 'Russia', 'Europe', 'Asia', 'Middle East',
      'Washington', 'New York', 'London', 'Moscow', 'Beijing'
    ];

    commonPlaces.forEach(place => {
      if (text.includes(place)) {
        indicators.push(place);
      }
    });

    return [...new Set(indicators)]; // Remove duplicates
  }

  /**
   * Fetch and normalize RSS feed items into SourceRecordDTOs
   */
  async fetchAndNormalize(): Promise<SourceRecordDTO[]> {
    try {
      console.log(`      🔗 Fetching RSS feed from: ${this.config.feedUrl}`);
      
      // Create a NewsSource object for the parser
      const source: NewsSource = {
        id: this.config.sourceId,
        name: 'RSS Source', // Not used by parser
        type: 'rss',
        url: this.config.feedUrl,
        enabled: true,
        createdAt: new Date().toISOString(),
        scrapeExternalUrl: this.config.scrapeExternalUrl || false,
      };

      // Parse RSS feed using existing logic
      const rssItems = await parseRSSFeed(this.config.feedUrl, source);
      console.log(`      📰 Parsed ${rssItems.length} RSS item(s) from feed`);

      // Process items in parallel with content extraction if enabled
      if (this.config.extractFullContent) {
        console.log(`      📄 Content extraction enabled (min length: 500 chars)`);
      }
      if (this.config.scrapeExternalUrl) {
        console.log(`      🔍 External URL scraping enabled`);
      }
      
      const dtos = await Promise.all(rssItems.map(async (item, index) => {
        // Start with RSS feed content
        let fullContent = [
          item.description || '',
          item.content || '',
        ].filter(Boolean).join('\n\n');

        // If content extraction is enabled and RSS content is short, fetch full article
        const minContentLength = 500; // Characters
        const originalContentLength = fullContent.length;
        if (this.config.extractFullContent && fullContent.length < minContentLength) {
          const extractedContent = await contentExtractor.extractTextOnly(item.link);
          
          if (extractedContent && extractedContent.length > fullContent.length) {
            fullContent = extractedContent;
            // Only log if we successfully extracted significantly more content
            if (extractedContent.length > originalContentLength * 1.5) {
              console.log(`      ✅ Extracted ${extractedContent.length} chars for: ${item.title.substring(0, 60)}...`);
            }
          }
        }

        const language = this.detectLanguage(fullContent || item.title);
        const geographicIndicators = this.extractGeographicIndicators(
          `${item.title} ${fullContent}`
        );

        return {
          source_id: this.config.sourceId,
          title: item.title,
          url: item.link,
          content: fullContent || undefined,
          published_at: new Date(item.pubDate),
          language,
          geographic_indicators: geographicIndicators.length > 0 ? geographicIndicators : undefined,
          raw_metadata: {
            author: item.author,
            thumbnail: item.thumbnail,
            rss_item: {
              title: item.title,
              description: item.description,
              link: item.link,
              pubDate: item.pubDate,
            },
            extracted_content_length: fullContent.length,
          },
        };
      }));

      return dtos;
    } catch (error) {
      console.error('RSS ingestion error:', error);
      throw new Error(`Failed to fetch RSS feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

