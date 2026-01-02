# Plan 8: Legacy to OSINT Complete Migration

This plan migrates existing legacy data to OSINT tables, removes all legacy code paths, and ensures the application operates fully under the OSINT model.

## Current State Analysis

The app has two parallel data models:**Legacy (to be removed):**

- Tables: `news_sources`, `news_articles`, `feed_collections`, `topics`, `topic_articles`, `ignored_topics`
- Services: `sources.service.ts`, `articles.service.ts`, `collections.service.ts`, `topics.service.ts`
- State: `state.sources`, `state.articles`, `state.collections`, `state.topics`, `state.ignoredTopics`
- Components: `src/components/Intelligence/*`, `src/components/News/*`, `src/components/Feeds/*`, `src/components/Sources/SourceManager.tsx`, `AddSourceForm.tsx`

**OSINT (keeping):**

- Tables: `sources`, `source_records`, `osint_topics`, `topic_source_links`, `analytic_artifacts`, `organizations`, `org_members`
- Services: `osintSources.service.ts`, `osintTopics.service.ts`, `sourceRecords.service.ts`, `analysis.service.ts`
- Components: `src/components/Topics/*`, `src/components/SourceRecords/*`, `src/components/Sources/SourcesPage.tsx`, `OsintSourcesTable.tsx`

## Architecture After Cleanup

```mermaid
flowchart TB
    subgraph Frontend [Frontend - React]
        Header[Header.tsx]
        TopicsPage[TopicsPage]
        SourceRecordsPage[SourceRecordsPage]
        SourcesPage[SourcesPage]
        AppContext[AppContext - Simplified]
    end
    
    subgraph Services [Frontend Services]
        OsintSources[osintSources.service]
        OsintTopics[osintTopics.service]
        SourceRecords[sourceRecords.service]
        Analysis[analysis.service]
    end
    
    subgraph Backend [Backend API]
        IngestRoute[/api/ingest]
        TopicsRoute[/api/topics]
        SourcesRoute[/api/sources]
        RecordsRoute[/api/source-records]
        AnalysisRoute[/api/analysis]
    end
    
    subgraph Database [Supabase - OSINT Only]
        Sources[(sources)]
        Records[(source_records)]
        Topics[(osint_topics)]
        Links[(topic_source_links)]
        Artifacts[(analytic_artifacts)]
    end
    
    Header --> IngestRoute
    TopicsPage --> OsintTopics
    SourceRecordsPage --> SourceRecords
    SourcesPage --> OsintSources
    
    OsintSources --> SourcesRoute
    OsintTopics --> TopicsRoute
    SourceRecords --> RecordsRoute
    
    SourcesRoute --> Sources
    RecordsRoute --> Records
    TopicsRoute --> Topics
    TopicsRoute --> Links
    AnalysisRoute --> Artifacts
```



## Implementation Tasks

### Phase 1: Data Migration

#### 1.1 Create Migration Script

**File:** New `supabase/migrations/20250102000002_migrate_legacy_to_osint.sql`Migrate data from legacy tables to OSINT tables:

- `news_sources` -> `sources` (map user_id to default organization)
- `news_articles` -> `source_records`
- `topics` -> `osint_topics`
- `topic_articles` -> `topic_source_links`

Key mappings:

- Legacy `source_type` enum values match OSINT `osint_source_type`
- Set default `reliability_rating` to 'UNKNOWN' for migrated sources
- Set default `confidence_level` to 'LOW' for migrated topic links

### Phase 2: Rewire Header "Update News" Button

#### 2.1 Update Header Component

**File:** [`src/components/Layout/Header.tsx`](src/components/Layout/Header.tsx)

- Remove imports of legacy `articlesService` and `feedsApi`
- Replace `handleUpdateNews` to call new OSINT ingestion endpoint (`POST /api/ingest/rss`)
- Remove references to `state.sources` (legacy sources array)
- Add organization context (hardcoded org ID for now, like SourcesPage uses)

### Phase 3: Remove Legacy Frontend Code

#### 3.1 Delete Legacy Services

**Files to delete:**

- `src/services/sources.service.ts`
- `src/services/articles.service.ts`
- `src/services/collections.service.ts`
- `src/services/topics.service.ts`

**File to update:** [`src/services/index.ts`](src/services/index.ts) - Remove exports

#### 3.2 Delete Legacy Components

**Directories to delete:**

