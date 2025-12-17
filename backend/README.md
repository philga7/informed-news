# Informed News Backend Service

Express backend service acting as a **stateless proxy** for feed fetching, solving CORS limitations and enabling future AI features.

## Architecture

This backend service is **stateless** and does NOT store any user data. It serves as a proxy layer that:
- Fetches RSS feeds and web content (bypassing CORS restrictions)
- Caches feed responses temporarily (in-memory, 5-minute TTL)
- Provides scheduled fetching capabilities
- Returns fetched data to the frontend, which stores it in localStorage

All application data (articles, sources, collections, preferences) remains in the frontend's localStorage.

## Features

- **Feed Fetching**: RSS feed parsing and web scraping without CORS limitations
- **Caching**: In-memory cache for feed responses (5-minute TTL) to reduce redundant requests
- **Scheduled Fetching**: Automatic feed updates using cron jobs (optional)
- **Error Handling**: Robust error handling with retry logic support

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

### Feeds

- `POST /api/feeds/fetch` - Fetch news from all enabled sources
- `POST /api/feeds/fetch/:sourceId` - Fetch news from a specific source
- `GET /api/feeds/cache/stats` - Get cache statistics
- `DELETE /api/feeds/cache/:sourceId` - Clear cache for a source
- `DELETE /api/feeds/cache` - Clear all cache

### Sources

- `POST /api/sources/test` - Test a news source configuration

### Scheduler

- `POST /api/scheduler/start` - Start scheduled feed fetching
- `POST /api/scheduler/stop` - Stop scheduled feed fetching
- `GET /api/scheduler/status` - Get scheduler status

### Health

- `GET /health` - Health check endpoint

## Environment Variables

- `PORT` - Server port (default: 3001)

## Future Enhancements

- Redis caching layer (shared cache across users)
- AI processing endpoints (summarization, categorization)
- Advanced scraping with Puppeteer/Playwright
- Rate limiting and retry logic
- Background job queue for async processing

**Note**: Database integration is optional and can be added later if multi-device sync or shared data is needed. The current stateless architecture works well with localStorage-based storage.

