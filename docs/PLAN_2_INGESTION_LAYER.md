# Plan 2: Ingestion Layer Implementation

## Overview

This document describes the new ingestion layer that abstracts RSS ingestion and manual input into a unified system that populates the OSINT schema (Plan 1).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     API Layer                            │
│  /api/ingest/rss  |  /api/ingest/manual                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Ingestion Services Layer                    │
│  RssIngestionService  |  ManualInputService             │
│  (implements IngestionService interface)                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              IngestionController                         │
│  • Content-hash deduplication                           │
│  • Database insertion                                    │
│  • Error handling & logging                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Supabase Database                           │
│  sources table  |  source_records table                 │
└─────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Ingestion Interface (`backend/src/types/ingestion.ts`)

```typescript
interface IngestionService {
  fetchAndNormalize(): Promise<SourceRecordDTO[]>;
}

interface SourceRecordDTO {
  source_id: string;
  title: string;
  url?: string;
  content: string;
  published_at?: Date;
  language?: string;
  geographic_indicators?: string[];
  raw_metadata?: Record<string, any>;
}
```

### 2. RssIngestionService

- Wraps existing `parseRSSFeed()` logic
- Maps RSS items to `SourceRecordDTO` format
- Detects language and geographic indicators
- Preserves raw RSS metadata

**File:** `backend/src/services/ingestion/RssIngestionService.ts`

### 3. ManualInputService

- Accepts manual content via API
- Creates or finds a `manual` type source
- Normalizes input to `SourceRecordDTO` format

**File:** `backend/src/services/ingestion/ManualInputService.ts`

### 4. IngestionController

- Orchestrates ingestion process
- **Content-hash deduplication**: SHA-256 hash of `title + content + published_at`
- Stores records in `source_records` table
- Returns ingestion statistics

**File:** `backend/src/services/ingestion/IngestionController.ts`

### 5. Ingestion Scheduler

- Replaces old `FeedScheduler`
- Organization-based scheduling
- Queries sources from database
- Uses new ingestion layer

**File:** `backend/src/services/ingestion/IngestionScheduler.ts`

## API Endpoints

### Ingest from RSS Source

```http
POST /api/ingest/rss
Content-Type: application/json

{
  "organization_id": "uuid",
  "source_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "source_id": "uuid",
  "source_name": "Example RSS Feed",
  "result": {
    "added": 15,
    "skipped": 5,
    "errors": [],
    "total_processed": 20
  }
}
```

### Submit Manual Content

```http
POST /api/ingest/manual
Content-Type: application/json

{
  "organization_id": "uuid",
  "title": "Article Title",
  "content": "Article content...",
  "url": "https://example.com/article",
  "source_name": "Manual Input",
  "language": "en",
  "published_at": "2025-01-01T12:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "added": 1,
    "skipped": 0,
    "errors": []
  }
}
```

### Check Ingestion Status

```http
GET /api/ingest/status
```

**Response:**
```json
{
  "status": "operational",
  "database": "connected",
  "timestamp": "2025-01-01T12:00:00Z"
}
```

### Start Organization Scheduler

```http
POST /api/scheduler/organization/start
Content-Type: application/json

{
  "organization_id": "uuid",
  "schedule": "*/15 * * * *"
}
```

### Stop Organization Scheduler

```http
POST /api/scheduler/organization/stop
Content-Type: application/json

{
  "organization_id": "uuid"
}
```

### Get Active Schedulers

```http
GET /api/scheduler/organizations
```

**Response:**
```json
{
  "active_organizations": ["uuid1", "uuid2"],
  "count": 2
}
```

## Deduplication Strategy

The system uses **content-hash deduplication**:

1. Generate SHA-256 hash of `title + content + published_at`
2. Store hash in `raw_metadata.content_hash`
3. Query database for existing records with same hash
4. Skip insertion if duplicate found

**Advantages:**
- Handles URL changes (e.g., tracking parameters)
- Detects true content duplicates
- More robust than URL+date matching

