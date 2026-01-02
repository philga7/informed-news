# Plan 4: Temporal Analysis & Timeline Visualization - Implementation Complete

## Overview

Plan 4 has been successfully implemented, adding temporal analysis capabilities to OSINT topics. Intelligence analysts can now visualize how topics evolve over time, track narrative velocity, and identify temporal patterns in linked source records.

## What Was Built

### Backend Implementation

**New Endpoint**: `GET /api/topics/:id/timeline`

Location: `backend/src/routes/topics.ts`

**Query Parameters**:
- `bucket`: `day` | `week` | `month` (default: `day`)
- `start_date`: ISO date string (optional)
- `end_date`: ISO date string (optional)

**Response Format**:
```json
{
  "success": true,
  "topic_id": "uuid",
  "timeline": [
    { "date": "2025-01-01", "count": 5 },
    { "date": "2025-01-02", "count": 12 }
  ],
  "first_mention": "2025-01-01T10:00:00Z",
  "total_records": 45,
  "velocity": {
    "last_7_days": 18,
    "previous_7_days": 9
  }
}
```

**Features**:
- Aggregates source records by date bucket (day/week/month)
- Identifies first mention date (earliest published_at)
- Calculates velocity (record count comparison between last 7 days vs previous 7 days)
- Supports date range filtering

### Frontend Implementation

#### 1. TypeScript Types

**File**: `src/types/osint.ts`

Added timeline-specific types:
- `TimelineBucket`: Individual date bucket with count
- `TopicTimeline`: Complete timeline response with metadata

#### 2. Service Layer

**File**: `src/services/osintTopics.service.ts`

New method: `getTimeline(topicId, options)` - Fetches and transforms timeline data from the backend API

#### 3. Timeline Chart Component

**File**: `src/components/Topics/TopicTimelineChart.tsx`

**Features**:
- Bar chart visualization using Chart.js
- Date bucket selector (day/week/month)
- Highlights first mention date in blue
- Dark theme integration (stone color palette)
- Responsive design
- Formatted tooltips with date and count

**Visual Design**:
- Stone-900 background matching existing UI
- Stone-400 text and gridlines
- Blue highlight for first mention bar
- Interactive bucket switching

#### 4. Timeline Stats Component

**File**: `src/components/Topics/TimelineStats.tsx`

Displays three key metrics in a card layout:

1. **First Mention**
   - Date and time of earliest linked record
   - Calendar icon

2. **Total Records**
   - Count of all linked source records
   - Document icon

3. **Velocity (7-day)**
   - Percentage change comparison
   - Color-coded: green (increase), red (decrease), gray (no change)
   - Trending icons (up/down/flat)
   - Shows exact counts for both periods

#### 5. Topic Detail Page Integration

**File**: `src/components/Topics/TopicDetailPage.tsx`

**Updates**:
- Added timeline state management
- Loads timeline data on page load
- Refreshes timeline when records are linked/unlinked
- New "Temporal Analysis" section between topic header and linked records
- Loading state for timeline data

**Layout**:
```
┌─────────────────────────────────────┐
│ Topic Header                        │
│ - Name, description, keywords       │
│ - Metadata footer                   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Temporal Analysis                   │
│ ┌─────────────────────────────────┐ │
│ │ Timeline Stats (3 cards)        │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Activity Chart                  │ │
│ │ - Bucket selector               │ │
│ │ - Bar chart                     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Linked Source Records               │
│ - Table of linked records           │
└─────────────────────────────────────┘
```

## Dependencies Added

- `chart.js` - Core charting library
- `react-chartjs-2` - React wrapper for Chart.js

## Testing the Implementation

### 1. Start Services

**Terminal 1 - Backend**:
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend**:
```bash
npm run dev
```

### 2. Test Timeline Endpoint

```bash
# Get daily timeline
curl "http://localhost:3001/api/topics/{topic_id}/timeline?bucket=day"

# Get weekly timeline with date range
curl "http://localhost:3001/api/topics/{topic_id}/timeline?bucket=week&start_date=2025-01-01&end_date=2025-01-31"
```

### 3. Test UI

