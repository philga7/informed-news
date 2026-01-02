# Plan 3: Topic-Centric UI Foundation

## Summary

Build a new topic-centric UI using the OSINT database schema (`osint_topics`, `source_records`, `topic_source_links`). Replace the existing Dashboard with a Topics-first navigation pattern.

## Architecture Overview

```mermaid
flowchart TB
    subgraph Frontend [Frontend Pages]
        TopicsPage["/topics - Topic List"]
        TopicDetail["/topics/:id - Topic Detail"]
        SourceRecordsPage["/source-records - Records List"]
        SourceRecordDetail["/source-records/:id - Record Detail"]
        SourcesPage["/sources - Manage Sources"]
    end
    
    subgraph Services [Frontend Services]
        OsintTopicsService["osintTopics.service.ts"]
        SourceRecordsService["sourceRecords.service.ts"]
        OsintSourcesService["osintSources.service.ts"]
    end
    
    subgraph Backend [Backend API]
        TopicsAPI["/api/topics"]
        SourceRecordsAPI["/api/source-records"]
    end
    
    subgraph Database [Supabase Tables]
        OsintTopics["osint_topics"]
        SourceRecords["source_records"]
        TopicSourceLinks["topic_source_links"]
        Sources["sources"]
    end
    
    TopicsPage --> OsintTopicsService
    TopicDetail --> OsintTopicsService
    SourceRecordsPage --> SourceRecordsService
    SourceRecordDetail --> SourceRecordsService
    SourcesPage --> OsintSourcesService
    
    OsintTopicsService --> TopicsAPI
    SourceRecordsService --> SourceRecordsAPI
    
    TopicsAPI --> OsintTopics
    TopicsAPI --> TopicSourceLinks
    SourceRecordsAPI --> SourceRecords
    SourceRecordsAPI --> TopicSourceLinks
</flowchart>
```

---

## Phase 1: Backend API Endpoints

Create new backend routes in [`backend/src/routes/`](backend/src/routes/).

### New File: `backend/src/routes/topics.ts`

Endpoints:

- `GET /api/topics` - List all topics with linked record counts
- `POST /api/topics` - Create new topic
- `GET /api/topics/:id` - Get topic detail with linked records
- `PATCH /api/topics/:id` - Update topic metadata
- `DELETE /api/topics/:id` - Delete topic
- `POST /api/topics/:id/links` - Link a SourceRecord to topic
- `DELETE /api/topics/:topicId/links/:linkId` - Unlink a record

### New File: `backend/src/routes/sourceRecords.ts`

Endpoints:

- `GET /api/source-records` - List with filters (source, date range, linked/unlinked, full-text search)
- `GET /api/source-records/:id` - Get record detail with linked topics

### Update: `backend/src/server.ts`

Register new routers.---

## Phase 2: Frontend Services

Create new services in [`src/services/`](src/services/) for OSINT data.

### New File: `src/services/osintTopics.service.ts`

Methods:

- `getAll(orgId)` - Fetch topics with counts
- `getById(id)` - Fetch topic detail with linked records
- `create(topic)` - Create topic
- `update(id, updates)` - Update topic
- `delete(id)` - Delete topic
- `linkRecord(topicId, sourceRecordId, metadata)` - Create link
- `unlinkRecord(topicId, linkId)` - Remove link

### New File: `src/services/sourceRecords.service.ts`

Methods:

- `getAll(filters)` - Fetch records with filters
- `getById(id)` - Fetch record detail with linked topics
- `search(query)` - Full-text search

---

## Phase 3: UI Components

### Navigation Update: [`src/components/Layout/Header.tsx`](src/components/Layout/Header.tsx)

Replace existing nav with:

- **Topics** (primary, icon: `Target` or `Crosshair`)
- **Source Records** (secondary, icon: `FileText`)
- **Sources** (icon: `Database`) - now a page, not modal

Remove from nav:

- Articles
- Dashboard  
- Feeds
- History

### New Pages in `src/components/Topics/`

| File | Description ||------|-------------|| `TopicsPage.tsx` | Main /topics list page || `TopicDetailPage.tsx` | /topics/:id detail with tabs || `TopicForm.tsx` | Create/edit topic modal/form || `TopicCard.tsx` | Card component for topic list || `LinkedRecordsTable.tsx` | Table of linked source records || `LinkRecordModal.tsx` | Modal to search and link records |

### New Pages in `src/components/SourceRecords/`

| File | Description ||------|-------------|| `SourceRecordsPage.tsx` | Main /source-records list page || `SourceRecordDetailPage.tsx` | /source-records/:id detail || `SourceRecordCard.tsx` | Card/row for record list || `SourceRecordFilters.tsx` | Filter controls || `LinkToTopicModal.tsx` | Modal to select topic(s) to link |

### New Page: `src/components/Sources/SourcesPage.tsx`

Convert existing `SourcesModal` content into a full page at /sources.---

## Phase 4: Routing Updates

### Update: [`src/App.tsx`](src/App.tsx)

```typescript
// New routes
<Route path="/topics" element={<TopicsPage />} />
<Route path="/topics/:id" element={<TopicDetailPage />} />
<Route path="/source-records" element={<SourceRecordsPage />} />
<Route path="/source-records/:id" element={<SourceRecordDetailPage />} />
<Route path="/sources" element={<SourcesPage />} />

// Redirect / to /topics (primary entry point)
<Route path="/" element={<Navigate to="/topics" replace />} />
```

---

## UI Styling Consistency

All new components will follow existing patterns from the codebase:| Element | Classes ||---------|---------|| Page background | `min-h-screen bg-stone-950` || Container | `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8` || Card | `bg-stone-900 border border-stone-800 rounded-lg` || Primary button | `bg-accent hover:bg-accent-hover text-white rounded-lg` || Secondary button | `bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg` || Page title | `text-3xl font-bold text-stone-100` || Tag/badge | `px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded` || Table header | `text-stone-400 text-sm font-medium` || Empty state | Use `EmptyState` component || Icons | Lucide React |---

## Key Files to Create/Modify

**Backend (4 files):**

- `backend/src/routes/topics.ts` (CREATE)
- `backend/src/routes/sourceRecords.ts` (CREATE)
- `backend/src/server.ts` (MODIFY - add routes)

**Frontend Services (3 files):**

- `src/services/osintTopics.service.ts` (CREATE)
- `src/services/sourceRecords.service.ts` (CREATE)
- `src/services/index.ts` (MODIFY - export new services)

**Frontend Components (12+ files):**

- `src/components/Topics/TopicsPage.tsx` (CREATE)
- `src/components/Topics/TopicDetailPage.tsx` (CREATE)
- `src/components/Topics/TopicForm.tsx` (CREATE)
- `src/components/Topics/TopicCard.tsx` (CREATE)
- `src/components/Topics/LinkedRecordsTable.tsx` (CREATE)
- `src/components/Topics/LinkRecordModal.tsx` (CREATE)
- `src/components/SourceRecords/SourceRecordsPage.tsx` (CREATE)
- `src/components/SourceRecords/SourceRecordDetailPage.tsx` (CREATE)
- `src/components/SourceRecords/SourceRecordFilters.tsx` (CREATE)
- `src/components/SourceRecords/LinkToTopicModal.tsx` (CREATE)
- `src/components/Sources/SourcesPage.tsx` (CREATE)
- `src/components/Layout/Header.tsx` (MODIFY)
- `src/App.tsx` (MODIFY)