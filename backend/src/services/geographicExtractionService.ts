/**
 * Geographic Extraction Service
 * 
 * Enhanced NER-based location extraction service for extracting place names
 * from text content. Replaces simple string matching with more sophisticated
 * pattern recognition and can be enhanced with NER libraries in the future.
 * 
 * This service is used by all ingestion services to extract geographic indicators
 * from source record content.
 */

export interface ExtractedLocation {
  placeName: string;
  confidence: number; // 0.0 to 1.0
  type?: 'country' | 'region' | 'city' | 'state' | 'unknown';
}

export interface ExtractionResult {
  locations: string[]; // Array of unique place names (for backward compatibility)
  detailedLocations: ExtractedLocation[]; // Structured location data with confidence scores
}

/**
 * Comprehensive geographic extraction service using pattern matching
 * and common location patterns. Can be enhanced with NER libraries later.
 */
class GeographicExtractionService {
  // Expanded list of countries and their variations
  private readonly countries: Map<string, string[]> = new Map([
    ['United States', ['United States', 'USA', 'U.S.A.', 'US', 'America', 'United States of America']],
    ['United Kingdom', ['United Kingdom', 'UK', 'U.K.', 'Britain', 'Great Britain']],
    ['China', ['China', 'PRC', "People's Republic of China", 'Mainland China']],
    ['Russia', ['Russia', 'Russian Federation', 'RF']],
    ['Japan', ['Japan']],
    ['Germany', ['Germany', 'Deutschland', 'FRG', 'Federal Republic of Germany']],
    ['France', ['France']],
    ['India', ['India', 'Bharat']],
    ['Brazil', ['Brazil', 'Brasil']],
    ['Canada', ['Canada']],
    ['Australia', ['Australia']],
    ['South Korea', ['South Korea', 'Republic of Korea', 'ROK']],
    ['North Korea', ['North Korea', 'DPRK', "Democratic People's Republic of Korea"]],
    ['Iran', ['Iran', 'Islamic Republic of Iran']],
    ['Israel', ['Israel']],
    ['Saudi Arabia', ['Saudi Arabia', 'KSA', 'Kingdom of Saudi Arabia']],
    ['Turkey', ['Turkey', 'Türkiye']],
    ['Italy', ['Italy', 'Italia']],
    ['Spain', ['Spain', 'España']],
    ['Mexico', ['Mexico', 'México']],
    ['South Africa', ['South Africa', 'RSA', 'Republic of South Africa']],
    ['Egypt', ['Egypt']],
    ['Nigeria', ['Nigeria']],
    ['Pakistan', ['Pakistan']],
    ['Bangladesh', ['Bangladesh']],
    ['Indonesia', ['Indonesia']],
    ['Thailand', ['Thailand']],
    ['Vietnam', ['Vietnam', 'Viet Nam']],
    ['Philippines', ['Philippines']],
    ['Poland', ['Poland', 'Polska']],
    ['Ukraine', ['Ukraine', 'Україна']],
  ]);

  // Major cities
  private readonly cities: Map<string, string[]> = new Map([
    ['New York', ['New York', 'NYC', 'New York City']],
    ['Washington', ['Washington', 'Washington DC', 'Washington D.C.', 'DC']],
    ['London', ['London']],
    ['Paris', ['Paris']],
    ['Tokyo', ['Tokyo']],
    ['Beijing', ['Beijing', 'Peking']],
    ['Moscow', ['Moscow', 'Moskva']],
    ['Berlin', ['Berlin']],
    ['Rome', ['Rome', 'Roma']],
    ['Madrid', ['Madrid']],
    ['Los Angeles', ['Los Angeles', 'LA', 'L.A.']],
    ['Chicago', ['Chicago']],
    ['Houston', ['Houston']],
    ['San Francisco', ['San Francisco', 'SF']],
    ['Boston', ['Boston']],
    ['Seattle', ['Seattle']],
    ['Miami', ['Miami']],
    ['Atlanta', ['Atlanta']],
    ['Dallas', ['Dallas']],
    ['Philadelphia', ['Philadelphia', 'Philly']],
    ['Shanghai', ['Shanghai']],
    ['Hong Kong', ['Hong Kong', 'HK']],
    ['Singapore', ['Singapore']],
    ['Dubai', ['Dubai']],
    ['Sydney', ['Sydney']],
    ['Melbourne', ['Melbourne']],
    ['Toronto', ['Toronto']],
    ['Vancouver', ['Vancouver']],
    ['Mexico City', ['Mexico City', 'Ciudad de México']],
    ['São Paulo', ['São Paulo', 'Sao Paulo']],
    ['Buenos Aires', ['Buenos Aires']],
    ['Cairo', ['Cairo']],
    ['Lagos', ['Lagos']],
    ['Johannesburg', ['Johannesburg']],
    ['Mumbai', ['Mumbai', 'Bombay']],
    ['Delhi', ['Delhi', 'New Delhi']],
    ['Bangalore', ['Bangalore', 'Bengaluru']],
    ['Seoul', ['Seoul']],
    ['Bangkok', ['Bangkok']],
    ['Jakarta', ['Jakarta']],
    ['Manila', ['Manila']],
    ['Kuala Lumpur', ['Kuala Lumpur', 'KL']],
  ]);