1. Navigate to `/topics`
2. Click on any topic with linked records
3. Scroll to "Temporal Analysis" section
4. Verify:
   - Timeline stats display correctly
   - Chart renders with data
   - Bucket selector changes aggregation
   - First mention is highlighted
   - Velocity shows correct percentage and trend

### 4. Test Interactivity

1. Link a new source record to the topic
2. Verify timeline updates automatically
3. Switch between day/week/month buckets
4. Check tooltip shows correct date and count

## Use Cases

### 1. Narrative Velocity Tracking

Analysts can quickly see if a topic is "heating up":
- Positive velocity: Topic gaining attention (more recent records)
- Negative velocity: Topic cooling down
- Flat velocity: Steady state

### 2. Pattern Recognition

The timeline chart reveals:
- Spikes in activity (potential events)
- Periodic patterns (regular reporting cycles)
- Gaps in coverage
- Trends over time

### 3. First Mention Analysis

Identifying when a topic first appeared helps:
- Trace narrative origins
- Understand topic lifecycle
- Correlate with external events

### 4. Temporal Scoping

Different bucket sizes provide different perspectives:
- **Day**: Granular activity tracking
- **Week**: Smoothed trends
- **Month**: Long-term patterns

## Architecture Notes

### Data Flow

```
User selects bucket size
    ↓
TopicTimelineChart calls onBucketChange
    ↓
TopicDetailPage updates timelineBucket state
    ↓
useEffect triggers loadTimeline()
    ↓
osintTopicsService.getTimeline() calls API
    ↓
Backend aggregates source_records
    ↓
Response transformed to TopicTimeline type
    ↓
Chart and stats components re-render
```

### Performance Considerations

- Timeline data cached in component state
- Only refetches when bucket or topic changes
- Loading spinner shown during fetch
- Errors logged but don't block page
- Chart.js handles rendering optimization

### Database Query Strategy

The backend uses:
1. Join `topic_source_links` with `source_records`
2. Use `COALESCE(published_at, ingested_at)` for reliable dates
3. Group by date bucket using date truncation
4. Calculate aggregates (count, min, etc.)
5. Filter by date range if provided

## Future Enhancements

Potential additions not in scope for Plan 4:

1. **Date Range Picker UI**
   - Calendar widget for custom date ranges
   - Quick presets (last 7 days, last 30 days, etc.)

2. **Export Functionality**
   - CSV export of timeline data
   - Image export of chart

3. **Comparative Analysis**
   - Overlay multiple topics on one chart
   - Compare velocity across topics

4. **AI-Driven Insights**
   - Detect anomalies automatically
   - Predict future activity
   - Suggest related events

5. **Advanced Visualizations**
   - Heatmap calendar view
   - Cumulative line chart
   - Stacked bars by source

6. **Alerting**
   - Notify when velocity exceeds threshold
   - Alert on unusual spikes
   - Email digest of trending topics

## Acceptance Criteria - All Met ✅

- ✅ Timeline endpoint returns correctly aggregated data grouped by bucket
- ✅ First mention is accurately identified as earliest `published_at`
- ✅ Velocity calculates comparison between last 7 days and previous 7 days
- ✅ Chart renders on topic detail page with responsive sizing
- ✅ Bucket size can be changed via UI control
- ✅ Date range filtering works via API (UI controls optional)
- ✅ Matches existing dark theme aesthetic
- ✅ No linter errors

## Integration with Previous Plans

Plan 4 builds on:

- **Plan 1**: Uses `osint_topics`, `topic_source_links`, and `source_records` tables
- **Plan 2**: Analyzes records ingested through the ingestion layer
- **Plan 3**: Enhances the topic detail page with temporal analysis

The temporal analysis layer complements the topic-centric UI by adding time-series insight into the intelligence data.

## Conclusion

Plan 4 successfully adds temporal analysis capabilities to the Informed News platform. Intelligence analysts can now:

- Track narrative velocity over time
- Identify when topics first appear
- Visualize activity patterns
- Understand temporal trends

The implementation follows the established architecture patterns, integrates seamlessly with existing components, and provides a foundation for more advanced temporal analytics in future plans.

