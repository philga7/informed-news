# Testing Guide: Plan 6 Ollama Integration

This guide walks you through testing the AI-assisted analysis features.

## Prerequisites

Before testing, ensure you have:

1. ✅ Supabase project set up with migrations applied
2. ✅ Backend running with valid environment variables
3. ✅ Frontend running and connected to backend
4. ✅ At least one source record in the database to test with

## Step 1: Configure Ollama API Key

### Get Your API Key

1. Visit [https://ollama.com](https://ollama.com)
2. Sign in or create a free account
3. Navigate to your account settings/API section
4. Generate a new API key
5. Copy the key

### Add to Backend Environment

Edit `backend/.env`:

```bash
# Ollama Cloud API Configuration
OLLAMA_API_KEY=your_actual_api_key_here
OLLAMA_MODEL=gpt-oss:120b
```

### Restart Backend

```bash
cd backend
npm run dev
```

**Expected output WITH API key**:
```
✅ Ollama Cloud API configured (API key present)
   Model: gpt-oss:120b
   Note: Actual connectivity will be verified on first API call
🚀 Backend server running on http://localhost:3001
```

**Expected output WITHOUT API key**:
```
⚠️  OLLAMA_API_KEY not configured - AI analysis will be disabled
   Get your API key from https://ollama.com and add to backend/.env
🚀 Backend server running on http://localhost:3001
```

If you see the warning → Add your API key to `backend/.env` and restart the backend.

## Step 2: Verify Backend Setup

### Test 1: Health Check

```bash
curl http://localhost:3001/health
```

**Expected response**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-01T..."
}
```

### Test 2: Check Ollama Service (Backend Logs)

Look for these lines in your backend terminal:

**Success** (with API key):
```
✅ Ollama Cloud API configured (API key present)
   Model: gpt-oss:120b
   Note: Actual connectivity will be verified on first API call
```

**Failure** (without API key):
```
⚠️  OLLAMA_API_KEY not configured - AI analysis will be disabled
   Get your API key from https://ollama.com and add to backend/.env
```

If you see the warning → Add your API key to `backend/.env` and restart.

## Step 3: Create or Find a Test Source Record

You need at least one source record to test with. Two options:

### Option A: Use Existing Source Record

1. Open frontend: `http://localhost:5173`
2. Navigate to "Source Records" page
3. Click on any existing record
4. Note the record ID in the URL: `/source-records/{ID}`

### Option B: Create New Source Record via Ingestion

```bash
# Run ingestion for a source
curl -X POST http://localhost:3001/api/ingest/source/{source-id}
```

## Step 4: Test Backend API Endpoints

### Test Summarization Endpoint

```bash
# Replace {record-id} with an actual source record ID
curl -X POST http://localhost:3001/api/analysis/source-records/{record-id}/summarize \
  -H "Content-Type: application/json"
```

**Expected response** (takes 5-30 seconds):
```json
{
  "success": true,
  "artifact": {
    "id": "uuid-here",
    "source_record_id": "record-id",
    "type": "summary",
    "payload": {
      "summary": "Brief overview of the article...",
      "bulletPoints": [
        "First key point",
        "Second key point",
        "Third key point"
      ]
    },
    "model_name": "gpt-oss:120b",
    "reviewed": false,
    "created_by": "system:ollama",
    "created_at": "2026-01-01T..."
  }
}
```

**Possible errors**:

❌ **503 Service Unavailable**:
```json
{
  "error": "AI analysis service not available",
  "message": "OLLAMA_API_KEY not configured"
}
```
→ Fix: Add API key to `.env` and restart backend.

❌ **404 Not Found**:
```json
{
  "error": "Source record not found"
}
```
→ Fix: Use a valid source record ID.

❌ **400 Bad Request**:
```json
{
  "error": "No content available to analyze"
}
```
→ Fix: The source record has no title or content. Use a different record.

❌ **500 Internal Server Error**:
```json
{
  "error": "Failed to generate summary",
  "message": "Ollama API request timed out"
}
```
→ The API request took too long. Try again or check network connection.

### Test Entity Extraction

```bash
curl -X POST http://localhost:3001/api/analysis/source-records/{record-id}/entities \
  -H "Content-Type: application/json"
```