  // US States and major regions
  private readonly statesAndRegions: Map<string, string[]> = new Map([
    ['California', ['California', 'CA', 'Calif.']],
    ['Texas', ['Texas', 'TX']],
    ['Florida', ['Florida', 'FL']],
    ['New York', ['New York', 'NY']], // Note: overlaps with city
    ['Illinois', ['Illinois', 'IL']],
    ['Pennsylvania', ['Pennsylvania', 'PA']],
    ['Ohio', ['Ohio', 'OH']],
    ['Georgia', ['Georgia', 'GA']],
    ['North Carolina', ['North Carolina', 'NC']],
    ['Michigan', ['Michigan', 'MI']],
    ['Europe', ['Europe', 'European', 'EU', 'European Union']],
    ['Asia', ['Asia', 'Asian']],
    ['Middle East', ['Middle East', 'MENA', 'Middle East and North Africa']],
    ['Africa', ['Africa', 'African']],
    ['Latin America', ['Latin America', 'South America', 'Central America']],
    ['North America', ['North America', 'North American']],
    ['Southeast Asia', ['Southeast Asia', 'SE Asia', 'SEA']],
    ['East Asia', ['East Asia', 'East Asian']],
    ['Western Europe', ['Western Europe', 'West Europe']],
    ['Eastern Europe', ['Eastern Europe', 'East Europe']],
  ]);

  /**
   * Extract locations from text content
   * 
   * @param text - The text content to extract locations from
   * @returns ExtractionResult with locations array and detailed location data
   */
  extractLocations(text: string): ExtractionResult {
    if (!text || typeof text !== 'string') {
      return { locations: [], detailedLocations: [] };
    }

    const normalizedText = text.toLowerCase();
    const foundLocations = new Map<string, ExtractedLocation>();

    // Extract countries
    this.countries.forEach((variations, canonicalName) => {
      for (const variation of variations) {
        const pattern = new RegExp(`\\b${this.escapeRegex(variation)}\\b`, 'gi');
        if (pattern.test(text)) {
          // Higher confidence for exact matches, lower for abbreviations
          const confidence = variation.length > 3 ? 0.9 : 0.7;
          foundLocations.set(canonicalName, {
            placeName: canonicalName,
            confidence,
            type: 'country',
          });
          break; // Found this country, move to next
        }
      }
    });

    // Extract cities (check cities after countries to avoid duplicates)
    this.cities.forEach((variations, canonicalName) => {
      // Skip if we already found this as a country/region
      if (foundLocations.has(canonicalName)) {
        return;
      }

      for (const variation of variations) {
        const pattern = new RegExp(`\\b${this.escapeRegex(variation)}\\b`, 'gi');
        if (pattern.test(text)) {
          const confidence = variation.length > 3 ? 0.85 : 0.65;
          foundLocations.set(canonicalName, {
            placeName: canonicalName,
            confidence,
            type: 'city',
          });
          break;
        }
      }
    });

    // Extract states and regions
    this.statesAndRegions.forEach((variations, canonicalName) => {
      // Skip if we already found this
      if (foundLocations.has(canonicalName)) {
        return;
      }

      for (const variation of variations) {
        const pattern = new RegExp(`\\b${this.escapeRegex(variation)}\\b`, 'gi');
        if (pattern.test(text)) {
          const confidence = variation.length > 3 ? 0.8 : 0.6;
          const type: 'state' | 'region' = canonicalName.length > 2 && !canonicalName.includes(' ') ? 'state' : 'region';
          foundLocations.set(canonicalName, {
            placeName: canonicalName,
            confidence,
            type,
          });
          break;
        }
      }
    });

    // Convert to arrays
    const locations = Array.from(foundLocations.keys());
    const detailedLocations = Array.from(foundLocations.values());

    return {
      locations,
      detailedLocations,
    };
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export singleton instance
export const geographicExtractionService = new GeographicExtractionService();

