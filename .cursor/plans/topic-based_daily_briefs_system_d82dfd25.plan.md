---
name: Topic-Based Daily Briefs System
overview: Comprehensive daily brief system supporting both topic-specific briefs and custom category briefs that can aggregate multiple topics. Briefs support structured and narrative formats, manual creation, and configurable retention policies per brief category.
todos:
  - id: brief-schema
    content: Create database schema for brief categories, briefs, and topic associations
    status: pending
  - id: brief-types
    content: Define TypeScript types for brief categories and briefs
    status: pending
  - id: brief-category-service
    content: Implement backend service for brief category CRUD operations
    status: pending
    dependencies:
      - brief-schema
  - id: brief-data-service
    content: Implement data aggregation service for brief generation
    status: pending
    dependencies:
      - brief-schema
  - id: brief-generation-service
    content: Implement brief generation service with structured and narrative formats
    status: pending
    dependencies:
      - brief-data-service
  - id: brief-routes
    content: Create backend API routes for briefs and brief categories
    status: pending
    dependencies:
      - brief-category-service
      - brief-generation-service
  - id: brief-category-ui
    content: Build frontend UI for managing brief categories
    status: pending
    dependencies:
      - brief-types
  - id: brief-generation-ui
    content: Build frontend UI for generating and viewing briefs
    status: pending
    dependencies:
      - brief-types
  - id: brief-retention
    content: Implement retention policies and cleanup service
    status: pending
    dependencies:
      - brief-schema
  - id: brief-cleanup-workflow
    content: Create GitHub Actions workflow for automated brief cleanup
    status: pending
    dependencies:
      - brief-retention
---

# Topic-Based Daily Briefs System

## Overview

This plan implements a comprehensive daily brief system that enables analysts to create focused intelligence briefs for specific topics or custom categories. Briefs can aggregate multiple topics (e.g., a "Financial" brief covering multiple dividend-related topics), support both structured and narrative formats, and have configurable retention policies per brief category.**Key Principles:**

- **Topic Briefs**: One brief per topic (e.g., "AI Developments", "Dividend News")
- **Custom Category Briefs**: User-defined categories that can aggregate multiple topics (e.g., "Financial Brief" covering multiple financial topics)
- **Manual Creation**: Briefs are created on-demand by users (no automatic generation)
- **Dual Formats**: Both structured (organized sections) and narrative (flowing text) formats
- **Configurable Retention**: Each brief category can have its own retention policy (default 30 days, configurable)
- **Separate Section**: Briefs are a distinct section of the app with their own navigation and management

## Current State

**Existing Analysis Capabilities:**

- ✅ Text summarization (3-5 bullet points)
- ✅ Entity extraction (people, organizations, locations, dates)
- ✅ Tone/sentiment analysis
- ✅ Topic-level summarization (from Phase 2 of Enhanced AI Analysis plan)
- ✅ Key facts extraction
- ✅ Cross-media comparison

**Briefs:**

- ❌ Not implemented

---

## Phase 1: Brief Categories & Data Model

**Goal:** Establish the foundation for brief categories, topic associations, and data aggregation.

### 1.1 Database Schema: Brief Categories & Briefs

**File:** `supabase/migrations/[timestamp]_brief_categories.sql`