**Expected response**:
```json
{
  "success": true,
  "artifact": {
    "id": "uuid-here",
    "type": "entity_extraction",
    "payload": {
      "people": ["John Doe", "Jane Smith"],
      "organizations": ["Company Inc", "Organization Name"],
      "locations": ["New York", "Washington DC"],
      "dates": ["January 1, 2026", "2026-01-01"]
    },
    ...
  }
}
```

### Test Tone Analysis

```bash
curl -X POST http://localhost:3001/api/analysis/source-records/{record-id}/tone \
  -H "Content-Type: application/json"
```

**Expected response**:
```json
{
  "success": true,
  "artifact": {
    "id": "uuid-here",
    "type": "tone_analysis",
    "payload": {
      "overallTone": "neutral",
      "confidence": 0.85,
      "indicators": [
        "Uses factual language",
        "Presents multiple perspectives"
      ],
      "sentiment": "neutral",
      "biasSignals": [
        "No apparent bias detected"
      ]
    },
    ...
  }
}
```

### Test Getting Artifacts

```bash
curl http://localhost:3001/api/analysis/source-records/{record-id}/artifacts
```

**Expected response**:
```json
{
  "success": true,
  "artifacts": [
    { "id": "...", "type": "summary", ... },
    { "id": "...", "type": "entity_extraction", ... },
    { "id": "...", "type": "tone_analysis", ... }
  ]
}
```

### Test Updating Review Status

```bash
# Mark artifact as reviewed
curl -X PATCH http://localhost:3001/api/analysis/artifacts/{artifact-id} \
  -H "Content-Type: application/json" \
  -d '{"reviewed": true}'
```

**Expected response**:
```json
{
  "success": true,
  "artifact": {
    "id": "artifact-id",
    "reviewed": true,
    ...
  }
}
```

## Step 5: Test Frontend UI

### Open Source Record Detail Page

1. Start frontend: `npm run dev` (from project root)
2. Navigate to `http://localhost:5173`
3. Log in if needed
4. Go to "Source Records" page
5. Click on any source record

### Verify UI Elements Present

You should see:

✅ **AI-Assisted Analysis Section**:
- Section header with sparkles icon
- Description text about verification
- Three buttons:
  - "Generate Summary" (FileText icon)
  - "Extract Entities" (Users icon)
  - "Analyze Tone" (MessageSquare icon)

✅ **Analysis History Section** (if artifacts exist):
- Header showing count: "Analysis History (3)"
- List of artifact cards

### Test: Generate Summary

1. Click **"Generate Summary"** button
2. **Watch for**:
   - Button changes to "Generating..." with spinner
   - All buttons become disabled
   - Takes 5-30 seconds
3. **After completion**:
   - New artifact card appears at bottom
   - Button returns to normal state
   - Card shows amber warning header
   - Card is collapsed by default

### Test: Expand Artifact

1. Click on the artifact card to expand
2. **Verify**:
   - Overview text is displayed
   - Bullet points are listed
   - Footer shows:
     - "Reviewed and accepted" checkbox (unchecked)
     - "Dismiss" button with trash icon
   - Model name and timestamp displayed

### Test: Review Checkbox

1. Expand an artifact
2. Check the "Reviewed and accepted" checkbox
3. **Verify**:
   - Checkbox becomes checked
   - Icon changes from gray circle to green checkmark
   - Database updated (refresh page - checkbox remains checked)

### Test: Extract Entities

1. Click **"Extract Entities"** button
2. Wait for completion
3. Expand the new artifact
4. **Verify**:
   - Entities grouped by type (People, Organizations, Locations, Dates)
   - Each entity in a badge
   - No entities if none found in text

### Test: Analyze Tone

1. Click **"Analyze Tone"** button
2. Wait for completion
3. Expand the new artifact
4. **Verify**:
   - Overall Tone badge (colored)
   - Sentiment badge (colored)
   - Confidence percentage
   - Indicators list
   - Bias Signals list

### Test: Delete Artifact

1. Expand any artifact
2. Click **"Dismiss"** button
3. **Verify**:
   - Browser confirmation dialog appears
   - Click "OK"
   - Artifact disappears from list
   - Count updates

## Step 6: Test Error Scenarios

### Test: No API Key

