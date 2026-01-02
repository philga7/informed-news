# Informed News Backend Service

Express backend service for OSINT intelligence gathering, feed ingestion, and AI-assisted analysis.

## Architecture

This backend service provides:
- **OSINT Data Management**: Sources, source records, topics, and organizations
- **Feed Ingestion**: Automated RSS/API feed fetching and processing
- **AI Analysis**: Ollama Cloud integration for summarization, entity extraction, and tone analysis
- **Scheduled Tasks**: Automated feed updates via cron scheduler
- **Database**: Supabase PostgreSQL backend with RLS security

All data is stored in Supabase with organization-scoped access control.

## Features

- **OSINT Data Management**: Organizations, sources, source records, topics, and links
- **Feed Ingestion**: Automated RSS/API feed fetching with configurable schedules
- **AI Analysis** (Plan 6):
  - Summarization: 3-5 bullet point summaries
  - Entity Extraction: People, organizations, locations, dates
  - Tone Analysis: Sentiment, bias indicators, propaganda detection
- **Caching**: In-memory cache for feed responses (5-minute TTL)
- **Scheduled Tasks**: Cron-based feed fetching with start/stop controls
- **Database**: Supabase PostgreSQL with Row Level Security

## Setup

```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev

# Build
npm run build

# Production
npm start
```

## API Endpoints

### Health

- `GET /health` - Health check endpoint

### Feeds

- `GET /api/feeds` - List available feeds
- `GET /api/feeds/:id` - Get feed details
- `POST /api/feeds/fetch` - Fetch news from all enabled sources
- `POST /api/feeds/fetch/:sourceId` - Fetch news from a specific source
- `GET /api/feeds/cache/stats` - Get cache statistics
- `DELETE /api/feeds/cache/:sourceId` - Clear cache for a source

### Sources

- `GET /api/sources` - List OSINT sources
- `POST /api/sources` - Create new source
- `PUT /api/sources/:id` - Update source
- `DELETE /api/sources/:id` - Delete source
- `POST /api/sources/test` - Test source configuration

### Source Records

- `GET /api/source-records` - List source records with filters
- `GET /api/source-records/:id` - Get source record detail

### Topics

- `GET /api/topics` - List OSINT topics
- `POST /api/topics` - Create topic
- `PUT /api/topics/:id` - Update topic
- `DELETE /api/topics/:id` - Delete topic

### Ingestion

- `POST /api/ingest/source/:id` - Ingest from specific source
- `POST /api/ingest/all` - Ingest from all enabled sources

### Analysis (Plan 6 - AI-Assisted)

- `POST /api/analysis/source-records/:id/summarize` - Generate AI summary
- `POST /api/analysis/source-records/:id/entities` - Extract entities
- `POST /api/analysis/source-records/:id/tone` - Analyze tone and bias
- `GET /api/analysis/source-records/:id/artifacts` - List all artifacts
- `PATCH /api/analysis/artifacts/:id` - Update artifact review status
- `DELETE /api/analysis/artifacts/:id` - Delete artifact

### Scheduler

- `POST /api/scheduler/start` - Start scheduled feed fetching
- `POST /api/scheduler/stop` - Stop scheduled feed fetching
- `GET /api/scheduler/status` - Get scheduler status

## Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
# Server Configuration
PORT=3001

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Ollama Cloud API (Plan 6 - AI Analysis)
OLLAMA_API_KEY=your_ollama_api_key
OLLAMA_MODEL=gpt-oss:120b  # Optional, defaults to gpt-oss:120b
```

### Getting Ollama API Key

1. Visit [https://ollama.com](https://ollama.com)
2. Sign in or create an account
3. Navigate to API settings
4. Generate a new API key
5. Add to `.env` file

**Note**: AI analysis features require a valid Ollama API key. Without it, the analysis endpoints will return 503 errors.

## Implementation Status

### Completed

- ✅ Plan 1: OSINT Database Schema (organizations, sources, records, topics)
- ✅ Plan 2: Ingestion Layer (RSS/API feed processing)
- ✅ Plan 3: Topic-Centric UI Foundation
- ✅ Plan 4: Temporal Analysis & Timeline
- ✅ Plan 5: Credibility Framework
- ✅ Plan 6: Ollama Cloud Integration (AI-assisted analysis)

### Future Enhancements

- Redis caching layer for distributed caching
- Advanced scraping with Puppeteer/Playwright for dynamic content
- Rate limiting and retry logic improvements
- Background job queue for async processing (Bull/BullMQ)
- Batch analysis capabilities
- Custom prompt templates for AI analysis
- Export functionality (JSON, PDF, CSV)
- Webhook integrations for external systems

