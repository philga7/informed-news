/**
 * Manual Input Service
 * 
 * Handles manual content submission via API.
 * Creates or finds a 'manual' type source and normalizes input
 * into SourceRecordDTO format.
 */

import { supabase } from '../../utils/supabase.js';
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
      .maybeSingle();

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
      })
      .select('id')
      .single();

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
   * Fetch and normalize manual input into SourceRecordDTO
   */
  async fetchAndNormalize(): Promise<SourceRecordDTO[]> {
    try {
      // Get or create the manual source
      this.sourceId = await this.getOrCreateManualSource();

      // Extract geographic indicators
      const fullText = `${this.config.title} ${this.config.content}`;
      const geographicIndicators = this.extractGeographicIndicators(fullText);

      // Create single SourceRecordDTO
      const dto: SourceRecordDTO = {
        source_id: this.sourceId,
        title: this.config.title,
        url: this.config.url,
        content: this.config.content,
        published_at: this.config.publishedAt || new Date(),
        language: this.config.language || 'unknown',
        geographic_indicators: geographicIndicators.length > 0 ? geographicIndicators : undefined,
        raw_metadata: {
          source_name: this.config.sourceName || 'Manual Input',
          submitted_at: new Date().toISOString(),
          input_method: 'api',
        },
      };

      return [dto];
    } catch (error) {
      console.error('Manual input service error:', error);
      throw new Error(`Failed to process manual input: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

