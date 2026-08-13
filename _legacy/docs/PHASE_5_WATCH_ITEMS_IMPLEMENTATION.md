# Phase 5: Watch Items Foundation - Implementation Summary

**Date**: January 3, 2026  
**Phase**: Two-Tier Intelligence Model - Phase 5  
**Status**: ✅ Complete

## Overview

Successfully implemented the Watch Items Foundation as Phase 5 of the Two-Tier Intelligence Model. This creates the bridge between Tier 1 (Situational Awareness) and Tier 2 (Deep Analysis) by introducing a Watch List entity for monitoring potential topics under light surveillance.

## Architecture

### Data Model

```
organizations
    ↓
watch_items (Tier 1 entity)
    ↓
watch_item_records (junction table)
    ↓
source_records
    
watch_items → osint_topics (escalation path)
```

### Key Concepts

- **Watch Items**: Lightweight monitoring entities for potential topics
- **Signal Count**: Number of linked source records (indicates activity level)
- **Escalation Triggers**: User-defined conditions that warrant escalation to full topic
- **Status Lifecycle**: watching → escalated → archived

## Implementation Details

### 1. Database Migration

**File**: `supabase/migrations/20250107000001_watch_items.sql`

Created:
- `watch_item_status` enum: `watching`, `escalated`, `archived`
- `watch_item_category` enum: `politics`, `finance`, `technology`, `local`, `international`, `health`, `security`, `other`
- `watch_items` table with RLS policies
- `watch_item_records` junction table with RLS policies
- Helper functions:
  - `get_watch_item_signal_count(p_watch_item_id)` - Count linked records
  - `escalate_watch_item_to_topic(...)` - Convert watch item to topic

### 2. TypeScript Types

**File**: `src/types/osint.ts`

Added:
```typescript
export type WatchItemStatus = 'watching' | 'escalated' | 'archived';
export type WatchItemCategory = 'politics' | 'finance' | 'technology' | 
  'local' | 'international' | 'health' | 'security' | 'other';

export interface WatchItem {
  id: string;
  organizationId: string;
  title: string;
  category: WatchItemCategory;
  notes: string | null;
  indicatorTriggers: string[];
  status: WatchItemStatus;
  escalatedTopicId: string | null;
  firstNotedAt: Date;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  signalCount?: number; // Computed field
}
```

### 3. Service Layer

**File**: `src/services/watchItems.service.ts`

Implemented operations:
- `getAll(organizationId, filters)` - List with category/status filtering
- `getById(watchItemId)` - Get single item with signal count
- `create(watchItem)` - Create new watch item
- `update(watchItemId, updates)` - Update item
- `archive(watchItemId)` - Mark as archived
- `delete(watchItemId)` - Permanent deletion
- `linkRecord(watchItemId, sourceRecordId)` - Associate source record
- `unlinkRecord(watchItemId, sourceRecordId)` - Remove association
- `getSignalCount(watchItemId)` - Get linked record count
- `escalateToTopic(watchItemId, topicData)` - Convert to full topic
- `markAsReviewed(watchItemId)` - Update last_reviewed_at
- `getLinkedRecords(watchItemId)` - Fetch associated records

### 4. UI Components

**Directory**: `src/components/WatchList/`

#### WatchListPage.tsx
Main route at `/watch-list` featuring:
- Search and filtering (by category and status)
- Stats dashboard (watching count, total signals, escalated, archived)
- Grouped display by category
- Create watch item modal
- Refresh functionality

#### WatchItemCard.tsx
Individual watch item display with:
- Status and category badges
- Signal count indicator
- Days since last review
- Escalation triggers display
- Quick actions:
  - Escalate to Topic
  - Mark as Reviewed
  - Archive
  - Delete
  - View Topic (if escalated)

#### WatchItemForm.tsx
Create/edit modal with fields:
- Title (required)
- Category (required)
- Notes
- Escalation Triggers (array)

#### EscalateToTopicModal.tsx
Escalation workflow featuring:
- Pre-filled topic data from watch item
- Intelligence requirement fields (optional):
  - Decision Question
  - Decision Context
  - Key Indicators
- Keywords management
- Info banner explaining escalation process
- Automatic navigation to new topic on success

### 5. Backend API Routes

**Files**: 
- `backend/src/routes/watchItems.ts` - Express route handlers
- `backend/src/server.ts` - Local development server registration
- `api/index.ts` - Vercel serverless function registration

Endpoints:
- `GET /api/watch-items` - List all (with filters)
- `GET /api/watch-items/:id` - Get single item
- `POST /api/watch-items` - Create new
- `PATCH /api/watch-items/:id` - Update
- `DELETE /api/watch-items/:id` - Delete
- `POST /api/watch-items/:id/records` - Link source record
- `DELETE /api/watch-items/:id/records/:recordId` - Unlink record
- `GET /api/watch-items/:id/records` - Get linked records
- `GET /api/watch-items/:id/signal-count` - Get signal count
- `POST /api/watch-items/:id/escalate` - Escalate to topic

**Deployment**: Routes are configured for both local Express server and Vercel serverless deployment.

### 6. Navigation Integration

**Files**: 
- `src/App.tsx` - Added `/watch-list` route
- `src/components/Layout/Header.tsx` - Added Watch List nav button with Eye icon

## User Workflows

### 1. Create Watch Item
1. Click "Add Watch Item" button
2. Enter title, select category
3. Add notes explaining why monitoring
4. Define escalation triggers
5. Submit to create