```sql
-- Brief categories table (custom categories like "News", "AI", "Financial")
CREATE TABLE brief_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- Optional icon identifier
  color TEXT, -- Optional color for UI
  retention_days INTEGER DEFAULT 30, -- Configurable retention (null = never delete)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_brief_categories_org ON brief_categories(organization_id);

-- Junction table: Which topics belong to which brief category
CREATE TABLE brief_category_topics (
  brief_category_id UUID NOT NULL REFERENCES brief_categories(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES osint_topics(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (brief_category_id, topic_id)
);

CREATE INDEX idx_brief_category_topics_category ON brief_category_topics(brief_category_id);
CREATE INDEX idx_brief_category_topics_topic ON brief_category_topics(topic_id);

-- Briefs table (actual generated briefs)
CREATE TABLE briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brief_category_id UUID REFERENCES brief_categories(id) ON DELETE SET NULL, -- NULL for topic-specific briefs
  topic_id UUID REFERENCES osint_topics(id) ON DELETE SET NULL, -- NULL for category briefs
  brief_date DATE NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('structured', 'narrative')),
  content JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  -- Ensure one brief per category/topic per date per format
  UNIQUE(organization_id, brief_category_id, topic_id, brief_date, format)
);

CREATE INDEX idx_briefs_org_date ON briefs(organization_id, brief_date DESC);
CREATE INDEX idx_briefs_category ON briefs(brief_category_id, brief_date DESC);
CREATE INDEX idx_briefs_topic ON briefs(topic_id, brief_date DESC);
CREATE INDEX idx_briefs_reviewed ON briefs(organization_id, reviewed, brief_date DESC);
CREATE INDEX idx_briefs_generated_at ON briefs(generated_at DESC);

-- Function to delete briefs based on category retention policy
CREATE OR REPLACE FUNCTION delete_expired_briefs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM briefs b
  USING brief_categories bc
  WHERE b.brief_category_id = bc.id
    AND bc.retention_days IS NOT NULL
    AND b.generated_at < NOW() - (bc.retention_days || ' days')::INTERVAL;
  
  -- Also delete topic-specific briefs older than 30 days (default)
  DELETE FROM briefs
  WHERE brief_category_id IS NULL
    AND topic_id IS NOT NULL
    AND generated_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

**Schema Notes:**

- `brief_categories`: User-defined categories (e.g., "News", "AI", "Financial")
- `brief_category_topics`: Many-to-many relationship (categories can include multiple topics)
- `briefs`: Actual brief documents
- Can be scoped to a category (`brief_category_id` set, `topic_id` NULL)
- Can be scoped to a single topic (`topic_id` set, `brief_category_id` NULL)
- Unique constraint ensures one brief per scope/date/format combination
- Retention: Configurable per category, defaults to 30 days for topic-specific briefs

### 1.2 Types: Brief Categories & Briefs

**File:** `src/types/briefs.ts` (New)

```typescript
export type BriefFormat = 'structured' | 'narrative';

export interface BriefCategory {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  retentionDays: number | null; // null = never delete
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  topicIds?: string[]; // Populated when fetching with topics
}

export interface BriefCategoryInsert {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  retentionDays?: number | null;
  topicIds?: string[]; // Topics to associate
}

export interface BriefCategoryUpdate {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  retentionDays?: number | null;
  topicIds?: string[]; // Update topic associations
}

