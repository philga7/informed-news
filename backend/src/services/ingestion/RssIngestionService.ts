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
import { contentOptimizer } from './ContentOptimizer.js';
import { mediaTypeDetector } from './MediaTypeDetector.js';
import { geographicExtractionService } from '../geographicExtractionService.js';
import { supabase } from '../../utils/supabase.js';
import type { NewsSource } from '../../types/index.js';
import type { IngestionService, SourceRecordDTO } from '../../types/ingestion.js';

interface RssIngestionConfig {
  sourceId: string;
  feedUrl: string;
  scrapeExternalUrl?: boolean;
  extractFullContent?: boolean; // Extract full article content from URLs
  sourceValueRating?: number | null; // 1-5 rating for optimization strategy
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
   * Fetch source value rating from database
   */
  private async getSourceValueRating(): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from('sources')
        .select('value_rating')
        .eq('id', this.config.sourceId)
        .single<{ value_rating: number | null }>();

      if (error || !data) {
        return this.config.sourceValueRating ?? null;
      }

      return data.value_rating ?? this.config.sourceValueRating ?? null;
    } catch (error) {
      console.warn(`Could not fetch source value rating: ${error}`);
      return this.config.sourceValueRating ?? null;
    }
  }

  /**
   * Fetch and normalize RSS feed items into SourceRecordDTOs
   */
  async fetchAndNormalize(): Promise<SourceRecordDTO[]> {
    try {
      console.log(`      🔗 Fetching RSS feed from: ${this.config.feedUrl}`);
      
      // Get source value rating for optimization strategy
      const sourceValueRating = await this.getSourceValueRating();

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

        let fullContent: string | undefined;
        let links: Array<{ url: string; text: string; context?: string }> = [];
        let headings: string[] = [];
        let contentLength = 0;

        // Handle videos: extract title only
        if (mediaType === 'video') {
          const videoTitle = await contentExtractor.extractVideoContent(item.link);
          fullContent = videoTitle || item.title;
          contentLength = fullContent.length;
        } else {
          // Handle articles: extract content with links
          // Start with RSS feed content
          let rssContent = [
            item.description || '',
            item.content || '',
          ].filter(Boolean).join('\n\n');

          // If content extraction is enabled and RSS content is short, fetch full article
          const minContentLength = 500; // Characters
          const originalContentLength = rssContent.length;
          
          if (this.config.extractFullContent && rssContent.length < minContentLength) {
            const extractedContent = await contentExtractor.extractFromUrl(item.link);
            
            if (extractedContent) {
              fullContent = extractedContent.textContent;
              links = extractedContent.links;
              headings = extractedContent.headings;
              contentLength = extractedContent.length;

              // Only log if we successfully extracted significantly more content
              if (extractedContent.length > originalContentLength * 1.5) {
                console.log(`      ✅ Extracted ${extractedContent.length} chars for: ${item.title.substring(0, 60)}...`);
              }
            } else {
              fullContent = rssContent;
              contentLength = rssContent.length;
            }
          } else {
            fullContent = rssContent;
            contentLength = rssContent.length;
          }

          // Determine optimization strategy
          const strategy = contentOptimizer.determineStrategy(
            sourceValueRating,
            contentLength,
            false, // isLinkedToTopic - will be updated later if linked
            mediaType
          );

          // Optimize content based on strategy
          if (fullContent) {
            const extractedForOptimization = {
              title: item.title,
              textContent: fullContent,
              htmlContent: '',
              excerpt: item.description || '',
              byline: item.author,
              siteName: undefined,
              length: contentLength,
              links,
              headings,
            };
            fullContent = contentOptimizer.optimizeContent(extractedForOptimization, strategy);
            contentLength = fullContent.length;
          }
        }

        const language = this.detectLanguage(fullContent || item.title);
        const geographicResult = geographicExtractionService.extractLocations(
          `${item.title} ${fullContent || ''}`
        );
        const geographicIndicators = geographicResult.locations;

        // Determine final optimization strategy for storage
        const finalStrategy = contentOptimizer.determineStrategy(
          sourceValueRating,
          contentLength,
          false,
          mediaType
        );

        // Store links in raw_metadata
        const rawMetadata: Record<string, any> = {
          author: item.author,
          thumbnail: item.thumbnail,
          rss_item: {
            title: item.title,
            description: item.description,
            link: item.link,
            pubDate: item.pubDate,
          },
          extracted_content_length: contentLength,
        };

        if (links.length > 0) {
          rawMetadata.links = links;
        }

        if (headings.length > 0) {
          rawMetadata.headings = headings;
        }

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
          content_type: finalStrategy.contentType,
          content_compressed: finalStrategy.shouldCompress,
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

