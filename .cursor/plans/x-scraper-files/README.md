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

- `package.json` - Dependencies and scripts (note: validate-session script is in main backend)
- `tsconfig.json` - TypeScript configuration
- `README.md` - This file

**Note:** The session extraction scripts (`extract-session.ts` and `validate-session.ts`) are located in the main backend directory at `backend/scripts/` to better organize dependencies. They're part of the main backend package, not this x-scraper-files package.

- **`extract-session.ts`** - Recommended: Connects to your existing browser session and extracts cookies
- **`validate-session.ts`** - Alternative: Opens a browser window for you to log in

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

Key dependencies (for the Hetzner scraper):
- `playwright` + `playwright-extra` - Browser automation
- `puppeteer-extra-plugin-stealth` - Anti-detection
- `express` - Web server
- `winston` - Logging
- `dotenv` - Environment variables

**Note:** The session validation script uses the same Playwright dependencies, which are installed in the main `backend/package.json` for local development.

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

### Local Session Extraction

The simplest way to get your X.com session is to log in normally in your browser and extract it. The session extraction scripts are located in the main backend directory (`backend/scripts/`), not in this x-scraper-files directory.

#### Recommended: Extract Session (Simplest)

```bash
cd backend
npm run extract-session
```

This script:
1. Launches or connects to Chrome/Edge with remote debugging
2. Opens X.com (or uses your existing X.com tab)
3. You log in normally with phil@informedcrew.com (including any verification codes)
4. Press Enter in the terminal when you're logged in
5. Extracts and saves the session to `backend/sessions/auth.json`

**That's it!** The script connects to your browser and extracts the session automatically.

#### Alternative: Validate Session (Opens Browser for You)

If you prefer the script to open a browser window for you:

```bash
cd backend
npm run validate-session
```

This script:
1. Opens a browser window (non-headless) on your local machine
2. Navigates to X.com login page
3. Waits for you to manually log in (including any verification codes)
4. Automatically detects when login is successful
5. Saves the session to `backend/sessions/auth.json`

**Transfer to Hetzner:**

After extraction/validation, transfer the session file to your Hetzner server:

```bash
# Using SCP (from project root)
scp backend/sessions/auth.json user@hetzner-server:~/x-scraper/sessions/auth.json

# Or using rsync
rsync -avz backend/sessions/auth.json user@hetzner-server:~/x-scraper/sessions/
```

The scraper on Hetzner will automatically use this session for authentication, avoiding the need for repeated logins or manual intervention on the server.

**Dependencies:** The backend package.json includes the required Playwright dependencies. Make sure to run `npm install` in the backend directory first.

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
