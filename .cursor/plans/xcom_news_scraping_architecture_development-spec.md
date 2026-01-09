# X.com News Scraping Architecture - Development Spec

## Infrastructure
- **Backend**: Hetzner CPX11 (2 vCPU, 4GB RAM, 40GB storage) in Ashburn, VA
- **OS**: Ubuntu 24.04 with Docker
- **Cost**: $5.99/month with backups included
- **Deployment**: Persistent 24/7 server (not ephemeral)
- **Frontend**: Vercel-hosted news analysis site

## Technical Stack
- Node.js/TypeScript
- Playwright with `playwright-extra` and `puppeteer-extra-plugin-stealth` for anti-detection
- Express API server to receive webhook triggers from GitHub Actions
- Docker container for Playwright (~2-3GB image)
- Session persistence using `storageState` for cookie management

## X.com Scraping Requirements

### Authentication
- Use dedicated X.com account credentials (NOT personal account)
- Implement persistent session storage to avoid repeated logins
- Store auth cookies in `auth.json` for session reuse

### Rate Limiting & Detection Avoidance
- Stay under 300 requests/hour per authenticated session
- Implement human-like delays: 2-10 seconds randomized between requests
- Use exponential backoff on errors (429, 503)
- Maintain consistent user-agent and browser fingerprint
- Session behavior should mimic real user (scroll, wait for elements)

### Anti-Detection Configuration
```javascript
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const context = await browser.newContext({
  storageState: 'auth.json',
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Mozilla/5.0...' // Use realistic UA
});
```

## Architecture Flow
1. GitHub Actions workflow triggers on schedule (hourly/custom)
2. Webhook hits Hetzner Express endpoint
3. Playwright scraper authenticates, collects data from target profiles
4. Data formatted and sent to Vercel API endpoint
5. Vercel frontend updates/revalidates with new data

## Monitoring & Fallback
- Log all requests with timestamps
- Track rate limit headers from X.com responses
- Implement health check endpoint for GitHub Actions
- **If detection occurs**: Add residential proxy layer (Smartproxy/BrightData)
- Alert on: captchas, 429 errors, login challenges

## Scaling Considerations
- Current setup supports ~50-100 profiles per hour comfortably
- If exceeding 300 req/hour: add residential proxies via Playwright proxy config
- Storage monitoring: 40GB should handle logs + temp data for months
- Backup strategy: Hetzner automated backups capture full disk state

## Environment Variables
```env
X_USERNAME=scraper_account
X_PASSWORD=secure_password
VERCEL_API_ENDPOINT=https://your-site.vercel.app/api/ingest
GITHUB_WEBHOOK_SECRET=for_validating_triggers
```

## Initial Development Tasks
1. Set up Hetzner CPX11 server with Ubuntu 24.04
2. Install Docker, configure Playwright container
3. Create Express webhook receiver
4. Implement Playwright scraper with stealth plugins
5. Build session persistence and auth flow
6. Create Vercel API ingestion endpoint
7. Configure GitHub Actions workflow for scheduling
8. Implement monitoring and error logging

**Start without proxies** - add only if Hetzner datacenter IP gets flagged.
```
