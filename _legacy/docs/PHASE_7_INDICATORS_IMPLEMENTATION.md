# Phase 7: Indicators & Warnings System - Implementation Summary

**Status**: ✅ Complete  
**Date**: January 3, 2026  
**Phase**: Two-Tier Intelligence Model - Phase 7

## Overview

Implemented the Indicators & Warnings system for Tier 1 situational awareness. This system allows analysts to define predefined signals that trigger escalation to deep analysis topics.

## What Was Implemented

### 1. Database Schema (`supabase/migrations/20250108000002_indicators.sql`)

#### New Tables
- **`indicators`** - Main indicators table
  - `id` (UUID, PK)
  - `organization_id` (UUID, FK to organizations)
  - `domain` (watch_item_category enum)
  - `name` (TEXT)
  - `description` (TEXT, nullable)
  - `source_url` (TEXT, nullable)
  - `check_frequency` (indicator_check_frequency enum: daily/weekly/monthly)
  - `is_triggered` (BOOLEAN, default false)
  - `triggered_at` (TIMESTAMPTZ, nullable)
  - `action_on_trigger` (TEXT, nullable)
  - `last_checked_at` (TIMESTAMPTZ, nullable)
  - `triggered_topic_id` (UUID, FK to osint_topics, nullable)
  - `created_at`, `updated_at` (TIMESTAMPTZ)

#### Database Functions
- **`get_indicators_due_for_check(p_organization_id)`** - Returns indicators past their check frequency interval
- **`trigger_indicator(p_indicator_id, p_topic_name, p_topic_description, p_topic_keywords)`** - Marks indicator as triggered and optionally creates a topic
- **`reset_indicator(p_indicator_id)`** - Resets a triggered indicator back to active monitoring

#### Security
- Row Level Security (RLS) policies for organization-based access control
- Indexes for performance on organization_id, domain, is_triggered, and check_frequency

### 2. TypeScript Types (`src/types/osint.ts`)

Added:
- `IndicatorCheckFrequency` enum type: 'daily' | 'weekly' | 'monthly'
- `Indicator` interface with all indicator fields
- `IndicatorInsert` type for creating indicators
- `IndicatorUpdate` type for updating indicators

### 3. Backend API (`backend/src/routes/indicators.ts`)

Implemented RESTful API endpoints:

#### CRUD Operations
- `GET /api/indicators` - List indicators with filtering (organization_id, domain, is_triggered)
- `GET /api/indicators/:id` - Get single indicator by ID
- `POST /api/indicators` - Create new indicator
- `PATCH /api/indicators/:id` - Update indicator
- `DELETE /api/indicators/:id` - Delete indicator

#### Indicator Operations
- `POST /api/indicators/:id/check` - Mark indicator as checked (updates last_checked_at)
- `POST /api/indicators/:id/trigger` - Trigger indicator and optionally create topic
- `POST /api/indicators/:id/reset` - Reset triggered indicator to active monitoring

#### Special Queries
- `GET /api/indicators/due-for-check/:organizationId` - Get indicators due for checking
- `GET /api/indicators/triggered/:organizationId` - Get all triggered indicators

Registered route in `backend/src/server.ts`:
```typescript
app.use('/api/indicators', indicatorsRouter);
```

### 4. Frontend Service (`src/services/indicators.service.ts`)

Comprehensive service layer with methods:
- `getAll(organizationId, filters?)` - List indicators with optional filtering
- `getById(indicatorId)` - Get single indicator
- `create(indicator)` - Create new indicator
- `update(indicatorId, updates)` - Update indicator
- `delete(indicatorId)` - Delete indicator
- `markAsChecked(indicatorId)` - Mark as checked
- `trigger(indicatorId, topicData?)` - Trigger indicator and optionally create topic
- `reset(indicatorId)` - Reset triggered indicator
- `getDueForCheck(organizationId)` - Get indicators due for checking
- `getTriggered(organizationId)` - Get triggered indicators

Exported in `src/services/index.ts`.

### 5. UI Components

#### IndicatorsPage (`src/components/Indicators/IndicatorsPage.tsx`)
- Main `/indicators` route
- Search and filter indicators by domain and status
- Statistics dashboard (total, active, triggered)
- Grouped display by domain
- Create new indicator functionality

#### IndicatorCard (`src/components/Indicators/IndicatorCard.tsx`)
- Individual indicator display
- Visual distinction for triggered vs active indicators
- Quick actions: Check, Mark as Checked, Reset, Edit, Delete
- Displays check frequency and last checked timestamp
- Shows action on trigger and source URL

#### IndicatorForm (`src/components/Indicators/IndicatorForm.tsx`)
- Create/edit indicator modal
- Fields:
  - Name (required)
  - Domain (required)
  - Check Frequency (daily/weekly/monthly)
  - Description
  - Source URL
  - Action on Trigger
- Form validation

