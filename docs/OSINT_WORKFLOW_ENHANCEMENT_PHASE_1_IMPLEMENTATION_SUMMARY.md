# Phase 1: Question-Driven Topic Structure - Implementation Summary

**Date**: January 2, 2026
**Status**: ✅ Complete

## Overview

Phase 1 of the OSINT Workflow Enhancement adds intelligence-driven context to topics by capturing decision requirements, key indicators, resolution criteria, and collection planning. This transforms topics from simple categorization into structured intelligence requirements.

## What Was Implemented

### 1. Database Schema Changes

**File**: `supabase/migrations/20250104000001_question_driven_topics.sql`

#### osint_topics Table Updates
Added four new columns to capture intelligence requirements:

- `decision_question` (TEXT): The specific question the topic is answering
- `decision_context` (TEXT): Why this intelligence matters (decision dependency)
- `key_indicators` (TEXT[]): Observable indicators that would confirm/refute the hypothesis
- `resolution_criteria` (TEXT): When the question is considered answered

#### New collection_plans Table
Created to track collection planning for each topic:

```sql
CREATE TABLE collection_plans (
  id UUID PRIMARY KEY,
  topic_id UUID REFERENCES osint_topics(id) ON DELETE CASCADE,
  source_types_needed TEXT[],  -- e.g., ['government', 'academic', 'primary']
  claims_to_verify TEXT[],     -- Specific claims needing corroboration
  coverage_gaps TEXT[],         -- Identified gaps in evidence
  sources_to_avoid TEXT[],      -- Biased/noise sources to skip
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Security**: Full Row Level Security (RLS) policies implemented
- Users can view plans for topics in their organizations
- Analysts and admins can create/update plans
- Only owners and admins can delete plans

### 2. TypeScript Type Updates

**Files Modified**:
- `src/types/osint.ts` - Added CollectionPlan interface and updated OsintTopic
- `backend/src/types/index.ts` - Backend type alignment (legacy, minimal changes)

**New Types**:
```typescript
export interface OsintTopic {
  // ... existing fields ...
  decisionQuestion: string | null;
  decisionContext: string | null;
  keyIndicators: string[];
  resolutionCriteria: string | null;
}