1. Stop backend
2. Remove `OLLAMA_API_KEY` from `.env`
3. Restart backend
4. Try generating analysis in UI
5. **Expected**:
   - Alert/error message appears
   - Something like "AI analysis service not available"

### Test: Invalid API Key

1. Set `OLLAMA_API_KEY` to "invalid-key-123"
2. Restart backend
3. Try generating analysis
4. **Expected**:
   - Request fails after attempt
   - Error message about authentication/authorization

### Test: Record with No Content

1. Find or create a source record with no content field
2. Try generating summary
3. **Expected**:
   - Works if title exists (uses title only)
   - Error if both title and content are empty

### Test: Network Timeout

This is hard to test manually, but the code has 30-second timeout protection. If you want to test:

1. Temporarily modify `ollamaService.ts` to set shorter timeout:
```typescript
private timeout: number = 3000; // 3 seconds instead of 30
```
2. Try analysis on a long article
3. Should see timeout error

## Step 7: Verify Database

Check that artifacts are being stored correctly:

### Using Supabase Dashboard

1. Open Supabase dashboard
2. Go to Table Editor
3. Select `analytic_artifacts` table
4. **Verify**:
   - New rows appear after each analysis
   - `type` field is correct (summary, entity_extraction, tone_analysis)
   - `payload` contains JSON data
   - `model_name` is "gpt-oss:120b"
   - `reviewed` defaults to false
   - `created_by` is "system:ollama"
   - `source_record_id` matches your test record

### Using SQL

```sql
-- Get all artifacts for a source record
SELECT 
  id,
  type,
  reviewed,
  model_name,
  created_at,
  payload
FROM analytic_artifacts
WHERE source_record_id = 'your-record-id'
ORDER BY created_at DESC;
```

## Step 8: Test Multiple Users/Organizations

If you have multiple organizations:

1. Log in as user from Org A
2. Generate analysis on a source record from Org A
3. Log in as user from Org B
4. Try to access Org A's source record
5. **Verify**: Row Level Security prevents access

## Common Issues & Solutions

### Issue: "Module not found: ollama"

**Solution**:
```bash
cd backend
npm install ollama
npm run dev
```

### Issue: Analysis buttons do nothing

**Checks**:
1. Open browser DevTools → Console
2. Look for JavaScript errors
3. Check Network tab for failed requests
4. Verify backend is running on port 3001

### Issue: "Cannot read property 'payload'"

**Solution**: The artifact might be malformed. Check:
1. Backend logs for errors
2. Database `analytic_artifacts` table
3. Make sure payload is valid JSON

### Issue: Analysis takes forever

**Possible causes**:
1. Network latency to Ollama Cloud
2. Large content (only first 4000 chars sent)
3. Ollama API rate limiting

**Solution**: Wait up to 30 seconds. If timeout, try again.

## Success Checklist

After testing, you should have:

- ✅ Backend starts with "✅ Ollama Cloud API initialized"
- ✅ All three analysis types generate artifacts successfully
- ✅ Artifacts display in UI with proper formatting
- ✅ Warning headers appear on all artifacts
- ✅ Review checkbox updates database
- ✅ Delete functionality works
- ✅ Multiple artifacts can coexist
- ✅ Artifacts persist after page refresh
- ✅ Database records are created properly

## Performance Benchmarks

Typical response times:

- **Summarization**: 10-25 seconds
- **Entity Extraction**: 8-20 seconds
- **Tone Analysis**: 12-28 seconds

If consistently slower:
- Check network connection
- Try a different Ollama model
- Check Ollama Cloud status page

## Next Steps After Testing

Once testing is complete:

1. **Production Setup**:
   - Use environment variables for API key (never commit)
   - Set up monitoring for API usage
   - Consider rate limiting

2. **User Training**:
   - Document AI limitations
   - Emphasize verification requirement
   - Create workflow guidelines

3. **Monitoring**:
   - Track artifact creation rates
   - Monitor review completion rates
   - Identify useful vs. dismissed artifacts

## Getting Help

If something doesn't work:

1. Check backend logs for errors
2. Check browser console for frontend errors
3. Verify all environment variables are set
4. Ensure Supabase migrations are applied
5. Check Ollama API status: https://status.ollama.com
6. Review `docs/PLAN_6_OLLAMA_INTEGRATION_COMPLETE.md`

Happy testing! 🧪

