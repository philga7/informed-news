/**
 * RSS Ingestion Service
 * 
 * Wraps existing RSS feed parsing logic and normalizes
 * RSS items into SourceRecordDTO format for the OSINT schema.
 * 
 * Optionally extracts full article content from URLs for better AI analysis.
 */

import { parseRSSFeed } from '../feedFetcher.js';
import { mediaTypeDetector } from './MediaTypeDetector.js';
import type { NewsSource } from '../../types/index.js';
import type { IngestionService, SourceRecordDTO } from '../../types/ingestion.js';

interface RssIngestionConfig {
  sourceId: string;
  feedUrl: string;
  scrapeExternalUrl?: boolean;
  /**
   * If true, attempts to fetch the linked URL and extract full text.
   * NOTE: This is intentionally disabled for ingestion speed and should
   * be reserved for downstream AI analysis/enrichment.
   */
  extractFullContent?: boolean;
  sourceValueRating?: number | null; // Reserved for future optimization strategies
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

      // Ingestion policy: use feed-provided content only (no fetching linked pages).
      if (this.config.extractFullContent) {
        console.log(`      ⚠️  Full-content extraction requested but is disabled for ingestion speed; using feed content only`);
      }
      if (this.config.scrapeExternalUrl) {
        console.log(`      🔍 External URL reference resolution enabled (scrape_external_url)`);
      }
      
      const dtos = await Promise.all(rssItems.map(async (item) => {
        // Detect media type from URL and metadata
        const mediaType = mediaTypeDetector.detectFromContent(
          null,
          item.link,
          {
            rss_item: {
              title: item.title,
              description: item.description,
              link: item.link,
              pubDate: item.pubDate,
              enclosure: (item as any).enclosure,
            },
          }
        );

        // Use feed content only (no URL fetching, no jsdom/Readability).
        const feedContent = [
          item.description || '',
          item.content || '',
        ].filter(Boolean).join('\n\n').trim();
        const fullContent = feedContent || undefined;
        const contentLength = fullContent ? fullContent.length : 0;

        const language = this.detectLanguage(fullContent || item.title);
        const geographicIndicators = this.extractGeographicIndicators(
          `${item.title} ${fullContent || ''}`
        );

        // Store links in raw_metadata
        const rawMetadata: Record<string, any> = {
          author: item.author,
          thumbnail: item.thumbnail,
          rss_item: {
            title: item.title,
            description: item.description,
            link: item.link,
            original_link: (item as any).original_link,
            pubDate: item.pubDate,
          },
          extracted_content_length: contentLength,
        };

        return {
          source_id: this.config.sourceId,
          title: item.title,
          url: item.link,
          content: fullContent || undefined,
          published_at: new Date(item.pubDate),
          language,
          geographic_indicators: geographicIndicators.length > 0 ? geographicIndicators : undefined,
          raw_metadata: rawMetadata,
          // Phase 1: Content optimization and media types
          media_type: mediaType,
          content_type: 'full_text' as const,
          content_compressed: false,
          content_length: contentLength,
        };
      }));

      return dtos;
    } catch (error) {
      console.error('RSS ingestion error:', error);
      throw new Error(`Failed to fetch RSS feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

