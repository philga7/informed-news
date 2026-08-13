# Backend Implementation Guide

## Overview

This guide explains how to set up and use the new Express backend service for Informed News.

## Architecture

The backend service is a **stateless proxy** that provides:
- **Feed Fetching**: RSS parsing and web scraping without CORS limitations
- **Caching**: In-memory cache for feed responses (reduces redundant requests)
- **Scheduling**: Automatic feed updates via cron jobs (optional)
- **API Endpoints**: RESTful API for frontend integration

**Important**: The backend does NOT store any user data. All data (articles, sources, preferences) remains in localStorage on the frontend. The backend only fetches feeds and returns them to the frontend.

## Setup Instructions

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Create a `.env` file in the `backend/` directory:

```env
PORT=3001
NODE_ENV=development
```

### 3. Start Backend Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

The server will start on `http://localhost:3001`

### 4. Update Frontend Configuration

Add the API URL to your frontend `.env` file:

```env
VITE_API_URL=http://localhost:3001
```

## Integration with Frontend

### Option 1: Use API Client Utility

The `src/utils/apiClient.ts` file provides helper functions:

```typescript
import { feedsApi } from '../utils/apiClient';

// Fetch all feeds
const result = await feedsApi.fetchAll(sources);
console.log(result.articles);
```

### Option 2: Direct Fetch Calls

```typescript
const response = await fetch('http://localhost:3001/api/feeds/fetch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sources }),
});
const data = await response.json();
```

## Updating Frontend Components

### Update Header Component

Replace the direct `fetchAllNews` call with API call:

```typescript
// Before (src/components/Layout/Header.tsx)
import { fetchAllNews } from '../../utils/newsFetcher';
const { articles, errors } = await fetchAllNews(state.sources);

// After
import { feedsApi } from '../../utils/apiClient';
const result = await feedsApi.fetchAll(state.sources);
const { articles, errors } = result;
```

### Update News Fetcher

The `newsFetcher.ts` can be updated to use the backend API instead of direct browser fetch:

```typescript
// Option: Keep as fallback or replace entirely
export async function fetchAllNews(sources: NewsSource[]) {
  try {
    // Try backend API first
    const result = await feedsApi.fetchAll(sources);
    return { articles: result.articles, errors: result.errors };
  } catch (error) {
    // Fallback to direct fetch if backend unavailable
    console.warn('Backend unavailable, using direct fetch');
    return directFetchAllNews(sources);
  }
}
```

## API Endpoints Reference

### Feeds

- `POST /api/feeds/fetch` - Fetch from all sources
  ```json
  Request: { "sources": [...] }
  Response: { "articles": [...], "errors": [...], "count": 10 }
  ```

- `POST /api/feeds/fetch/:sourceId` - Fetch from single source
  ```json
  Request: { "source": {...} }
  Response: { "articles": [...], "errors": [], "cached": false }
  ```

- `GET /api/feeds/cache/stats` - Cache statistics
- `DELETE /api/feeds/cache/:sourceId` - Clear source cache
- `DELETE /api/feeds/cache` - Clear all cache

### Sources

- `POST /api/sources/test` - Test source configuration
  ```json
  Request: { "source": {...} }
  Response: { "success": true, "articleCount": 5, "sampleArticle": {...} }
  ```

### Scheduler

- `POST /api/scheduler/start` - Start scheduled fetching
  ```json
  Request: { "sources": [...], "schedule": "*/15 * * * *" }
  ```

- `POST /api/scheduler/stop` - Stop scheduler
- `GET /api/scheduler/status` - Get scheduler status

## Integration Strategy

### Implementation Steps

1. **Keep localStorage for all data storage**
   - Articles, sources, collections remain in localStorage
   - No changes to storage utilities

2. **Update feed fetching to use backend**
   - Replace direct `fetch()` calls with backend API
   - Backend handles RSS parsing and web scraping
   - Frontend receives articles and stores in localStorage

3. **Add fallback mechanism**
   - If backend unavailable, fallback to direct fetch (with CORS limitations)
   - Graceful degradation for offline scenarios

4. **Optional: Scheduled fetching**
   - Backend can run scheduled jobs
   - Frontend polls backend for updates
   - Or frontend triggers manual refresh

### Data Flow

```
User Action → Frontend → Backend API → External Feeds
                                    ↓
                            Articles returned
                                    ↓
                            Frontend stores in localStorage
                                    ↓
                            UI updates from localStorage
```

## Testing

### Test Backend Health

```bash
curl http://localhost:3001/health
```

### Test Feed Fetching

```bash
curl -X POST http://localhost:3001/api/feeds/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "sources": [{
      "id": "test-1",
      "name": "Test Feed",
      "type": "rss",
      "url": "https://feeds.bbci.co.uk/news/rss.xml",
      "enabled": true,
      "createdAt": "2024-01-01T00:00:00Z"
    }]
  }'
```

## Troubleshooting

### CORS Issues

If you see CORS errors, ensure the backend has CORS enabled (already configured in `server.ts`).

### Connection Refused

- Check backend is running on correct port
- Verify `VITE_API_URL` matches backend URL
- Check firewall settings

### Feed Fetching Fails

- Check backend logs for errors
- Verify RSS feed URLs are accessible
- Test feed URL directly with curl

## Next Steps

1. **Enhanced Caching**: Consider Redis for shared cache across users (optional)
2. **AI Features**: Add endpoints for article summarization and categorization
3. **Rate Limiting**: Implement rate limiting per source
4. **Advanced Scraping**: Add Puppeteer/Playwright for complex scraping scenarios

**Note**: Database migration is optional and can be done later if needed. The current architecture with localStorage is sufficient for single-user scenarios.

## Resources

- [Backend README](../backend/README.md)
- [Migration Plan](./MIGRATION_PLAN.md)
- [Hosting Evaluation](./HOSTING_EVALUATION.md)
- [CORS Evaluation](./CORS_EVALUATION.md)