## Database Schema

### sources table

```sql
CREATE TABLE public.sources (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  source_type osint_source_type NOT NULL,  -- 'rss' | 'api' | 'email' | 'manual'
  name TEXT NOT NULL,
  url TEXT,
  reliability_rating reliability_rating DEFAULT 'UNKNOWN',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### source_records table

```sql
CREATE TABLE public.source_records (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id),
  title TEXT NOT NULL,
  url TEXT,
  content TEXT,
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  language TEXT,
  geographic_indicators JSONB,
  raw_metadata JSONB,  -- Contains content_hash for deduplication
  initial_confidence_flags JSONB
);
```

## Migration from Old System

### Deprecated Components

The following components are **deprecated** but still functional:

- `fetchNewsFromSource()` in `backend/src/services/feedFetcher.ts`
- `fetchAllNews()` in `backend/src/services/feedFetcher.ts`
- `POST /api/feeds/fetch` endpoint
- `POST /api/feeds/fetch/:sourceId` endpoint
- `POST /api/scheduler/start` endpoint

All deprecated functions log warnings when called.

### Migration Path

1. **Create sources in new schema**:
   - Query old `news_sources` table
   - Insert corresponding entries in new `sources` table
   - Map old source IDs to new source IDs

2. **Update API calls**:
   - Replace `POST /api/feeds/fetch` with `POST /api/ingest/rss`
   - Add `organization_id` parameter

3. **Update scheduler**:
   - Replace `POST /api/scheduler/start` with `POST /api/scheduler/organization/start`
   - Provide `organization_id` instead of sources array

4. **Historical data migration** (optional):
   - Script to convert old articles to `source_records` format
   - Backfill `source_records` table

## Environment Variables

Add to your `.env` file:

```bash
# Supabase Configuration (if not already set)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The service role key is required for backend operations that bypass RLS.

## Testing

### Prerequisites

Before testing, ensure:
1. ✅ Plan 1 migrations are applied (OSINT schema exists)
2. ✅ Backend server is running (`npm run dev` in `backend/`)
3. ✅ Environment variables are configured (`backend/.env`)

### Quick Setup with SQL Script

For convenience, use the provided SQL script: **`supabase/setup_test_data.sql`**

This script helps you:
- Check existing organizations
- Create test organization
- Add yourself as org member
- Create multiple RSS sources
- Verify setup

Open it in Supabase SQL Editor and follow the commented instructions.

### Manual Setup Steps

### 1. Test Database Connection

```bash
curl http://localhost:3001/api/ingest/status
```

### 2. Get or Create Test Organization

First, check if you already have an organization:

```sql
-- In Supabase SQL Editor, check for existing organizations
SELECT id, name, slug FROM organizations;
```

If you have organizations, note the `id` and skip to step 3.

If you don't have any organizations yet, create one:

```sql
-- Create a test organization
INSERT INTO organizations (name, slug) 
VALUES ('Test Organization', 'test-org')
RETURNING id, name, slug;

-- Save the returned 'id' - this is your organization_id
```

**Optional: Add yourself as an organization member**

```sql
-- First, get your user_id from the profiles table
SELECT id, email FROM auth.users LIMIT 5;

-- Then add yourself to the organization as owner
INSERT INTO org_members (organization_id, user_id, role)
VALUES (
  'YOUR_ORG_ID',  -- from previous query
  'YOUR_USER_ID', -- from profiles query
  'owner'
);
```

### 3. Create Test RSS Source

Now create a source within your organization:

```sql
-- Create an RSS source
INSERT INTO sources (organization_id, source_type, name, url, reliability_rating)
VALUES (
  'YOUR_ORG_ID',  -- from step 2
  'rss',
  'BBC News',
  'https://feeds.bbci.co.uk/news/rss.xml',
  'HIGH'
)
RETURNING id, name, url;

-- Save the returned 'id' - this is your source_id
```