export interface Brief {
  id: string;
  organizationId: string;
  briefCategoryId: string | null;
  topicId: string | null;
  briefDate: Date;
  format: BriefFormat;
  content: StructuredBriefContent | NarrativeBriefContent;
  generatedAt: Date;
  generatedBy: string;
  reviewed: boolean;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

export interface StructuredBriefContent {
  executiveSummary: string;
  topicHighlights: TopicHighlight[];
  topStories: TopStory[];
  claimsUpdates: Array<{
    claimId: string;
    claimText: string;
    status: CorroborationStatus;
    newEvidence: number;
  }>;
  recommendedActions: string[];
}

export interface NarrativeBriefContent {
  narrative: string; // Flowing text summary
  sections: string[]; // Section headers for navigation
}

export interface TopicHighlight {
  topicId: string;
  topicName: string;
  status: TopicStatus;
  activityCount: number;
  newEvidenceCount: number;
  summary?: string; // From topic summary artifact
  keyDevelopments?: string[];
  mediaTypes: MediaType[];
}

export interface TopStory {
  sourceRecordId: string;
  title: string;
  sourceName: string;
  sourceReliability: ReliabilityRating;
  publishedAt: Date;
  mediaType: MediaType;
  summary?: string; // From summary artifact (or title for videos)
  linkedTopics: Array<{ id: string; name: string }>;
  relevanceScore?: number;
  keyFacts?: string[]; // From key_facts artifact
}
```

**File:** `src/types/database.ts` - Add database types for brief tables

### 1.3 Backend: Brief Category Service

**File:** `backend/src/services/briefCategoryService.ts` (New)

```typescript
import { supabase } from '../utils/supabase';
import type { BriefCategory, BriefCategoryInsert, BriefCategoryUpdate } from '../types/briefs';

export const briefCategoryService = {
  async getAll(organizationId: string, includeTopics = false): Promise<BriefCategory[]>,
  async getById(categoryId: string, includeTopics = false): Promise<BriefCategory>,
  async create(organizationId: string, userId: string, category: BriefCategoryInsert): Promise<BriefCategory>,
  async update(categoryId: string, userId: string, updates: BriefCategoryUpdate): Promise<BriefCategory>,
  async delete(categoryId: string): Promise<void>,
  async addTopic(categoryId: string, topicId: string, userId: string): Promise<void>,
  async removeTopic(categoryId: string, topicId: string): Promise<void>,
  async getTopics(categoryId: string): Promise<string[]>, // Returns topic IDs
};
```

---

## Phase 2: Data Aggregation Service

**Goal:** Build data aggregation infrastructure to collect intelligence data for brief generation.

### 2.1 Brief Data Aggregation Service

**File:** `backend/src/services/briefDataService.ts` (New)

```typescript
interface BriefDataOptions {
  organizationId: string;
  dateRange: { start: Date; end: Date };
  topicIds?: string[]; // For category briefs: aggregate these topics
  singleTopicId?: string; // For topic briefs: single topic only
}

interface BriefDataAggregation {
  overview: {
    dateRange: { start: Date; end: Date };
    stats: {
      newRecords: number;
      activeTopics: number;
      newClaims: number;
      newEvidence: number;
      newArtifacts: number;
    };
    recentActivity: Array<{
      type: string;
      description: string;
      timestamp: Date;
      link?: string;
    }>;
  };
  topicHighlights: TopicHighlight[];
  topStories: TopStory[];
  claimsUpdates: Array<{
    claimId: string;
    claimText: string;
    status: CorroborationStatus;
    newEvidence: number;
    topicId: string;
    topicName: string;
  }>;
}

export const briefDataService = {
  async aggregateBriefData(options: BriefDataOptions): Promise<BriefDataAggregation>,
  
  // Helper methods
  async getOrganizationOverview(organizationId: string, dateRange: { start: Date; end: Date }),
  async getTopicHighlights(topicIds: string[], dateRange: { start: Date; end: Date }),
  async getTopStories(topicIds: string[], dateRange: { start: Date; end: Date }, limit: number),
  async getClaimsUpdates(topicIds: string[], dateRange: { start: Date; end: Date }),
};
```

**Aggregation Logic:**

- For category briefs: Aggregate data across all topics in the category
- For topic briefs: Aggregate data for the single topic
- Include source records linked to topics, artifacts, claims, evidence
- Filter by date range (typically last 24 hours for daily briefs)
- Rank top stories by relevance score, recency, source reliability

### 2.2 Brief Data Routes

**File:** `backend/src/routes/briefs.ts` (New)

- `GET /api/briefs/data` - Get aggregated data for brief generation
- Query params: `organizationId`, `startDate`, `endDate`, `topicIds[]`, `singleTopicId`
- Returns: `BriefDataAggregation`

---

## Phase 3: Brief Generation Service

**Goal:** Generate briefs in structured and narrative formats using AI analysis.

### 3.1 Brief Generation Service

**File:** `backend/src/services/briefGenerationService.ts` (New)

```typescript
interface BriefGenerationOptions {
  organizationId: string;
  briefCategoryId?: string | null; // NULL for topic-specific briefs
  topicId?: string | null; // NULL for category briefs
  briefDate: Date;
  format: BriefFormat;
  userId: string;
}

export const briefGenerationService = {
  async generateBrief(options: BriefGenerationOptions): Promise<Brief>,
  
  async generateStructuredBrief(data: BriefDataAggregation, context: { categoryName?: string; topicName?: string }): Promise<StructuredBriefContent>,
  
  async generateNarrativeBrief(data: BriefDataAggregation, context: { categoryName?: string; topicName?: string }): Promise<NarrativeBriefContent>,
};
```

**Generation Flow:**

1. Determine scope (category or single topic)
2. Fetch topic IDs (from category or single topic)
3. Aggregate data using `briefDataService`
4. Generate content based on format:

- **Structured**: Organize data into sections (overview, highlights, stories, claims, actions)
- **Narrative**: Use Ollama to generate flowing text summary

5. Store brief in database
6. Return brief

### 3.2 Ollama Integration for Narrative Briefs

**File:** `backend/src/services/ollamaService.ts` - Add method

```typescript
async generateNarrativeBrief(
  data: BriefDataAggregation,
  context: { categoryName?: string; topicName?: string }
): Promise<string> {
  // Enhanced prompt includes all brief data
  // Generates human-readable narrative
  // Sections: Overview, Key Developments, Topic Updates, Important Stories, Analysis Insights
  // References links and cross-media analysis when available
  // Notes when video content is title-only
  // For category briefs: Synthesizes across multiple topics
  // For topic briefs: Focuses on single topic depth
}
```



### 3.3 Brief Routes

**File:** `backend/src/routes/briefs.ts`

- `POST /api/briefs/generate` - Generate a new brief
- Body: `{ briefCategoryId?: string, topicId?: string, briefDate?: string, format: BriefFormat }`
- Returns: `Brief`
- `GET /api/briefs/:briefId` - Get a specific brief
- `GET /api/briefs` - List briefs
- Query params: `organizationId`, `briefCategoryId?`, `topicId?`, `startDate?`, `endDate?`, `format?`
- `PATCH /api/briefs/:briefId/review` - Mark brief as reviewed
- `DELETE /api/briefs/:briefId` - Delete a brief

---

## Phase 4: Frontend: Brief Categories Management

**Goal:** UI for creating and managing brief categories.

### 4.1 Brief Categories Page

**File:** `src/components/Briefs/BriefCategoriesPage.tsx` (New)

- List all brief categories for organization
- Create new category button
- Edit/delete category actions
- Show topic associations for each category
- Display retention policy

### 4.2 Brief Category Form

**File:** `src/components/Briefs/BriefCategoryForm.tsx` (New)

- Name, description, icon, color fields
- Retention days input (optional, defaults to 30)
- Topic selection (multi-select from organization topics)
- Create/update category

### 4.3 Brief Category Service

**File:** `src/services/briefCategory.service.ts` (New)

- `getAll(organizationId, includeTopics?)`
- `getById(categoryId, includeTopics?)`
- `create(category)`
- `update(categoryId, updates)`
- `delete(categoryId)`
- `addTopic(categoryId, topicId)`
- `removeTopic(categoryId, topicId)`

---

## Phase 5: Frontend: Brief Generation & Viewing

**Goal:** UI for generating and viewing briefs.

### 5.1 Briefs Page

**File:** `src/components/Briefs/BriefsPage.tsx` (New)

- Main briefs listing page
- Filter by category, topic, date range, format
- "Generate Brief" button
- Brief cards showing date, category/topic, format, review status

### 5.2 Brief Generation Modal

**File:** `src/components/Briefs/GenerateBriefModal.tsx` (New)

- Scope selection: Category or Topic
- Category/Topic selector
- Date picker (defaults to today)
- Format selector: Structured or Narrative
- Generate button

### 5.3 Brief Detail View

**File:** `src/components/Briefs/BriefDetailPage.tsx` (New)

- Display brief content based on format
- Structured view: Sections with organized data
- Narrative view: Flowing text with section navigation
- Review button
- Delete button
- Export/share options (future)

### 5.4 Brief Views

**Files:**

- `src/components/Briefs/StructuredBriefView.tsx` (New) - Structured format display
- `src/components/Briefs/NarrativeBriefView.tsx` (New) - Narrative format display
- `src/components/Briefs/BriefSection.tsx` (New) - Reusable section component

### 5.5 Brief Service

**File:** `src/services/briefs.service.ts` (New)

- `generateBrief(options)`
- `getBrief(briefId)`
- `listBriefs(filters)`
- `markReviewed(briefId)`
- `deleteBrief(briefId)`
- `getBriefData(options)` - Get aggregated data for preview

### 5.6 Navigation Updates

**Files:**

- Update `src/components/Layout/Sidebar.tsx` - Add "Briefs" navigation item
- Update `src/App.tsx` - Add routes:
- `/briefs` - Briefs listing
- `/briefs/categories` - Category management
- `/briefs/:briefId` - Brief detail

---

## Phase 6: Retention & Cleanup

**Goal:** Implement configurable retention policies and automated cleanup.

### 6.1 Retention Policy Management

**File:** `backend/src/services/briefRetentionService.ts` (New)

```typescript
export const briefRetentionService = {
  async applyRetentionPolicy(categoryId: string): Promise<{ deleted: number }>,
  async applyDefaultRetention(): Promise<{ deleted: number }>, // For topic-specific briefs
  async previewExpiredBriefs(categoryId?: string): Promise<Brief[]>,
};
```



### 6.2 GitHub Actions: Brief Cleanup Workflow

**File:** `.github/workflows/brief-cleanup.yml` (New)

```yaml
name: Brief Cleanup
on:
  schedule:
        - cron: '0 1 * * *' # Daily at 1 AM UTC
  workflow_dispatch: # Allow manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
            - name: Delete Expired Briefs
        run: |
          curl -X POST "${{ secrets.API_URL }}/api/briefs/cleanup" \
            -H "Authorization: Bearer ${{ secrets.API_KEY }}"
```

**File:** `backend/src/routes/briefs.ts`

- `POST /api/briefs/cleanup` - Trigger retention cleanup (called by GitHub Actions)
- Calls `delete_expired_briefs()` function
- Returns deletion count

### 6.3 Frontend: Retention Policy UI

**Files:**

- Update `src/components/Briefs/BriefCategoryForm.tsx` - Retention days input with help text
- Update `src/components/Briefs/BriefCategoriesPage.tsx` - Show retention policy per category
- Add retention policy explanation tooltip

---

## Implementation Strategy

### Phased Rollout

1. **Phase 1** (Foundation): Brief categories schema and service
2. **Phase 2** (Data Aggregation): Data collection infrastructure
3. **Phase 3** (Generation): Brief generation with AI
4. **Phase 4** (Category Management): Frontend for managing categories
5. **Phase 5** (Brief UI): Frontend for generating and viewing briefs
6. **Phase 6** (Retention): Cleanup and retention policies

### Key Design Decisions

1. **Dual Scope Model:**

- Briefs can be scoped to categories (multiple topics) or single topics
- Category briefs aggregate data across all associated topics
- Topic briefs focus on single topic depth

2. **Manual Creation:**

- Briefs are created on-demand by users
- No automatic generation (keeps control with analysts)
- Can generate for any date (not just today)

3. **Format Flexibility:**

- Structured: Organized sections, easy to scan
- Narrative: Flowing text, better for reading
- User chooses format at generation time

4. **Configurable Retention:**

- Each category can have its own retention policy
- Topic-specific briefs default to 30 days
- Categories can set retention to null (never delete) for important briefs

5. **Separate Section:**

- Briefs are a distinct section of the app
- Own navigation, management, and workflows
- Integrates with topics but operates independently

### Dependencies

- Requires Phase 2 (Enhanced Analysis) from Enhanced AI Analysis plan for:
- Topic summarization
- Key facts extraction
- Content preparation with metadata/links
- Uses existing topic and source record data
- Uses Ollama for narrative brief generation

### Testing Considerations

- Brief category creation and topic associations
- Data aggregation across multiple topics
- Structured brief generation accuracy
- Narrative brief quality and coherence
- Retention policy application (per category and default)
- Brief deletion and cleanup
- Topic-specific vs category brief generation
- Date range filtering in aggregation

### Performance Considerations

- Data aggregation: Optimize queries for large topic sets
- Narrative generation: May take time for large datasets (consider async generation)
- Brief storage: JSONB content can be large (monitor database size)
- Cleanup: Efficient deletion queries (indexed on `generated_at`)

---

## Workflow Integration

### Brief Creation Workflow

1. User navigates to Briefs section
2. Creates brief category (optional) or selects existing category
3. Associates topics with category (for category briefs)
4. Generates brief:

- Selects scope (category or topic)
- Chooses date
- Chooses format (structured or narrative)

5. Views generated brief
6. Reviews and marks as reviewed

### Brief Category Management

1. User creates category (e.g., "Financial Brief")
2. Associates relevant topics (e.g., "Dividend News", "Market Analysis")
3. Sets retention policy (e.g., 60 days for financial briefs)
4. Generates briefs for this category as needed

### Topic-Specific Briefs

1. User selects a topic
2. Generates brief for that topic
3. Brief focuses on single topic depth
4. Uses default 30-day retention

---

## Future Enhancements (Out of Scope)

- Scheduled automatic brief generation
- Brief templates and customization