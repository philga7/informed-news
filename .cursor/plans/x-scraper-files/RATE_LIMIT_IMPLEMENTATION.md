# X.com Scraping Rate Limit Implementation

## Overview

This implementation adds **Supabase-backed global rate limiting** to ensure we never exceed X.com's 300 requests/hour limit, even when manually triggering workflows or running multiple Hetzner servers.

## Key Features

✅ **Global Rate Limiting**: Tracks requests across all Hetzner servers in Supabase  
✅ **Pre-Scraping Check**: Validates rate limits BEFORE starting scraping (even on manual triggers)  
✅ **Automatic Enforcement**: Returns 429 error if limit exceeded  
✅ **Hourly Windows**: Resets every hour automatically  
✅ **Database Functions**: Efficient PostgreSQL functions for rate limit operations  

## Architecture

```
┌─────────────────┐
│ GitHub Actions  │
│  (Manual/Sched) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Hetzner Server  │
│  /webhook       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Step 1: Check Supabase Rate     │
│ Limit (via Vercel API)          │
│ POST /api/xcom-rate-limit/      │
│ increment                       │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  ✅ Pass   ❌ Fail (429)
    │         │
    │         └─► Return error, stop
    │
    ▼
┌─────────────────┐
│ Step 2: Fetch  │
│ Sources         │
└────────┬────────┘
         │
    (Continue scraping...)
```

## Database Schema

### Table: `xcom_scraping_rate_limits`

Tracks rate limits per hour window:

- `id` (UUID) - Primary key
- `hour_window` (TIMESTAMPTZ) - The hour being tracked (truncated to hour)
- `request_count` (INTEGER) - Number of requests in this hour
- `last_request_at` (TIMESTAMPTZ) - Last request timestamp
- `created_at`, `updated_at` - Timestamps

**Unique Constraint**: One record per hour window

### Database Functions

1. **`check_xcom_rate_limit()`**
   - Checks current rate limit status WITHOUT incrementing
   - Returns: `can_proceed`, `current_count`, `max_requests`, `reset_at`, `requests_remaining`

2. **`increment_xcom_rate_limit()`**
   - Increments counter and checks if can proceed
   - Returns: Same as above + `can_proceed` flag
   - Used before starting scraping to reserve a slot

3. **`get_current_xcom_rate_limit()`**
   - Gets or creates current hour window record
   - Internal helper function

4. **`cleanup_old_xcom_rate_limits()`**
   - Removes records older than 24 hours
   - Can be run periodically for maintenance

## API Endpoints

### GET `/api/xcom-rate-limit/check`

Check rate limit status without incrementing.

**Response:**
```json
{
  "can_proceed": true,
  "current_count": 45,
  "max_requests": 300,
  "reset_at": "2024-01-15T15:00:00Z",
  "requests_remaining": 255
}
```

### POST `/api/xcom-rate-limit/increment`

Increment rate limit counter and check if scraping can proceed.

**Response (Success):**
```json
{
  "can_proceed": true,
  "current_count": 46,
  "max_requests": 300,
  "reset_at": "2024-01-15T15:00:00Z",
  "requests_remaining": 254
}
```

**Response (Rate Limit Exceeded - 429):**
```json
{
  "error": "Rate limit exceeded",
  "can_proceed": false,
  "current_count": 300,
  "max_requests": 300,
  "reset_at": "2024-01-15T15:00:00Z",
  "requests_remaining": 0,
  "message": "Rate limit of 300 requests/hour exceeded. Reset at 2024-01-15T15:00:00Z"
}
```

## Implementation Details

### Hetzner Server (`src/index.ts`)

**Before starting scraping:**
1. Webhook received (manual or scheduled)
2. **NEW**: Call `incrementSupabaseRateLimit()` via Vercel API
3. If `can_proceed === false`, return 429 error immediately
4. If `can_proceed === true`, continue with scraping

