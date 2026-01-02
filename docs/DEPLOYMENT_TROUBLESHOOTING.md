# Vercel Deployment Troubleshooting Guide

## How to Check Serverless Function Logs

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click on the deployment that's failing
4. Click the "Functions" tab
5. Click on `/api` function
6. Click the "Logs" tab
7. Look for error messages - these will show the actual runtime error

## Common Issues

### 500 Internal Server Error

**Possible Causes:**

1. **Missing Environment Variables**
   - Check that all required env vars are set in Vercel dashboard
   - Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

2. **Module Import Errors**
   - Check logs for "Cannot find module" errors
   - Verify all dependencies are in root `package.json`

3. **TypeScript Compilation Errors**
   - Check build logs for TypeScript errors
   - Some may be suppressed with `@ts-ignore` but still cause runtime issues

4. **Supabase Connection Issues**
   - Verify environment variables are correct
   - Check if Supabase project is accessible

### Testing Locally

You can test the serverless function locally:

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Run locally (this uses your local .env file)
vercel dev
```

This will start a local server that mimics Vercel's serverless environment.

### Environment Variables Checklist

Ensure these are set in Vercel Dashboard → Settings → Environment Variables:

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `VITE_SUPABASE_URL` (same as SUPABASE_URL)
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `OLLAMA_API_KEY` (optional)
- [ ] `OLLAMA_MODEL` (optional)

### Testing the API Endpoint

Test the health endpoint first:
```bash
curl https://your-app.vercel.app/api/health
```

Should return:
```json
{"status":"ok","timestamp":"..."}
```

If this fails, the issue is with the serverless function setup itself.