- `src/components/Intelligence/` (6 files - unused legacy topic views)
- `src/components/News/` (3 files - legacy article views)
- `src/components/Feeds/` (4 files - legacy feed collection views)
- `src/components/Filters/` (1 file - legacy article filters)

**Files to delete:**

- `src/components/Sources/SourceManager.tsx`
- `src/components/Sources/AddSourceForm.tsx`
- `src/components/Sources/EditSourceModal.tsx`
- `src/components/Sources/SourcesModal.tsx`

#### 3.3 Delete Legacy Utils

**Files to review/delete:**

- `src/utils/newsFetcher.ts` (if only used by legacy flow)
- `src/utils/feedAggregator.ts` (if only used by legacy flow)
- `src/utils/topicExtractor.ts` (if only used by legacy flow)

### Phase 4: Simplify State Management

#### 4.1 Remove Legacy State Properties

**File:** [`src/types/index.ts`](src/types/index.ts)Remove interfaces:

- `NewsArticle`
- `NewsSource`
- `SourceType`
- `FeedSourceConfig`
- `FeedCollection`
- `Topic` (legacy version)
- `IgnoredTopic`
- `TopicTag`, `TopicStatus`

Simplify `AppState`:

- Remove `articles`, `sources`, `collections`, `topics`, `ignoredTopics`
- Remove `filters` (legacy article filtering)
- Keep only: `authentication`, `ui`

#### 4.2 Simplify Reducer

**File:** [`src/context/appReducer.ts`](src/context/appReducer.ts)Remove actions:

- All `*_ARTICLES` actions
- All `*_SOURCE` actions  
- All `*_COLLECTION` actions
- All `*_TOPIC` actions (legacy)
- `SET_FILTER`

Keep only:

- `LOGIN`, `LOGOUT`, `RESTORE_AUTH`
- `SET_FETCHING`, `SET_ERROR`, `SET_LAST_UPDATE`
- `SET_LOADING_DATA`, `SET_DATA_LOAD_ERROR`

#### 4.3 Remove Data Loader Hook

**File:** Delete `src/hooks/useDataLoader.ts`**File:** [`src/context/AppContext.tsx`](src/context/AppContext.tsx) - Remove useDataLoader import and usage

### Phase 5: Backend Cleanup

#### 5.1 Remove Deprecated Routes

**File:** [`backend/src/routes/feeds.ts`](backend/src/routes/feeds.ts) - Delete entire file (marked @deprecated)**File:** [`backend/src/server.ts`](backend/src/server.ts) - Remove feeds router import and mount

#### 5.2 Clean Up Backend Services

**Files to review:**

- `backend/src/services/feedFetcher.ts` - Delete if only used by deprecated feeds route
- `backend/src/services/feedCache.ts` - Delete if only used by deprecated feeds route

### Phase 6: Database Cleanup (Optional - After Verification)

#### 6.1 Drop Legacy Tables Migration

**File:** New `supabase/migrations/20250102000003_drop_legacy_tables.sql`After verifying migration success:

```sql
DROP TABLE IF EXISTS ignored_topic_articles CASCADE;
DROP TABLE IF EXISTS ignored_topics CASCADE;
DROP TABLE IF EXISTS topic_articles CASCADE;
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS feed_source_configs CASCADE;
DROP TABLE IF EXISTS feed_collections CASCADE;
DROP TABLE IF EXISTS news_articles CASCADE;
DROP TABLE IF EXISTS news_sources CASCADE;
DROP TYPE IF EXISTS source_type;
DROP TYPE IF EXISTS sort_by_type;
DROP TYPE IF EXISTS topic_status;
```



## Key Files Summary

| Action | Files ||--------|-------|| Create | `supabase/migrations/20250102000002_migrate_legacy_to_osint.sql` || Modify | `src/components/Layout/Header.tsx`, `src/services/index.ts`, `src/types/index.ts`, `src/context/appReducer.ts`, `src/context/AppContext.tsx`, `backend/src/server.ts` || Delete | 4 legacy services, 14+ legacy components, `useDataLoader.ts`, `backend/src/routes/feeds.ts`, legacy backend services || Optional | `supabase/migrations/20250102000003_drop_legacy_tables.sql` |

## Testing Checklist

- [ ] Legacy sources (e.g., "Citizen Free Press") appear in OSINT Sources page after migration
- [ ] "Update News" button triggers OSINT ingestion successfully
- [ ] Topics page loads OSINT topics correctly