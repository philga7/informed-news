# X.com Scraper - TypeScript Implementation

This directory contains the four TypeScript files for the X.com scraping service that will run on Hetzner CPX11.

## Files Created

### 1. `src/index.ts` - Express Webhook Server
- Receives webhook triggers from GitHub Actions
- Validates webhook secret
- Discovers enabled X.com sources from Vercel API (pull model)
- Orchestrates sequential profile scraping (one at a time)
- Sends scraped tweets to Vercel API with retry logic
- Returns processing summary

**Key Features:**
- Health check endpoint (`GET /health`)
- Webhook endpoint (`POST /webhook`)
- Source discovery from Vercel API
- Sequential processing (no parallelization)
- Comprehensive error handling and logging

### 2. `src/auth.ts` - X.com Authentication
- Handles X.com login flow with credentials
- Session persistence using Playwright `storageState`
- Reuses existing sessions when valid
- Handles login challenges (captcha, verification)
- Saves session to `sessions/auth.json`

**Key Features:**
- Session validation before re-authentication
- Automatic session reuse
- Error handling for login challenges
- Rate limiting integration

### 3. `src/scraper.ts` - Playwright Scraping Logic
- Scrapes tweets from X.com profiles
- Uses Playwright with stealth plugins for anti-detection
- Human-like behavior (scrolling, waiting)
- Extracts tweet data: content, URL, timestamp, engagement metrics
- Handles private/protected profiles and rate limits

**Key Features:**
- Stealth mode with anti-detection
- Scroll-based pagination
- Engagement metrics extraction (likes, retweets, replies, views)
- Error handling for various edge cases
- Rate limiting integration

### 4. `src/utils.ts` - Helper Functions
- Winston logging setup with file rotation
- Rate limiting (300 req/hour enforcement)
- Randomized delays (2-10 seconds)
- Exponential backoff for retries
- Vercel API communication (fetch sources, send tweets)
- Type definitions

**Key Features:**
- Persistent rate limit state (file-based)
- Configurable logging levels
- Retry logic with exponential backoff
- Source discovery from Vercel API
- Batch tweet ingestion to Vercel API

## Additional Files

- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `README.md` - This file

## Important Notes

### Dockerfile Update Required

The Dockerfile in the setup guide shows:
```dockerfile
CMD ["node", "src/index.js"]
```

Since we're using TypeScript, you'll need to either:

**Option 1: Compile before building Docker image**
```dockerfile
# Add build step
RUN npm run build

# Update CMD
CMD ["node", "dist/index.js"]
```

**Option 2: Use tsx for development**
```dockerfile
# For development only
CMD ["npx", "tsx", "src/index.ts"]
```

### Environment Variables

Required environment variables (from `.env`):
- `X_USERNAME` - X.com scraper account username
- `X_PASSWORD` - X.com scraper account password
- `VERCEL_API_ENDPOINT` - Base URL for Vercel API (e.g., `https://your-site.vercel.app`)
- `WEBHOOK_SECRET` - Secret for webhook validation
- `PORT` - Server port (default: 3000)
- `LOG_LEVEL` - Winston log level (default: 'info')

### Directory Structure

The application expects these directories to exist (created automatically):
- `sessions/` - For auth session and rate limit state
- `logs/` - For Winston log files

### Dependencies

Key dependencies:
- `playwright` + `playwright-extra` - Browser automation
- `puppeteer-extra-plugin-stealth` - Anti-detection
- `express` - Web server
- `winston` - Logging
- `dotenv` - Environment variables

### TypeScript Compilation

To compile for production:
```bash
npm run build
```

This will output compiled JavaScript to `dist/` directory.

### Development

For development with hot reload:
```bash
npm run dev
```

This uses `tsx` to run TypeScript directly without compilation.

### Manual Login (for X.com Verification Issues)

If X.com requires email verification codes or other manual verification steps, you can use the manual login helper:

```bash
npm run manual-login
```

This script:
1. Opens a browser window (non-headless)
2. Navigates to X.com login page
3. Waits for you to manually log in (including any verification codes)
4. After successful login, press Enter in the terminal
5. Saves the session to `sessions/auth.json`

The scraper will then reuse this session for future runs, avoiding the need for repeated logins.

## Integration Points

### Vercel API Endpoints Used

1. **GET `/api/sources?source_type=xcom&enabled=true`**
   - Fetches enabled X.com sources
   - Returns: `{ sources: Array<{id, organization_id, name, url, ...}> }`

2. **POST `/api/ingest/xcom`**
   - Sends batch of tweets for ingestion
   - Body: `{ organization_id, source_id, tweets: Array<{title, content, url, published_at, raw_metadata}> }`
   - Returns: `{ success, added, skipped, errors }`

### GitHub Actions Webhook

The webhook expects:
- Header: `x-webhook-secret` with `WEBHOOK_SECRET` value
- Or body: `{ secret: "..." }`

## Rate Limiting

- **300 requests/hour** - Enforced via file-based state tracking
- **2-10 second delays** - Randomized between requests
- **Exponential backoff** - On 429/503 errors (up to 60s max)

## Error Handling

The implementation includes comprehensive error handling for:
- Authentication failures
- Login challenges (captcha, verification)
- Rate limit detection
- Network errors
- Invalid profiles (private, non-existent)
- Vercel API failures (with 3 retry attempts)

## Next Steps

1. Copy these files to your Hetzner server (`~/x-scraper/`)
2. Update Dockerfile to compile TypeScript or use tsx
3. Install dependencies: `npm install`
4. Configure `.env` file with credentials
5. Build and run: `docker compose up -d`

## Architecture Notes

- **Pull Model**: Hetzner queries Vercel for enabled sources (no hardcoded list)
- **Sequential Processing**: One profile at a time (no parallelization)
- **Session Persistence**: Reuses X.com session to avoid repeated logins
- **Retry Logic**: 3 attempts for Vercel API calls with exponential backoff
- **Comprehensive Logging**: Winston with file rotation for debugging
