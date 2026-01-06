---
name: Overture Maps Integration Analysis
overview: Comprehensive integration of Overture Maps API and Nominatim for geographic analysis, including enhanced NER-based location extraction, on-demand topic geographic analysis, database enhancements, and complete cleanup of legacy Leaflet/react-leaflet dependencies and simple geographic extraction code.
todos: []
---

# Overture Maps Integration Analysis & Plan

## Executive Summary

**Current State:** The application has minimal geographic mapping capabilities:

- Leaflet/react-leaflet installed but not actively used (no map components found) - **TO BE REMOVED**
- Basic geographic extraction using simple string matching in three ingestion services (RssIngestionService, ManualInputService, NitterScrapingService) - **TO BE REPLACED**
- Geographic indicators stored as JSONB arrays of place names (e.g., `["United States", "New York"]`)
- No coordinates (latitude/longitude), no geocoding service, no map visualization

**Overture Maps Assessment:** Overture Maps Foundation provides downloadable datasets, while **Overture Maps API** (by ThatAPICompany) provides a REST API wrapper for easier access. For topic-specific deep-dive analysis, the **Overture Maps API** enables on-demand queries for specific locations without requiring full dataset infrastructure. This is ideal for the use case of analyzing specific Topics on-demand.**Important Constraints:**