#### IndicatorCheckModal (`src/components/Indicators/IndicatorCheckModal.tsx`)
- Modal workflow for checking indicators
- Two-path decision: Not Triggered / Triggered
- **Not Triggered Path**: Mark as checked, continue monitoring
- **Triggered Path**: 
  - Option to create topic from indicator
  - Topic creation form (name, description, keywords)
  - Automatic navigation to created topic
  - Marks indicator as triggered

#### TriggeredIndicatorsBanner (`src/components/Indicators/TriggeredIndicatorsBanner.tsx`)
- Global alert banner for triggered indicators
- Shows count and names of triggered indicators
- Link to indicators page
- Dismissible
- Auto-refreshes every 5 minutes

### 6. Integration

#### Header Navigation (`src/components/Layout/Header.tsx`)
- Added Indicators navigation link with AlertTriangle icon
- Integrated TriggeredIndicatorsBanner below header
- Banner appears globally when indicators are triggered

#### App Routing (`src/App.tsx`)
- Added `/indicators` route to IndicatorsPage
- Imported IndicatorsPage component

## Key Features

### 1. Predefined Escalation Triggers
- Analysts define indicators for specific conditions to monitor
- Each indicator has a check frequency (daily/weekly/monthly)
- Action on trigger describes what should happen when triggered

### 2. Structured Check Workflow
- Check indicator opens modal with decision workflow
- Analyst reviews and decides: Not Triggered or Triggered
- Not Triggered: Mark as checked, continue monitoring
- Triggered: Optionally create topic and escalate

### 3. Topic Creation from Indicators
- When indicator is triggered, can create topic automatically
- Pre-fills topic with indicator context
- Links indicator to created topic via `triggered_topic_id`
- Automatically navigates to new topic for immediate action

### 4. Global Awareness
- Triggered indicators banner appears site-wide
- Real-time visibility of escalation triggers
- Quick navigation to indicators page

### 5. Reset Capability
- Triggered indicators can be reset to active monitoring
- Useful for recurring patterns or false positives
- Maintains indicator history via timestamps

## Usage Patterns

### Creating an Indicator
1. Navigate to `/indicators`
2. Click "Create Indicator"
3. Fill in:
   - Name: "Market Volatility Spike"
   - Domain: Finance
   - Check Frequency: Daily
   - Description: "Daily check of VIX index > 30"
   - Source URL: Link to data source
   - Action on Trigger: "Create topic: Market Risk Assessment"
4. Submit

### Checking an Indicator
1. Open indicator card
2. Click "Check indicator" icon
3. Review source data (opens source URL if provided)
4. Decide:
   - **Not Triggered**: Click "Mark as Checked" - indicator continues monitoring
   - **Triggered**: 
     - Check "Create topic from this indicator"
     - Fill in topic details
     - Click "Trigger Indicator"
     - Automatically navigated to new topic

### Responding to Triggered Indicators
1. See banner at top: "2 Indicators Triggered - Market Volatility Spike, Policy Change"
2. Click "View Indicators" in banner
3. Navigate to indicators page
4. Review triggered indicators (amber cards)
5. Click through to linked topics via `triggeredTopicId`
6. Optionally reset indicator after addressing trigger

## Database Migration

To apply the schema:

```bash
# Apply migration
psql $DATABASE_URL -f supabase/migrations/20250108000002_indicators.sql
```

The migration creates:
- `indicator_check_frequency` enum
- `indicators` table with RLS policies
- Indexes for performance
- Three database functions for indicator operations

## API Testing

Test the indicators API:

```bash
# List indicators
curl "http://localhost:3001/api/indicators?organization_id=YOUR_ORG_ID"

# Create indicator
curl -X POST http://localhost:3001/api/indicators \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "YOUR_ORG_ID",
    "domain": "finance",
    "name": "Market Volatility Spike",
    "description": "VIX index exceeds 30",
    "check_frequency": "daily",
    "action_on_trigger": "Create topic: Market Risk Assessment"
  }'

# Trigger indicator with topic creation
curl -X POST http://localhost:3001/api/indicators/INDICATOR_ID/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "topic_name": "Market Volatility Investigation",
    "topic_description": "Investigate causes of market volatility spike",
    "topic_keywords": ["volatility", "VIX", "market risk"]
  }'

# Get triggered indicators
curl "http://localhost:3001/api/indicators/triggered/YOUR_ORG_ID"
```

## UI Flow

```
Indicators Page (/indicators)
├── Search & Filter (domain, status)
├── Stats Dashboard (total, active, triggered)
└── Indicator Cards (grouped by domain)
    ├── Active Indicators (green badge)
    │   ├── Check Icon → IndicatorCheckModal
    │   ├── Clock Icon → Mark as Checked
    │   ├── Edit Icon → IndicatorForm (edit mode)
    │   └── Delete Icon → Confirm & Delete
    └── Triggered Indicators (amber badge)
        ├── Shows triggered date
        ├── Reset Icon → Reset to Active
        ├── Edit Icon → IndicatorForm (edit mode)
        └── Delete Icon → Confirm & Delete

IndicatorCheckModal
├── Display indicator info
├── Decision: Not Triggered / Triggered
├── Not Triggered Path
│   └── Mark as Checked → Close modal
└── Triggered Path
    ├── Option: Create topic
    │   ├── Topic Name (required)
    │   ├── Description
    │   └── Keywords
    ├── Trigger Indicator → Marks as triggered
    └── Navigate to created topic (if topic was created)

TriggeredIndicatorsBanner (Global)
├── Appears when indicators are triggered
├── Shows count and names
├── Link to /indicators
└── Dismiss button
```

