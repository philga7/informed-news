# Phase 7: Indicators & Warnings - Setup Verification Guide

This guide helps you verify that Phase 7 is properly installed and working.

## Prerequisites

- Backend server running
- Frontend development server running
- Database migrations applied
- Authenticated user with organization access

## Step 1: Apply Database Migration

```bash
# From project root
cd /Users/philipclapper/workspace/informed-news

# Apply the indicators migration
psql $DATABASE_URL -f supabase/migrations/20250108000002_indicators.sql

# Verify the table exists
psql $DATABASE_URL -c "\d indicators"

# Verify the functions exist
psql $DATABASE_URL -c "\df get_indicators_due_for_check"
psql $DATABASE_URL -c "\df trigger_indicator"
psql $DATABASE_URL -c "\df reset_indicator"
```

Expected output:
- Table `indicators` with all columns
- Three functions listed

## Step 2: Start Backend (if not running)

```bash
cd backend
npm run dev
```

Expected output:
```
🚀 Backend server running on http://localhost:3001
📡 Health check: http://localhost:3001/health
```

## Step 3: Verify Backend API

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test indicators endpoint (replace YOUR_ORG_ID)
curl "http://localhost:3001/api/indicators?organization_id=YOUR_ORG_ID"
```

Expected: `{"success":true,"indicators":[]}` (empty array initially)

## Step 4: Start Frontend (if not running)

```bash
# From project root
npm run dev
```

Expected: Frontend running on http://localhost:5173

## Step 5: UI Verification Checklist

### Navigation
- [ ] Header shows "Indicators" link with AlertTriangle icon
- [ ] Clicking "Indicators" navigates to `/indicators`
- [ ] Indicators page loads without errors

### Create Indicator
- [ ] Click "Create Indicator" button
- [ ] Modal appears with form
- [ ] Fill in required fields:
  - Name: "Test Market Volatility"
  - Domain: Finance
  - Check Frequency: Weekly
- [ ] Click "Create Indicator"
- [ ] New indicator appears in list

### Indicator Card
- [ ] Green badge shows "Active Monitoring"
- [ ] Domain shown at bottom (Finance)
- [ ] Check frequency visible
- [ ] Action buttons visible: Check, Clock, Edit, Delete

### Check Workflow
- [ ] Click check icon on indicator
- [ ] Modal opens with indicator info
- [ ] Choose "Not Triggered"
- [ ] Click "Mark as Checked"
- [ ] Last checked updates to "Today"

### Trigger Workflow
- [ ] Click check icon again
- [ ] Choose "Triggered"
- [ ] Check "Create topic from this indicator"
- [ ] Fill in topic name: "Test Volatility Investigation"
- [ ] Click "Trigger Indicator"
- [ ] Navigates to new topic page
- [ ] Topic shows indicator link

### Triggered Banner
- [ ] Navigate back to any page
- [ ] Banner appears at top: "1 Indicator Triggered - Test Market Volatility"
- [ ] Click "View Indicators"
- [ ] Navigates to indicators page
- [ ] Indicator card shows amber badge "Triggered"

### Reset Indicator
- [ ] Click reset icon on triggered indicator
- [ ] Confirm reset
- [ ] Indicator returns to "Active Monitoring"
- [ ] Banner disappears

## Step 6: Database Verification

```bash
# Check created indicator
psql $DATABASE_URL -c "SELECT id, name, domain, is_triggered FROM indicators LIMIT 5;"

# Check triggered topic link
psql $DATABASE_URL -c "SELECT id, name, triggered_topic_id FROM indicators WHERE triggered_topic_id IS NOT NULL;"

# Check RLS policies
psql $DATABASE_URL -c "\d+ indicators" | grep POLICY
```

Expected:
- Indicators in database
- `triggered_topic_id` populated for triggered indicators
- RLS policies active

## Troubleshooting

### "Table indicators does not exist"
**Solution**: Apply the migration:
```bash
psql $DATABASE_URL -f supabase/migrations/20250108000002_indicators.sql
```

### "organization_id is required" error
**Solution**: Ensure you're authenticated and have selected an organization in the UI

### "Indicator not found" when triggering
**Solution**: Refresh the indicators list and verify the indicator ID exists in the database

### Banner doesn't appear
**Solution**: 
- Trigger an indicator
- Refresh the page (banner loads on mount)
- Check browser console for errors

### "Failed to fetch indicators"
**Solution**: 
- Verify backend is running on port 3001
- Check CORS settings
- Verify `VITE_API_URL` environment variable

## API Endpoint Reference

All endpoints require `organization_id` parameter or in request body.

### List Indicators
```bash
GET /api/indicators?organization_id=ORG_ID&domain=finance&is_triggered=false
```

### Get Indicator
```bash
GET /api/indicators/INDICATOR_ID
```

### Create Indicator
```bash
POST /api/indicators
Content-Type: application/json

{
  "organization_id": "ORG_ID",
  "domain": "finance",
  "name": "Market Volatility Spike",
  "description": "Monitor VIX index",
  "check_frequency": "daily",
  "action_on_trigger": "Create topic: Market Risk"
}
```

### Update Indicator
```bash
PATCH /api/indicators/INDICATOR_ID
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

### Check Indicator
```bash
POST /api/indicators/INDICATOR_ID/check
```

### Trigger Indicator
```bash
POST /api/indicators/INDICATOR_ID/trigger
Content-Type: application/json

{
  "topic_name": "Investigation Topic",
  "topic_description": "Investigate the triggered condition",
  "topic_keywords": ["keyword1", "keyword2"]
}
```

### Reset Indicator
```bash
POST /api/indicators/INDICATOR_ID/reset
```

### Get Due Indicators
```bash
GET /api/indicators/due-for-check/ORG_ID
```

### Get Triggered Indicators
```bash
GET /api/indicators/triggered/ORG_ID
```

## Success Criteria

Phase 7 is successfully implemented when:

✅ Database migration applied without errors  
✅ Indicators API endpoints respond correctly  
✅ Indicators page loads and displays indicators  
✅ Can create new indicators via UI  
✅ Can check indicators and mark as checked  
✅ Can trigger indicators and create topics  
✅ Triggered indicators banner appears globally  
✅ Can reset triggered indicators  
✅ Can edit and delete indicators  
✅ RLS policies enforce organization isolation  

## Next Steps

After verifying Phase 7:

1. **Test with Real Use Cases**: Create indicators for actual monitoring scenarios
2. **Integrate with Dashboard**: Add due indicators to daily/weekly review dashboards
3. **Document Indicator Patterns**: Create guide for effective indicator design
4. **Phase 8 Planning**: Move to scan workflow integration and hygiene metrics

## Support

If you encounter issues:

1. Check browser console for JavaScript errors
2. Check backend logs for API errors
3. Verify database connection and migration status
4. Review implementation docs: `PHASE_7_INDICATORS_IMPLEMENTATION.md`
5. Check TypeScript compilation: `npm run build` in both frontend and backend

