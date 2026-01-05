---
name: Implementation Todos
overview: ""
todos: []
---

# Nominatim and Overture Maps Implementation Todos

## Phase 1: Backend Services

1. **Create Nominatim Service** (`backend/src/services/nominatimService.ts`)

- Implement `/search` endpoint for geocoding
- Implement `/reverse` endpoint for reverse geocoding
- Add rate limiting (1 req/sec) with queue
- Add proper User-Agent header
- Add caching layer
- Handle errors and rate limit responses

2. **Create Overture Maps Service** (`backend/src/services/overtureMapsService.ts`)

- Implement `/places` endpoint for POI lookup
- Implement `/places/buildings` endpoint (optional)
- Implement `/buildings` endpoint (optional)
- Add API key authentication
- Add caching layer
- Handle errors and rate limits

3. **Create Topic Geographic Service** (`backend/src/services/topicGeographicService.ts`)

- Extract place names from source records
- Geocode locations using Nominatim (with rate limiting)
- Query POIs using Overture Maps API
- Aggregate and structure geographic data
- Implement caching strategy

## Phase 2: API Endpoints

4. **Create Overture Routes** (`backend/src/routes/overture.ts`)

- `GET /api/overture/pois` - Get POIs around coordinates
- Add error handling and validation

5. **Update Topics Routes** (`backend/src/routes/topics.ts`)

- `GET /api/topics/:id/geographic-analysis` - Get geographic analysis for topic
- Check cache, trigger analysis if needed
- Return structured geographic data

## Phase 3: Database

6. **Create Database Migration**

- Add `geographic_analysis` JSONB field to `osint_topics` table
- Add GIN index for efficient queries
- Migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_geographic_analysis.sql`

## Phase 4: Frontend

7. **Create TopicMap Component** (`src/components/Topics/TopicMap.tsx`)

- Leaflet map with react-leaflet
- Display location markers
- Display POI markers
- Marker clustering
- Popups with details
- Attribution display

8. **Update TopicDetailPage** (`src/components/Topics/TopicDetailPage.tsx`)

- Add "Geographic Analysis" section
- Integrate TopicMap component
- Add "Analyze Geography" button
- Handle loading and error states

## Phase 5: Configuration & Testing

9. **Environment Variables**

- Add `OVERTURE_MAPS_API_KEY` to backend `.env`
- Add `NOMINATIM_USER_AGENT` to backend `.env`
- Update documentation with setup instructions

10. **Testing**

    - Test Nominatim geocoding with rate limiting
    - Test Overture Maps API POI queries
    - Test caching behavior
    - Test error handling