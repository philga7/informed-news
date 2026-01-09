# GitHub Actions Setup for X.com Scraping

This guide explains how to configure GitHub Actions to trigger the Hetzner scraper.

## Required GitHub Secrets

You need to add two secrets to your GitHub repository:

### 1. `HETZNER_WEBHOOK_URL`

**What it is:** The full URL to your Hetzner server's webhook endpoint.

**How to get it:**
1. Get your Hetzner server's public IP address from the Hetzner console
2. The URL format is: `http://YOUR_SERVER_IP:3000/webhook`
   - Example: `http://123.45.67.89:3000/webhook`

**Note:** If you have a domain pointing to your Hetzner server, you can use that instead:
   - Example: `https://scraper.yourdomain.com/webhook`

### 2. `GITHUB_WEBHOOK_SECRET`

**What it is:** A secret string used to validate webhook requests (must match the value in Hetzner `.env`).

**How to generate it:**

**Option 1: Using OpenSSL (recommended)**
```bash
openssl rand -hex 32
```

**Option 2: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option 3: Using a password generator**
- Generate a random string (minimum 32 characters)
- Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

**Important:** This must be the **same value** as `GITHUB_WEBHOOK_SECRET` in your Hetzner server's `.env` file!

## Setting Up GitHub Secrets

1. **Go to your GitHub repository**
2. **Navigate to Settings**
   - Click on "Settings" tab in your repository
3. **Go to Secrets and variables → Actions**
   - In the left sidebar, click "Secrets and variables"
   - Click "Actions"
4. **Add the secrets**
   - Click "New repository secret"
   - Add each secret:
     - **Name:** `HETZNER_WEBHOOK_URL`
     - **Value:** `http://YOUR_SERVER_IP:3000/webhook`
   - Click "Add secret"
   - Repeat for `GITHUB_WEBHOOK_SECRET`

## Workflow Configuration

The workflow (`.github/workflows/xcom-scraping.yml`) is configured to:

- **Run automatically:** Every 4 hours (cron schedule)
- **Manual trigger:** Available from GitHub Actions UI
- **Timeout:** 60 minutes (scraping can take time with multiple profiles)

### Adjusting the Schedule

To change how often the scraper runs, edit the cron expression in the workflow:

```yaml
schedule:
  - cron: '0 */4 * * *'  # Every 4 hours
```

Common cron patterns:
- `'0 */1 * * *'` - Every hour
- `'0 */2 * * *'` - Every 2 hours
- `'0 */6 * * *'` - Every 6 hours
- `'0 0 * * *'` - Once daily at midnight UTC
- `'0 0,12 * * *'` - Twice daily (midnight and noon UTC)

## Testing the Workflow

### Manual Test

1. Go to **Actions** tab in your GitHub repository
2. Click on **X.com Scraping** workflow
3. Click **Run workflow** button (top right)
4. Select branch (usually `main` or `master`)
5. Click **Run workflow**

### Verify It Works

After running, check:
1. **GitHub Actions logs** - Should show success and scraping summary
2. **Hetzner server logs** - `docker compose logs scraper` should show webhook received
3. **Vercel database** - New tweets should appear in source records

## Troubleshooting

### Error: "HETZNER_WEBHOOK_URL secret is not set"
- **Solution:** Add the secret in GitHub repository settings

### Error: "GITHUB_WEBHOOK_SECRET is not set"
- **Solution:** Add the secret in GitHub repository settings

### Error: HTTP 401 (Unauthorized)
- **Cause:** Webhook secret mismatch
- **Solution:** Verify `GITHUB_WEBHOOK_SECRET` in GitHub matches the value in Hetzner `.env`

### Error: HTTP 404 (Not Found)
- **Cause:** Incorrect webhook URL
- **Solution:** Verify `HETZNER_WEBHOOK_URL` is correct and includes `/webhook` endpoint

### Error: HTTP 500 (Server Error)
- **Cause:** Hetzner server error
- **Solution:** Check Hetzner logs: `docker compose logs scraper`

### Workflow times out
- **Cause:** Scraping taking too long (many profiles or slow network)
- **Solution:** Increase timeout in workflow (currently 60 minutes) or reduce number of profiles

## Security Notes

- **Never commit secrets** to version control
- **Use strong, random secrets** for `GITHUB_WEBHOOK_SECRET`
- **Keep secrets synchronized** between GitHub and Hetzner
- **Rotate secrets periodically** for better security

## Next Steps

After setting up GitHub Actions:

1. ✅ Add both secrets to GitHub repository
2. ✅ Verify Hetzner server is running and accessible
3. ✅ Test with manual workflow trigger
4. ✅ Verify tweets appear in Vercel database
5. ✅ Monitor first scheduled run

## Workflow Output Example

When successful, the workflow will show:

```
✅ X.com scraping request completed (HTTP 200)
📊 Scraping Summary:
📈 Metrics:
  • Total sources: 3
  • Processed: 3
  • Succeeded: 2
  • Failed: 1
  • Duration: 245s
📋 Per-Source Results:
  • Profile 1 (@username1): ✅ 50 tweets scraped, 50 sent
  • Profile 2 (@username2): ✅ 30 tweets scraped, 30 sent
  • Profile 3 (@username3): ❌ 0 tweets scraped, 0 sent
```