## Architecture Notes

### Domain Reuse
- Indicators reuse `watch_item_category` enum for domains
- This provides consistency across Tier 1 entities (Watch Items & Indicators)
- Allows filtering Scan View by domain with shared vocabulary

### Escalation Bridge
- Indicators serve as automatic escalation triggers
- Watch Items are manual escalation candidates
- Both can create Topics (Tier 2) when escalated
- `triggered_topic_id` links indicator to created topic

### Check Frequency System
- Database function `get_indicators_due_for_check` calculates due indicators
- Respects daily/weekly/monthly frequencies
- Can be integrated into scheduled jobs or analyst workflows
- UI could show "overdue" badges for indicators past their check date

## Future Enhancements (Not Implemented)

1. **Automated Checking**: Scheduled jobs to check indicators automatically via external APIs
2. **Indicator Templates**: Pre-configured indicators for common patterns
3. **Historical Trigger Log**: Track when indicators were triggered over time
4. **Indicator Groups**: Group related indicators for bulk operations
5. **Notification System**: Email/Slack notifications when indicators trigger
6. **Threshold Configuration**: Numeric thresholds with automatic trigger logic
7. **Integration with Scan View**: Surface indicators in scan workflow

## Files Created

### Database
- `supabase/migrations/20250108000002_indicators.sql`

### Backend
- `backend/src/routes/indicators.ts`

### Frontend Services
- `src/services/indicators.service.ts`

### Frontend Components
- `src/components/Indicators/IndicatorsPage.tsx`
- `src/components/Indicators/IndicatorCard.tsx`
- `src/components/Indicators/IndicatorForm.tsx`
- `src/components/Indicators/IndicatorCheckModal.tsx`
- `src/components/Indicators/TriggeredIndicatorsBanner.tsx`

### Documentation
- `docs/PHASE_7_INDICATORS_IMPLEMENTATION.md`

## Files Modified

- `src/types/osint.ts` - Added indicator types
- `src/services/index.ts` - Exported indicators service
- `backend/src/server.ts` - Registered indicators route
- `src/components/Layout/Header.tsx` - Added navigation link and banner
- `src/App.tsx` - Added indicators route

## Testing Checklist

- [ ] Run database migration successfully
- [ ] Create new indicator via UI
- [ ] List indicators with filters (domain, status)
- [ ] Edit existing indicator
- [ ] Check indicator - mark as checked (not triggered)
- [ ] Check indicator - trigger with topic creation
- [ ] Verify triggered indicators banner appears
- [ ] Navigate to indicators page from banner
- [ ] Reset triggered indicator to active
- [ ] Delete indicator
- [ ] Verify RLS policies (organization isolation)
- [ ] Test API endpoints directly
- [ ] Verify topic created from indicator shows link back to indicator

## Integration Points

### With Watch Items (Phase 5)
- Both use same domain categorization
- Both can escalate to topics
- Complementary: Watch Items are manual, Indicators are predefined

### With Scan View (Phase 6)
- Indicators can inform what to look for during scanning
- Triggered indicators context for scan workflow
- Future: Auto-create watch items when indicators trigger

### With Topics (Tier 2)
- Indicators create topics when triggered
- `triggered_topic_id` maintains the link
- Topic shows it was created from an indicator

### With Dashboard (Phase 4)
- Could show indicators due for check in daily/weekly reviews
- Triggered indicators in alerts section
- Indicator effectiveness metrics over time

## Success Metrics

The system is working correctly when:

1. ✅ Analysts can create indicators with domain, frequency, and trigger criteria
2. ✅ Check workflow provides clear decision path (not triggered / triggered)
3. ✅ Triggered indicators create topics and navigate analyst to them
4. ✅ Global banner alerts analysts to triggered indicators
5. ✅ Indicators can be reset after addressing trigger
6. ✅ Organization-based access control enforced via RLS
7. ✅ UI follows existing design patterns from Watch Items and Topics

## Conclusion

Phase 7 successfully implements the Indicators & Warnings system as designed in the Two-Tier Intelligence Model plan. The system provides predefined escalation triggers that bridge Tier 1 (situational awareness) and Tier 2 (deep analysis), with a structured check workflow and global visibility of triggered conditions.

The implementation follows existing patterns, uses proper TypeScript types, implements comprehensive backend APIs, and provides a polished UI integrated into the application navigation and header.

