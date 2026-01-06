---
name: Overture Maps Integration Analysis
overview: Analyze Overture Maps Foundation as a potential replacement for current geographic mapping capabilities, evaluate its suitability for the OSINT application, and plan integration if analysis proves positive.
todos: []
---

# Overture Maps Integration Analysis & Plan

## Executive Summary

**Current State:** The application has minimal geographic mapping capabilities:

- Leaflet/react-leaflet installed but not actively used (no map components found)
- Basic geographic extraction using simple string matching (no geocoding)
- Geographic indicators stored as JSONB arrays of place names (e.g., `["United States", "New York"]`)
- No coordinates (latitude/longitude), no geocoding service, no map visualization

**Overture Maps Assessment:** Overture Maps Foundation provides downloadable datasets, while **Overture Maps API** (by ThatAPICompany) provides a REST API wrapper for easier access. For topic-specific deep-dive analysis, the **Overture Maps API** enables on-demand queries for specific locations without requiring full dataset infrastructure. This is ideal for the use case of analyzing specific Topics on-demand.**Important Constraints:**

- **Nominatim** has strict rate limits: **maximum 1 request per second** (see [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/))
- **Overture Maps API** is a third-party service that requires API key (see [Overture Maps API Guide](https://www.overturemapsapi.com/docs/intro))

## Current Geographic Implementation

### Existing Code

- **Geographic Extraction:** `backend/src/services/ingestion/RssIngestionService.ts` (lines 42-61) uses simple string matching against a hardcoded list of ~12 place names
- **Storage:** `geographic_indicators` JSONB field in `source_records` table stores arrays of place name strings
- **Visualization:** Leaflet installed but no map components implemented (planned in `.cursor/plans/osint_intelligence_dashboard_implementation_99cd8679.plan.md`)

### Limitations

1. No geocoding (place names → coordinates)
2. No reverse geocoding (coordinates → place names)
3. No POI (Points of Interest) data
4. No map visualization despite Leaflet being installed
5. Geographic extraction is extremely limited (only 12 hardcoded places)

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

1. **User initiates deep-dive** on a Topic in `TopicDetailPage`
2. **Extract locations** from linked source records (using existing `geographic_indicators` or enhanced NER)
3. **Geocode locations** on-demand using Nominatim (place name → coordinates)
4. **Query POIs** around those locations using Overture Maps API
5. **Display on map** using Leaflet component
6. **Cache results** in topic metadata to avoid repeated API calls

### API Documentation References

- **Nominatim API:** [https://nominatim.org/release-docs/develop/api/Overview/](https://nominatim.org/release-docs/develop/api/Overview/)
- Endpoints: `/search`, `/reverse`, `/lookup`
- Service: `https://nominatim.openstreetmap.org`
- **Overture Maps API:** [https://www.overturemapsapi.com/reference](https://www.overturemapsapi.com/reference)
- Endpoints: `/places`, `/places/buildings`, `/places/brands`, `/places/categories`, `/buildings`
- Service: `https://api.overturemapsapi.com`
- Authentication: API key in `x-api-key` header

### Phase 1: Enhanced Geographic Extraction (Immediate)

Replace simple string matching with proper Named Entity Recognition (NER) for location extraction:

- Use a library like `compromise` or `spacy` for location extraction
- Extract place names from article content more accurately
- Store extracted locations in existing `geographic_indicators` field
- **No geocoding yet** - just better place name extraction

### Phase 2: On-Demand Overture Maps Integration (Topic-Specific)

Build on-demand geocoding and POI lookup for specific Topics:

1. **Backend Service:**

- Create `backend/src/services/overtureMapsService.ts`
- Implement POI lookup via Overture Maps API (lat/lng + radius → POIs)
- Create `backend/src/services/nominatimService.ts`
- Use Nominatim for geocoding (place name → coordinates)
- **Critical:** Implement rate limiting for Nominatim (max 1 req/sec)
- **Critical:** Add proper User-Agent header for Nominatim requests
- **Critical:** Implement attribution display for Nominatim data
- Add aggressive caching layer to minimize API calls
- Implement request queuing/throttling for Nominatim

2. **API Endpoints:**

- Create `backend/src/routes/overture.ts` with endpoints:
- `POST /api/overture/pois` - Get POIs around coordinates
- Modify `backend/src/routes/topics.ts`:
- `GET /api/topics/:id/geographic-analysis` - Get geographic analysis for a topic

3. **Topic Geographic Analysis:**

- Create `backend/src/services/topicGeographicService.ts`
- Aggregate locations from all source records linked to a topic
- Geocode locations on-demand when user views topic
- Query POIs around geocoded locations
- Store results in topic metadata (cache)

4. **Frontend Integration:**

- Create `src/components/Topics/TopicMap.tsx` component
- Add "Geographic Analysis" section to `TopicDetailPage`
- Display map with:
- Source record locations (from geocoded place names)
- Nearby POIs (from Overture Maps API)
- Add button to trigger geographic analysis on-demand

5. **Database Enhancement (Optional):**

- Add `geographic_analysis` JSONB field to `osint_topics` table
- Cache geocoded coordinates and POI data per topic
- Structure: `{ locations: [...], pois: [...], lastUpdated: timestamp }`

## Implementation Plan (On-Demand API Approach)

### Step 1: Proof of Concept

- Obtain Overture Maps API key
- Test API endpoints with sample queries:
- Query POIs around a specific lat/lng with radius
- Test different category filters
- Test Nominatim for geocoding (place name → coordinates)
- Measure API response time and accuracy
- Verify rate limits and pricing (should be free)

### Step 2: Backend Service Implementation

- Create `backend/src/services/overtureMapsService.ts`:
- `getPOIs(lat: number, lng: number, radius: number, categories?: string[]): Promise<POI[]>`
- `getPOIsByBoundingBox(bbox: BoundingBox, categories?: string[]): Promise<POI[]>`
- Create `backend/src/services/nominatimService.ts`:
- `geocodePlace(placeName: string): Promise<{ lat, lng }>`
- **Rate limiting:** Enforce maximum 1 request per second
- **User-Agent:** Set proper User-Agent header identifying the application
- **Attribution:** Store attribution requirement for display
- **Caching:** Aggressive caching (cache results for at least 24 hours)
- **Request queuing:** Queue requests to respect rate limits
- Add Overture Maps API key to environment variables
- Implement request caching (Redis or in-memory) to avoid duplicate calls
- **Important:** Nominatim policy requires:
- Valid HTTP Referer or User-Agent (not stock library User-Agents)
- Attribution display (ODbL license requirement)
- No bulk geocoding (only user-triggered requests acceptable)
- Results must be cached

### Step 3: Topic Geographic Analysis Service

- Create `backend/src/services/topicGeographicService.ts`:
- `analyzeTopicGeography(topicId: string): Promise<GeographicAnalysis>`
- Extract all place names from linked source records (from `geographic_indicators` JSONB field)
- **Rate-limited geocoding:** 
    - Use Nominatim `/search` endpoint for place name → coordinates
    - Process geocoding requests sequentially (1 per second) or use cached results
    - Check cache first before making API call
    - Queue requests if rate limit would be exceeded
- **POI Lookup:**
    - For each geocoded location, query Overture Maps `/places` endpoint
    - Use reasonable radius (e.g., 1000-5000 meters depending on location type)
    - Filter by relevant categories if needed
    - Limit results per location (e.g., top 20 POIs)
- Aggregate and return structured geographic data:
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
                              lastUpdated: string;
                            }
    ```




- **Caching strategy:** 
    - Cache all geocoded results indefinitely (same place name = same coordinates)
    - Cache POI results for reasonable period (e.g., 7 days)
    - Store in `geographic_analysis` JSONB field in `osint_topics` table
- Create API endpoint: `GET /api/topics/:id/geographic-analysis`
- Check cache first, return cached data if available and recent
- If cache miss or stale, trigger new analysis
- Return analysis results with attribution information

### Step 4: Database Schema (Optional Enhancement)

- Add migration to add `geographic_analysis` JSONB field to `osint_topics`:
  ```sql
              ALTER TABLE osint_topics 
              ADD COLUMN geographic_analysis JSONB;
  ```




- Structure: `{ locations: [...], pois: [...], lastUpdated: timestamp }`
- Index for efficient queries: `CREATE INDEX idx_topics_geographic ON osint_topics USING GIN(geographic_analysis);`

### Step 5: Frontend Map Component

- Create `src/components/Topics/TopicMap.tsx`:
- Leaflet map component using `react-leaflet`
- Display markers for source record locations (from geocoded place names)
    - Use different marker style/color for locations vs POIs
    - Show popup with location name, address, linked source record count
- Display markers for nearby POIs (from Overture Maps API)
    - Show popup with POI name, category, address, brand (if available)
    - Group by category with different colors/icons
- Cluster markers for better performance (use `react-leaflet-cluster` or similar)
- Show attribution: "© OpenStreetMap contributors" (required for Nominatim data)
- Handle loading states and errors gracefully
- Center map on locations with appropriate zoom level
- Add to `TopicDetailPage`:
- New "Geographic Analysis" section (can be a new tab or expandable section)
- Button to trigger geographic analysis ("Analyze Geography" or "Load Map")
- Display map with locations and POIs
- Show loading state during API calls (with progress indicator if possible)
- Show message if rate limiting causes delays
- Display cached data indicator if showing cached results
- Show error messages if API calls fail

### Step 6: Integration & Testing

- Test with real topics and source records
- Verify caching works correctly
- Test error handling (API failures, rate limits)
- Optimize API call patterns (batch requests if possible)

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

## Next Steps

1. **Obtain API Access:** 

- Sign up for Overture Maps API at [overturemapsapi.com](https://www.overturemapsapi.com/docs/intro) and get API key
- Review Overture Maps API documentation and rate limits

2. **Review Nominatim Policy:** 

- Read and understand [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- Plan rate limiting implementation (1 req/sec max)
- Plan attribution display requirements

3. **Conduct Proof of Concept:** 

- Test Overture Maps API endpoints with sample queries
- Test Nominatim geocoding accuracy and rate limiting behavior
- Test POI query performance and data quality
- Verify Overture Maps API rate limits and pricing
- **Test rate limiting:** Verify Nominatim 1 req/sec limit is respected
- **Test caching:** Verify caching strategy works correctly
- **Test attribution:** Verify attribution display requirements

3. **Evaluate Alternatives:** Compare with Nominatim, Google Maps, or Mapbox APIs if needed
4. **Make Decision:** Based on POC results, decide whether to proceed with Overture Maps API
5. **If Positive:** Follow implementation plan above (on-demand API approach)
6. **If Negative:** Consider alternative geocoding services or hybrid approach

## Files to Modify (If Proceeding)

- `backend/src/services/overtureMapsService.ts` (CREATE) - Overture Maps API client
- `backend/src/services/nominatimService.ts` (CREATE) - Nominatim geocoding service with rate limiting
- `backend/src/services/topicGeographicService.ts` (CREATE) - Topic geographic analysis logic
- `backend/src/routes/overture.ts` (CREATE) - API endpoints for Overture Maps
- `backend/src/routes/topics.ts` (MODIFY) - Add geographic analysis endpoint
- `src/components/Topics/TopicMap.tsx` (CREATE) - Leaflet map component with attribution
- `src/components/Topics/TopicDetailPage.tsx` (MODIFY) - Add geographic analysis section
- `backend/src/services/ingestion/RssIngestionService.ts` (MODIFY) - Enhance geographic extraction (optional, Phase 1)
- Database migration: Add `geographic_analysis` JSONB field to `osint_topics` (optional)
- Environment variables: Add `OVERTURE_MAPS_API_KEY` configuration

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

- Cache Nominatim results for at least 24 hours (same queries should never hit API twice)
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

### Error Handling

- **Nominatim Rate Limits:** 
- Queue requests if rate limit exceeded
- Show user-friendly message about rate limiting
- Use cached data when available