**Quick copy-paste version (replace the UUIDs):**

```sql
-- All-in-one: Create org, add member, create source
WITH new_org AS (
  INSERT INTO organizations (name, slug) 
  VALUES ('Test Organization', 'test-org')
  RETURNING id
),
new_member AS (
  INSERT INTO org_members (organization_id, user_id, role)
  SELECT new_org.id, auth.uid(), 'owner'
  FROM new_org
  RETURNING organization_id
)
INSERT INTO sources (organization_id, source_type, name, url, reliability_rating)
SELECT id, 'rss', 'BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', 'HIGH'
FROM new_org
RETURNING id as source_id, organization_id;
```

### 4. Test RSS Ingestion

Replace `YOUR_ORG_ID` and `YOUR_SOURCE_ID` with the actual UUIDs from step 2-3:

```bash
curl -X POST http://localhost:3001/api/ingest/rss \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "YOUR_ORG_ID",
    "source_id": "YOUR_SOURCE_ID"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "source_id": "...",
  "source_name": "BBC News",
  "result": {
    "added": 15,
    "skipped": 0,
    "errors": [],
    "total_processed": 15
  }
}
```

### 5. Test Manual Input

```bash
curl -X POST http://localhost:3001/api/ingest/manual \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "YOUR_ORG_ID",
    "title": "Test Article",
    "content": "This is test content",
    "url": "https://example.com/test",
    "language": "en"
  }'
```

### 6. Verify Records

```sql
-- Check source_records table
SELECT 
  sr.title,
  sr.url,
  sr.ingested_at,
  s.name as source_name,
  sr.raw_metadata->>'content_hash' as content_hash
FROM source_records sr
JOIN sources s ON sr.source_id = s.id
ORDER BY sr.ingested_at DESC
LIMIT 10;
```

### 7. Test Scheduler

```bash
# Start scheduler for organization (runs every 5 minutes)
curl -X POST http://localhost:3001/api/scheduler/organization/start \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "YOUR_ORG_ID",
    "schedule": "*/5 * * * *"
  }'

# Check active schedulers
curl http://localhost:3001/api/scheduler/organizations

# Stop scheduler
curl -X POST http://localhost:3001/api/scheduler/organization/stop \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "YOUR_ORG_ID"
  }'
```

## Future Enhancements

The ingestion layer is designed for extensibility:

1. **Email Ingestion Service**: Implement `IngestionService` for IMAP/POP3
2. **API Ingestion Service**: Implement for third-party APIs (Twitter, etc.)
3. **Web Scraping Service**: Implement for structured web scraping
4. **AI-Assisted Enrichment**: Add language detection, entity extraction, sentiment analysis
5. **Source Reliability Scoring**: Automatic reliability rating based on ingestion history

## File Structure

```
backend/src/
├── routes/
│   ├── ingest.ts              # NEW: Ingestion endpoints
│   ├── scheduler.ts           # UPDATED: Added organization endpoints
│   ├── feeds.ts               # DEPRECATED: Legacy endpoints
│   └── sources.ts
├── services/
│   ├── ingestion/             # NEW: Ingestion services
│   │   ├── index.ts
│   │   ├── IngestionController.ts
│   │   ├── RssIngestionService.ts
│   │   ├── ManualInputService.ts
│   │   └── IngestionScheduler.ts
│   ├── feedFetcher.ts         # DEPRECATED: Legacy RSS parsing
│   └── scheduler.ts           # DEPRECATED: Legacy scheduler
├── types/
│   ├── ingestion.ts           # NEW: Ingestion types
│   └── index.ts
└── utils/
    └── supabase.ts            # NEW: Backend Supabase client

src/types/
└── database.ts                # NEW: Database schema types
```

## Support

For issues or questions:
1. Check server logs: `npm run dev` in `backend/` directory
2. Check database logs in Supabase Dashboard
3. Verify migrations applied: See Plan 1 documentation
4. Review ingestion stats in console output