### 2. Monitor Watch Items
1. View watch list grouped by category
2. See signal count (linked records) for each item
3. Filter by category or status
4. Search by title or notes
5. Review stats dashboard

### 3. Escalate to Topic
1. Click "Escalate" button on watch item card
2. Review/edit topic details
3. Add intelligence requirement fields (optional)
4. Submit to create topic
5. All linked records transfer to new topic
6. Watch item marked as "escalated"
7. Automatically navigate to new topic

### 4. Review Workflow
1. Mark items as reviewed (updates last_reviewed_at)
2. Archive dormant items
3. Delete irrelevant items

## Database Functions

### get_watch_item_signal_count
```sql
SELECT COUNT(*)::INTEGER
FROM public.watch_item_records
WHERE watch_item_id = p_watch_item_id;
```

### escalate_watch_item_to_topic
1. Retrieves watch item details
2. Creates new osint_topic
3. Transfers all linked source records to topic
4. Updates watch item status to 'escalated'
5. Returns new topic ID

## Security

All tables protected by Row Level Security (RLS):
- Users can only access watch items from their organization
- Policies enforce organization membership via `org_members` table
- Cascading deletes maintain referential integrity

## UI/UX Features

### Visual Design
- Category-based color coding
- Status badges (watching, escalated, archived)
- Signal strength indicators
- Days since review tracking
- Escalation trigger badges

### Interactions
- Hover effects and transitions
- Modal forms for create/edit/escalate
- Confirmation dialogs for destructive actions
- Loading states and error handling
- Empty states with helpful CTAs

### Responsive Design
- Mobile-friendly layouts
- Responsive grid (1-3 columns based on screen size)
- Collapsible navigation labels on small screens

## Integration Points

### With Existing System
- Seamlessly integrates with Topics (Tier 2)
- Reuses source_records infrastructure
- Follows established patterns (service layer, RLS, API routes)
- Consistent with existing UI components

### Future Phases
- Phase 6: Environmental Scan View will link records to watch items
- Phase 7: Indicators system will trigger watch item creation
- Phase 8: Scan workflow will track watch item review cadence

## Testing Recommendations

### Database
1. Test RLS policies with different organization memberships
2. Verify escalation function transfers all records correctly
3. Test cascade delete behavior
4. Verify signal count calculation

### API
1. Test all CRUD operations
2. Verify filtering works correctly
3. Test escalation endpoint
4. Test duplicate link prevention (unique constraint)

### Frontend
1. Test create/edit/delete workflows
2. Verify escalation modal pre-fills correctly
3. Test filtering and search
4. Verify navigation to escalated topics
5. Test responsive layouts

## Performance Considerations

- Signal counts computed via junction table count (indexed)
- Filtering uses indexed columns (organization_id, status, category)
- Pagination not yet implemented (add if watch items exceed ~100)

## Documentation

- Added comprehensive inline comments
- Database column comments explain purpose
- Function comments describe behavior
- Component prop types fully documented

## Metrics to Track

1. **Watch Item Lifecycle**
   - Average time from creation to escalation
   - Percentage escalated vs archived
   - Average signal count at escalation

2. **Usage Patterns**
   - Most common categories
   - Most common escalation triggers
   - Review frequency

3. **Effectiveness**
   - False positive rate (archived without escalation)
   - Signal-to-noise ratio per category
   - Time saved vs direct topic creation

## Next Steps

### Phase 6: Environmental Scan View
- Add `scan_status` to source_records
- Add `domain` to sources
- Create ScanPage with 3-column layout
- Implement keyboard shortcuts for rapid triage
- Add quick actions (link to topic, create watch item)

### Phase 7: Indicators & Warnings
- Create indicators table
- Implement check/trigger operations
- Add triggered indicators banner
- Link indicators to topic creation

### Phase 8: Scan Workflow Integration
- Create scan_sessions table
- Add scan metrics dashboard
- Implement weekly review mode
- Add feed hygiene tracking

## Files Changed

### New Files
- `supabase/migrations/20250107000001_watch_items.sql`
- `src/services/watchItems.service.ts`
- `src/components/WatchList/WatchListPage.tsx`
- `src/components/WatchList/WatchItemCard.tsx`
- `src/components/WatchList/WatchItemForm.tsx`
- `src/components/WatchList/EscalateToTopicModal.tsx`
- `backend/src/routes/watchItems.ts`
- `docs/PHASE_5_WATCH_ITEMS_IMPLEMENTATION.md`

### Modified Files
- `src/types/osint.ts` - Added WatchItem types
- `src/services/index.ts` - Exported watchItemsService
- `src/App.tsx` - Added /watch-list route
- `src/components/Layout/Header.tsx` - Added Watch List navigation
- `backend/src/server.ts` - Registered watchItems routes (local dev)
- `api/index.ts` - Registered watchItems routes (Vercel serverless)

## Conclusion

Phase 5 successfully implements the Watch Items Foundation, providing a lightweight monitoring layer (Tier 1) that bridges the gap between raw source records and full intelligence topics (Tier 2). The implementation follows established patterns, maintains security through RLS, and provides an intuitive UI for analysts to manage their situational awareness workflow.

The escalation mechanism provides a smooth transition from watching to deep analysis, preserving all context and linked records. This sets the foundation for Phase 6 (Environmental Scan View) and Phase 7 (Indicators & Warnings) to complete the Two-Tier Intelligence Model.

