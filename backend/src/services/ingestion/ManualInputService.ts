/**
 * Manual Input Service
 * 
 * Handles manual content submission via API.
 * Creates or finds a 'manual' type source and normalizes input
 * into SourceRecordDTO format.
 */

import { supabase } from '../../utils/supabase.js';
import { contentOptimizer } from './ContentOptimizer.js';
import { mediaTypeDetector } from './MediaTypeDetector.js';
import type { IngestionService, SourceRecordDTO } from '../../types/ingestion.js';

interface ManualInputConfig {
  organizationId: string;
  title: string;
  content: string;
  url?: string;
  sourceName?: string;
  language?: string;
  publishedAt?: Date;
}

export class ManualInputService implements IngestionService {
  private config: ManualInputConfig;
  private sourceId?: string;

  constructor(config: ManualInputConfig) {
    this.config = config;
  }

  /**
   * Find or create a manual source for this organization
   */
  private async getOrCreateManualSource(): Promise<string> {
    const sourceName = this.config.sourceName || 'Manual Input';

    // Try to find existing manual source with this name
    const { data: existing, error: findError } = await supabase
      .from('sources')
      .select('id')
      .eq('organization_id', this.config.organizationId)
      .eq('source_type', 'manual')
      .eq('name', sourceName)
      .maybeSingle<{ id: string }>();

    if (existing && !findError) {
      return existing.id;
    }

    // Create new manual source
    const { data: newSource, error: createError } = await supabase
      .from('sources')
      .insert({
        organization_id: this.config.organizationId,
        source_type: 'manual',
        name: sourceName,
        url: null,
        reliability_rating: 'UNKNOWN',
        notes: 'Manually submitted content',
      } as any)
      .select('id')
      .single<{ id: string }>();

    if (createError || !newSource) {
      throw new Error(`Failed to create manual source: ${createError?.message || 'Unknown error'}`);
    }

    return newSource.id;
  }

  /**
   * Extract potential geographic indicators from text
   */
  private extractGeographicIndicators(text: string): string[] {
    const indicators: string[] = [];
    const commonPlaces = [
      'United States', 'USA', 'America', 'UK', 'United Kingdom',
      'China', 'Russia', 'Europe', 'Asia', 'Middle East', 'Africa',
      'Washington', 'New York', 'London', 'Moscow', 'Beijing',
      'California', 'Texas', 'Florida'
    ];

    commonPlaces.forEach(place => {
      if (text.includes(place)) {
        indicators.push(place);
      }
    });

    return [...new Set(indicators)];
  }

  /**
   * Get source value rating from database
   */
  private async getSourceValueRating(): Promise<number | null> {
    if (!this.sourceId) {
      this.sourceId = await this.getOrCreateManualSource();
    }

    try {
      const { data, error } = await supabase
        .from('sources')
        .select('value_rating')
        .eq('id', this.sourceId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.value_rating ?? null;
    } catch (error) {
      console.warn(`Could not fetch source value rating: ${error}`);
      return null;
    }
  }

  /**
   * Fetch and normalize manual input into SourceRecordDTO
   */
  async fetchAndNormalize(): Promise<SourceRecordDTO[]> {
    try {
      // Get or create the manual source
      this.sourceId = await this.getOrCreateManualSource();

      // Get source value rating for optimization
      const sourceValueRating = await this.getSourceValueRating();

      // Detect media type from URL
      const mediaType = this.config.url
        ? mediaTypeDetector.detectFromUrl(this.config.url)
        : 'article';

      // Extract geographic indicators
      const fullText = `${this.config.title} ${this.config.content}`;
      const geographicIndicators = this.extractGeographicIndicators(fullText);

      // Determine content length
      const contentLength = this.config.content?.length || 0;

      // Determine optimization strategy
      const strategy = contentOptimizer.determineStrategy(
        sourceValueRating,
        contentLength,
        false, // isLinkedToTopic - will be updated later if linked
        mediaType
      );

      // Optimize content if needed
      let optimizedContent = this.config.content;
      if (optimizedContent && strategy.contentType !== 'full_text') {
        const extractedForOptimization = {
          title: this.config.title,
          textContent: optimizedContent,
          htmlContent: '',
          excerpt: optimizedContent.substring(0, 200),
          byline: undefined,
          siteName: undefined,
          length: contentLength,
          links: [],
          headings: [],
        };
        optimizedContent = contentOptimizer.optimizeContent(extractedForOptimization, strategy);
      }

      // Create single SourceRecordDTO
      const dto: SourceRecordDTO = {
        source_id: this.sourceId,
        title: this.config.title,
        url: this.config.url,
        content: optimizedContent,
        published_at: this.config.publishedAt || new Date(),
        language: this.config.language || 'unknown',
        geographic_indicators: geographicIndicators.length > 0 ? geographicIndicators : undefined,
        raw_metadata: {
          source_name: this.config.sourceName || 'Manual Input',
          submitted_at: new Date().toISOString(),
          input_method: 'api',
        },
        // Phase 1: Content optimization and media types
        media_type: mediaType,
        content_type: strategy.contentType,
        content_compressed: strategy.shouldCompress,
        content_length: contentLength,
      };

      return [dto];
    } catch (error) {
      console.error('Manual input service error:', error);
      throw new Error(`Failed to process manual input: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