**Code Flow:**
```typescript
// Step 1: Check Supabase rate limit BEFORE starting
const rateLimitCheck = await incrementSupabaseRateLimit(VERCEL_API_ENDPOINT);

if (!rateLimitCheck.can_proceed) {
  return res.status(429).json({
    error: 'Rate limit exceeded',
    // ... details
  });
}

// Step 2: Continue with scraping...
```

### Local Rate Limiting (Still Active)

The local file-based rate limiting in `utils.ts` is still active for:
- Per-request delays (2-10 seconds)
- Local request counting
- Additional safety layer

**Both systems work together:**
- **Supabase**: Global enforcement (prevents exceeding 300/hour across all servers)
- **Local**: Per-request delays and local tracking

## Migration

Run the migration to create the table and functions:

```bash
# Apply migration
supabase migration up

# Or via Supabase dashboard:
# Upload: supabase/migrations/20250115000001_xcom_scraping_rate_limits.sql
```

## Testing

### Test Rate Limit Check

**Production Domain** (recommended - no authentication required):
```bash
# Check current status
curl https://news.informedcrew.com/api/xcom-rate-limit/check

# Increment and check
curl -X POST https://news.informedcrew.com/api/xcom-rate-limit/increment
```

**Preview Deployments** (requires authentication bypass):

If testing a preview deployment URL, you'll need to use Vercel's bypass token:

1. **Get the bypass token:**
   - Go to Vercel Dashboard → Your Project → Settings → Deployment Protection
   - Enable "Protection Bypass for Automation"
   - Copy the generated secret

2. **Use the bypass token in requests:**
   ```bash
   # Option 1: Using query parameter
   curl "https://your-preview-url.vercel.app/api/xcom-rate-limit/check?x-vercel-protection-bypass=YOUR_BYPASS_TOKEN"
   
   # Option 2: Using header (if available)
   curl -H "x-vercel-protection-bypass: YOUR_BYPASS_TOKEN" \
        https://your-preview-url.vercel.app/api/xcom-rate-limit/check
   ```

**Expected Response (Success):**
```json
{
  "can_proceed": true,
  "current_count": 45,
  "max_requests": 300,
  "reset_at": "2024-01-15T15:00:00Z",
  "requests_remaining": 255
}
```

### Test Manual Trigger

1. Go to GitHub Actions → X.com Scraping
2. Click "Run workflow"
3. If rate limit exceeded, you'll see:
   ```
   ❌ Rate limit exceeded
   Rate limit of 300 requests/hour exceeded. Current count: 300
   ```

### Test Scheduled Trigger

The scheduled trigger will also check rate limits before starting, so it will automatically skip if the limit is reached.

## Error Handling

### Rate Limit Exceeded (429)

When rate limit is exceeded:
- **Hetzner server** returns 429 with details
- **GitHub Actions** workflow shows error in logs
- **No scraping occurs** - safe for X.com

### API Errors

If Vercel API is unavailable:
- Hetzner code is **conservative**: assumes rate limit exceeded
- Returns error instead of proceeding
- Prevents accidental violations

## Monitoring

### Check Current Rate Limit Status

```sql
-- Check current hour window
SELECT * FROM xcom_scraping_rate_limits 
WHERE hour_window = date_trunc('hour', NOW());

-- Check all recent windows
SELECT * FROM xcom_scraping_rate_limits 
ORDER BY hour_window DESC 
LIMIT 10;
```

### Cleanup Old Records

```sql
-- Manually cleanup old records (older than 24 hours)
SELECT cleanup_old_xcom_rate_limits();
```

## Important Notes

1. **Manual Triggers**: Rate limit is checked even on manual triggers - no bypass
2. **Multiple Servers**: All Hetzner servers share the same rate limit counter
3. **Hour Windows**: Resets automatically at the top of each hour
4. **Conservative Approach**: On API errors, we assume rate limit exceeded (safer)
5. **Local + Global**: Both local and Supabase rate limiting work together

## Future Enhancements

- [ ] Add rate limit dashboard in frontend
- [ ] Alert when approaching limit (e.g., >250 requests)
- [ ] Per-organization rate limits (if needed)
- [ ] Rate limit history/analytics
- [ ] Automatic cleanup job for old records