export interface CollectionPlan {
  id: string;
  topicId: string;
  sourceTypesNeeded: string[];
  claimsToVerify: string[];
  coverageGaps: string[];
  sourcesToAvoid: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. Frontend Components

#### Updated: TopicForm.tsx
**Location**: `src/components/Topics/TopicForm.tsx`

Added "Intelligence Requirement" section with:
- Decision Question input
- Decision Context textarea
- Key Indicators tag input (with add/remove)
- Resolution Criteria textarea
- Helpful tooltips and guidance text
- Visual distinction (blue badges for indicators)

**Key Features**:
- All fields optional (recommended, not required)
- Inline help tooltip explaining intelligence-driven approach
- Clear field labels with examples

#### New: CollectionPlanCard.tsx
**Location**: `src/components/Topics/CollectionPlanCard.tsx`

Comprehensive collection planning component with:
- View/Edit modes
- Four collection planning sections:
  - **Source Types Needed**: Tag-based input for required source types
  - **Claims to Verify**: List of claims needing corroboration
  - **Coverage Gaps**: Visual warning indicators for identified gaps
  - **Sources to Avoid**: Tag-based exclusion list
  - **Additional Notes**: Free-form notes field
- Color-coded sections (blue/yellow/red) for visual clarity
- Save/Cancel actions with error handling
- Empty state prompt when no plan exists

#### Updated: TopicDetailPage.tsx
**Location**: `src/components/Topics/TopicDetailPage.tsx`

Integrated Phase 1 features:
- Intelligence Requirement display in Overview tab (blue-bordered section)
- CollectionPlanCard component integration
- Topic editing with new fields support
- Collection plan save handler

### 4. Service Layer Updates

**File**: `src/services/osintTopics.service.ts`

**Updated Methods**:
- `create()`: Accepts new intelligence requirement fields
- `update()`: Accepts new intelligence requirement fields
- `getById()`: Returns collection_plan with topic detail
- `getAll()`: Returns topics with key_indicators

**New Methods**:
```typescript
saveCollectionPlan(topicId, plan): Promise<CollectionPlan>
getCollectionPlan(topicId): Promise<CollectionPlan | null>
```

### 5. Backend API Updates

**File**: `backend/src/routes/topics.ts`

**Updated Endpoints**:

- `POST /api/topics`: Accepts intelligence requirement fields
- `PATCH /api/topics/:id`: Accepts intelligence requirement fields
- `GET /api/topics/:id`: Returns collection_plan (joined from collection_plans table)
- `GET /api/topics`: Returns topics with new fields

**New Endpoints**:

- `POST /api/topics/:id/collection-plan`: Create/update collection plan (upsert logic)
- `GET /api/topics/:id/collection-plan`: Retrieve collection plan

**Request Body Examples**:

Create Topic with Intelligence Requirements:
```json
{
  "organization_id": "uuid",
  "name": "Chinese AI Development",
  "description": "Tracking developments in Chinese AI capabilities",
  "decision_question": "Is China developing AGI capabilities ahead of Western nations?",
  "decision_context": "Strategic assessment for technology policy planning",
  "key_indicators": [
    "Publication of novel architectures",
    "Compute infrastructure expansion",
    "Talent recruitment patterns"
  ],
  "resolution_criteria": "High confidence when multiple independent sources confirm capability demonstrations"
}
```

Save Collection Plan:
```json
{
  "source_types_needed": ["government", "academic", "expert_analysis"],
  "claims_to_verify": [
    "Reported 1000x compute scale-up",
    "Claims of emergent reasoning capabilities"
  ],
  "coverage_gaps": [
    "Lack of primary source documentation",
    "No independent verification of compute claims"
  ],
  "sources_to_avoid": ["propaganda outlets", "unverified social media"],
  "notes": "Focus on peer-reviewed papers and government statements only"
}
```

## User Experience Flow

### Creating a Topic (with Intelligence Requirements)

1. User clicks "Create Topic" on TopicsPage
2. TopicForm modal opens with basic fields (name, description, keywords)
3. User expands "Intelligence Requirement" section (Phase 1)
4. User fills in:
   - What question they're answering
   - What decision depends on this
   - What indicators would change their mind
   - When they'd consider the question answered
5. Saves topic with all context captured

### Using Collection Plans

1. User navigates to Topic Detail page
2. In Overview tab, sees "Collection Plan" card
3. Clicks "Create Plan" or "Edit"
4. Specifies:
   - What source types are needed (government, academic, etc.)
   - What claims need verification
   - What gaps exist in coverage
   - What sources to avoid (bias/noise)
5. Saves plan to guide future collection efforts

### Viewing Intelligence Context

1. Navigate to any topic
2. Overview tab shows:
   - Intelligence Requirement section (if filled)
     - Decision question in bold
     - Decision context explaining why it matters
     - Key indicators as blue badges
     - Resolution criteria
   - Collection Plan card below
     - Visual breakdown of collection strategy
     - Color-coded sections for quick scanning

## Design Philosophy

### Suggestive, Not Prescriptive
- All intelligence requirement fields are optional
- Labeled as "(Recommended)" not "Required"
- Tooltips explain best practices
- No validation blocking saves

### Intelligence Tradecraft Principles
- Tooltip quote: *"Topics come from questions. Questions come from decisions."*
- Encourages structured thinking about information needs
- Helps analysts articulate what would change their mind
- Makes collection gaps explicit

### Visual Design
- Blue theme for intelligence requirements (distinct from operational red/yellow)
- Color-coded collection plan sections:
  - Blue: source types needed
  - Yellow: coverage gaps (warning)
  - Red: sources to avoid (danger)
- Clear visual hierarchy in forms and display

## Database Migration

**To apply the migration**:

```bash
# Using Supabase CLI
supabase db push

# Or in production/Vercel
# Migration will run automatically on next deployment
```

**Rollback Strategy**:
If needed, the migration can be safely rolled back as all new fields are nullable and the collection_plans table has CASCADE delete.

## Testing Checklist

- [x] TypeScript types compile without errors
- [x] No linting errors
- [ ] Create topic with intelligence requirements
- [ ] Edit existing topic to add intelligence requirements
- [ ] Create collection plan
- [ ] Edit collection plan
- [ ] View topic with intelligence context in Overview tab
- [ ] Verify RLS policies work (test with different user roles)
- [ ] Test API endpoints with Postman/curl
- [ ] Verify collection plan persists across page reloads

## Next Steps (Phase 2)

Phase 2 will add:
- Expanded topic status enum (suspended, resolved)
- Topic lifecycle management
- Resolution workflow
- Soft limits and warnings for topic overload
- Stale topic detection

## Files Changed

### Created
- `supabase/migrations/20250104000001_question_driven_topics.sql`
- `src/components/Topics/CollectionPlanCard.tsx`
- `docs/PHASE_1_IMPLEMENTATION_SUMMARY.md`

### Modified
- `src/types/osint.ts`
- `src/components/Topics/TopicForm.tsx`
- `src/components/Topics/TopicDetailPage.tsx`
- `src/components/Topics/TopicsPage.tsx`
- `src/services/osintTopics.service.ts`
- `backend/src/routes/topics.ts`

## Deployment Notes

1. **Database Migration**: Run migration before deploying frontend/backend code
2. **Backward Compatibility**: All new fields are nullable, so existing topics continue to work
3. **No Breaking Changes**: Existing API endpoints still work; new fields are simply added
4. **Frontend/Backend Coordination**: Deploy backend first, then frontend (or simultaneously)

## Success Metrics

- Topics created with decision_question filled: target >50%
- Collection plans created: target >30% of active topics
- Key indicators specified: target >40% of topics
- User feedback on intelligence requirement guidance (qualitative)

---

**Implementation Status**: ✅ Complete
**All TODOs**: ✅ Completed
**Linting**: ✅ Clean
**Ready for Testing**: ✅ Yes