- **Nominatim** has strict rate limits: **maximum 1 request per second** (see [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/))
- **Overture Maps API** is a third-party service that requires API key (see [Overture Maps API Guide](https://www.overturemapsapi.com/docs/intro))

## Current Geographic Implementation

### Existing Code

- **Geographic Extraction:** Three ingestion services use simple string matching against hardcoded place name lists:
- `backend/src/services/ingestion/RssIngestionService.ts` (lines 50-65) - ~12 place names
- `backend/src/services/ingestion/ManualInputService.ts` (lines 75-89) - ~15 place names
- `backend/src/services/ingestion/NitterScrapingService.ts` (lines 70-84) - ~12 place names
- **Storage:** `geographic_indicators` JSONB field in `source_records` table stores arrays of place name strings
- **Legacy Dependencies:** Leaflet/react-leaflet installed but unused - will be removed as part of this plan

### Limitations

1. No geocoding (place names → coordinates)
2. No reverse geocoding (coordinates → place names)
3. No POI (Points of Interest) data
4. No map visualization (Leaflet installed but unused)
5. Geographic extraction is extremely limited (only 12-15 hardcoded places per service)
6. Duplicate code across three ingestion services (same simple string matching logic)

## Overture Maps Foundation Analysis

### What Overture Maps Is

- **Overture Maps Foundation:** Open map data initiative backed by AWS, Meta, Microsoft, and TomTom
- **Overture Maps API:** Third-party REST API service by ThatAPICompany that provides easy access to Overture Maps data
- **Two access methods:**

1. **REST API** (Overture Maps API by ThatAPICompany) - On-demand queries for specific locations

- Requires API key (available at [overturemapsapi.com](https://www.overturemapsapi.com/docs/intro))
- Provides simple RESTful interface to query Overture Maps data
- Abstracts complexity of working with raw datasets (Athena, BigQuery, etc.)
- Available as cloud service or self-hosted on GCP

2. **Downloadable datasets** - Parquet format for bulk data processing

- Direct access to Overture Maps Foundation data
- Requires SQL knowledge and cost optimization strategies
- Available on S3, Azure Blob Storage, BigQuery, Snowflake
- Free and open (no licensing costs for data)
- API allows querying by lat/lng, radius, categories, brands, and country codes

### Available Datasets

1. **Places of Interest (POIs):** 59+ million records worldwide
2. **Buildings:** 2.3 billion building footprints
3. **Transportation:** 86 million kilometers of roads
4. **Administrative Boundaries:** Countries, regions, cities, neighborhoods
5. **Addresses:** 200+ million addresses across 14 countries

### Key Features

- **Global Entity Reference System (GERS):** Links entities across datasets
- **Structured Schema:** Well-documented data schema
- **Quality Assurance:** Validation checks for errors and vandalism
- **Regular Updates:** Datasets are updated periodically

### Integration Options

**Option 1: Overture Maps API (Recommended for On-Demand Use)**

- REST API for on-demand queries (provided by ThatAPICompany)
- Query by lat/lng and radius for specific locations
- Filter by categories, brands, country codes
- Requires API key from [overturemapsapi.com](https://www.overturemapsapi.com/docs/intro)
- No infrastructure required - direct API calls to cloud service
- Perfect for topic-specific deep-dive analysis
- Example: `GET /places?lat=-33.8910&lng=151.2769&radius=2000&categories=cafes`
- Can be self-hosted on GCP if needed

**Option 2: Downloadable Datasets (For Bulk Processing)**

- Requires data ingestion pipeline to download Parquet files
- Requires query layer (DuckDB) to search the data
- Better for high-volume, always-on geocoding
- More infrastructure overhead

## Evaluation: Should We Use Overture Maps?

### ✅ Advantages

1. **Cost:** Free and open (no API rate limits or costs)
2. **Comprehensive Data:** 59M+ POIs, extensive geographic coverage
3. **Control:** Own the data, no dependency on external API availability
4. **Privacy:** No data sent to third-party services
5. **Scalability:** Can handle high-volume queries without API limits

### ⚠️ Considerations

**For API Approach (On-Demand):**

1. **API Key Required:** Need to obtain API key from Overture Maps API (ThatAPICompany)
2. **Network Dependency:** Requires internet connection for API calls
3. **Response Time:** API latency depends on network and service infrastructure
4. **Rate Limits:** Need to verify rate limits with ThatAPICompany
5. **Third-Party Service:** Dependency on ThatAPICompany's service availability
6. **Nominatim Rate Limits:** If using Nominatim for geocoding, **strict 1 request/second limit** applies (see [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/))

**For Dataset Approach (Bulk):**

1. **Infrastructure Required:** Need to build geocoding service, not a drop-in replacement
2. **Data Management:** Must download, store, and update large datasets (multi-GB)
3. **Query Performance:** Need to optimize DuckDB queries for production use
4. **Maintenance:** Must keep datasets updated
5. **Initial Setup Complexity:** More complex than integrating a REST API

### Comparison to Alternatives

- **Google Maps Geocoding API:** Paid, rate-limited, requires API key
- **Mapbox Geocoding API:** Paid, rate-limited, requires API key
- **Nominatim (OpenStreetMap):** Free but **strictly rate-limited (1 req/sec max)**, requires attribution and proper User-Agent
- **Overture Maps API:** Third-party service by ThatAPICompany, provides REST API access to Overture Maps data

## Recommended Approach: On-Demand Topic-Specific Analysis ✅ APPROVED

**Decision:** Proceeding with On-Demand Topic-Specific Analysis using Nominatim + Overture Maps API

### Architecture Overview

For topic-specific deep-dive analysis, use **Overture Maps API** on-demand when analyzing a specific Topic:

1. **Enhanced location extraction** from source records using NER (replaces simple string matching)
2. **User initiates deep-dive** on a Topic in `TopicDetailPage`
3. **Extract locations** from linked source records (using enhanced `geographic_indicators` from NER)
4. **Geocode locations** on-demand using Nominatim (place name → coordinates)
5. **Query POIs** around those locations using Overture Maps API
6. **Display geographic data** (map visualization to be implemented with alternative solution - Leaflet will be removed)
7. **Cache results** in topic metadata to avoid repeated API calls

### API Documentation References

- **Nominatim API:** [https://nominatim.org/release-docs/develop/api/Overview/](https://nominatim.org/release-docs/develop/api/Overview/)
- Endpoints: `/search`, `/reverse`, `/lookup`
- Service: `https://nominatim.openstreetmap.org`
- **Overture Maps API:** [https://www.overturemapsapi.com/reference](https://www.overturemapsapi.com/reference)
- Endpoints: `/places`, `/places/buildings`, `/places/brands`, `/places/categories`, `/buildings`
- Service: `https://api.overturemapsapi.com`
- Authentication: API key in `x-api-key` header

## Implementation Plan: Phase-Based Approach

The implementation is organized into four phases, each building on the previous phase and delivering incremental value.

### Phase 1: Foundation & Immediate Improvements

**Goal:** Improve geographic extraction and prepare database infrastructure for geographic analysis.**Deliverables:**

- Enhanced NER-based geographic extraction service
- All ingestion services using shared extraction service
- Database schema ready for geographic analysis caching

**Dependencies:** None (can be implemented independently)

#### Step 1.1: Enhanced Geographic Extraction (Replace Simple String Matching)

**Create shared geographic extraction service:**

- Create `backend/src/services/geographicExtractionService.ts`:
- Implement NER-based location extraction using a library (e.g., `compromise` or `spacy`)
- Extract place names from article content more accurately
- Support multiple languages if possible
- Return structured location data (place names, confidence scores)
- Store extracted locations in existing `geographic_indicators` field

**Update all ingestion services to use shared service:**

- Modify `backend/src/services/ingestion/RssIngestionService.ts`:
- Remove `extractGeographicIndicators()` method (lines 50-65)
- Import and use `geographicExtractionService.extractLocations()`
- Update method calls to use new service
- Modify `backend/src/services/ingestion/ManualInputService.ts`:
- Remove `extractGeographicIndicators()` method (lines 75-89)
- Import and use `geographicExtractionService.extractLocations()`
- Update method calls to use new service
- Modify `backend/src/services/ingestion/NitterScrapingService.ts`:
- Remove `extractGeographicIndicators()` method (lines 70-84)
- Import and use `geographicExtractionService.extractLocations()`
- Update method calls to use new service

**Benefits:**

- Single source of truth for geographic extraction
- More accurate location detection using NER
- Easier to maintain and enhance
- Removes duplicate code across three services

**Configuration:**

- Add NER library dependency to `package.json` (e.g., `compromise` or `spacy`)

#### Step 1.2: Database Schema Enhancement

**Create database migration:**

- Create migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_geographic_analysis.sql`
- Add `geographic_analysis` JSONB field to `osint_topics` table:
  ```sql
          ALTER TABLE osint_topics 
          ADD COLUMN geographic_analysis JSONB;
  ```




- Add GIN index for efficient queries:
  ```sql
          CREATE INDEX idx_topics_geographic ON osint_topics USING GIN(geographic_analysis);
  ```


**Structure:**

```typescript
{
  locations: Array<{
    placeName: string;
    coordinates: { lat: number, lng: number };
    address?: string;
    sourceRecords: string[]; // IDs of source records mentioning this location
  }>;
  pois: Array<{
    id: string;
    name: string;
    coordinates: { lat: number, lng: number };
    category: string;
    address?: string;
    nearbyLocation: string; // Which location this POI is near
  }>;
  lastUpdated: string; // ISO timestamp
  attribution: string; // "© OpenStreetMap contributors" for Nominatim data
}
```

**Testing:**

- Verify migration runs successfully
- Verify index is created and queries are efficient
- Test JSONB field can store and retrieve structured data

### Phase 2: Core Geographic Services

**Goal:** Implement backend services for geocoding and POI lookup, enabling topic geographic analysis.**Deliverables:**

- Overture Maps API service
- Nominatim geocoding service with rate limiting
- Topic geographic analysis service
- API endpoints for geographic analysis

**Dependencies:** Phase 1 (database schema must be in place)

#### Step 2.1: Backend Service Implementation

**Create Overture Maps Service:**

- Create `backend/src/services/overtureMapsService.ts`:
- `getPOIs(lat: number, lng: number, radius: number, categories?: string[]): Promise<POI[]>`
- `getPOIsByBoundingBox(bbox: BoundingBox, categories?: string[]): Promise<POI[]>`
- Add API key authentication (from environment variables)
- Implement request caching (Redis or in-memory) to avoid duplicate calls
- Handle errors and rate limits gracefully

**Create Nominatim Service:**

- Create `backend/src/services/nominatimService.ts`:
- `geocodePlace(placeName: string): Promise<{ lat, lng, address? }>`
- `reverseGeocode(lat: number, lng: number): Promise<{ placeName, address? }>`
- **Rate limiting:** Enforce maximum 1 request per second with request queue
- **User-Agent:** Set proper User-Agent header identifying the application
- **Attribution:** Store attribution requirement for display
- **Caching:** Aggressive caching (cache results indefinitely for same place names)
- **Request queuing:** Queue requests to respect rate limits
- Handle errors and rate limit responses gracefully

**Important:** Nominatim policy requires:

- Valid HTTP Referer or User-Agent (not stock library User-Agents)
- Attribution display (ODbL license requirement)
- No bulk geocoding (only user-triggered requests acceptable)
- Results must be cached

**Configuration:**

- Add environment variable: `OVERTURE_MAPS_API_KEY` - Overture Maps API key from ThatAPICompany

#### Step 2.2: Topic Geographic Analysis Service

**Create topic geographic analysis service:**

- Create `backend/src/services/topicGeographicService.ts`:
- `analyzeTopicGeography(topicId: string): Promise<GeographicAnalysis>`
- Extract all place names from linked source records (from `geographic_indicators` JSONB field)
- **Rate-limited geocoding:** 
    - Use Nominatim `/search` endpoint for place name → coordinates
    - Process geocoding requests sequentially (1 per second) or use cached results
    - Check cache first before making API call
    - Queue requests if rate limit would be exceeded
    - Handle geocoding failures gracefully (continue with other locations)
- **POI Lookup:**
    - For each geocoded location, query Overture Maps `/places` endpoint
    - Use reasonable radius (e.g., 1000-5000 meters depending on location type)
    - Filter by relevant categories if needed
    - Limit results per location (e.g., top 20 POIs)
- Aggregate and return structured geographic data matching database schema
- **Caching strategy:** 
    - Cache all geocoded results indefinitely (same place name = same coordinates)
    - Cache POI results for reasonable period (e.g., 7 days)
    - Store in `geographic_analysis` JSONB field in `osint_topics` table
    - Check cache first, return cached data if available and recent
    - Only refresh cache when new source records are linked to topic

**Create API endpoints:**

- Create `backend/src/routes/overture.ts`:
- `POST /api/overture/pois` - Get POIs around coordinates
- Add request validation and error handling
- Modify `backend/src/routes/topics.ts`:
- `GET /api/topics/:id/geographic-analysis` - Get geographic analysis for a topic
- Check cache first, return cached data if available and recent
- If cache miss or stale, trigger new analysis via `topicGeographicService`
- Return analysis results with attribution information
- Handle errors gracefully

**Testing:**

- Test Overture Maps API integration with sample queries
- Test Nominatim geocoding with rate limiting
- Test topic geographic analysis with real topics
- Verify caching works correctly
- Test error handling (API failures, rate limits)

### Phase 3: Frontend & Integration

**Goal:** Create user-facing geographic analysis interface and complete end-to-end integration.**Deliverables:**

- Frontend geographic visualization component
- Integration with TopicDetailPage
- Complete end-to-end testing

**Dependencies:** Phase 2 (backend services must be complete)

#### Step 3.1: Frontend Geographic Visualization Component

**Create geographic visualization component:**

- Create `src/components/Topics/TopicGeographicView.tsx` component:
- Display geographic data (locations and POIs) in a structured format
- **Note:** Map visualization will be implemented with an alternative solution (Leaflet to be removed in Phase 4)
- Display locations for source record locations (from geocoded place names)
    - Show location name, address, linked source record count
    - Group by location
- Display nearby POIs (from Overture Maps API)
    - Show POI name, category, address, brand (if available)
    - Group by category
    - Show which location each POI is near
- Show attribution: "© OpenStreetMap contributors" (required for Nominatim data)
- Handle loading states and errors gracefully
- Display cached data indicator if showing cached results
- Show progress indicator during geocoding (may take time due to rate limits)

**Update TopicDetailPage:**

- Modify `src/components/Topics/TopicDetailPage.tsx`:
- Add "Geographic Analysis" section (can be a new tab or expandable section)
- Button to trigger geographic analysis ("Analyze Geography" or "Load Geographic Data")
- Display `TopicGeographicView` component with locations and POIs
- Show loading state during API calls (with progress indicator)
- Show message if rate limiting causes delays
- Display estimated wait time if geocoding queue is long
- Show error messages if API calls fail
- Allow user to refresh/update geographic analysis

#### Step 3.2: Integration & Testing

- Test with real topics and source records
- Verify enhanced geographic extraction works across all ingestion services
- Verify caching works correctly (Nominatim and Overture Maps)
- Test error handling (API failures, rate limits, network errors)
- Test rate limiting behavior (verify 1 req/sec for Nominatim)
- Test attribution display
- Optimize API call patterns (batch requests if possible)
- Performance testing with topics containing many locations
- Verify database migration and indexing work correctly
- End-to-end user workflow testing

### Phase 4: Cleanup

**Goal:** Remove legacy Leaflet dependencies and any unused geographic code.**Deliverables:**

- All Leaflet dependencies removed
- No remaining references to Leaflet in codebase
- Documentation updated

**Dependencies:** Phase 3 (frontend component must be complete and working)

#### Step 4.1: Remove Legacy Leaflet Dependencies

**After all other implementation steps are complete**, remove unused Leaflet/react-leaflet dependencies:

1. **Remove npm packages:**

- Remove `leaflet` from `package.json` dependencies
- Remove `react-leaflet` from `package.json` dependencies
- Remove `@types/leaflet` from `package.json` dependencies
- Run `npm install` to update `package-lock.json`

2. **Remove CSS import:**

- Remove `@import 'leaflet/dist/leaflet.css';` from `src/index.css`

3. **Verify no remaining references:**

- Search codebase for any remaining `leaflet` or `react-leaflet` imports
- Search for any `Leaflet` or `react-leaflet` component usage
- Search for any `from 'leaflet'` or `from 'react-leaflet'` statements
- Remove any unused Leaflet-related code if found

4. **Update documentation:**

- Remove references to Leaflet from any documentation or comments
- Update architecture diagrams if they reference Leaflet
- Update any plan files that mention Leaflet

**Files to modify:**

- `package.json` - Remove leaflet, react-leaflet, @types/leaflet dependencies
- `src/index.css` - Remove Leaflet CSS import
- Verify no other files import or use Leaflet components

**Testing:**

- Verify application builds and runs without Leaflet
- Verify no runtime errors related to missing Leaflet dependencies

## Critical Constraints & Requirements

### Nominatim Rate Limiting (CRITICAL)

- **Maximum 1 request per second** - This is a hard limit, not a guideline
- **User-triggered only:** Bulk geocoding is strictly forbidden
- **Caching mandatory:** Results must be cached to avoid repeated queries
- **Proper User-Agent required:** Must identify the application (not stock library User-Agents)
- **Attribution required:** Must display OpenStreetMap attribution (ODbL license)
- **Policy:** [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

**Impact on Implementation:**

- If a topic has 10 locations to geocode, it will take at least 10 seconds (1 per second)
- Must implement request queuing/throttling
- Aggressive caching is essential (cache indefinitely for same place names)
- User experience must account for potential delays
- Show progress indicators and estimated wait times

### Overture Maps API

- **Third-party service:** Provided by ThatAPICompany, not Overture Maps Foundation directly
- **API key required:** Must obtain from [overturemapsapi.com](https://www.overturemapsapi.com/docs/intro)
- **Rate limits:** Verify with service provider
- **Self-hosting option:** Can deploy on GCP if needed

## Decision Criteria

**Proceed with Overture Maps API + Nominatim if:**

- ✅ Overture Maps API is available and free (or affordable)
- ✅ API response time is acceptable (<500ms for POI queries)
- ✅ POI data quality meets requirements for OSINT analysis
- ✅ Rate limits are sufficient for on-demand topic analysis use case
- ✅ API supports required query types (lat/lng + radius, categories)
- ✅ **Can accept Nominatim's 1 req/sec limit** (may cause delays for topics with many locations)
- ✅ **Can implement proper caching** to minimize Nominatim calls
- ✅ **Can display required attribution** for OpenStreetMap data

**Consider alternatives if:**

- ❌ Overture Maps API is not available or requires paid subscription
- ❌ API response time is too slow for user experience
- ❌ POI data quality is insufficient
- ❌ Rate limits are too restrictive
- ❌ **Nominatim rate limits are too slow** for use case (consider self-hosted Nominatim or commercial geocoding)
- ❌ Need offline capabilities (then use downloadable datasets approach)
- ❌ Cannot implement proper caching and rate limiting

**Alternative Geocoding Options:**

- **Self-hosted Nominatim:** For higher rate limits (requires infrastructure)
- **Commercial geocoding APIs:** Google Maps, Mapbox (paid, higher rate limits)
- **Hybrid approach:** Use Nominatim for common places (cached), commercial API for rare places

## Prerequisites

Before starting implementation:

1. **Obtain API Access:** 

- Sign up for Overture Maps API at [overturemapsapi.com](https://www.overturemapsapi.com/docs/intro) and get API key
- Review Overture Maps API documentation and rate limits

2. **Review Nominatim Policy:** 

- Read and understand [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- Plan rate limiting implementation (1 req/sec max)
- Plan attribution display requirements

3. **Evaluate NER Libraries:**

- Research and select NER library (compromise, spacy, or alternatives)
- Consider accuracy, performance, and ease of integration
- Test library with sample text to verify location extraction quality

## Files to Modify

**Backend Services (CREATE):**

- `backend/src/services/geographicExtractionService.ts` (CREATE) - Shared NER-based location extraction service
- `backend/src/services/overtureMapsService.ts` (CREATE) - Overture Maps API client
- `backend/src/services/nominatimService.ts` (CREATE) - Nominatim geocoding service with rate limiting
- `backend/src/services/topicGeographicService.ts` (CREATE) - Topic geographic analysis logic

**Backend Services (MODIFY):**

- `backend/src/services/ingestion/RssIngestionService.ts` (MODIFY) - Replace simple geographic extraction with shared service
- `backend/src/services/ingestion/ManualInputService.ts` (MODIFY) - Replace simple geographic extraction with shared service
- `backend/src/services/ingestion/NitterScrapingService.ts` (MODIFY) - Replace simple geographic extraction with shared service

**Backend Routes:**

- `backend/src/routes/overture.ts` (CREATE) - API endpoints for Overture Maps
- `backend/src/routes/topics.ts` (MODIFY) - Add geographic analysis endpoint

**Frontend Components:**

- `src/components/Topics/TopicGeographicView.tsx` (CREATE) - Geographic data visualization component (alternative to Leaflet)
- `src/components/Topics/TopicDetailPage.tsx` (MODIFY) - Add geographic analysis section

**Database:**

- `supabase/migrations/YYYYMMDDHHMMSS_add_geographic_analysis.sql` (CREATE) - Add geographic_analysis JSONB field to osint_topics

**Configuration:**

- Environment variables: Add `OVERTURE_MAPS_API_KEY` configuration
- `package.json` (MODIFY) - Add NER library dependency (e.g., compromise or spacy)

**Cleanup (Phase 4):**

- `package.json` (MODIFY) - Remove leaflet, react-leaflet, @types/leaflet dependencies
- `src/index.css` (MODIFY) - Remove Leaflet CSS import
- Verify no other files import or use Leaflet components

## Technical Notes

### Overture Maps API Approach

- **API Endpoint:** `https://api.overturemapsapi.com/places`
- **Service Provider:** ThatAPICompany ([overturemapsapi.com](https://www.overturemapsapi.com/docs/intro))
- **Authentication:** API key in `x-api-key` header
- **Query Parameters:** `lat`, `lng`, `radius`, `categories`, `brand_name`, `country`, `limit`
- **Response Format:** JSON with POI data
- **Geocoding:** Overture Maps API does not provide geocoding (place name → coordinates)
- **Self-Hosting:** Can be self-hosted on GCP (see [deployment guide](https://www.overturemapsapi.com/docs/deploy-to-gcp))

### Nominatim Geocoding Approach

- **API Endpoint:** `https://nominatim.openstreetmap.org/search`
- **Service:** OpenStreetMap Foundation's Nominatim service
- **Rate Limit:** **Maximum 1 request per second** (strictly enforced)
- **Requirements:**
- Valid HTTP Referer or User-Agent (must identify application, not stock library User-Agents)
- Attribution display required (ODbL license)
- Results must be cached
- No bulk geocoding (only user-triggered requests acceptable)
- **Policy:** [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- **Alternatives:** For bulk geocoding, consider self-hosted Nominatim instance or commercial providers

### Enhanced Geographic Extraction (NER)

- **Approach:** Use Named Entity Recognition library for location extraction
- **Libraries to consider:**
- `compromise` - Lightweight NLP library for JavaScript
- `spacy` - More powerful but may require Python backend or Node.js bindings
- `ner` - Simple NER library for Node.js
- Evaluate based on accuracy, performance, and ease of integration
- **Benefits over string matching:**
- More accurate location detection
- Handles variations in place name formatting
- Can extract locations from natural language text
- Supports multiple languages (depending on library)
- **Implementation:**
- Create shared service to avoid code duplication
- Extract place names with confidence scores
- Store in existing `geographic_indicators` JSONB field
- No geocoding at ingestion time (only on-demand for topics)

### Hybrid Approach (Recommended)

1. **Geocoding:** Use Nominatim (free, OpenStreetMap) for place name → coordinates

- **Rate Limit:** Maximum 1 request per second (strictly enforced)
- **Requirements:** Proper User-Agent, attribution display, caching mandatory
- **Policy:** [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- **Not for bulk:** Only user-triggered requests acceptable

2. **POI Lookup:** Use Overture Maps API for POIs around coordinates

- **Service:** Provided by ThatAPICompany ([overturemapsapi.com](https://www.overturemapsapi.com/docs/intro))
- **API Key:** Required from ThatAPICompany
- **Rate Limits:** Verify with service provider

3. **Caching:** Aggressive caching for both services to minimize API calls

- Cache Nominatim results indefinitely (same place name = same coordinates)
- Cache Overture Maps POI results per location/radius combination
- Store cached results in database (`geographic_analysis` JSONB field)

### Performance Considerations

- **Aggressive Caching:** Cache geographic analysis results per topic (store in `geographic_analysis` JSONB field)
- **Cache Strategy:** 
- Nominatim: Cache indefinitely (same place name = same coordinates)
- Overture Maps: Cache for reasonable period (POIs may change over time)
- Only refresh cache when new source records are linked to topic
- **Rate Limiting:** 
- Nominatim: Strict 1 req/sec limit with request queuing
- Overture Maps: Respect rate limits (verify with provider)
- **Request Batching:** Not possible with Nominatim (sequential only), but can batch Overture Maps queries if supported
- Use request debouncing for user-triggered analysis
- **User Experience:** Show loading states and progress for geocoding (may take time due to rate limits)
- **NER Performance:** Evaluate NER library performance for real-time ingestion (may need async processing)

### Error Handling

- **Nominatim Rate Limits:** 
- Queue requests if rate limit exceeded
- Show user-friendly message about rate limiting
- Display estimated wait time if queue is long
- **Overture Maps API Errors:**
- Handle API key errors gracefully
- Handle network failures with retry logic
- Show appropriate error messages to users
- **Geographic Analysis Failures:**
- If geocoding fails for a location, continue with other locations
- Log failures for debugging
- Show partial results if some locations fail