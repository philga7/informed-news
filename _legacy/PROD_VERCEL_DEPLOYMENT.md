# Vercel Deployment Guide

This guide covers deploying the Informed News application to Vercel with both frontend and backend functionality.

## Architecture

The application is deployed as:
- **Frontend**: Static Vite build served from `/dist`
- **Backend**: Serverless functions in `/api` directory
- **Database**: Supabase (external)
- **AI Analysis**: Ollama Cloud API (external)

## Prerequisites

1. [Vercel Account](https://vercel.com)
2. [Vercel CLI](https://vercel.com/cli) (optional, for local testing)
3. Supabase project with credentials
4. Ollama API key (optional, for AI features)

## Environment Variables

Configure these in your Vercel project settings (Project > Settings > Environment Variables):

### Required Variables

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Optional Variables

```env
# Ollama AI Analysis (optional)
OLLAMA_API_KEY=your-ollama-api-key
OLLAMA_MODEL=gpt-oss:120b
```

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Connect Repository**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New" > "Project"
   - Import your GitHub repository

2. **Configure Project**
   - Framework Preset: **Vite**
   - Root Directory: `./` (leave as default)
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `dist` (auto-detected)
   - Install Command: `npm install` (auto-detected)

3. **Add Environment Variables**
   - Go to Project Settings > Environment Variables
   - Add all required variables (see above)
   - Set for: Production, Preview, Development (as needed)

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app will be live at `https://your-project.vercel.app`

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   # Deploy to preview
   vercel
   
   # Deploy to production
   vercel --prod
   ```

4. **Add Environment Variables**
   ```bash
   # Add variables one by one
   vercel env add SUPABASE_URL
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   # ... etc
   ```

## Local Testing with Vercel Dev

To test the production build locally:

1. **Install Dependencies**
   ```bash
   npm install
   cd backend && npm install && cd ..
   ```

2. **Create `.env` file in project root**
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   OLLAMA_API_KEY=your-ollama-api-key (optional)
   ```

3. **Run Vercel Dev**
   ```bash
   vercel dev
   ```

4. **Test**
   - Frontend: `http://localhost:3000`
   - API Health: `http://localhost:3000/api/health`

## Local Development (Non-Vercel)

For regular development, continue using:

```bash
npm run dev
```

This runs:
- Frontend (Vite): `http://localhost:5173`
- Backend (Express): `http://localhost:3001`

## API Routes

All API routes are accessible at `/api/*`:

- `GET /api/health` - Health check
- `POST /api/feeds/fetch` - Fetch feeds (deprecated)
- `POST /api/ingest/rss` - RSS ingestion
- `POST /api/ingest/manual` - Manual content ingestion
- `GET /api/topics` - Get topics
- `GET /api/source-records` - Get source records
- `POST /api/analysis/source-records/:id/summarize` - AI summary
- `POST /api/analysis/source-records/:id/entities` - Entity extraction
- `POST /api/analysis/source-records/:id/tone` - Tone analysis

## Scheduling & Cron Jobs

The scheduler routes (`/api/scheduler/*`) are excluded from production deployment.

For automated ingestion, use **GitHub Actions** workflows:

```yaml
# .github/workflows/ingest-rss.yml
name: RSS Ingestion
on:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger RSS Ingestion
        run: |
          curl -X POST https://your-app.vercel.app/api/ingest/rss \
            -H "Content-Type: application/json" \
            -d '{"organization_id": "${{ secrets.ORG_ID }}", "source_id": "${{ secrets.SOURCE_ID }}"}'
```

## Troubleshooting

### Build Fails

1. Check build logs in Vercel dashboard
2. Ensure all dependencies are in `package.json`
3. Verify TypeScript compiles: `npm run typecheck`

### API Routes Return 404

1. Check `vercel.json` is in project root
2. Verify `api/index.ts` exists
3. Check deployment logs for errors

### Database Connection Errors

1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
2. Check Supabase project is active
3. Test connection: `curl https://your-app.vercel.app/api/health`

### AI Analysis Not Working

1. Verify `OLLAMA_API_KEY` is set in Vercel
2. Check if Ollama service is available
3. AI routes will return 503 if not configured (this is expected)

## Performance Considerations

### Cold Starts

Serverless functions have cold starts (~1-3 seconds). For critical paths:
- Keep functions small
- Consider Edge Functions for critical routes
- Use connection pooling for database

### Timeouts

Vercel has execution limits:
- Hobby: 10 seconds
- Pro: 60 seconds
- Enterprise: 900 seconds

For long-running tasks (like large RSS ingestion), consider:
- Breaking into smaller batches
- Using GitHub Actions
- External job queue (e.g., Vercel Cron Jobs)

## Monitoring

Monitor your deployment via:
- **Vercel Dashboard**: Deployment logs, analytics, errors
- **Supabase Dashboard**: Database queries, RLS policies
- **Browser DevTools**: Network tab for API calls

## Next Steps

1. Set up GitHub Actions for scheduled ingestion
2. Configure custom domain in Vercel
3. Enable Preview Deployments for pull requests
4. Set up error tracking (Sentry, LogRocket, etc.)
5. Configure analytics (Vercel Analytics, Google Analytics, etc.)

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Documentation](https://vitejs.dev)
- [Supabase Documentation](https://supabase.com/docs)

