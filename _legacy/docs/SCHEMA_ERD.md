# Entity Relationship Diagram

## Visual Schema Overview

```
┌─────────────────────┐
│   auth.users        │ (Supabase managed)
│  (Supabase Auth)    │
└──────────┬──────────┘
           │
           │ extends (1:1)
           │
           ▼
┌─────────────────────────────────────────────────────┐
│                    profiles                         │
│─────────────────────────────────────────────────────│
│ PK  id (UUID) → auth.users(id)                     │
│     email (TEXT, UNIQUE)                            │
│     name (TEXT)                                     │
│     created_at, updated_at                          │
└──────┬──────────────────────┬───────────────┬──────┘
       │                      │               │
       │ 1:N                  │ 1:N           │ 1:N
       │                      │               │
       ▼                      ▼               ▼
┌──────────────────┐   ┌──────────────┐   ┌─────────────────┐
│  news_sources    │   │feed_collections│   │    topics      │
│──────────────────│   │──────────────│   │─────────────────│
│ PK  id           │   │ PK  id       │   │ PK  id          │
│ FK  user_id      │   │ FK  user_id  │   │ FK  user_id     │
│     name         │   │     name     │   │     name        │
│     type (ENUM)  │   │     description│   │     keywords[]  │
│     url          │   │     created_at │   │     followed    │
│     enabled      │   │     updated_at │   │     tags[]      │
│     created_at   │   └───────┬──────┘   │     status(ENUM)│
│     last_fetched │           │          │     created_at   │
└─────┬────────────┘           │          └────────┬────────┘
      │                        │                   │
      │ 1:N                    │ N:M               │ N:M
      │                        │                   │
      ▼                        ▼                   ▼
┌──────────────────┐   ┌──────────────────┐   ┌─────────────────┐
│  news_articles   │   │feed_source_configs│   │ topic_articles  │
│──────────────────│   │──────────────────│   │─────────────────│
│ PK  id           │   │ PK  id           │   │ PK  id          │
│ FK  user_id      │◄──│ FK  collection_id│   │ FK  topic_id    │
│ FK  source_id    │   │ FK  source_id    │   │ FK  article_id ─┼──┐
│     title        │   │     count        │   │     created_at  │  │
│     description  │   │     sort_by      │   └─────────────────┘  │
│     url (UNIQUE) │   │     ascending    │                        │
│     image_url    │   │     created_at   │                        │
│     author       │   └──────────────────┘                        │
│     content      │                                                │
│     published_at │                                                │
│     fetched_at   │                                                │
│     is_read      │◄───────────────────────────────────────────────┘
│     is_favorite  │
│     created_at   │
│     updated_at   │
└──────────────────┘


┌─────────────────────────────────────────────────────┐
│              Soft Delete Flow                        │
└─────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │    topics       │
                    │     (active)    │
                    └────────┬────────┘
                             │
                             │ User ignores/deletes topic
                             │
                             ▼
                    ┌─────────────────┐
                    │ ignored_topics  │
                    │─────────────────│
                    │ PK  id          │
                    │ FK  user_id     │
                    │     original_   │
                    │     topic_id    │
                    │     name        │
                    │     keywords[]  │
                    │     tags[]      │
                    │     deleted_at  │
                    └────────┬────────┘
                             │
                             │ 1:N
                             ▼
                    ┌─────────────────────┐
                    │ignored_topic_articles│
                    │─────────────────────│
                    │ PK  id              │
                    │ FK  ignored_topic_id│
                    │ FK  article_id      │
                    │     created_at      │
                    └─────────────────────┘


┌─────────────────────────────────────────────────────┐
│              Data Flow Example                       │
└─────────────────────────────────────────────────────┘

User Registration
    │
    └──> auth.users (Supabase)
           │
           └──> profiles created (trigger or app logic)

User Adds RSS Source
    │
    └──> news_sources (enabled=true)

Backend Fetches Articles
    │
    ├──> news_articles inserted
    │      │
    │      └──> Duplicate check: UNIQUE(user_id, url)
    │
    └──> news_sources.last_fetched updated

Topic Extraction (AI/Manual)
    │
    ├──> topics created
    │
    └──> topic_articles created (linking topics ↔ articles)

User Creates Collection
    │
    ├──> feed_collections created
    │
    └──> feed_source_configs created (linking collection ↔ sources)


┌─────────────────────────────────────────────────────┐
│              Index Strategy                          │
└─────────────────────────────────────────────────────┘

news_articles:
  ✓ Primary: id
  ✓ Foreign: user_id, source_id
  ✓ Timestamp: published_at DESC
  ✓ Partial: is_read=false, is_favorite=true
  ✓ Composite: (user_id, published_at DESC)
  ✓ Full-text: GIN(title || description)

topics:
  ✓ Primary: id
  ✓ Foreign: user_id
  ✓ Enum: status
  ✓ Partial: followed=true
  ✓ Arrays: GIN(keywords), GIN(tags)

news_sources:
  ✓ Primary: id
  ✓ Foreign: user_id
  ✓ Enum: type
  ✓ Partial: enabled=true


┌─────────────────────────────────────────────────────┐
│         Common Query Patterns                        │
└─────────────────────────────────────────────────────┘

1. Get User's Recent Articles
   → Uses: idx_news_articles_user_published

2. Filter Unread Articles
   → Uses: idx_news_articles_is_read (partial)

3. Search Articles
   → Uses: idx_news_articles_search (GIN full-text)

4. Get Topic Articles
   → Uses: idx_topic_articles_topic_id

5. Get Articles for Source
   → Uses: idx_news_articles_source_id

6. List User Topics by Status
   → Uses: idx_topics_user_status (composite)


┌─────────────────────────────────────────────────────┐
│              Security Model (RLS)                    │
└─────────────────────────────────────────────────────┘

auth.uid() = user_id
      │
      ├──> SELECT: Own data only
      ├──> INSERT: Must match auth.uid()
      ├──> UPDATE: Own data only
      └──> DELETE: Own data only

JOIN tables (feed_source_configs, topic_articles):
  → RLS checks parent table ownership
  → e.g., feed_source_configs checks feed_collections.user_id
```

## Key Design Principles

### 1. Multi-Tenancy
- Every user has isolated data
- RLS enforces data isolation at database level
- `user_id` on all primary tables

### 2. Data Integrity
- Foreign keys with CASCADE deletes
- Unique constraints prevent duplicates
- Check constraints validate data ranges
- NOT NULL on critical fields

### 3. Performance
- Indexes on all foreign keys
- Partial indexes on boolean filters
- GIN indexes for array and full-text search
- Composite indexes for common multi-column queries

### 4. Soft Deletes
- Topics can be "ignored" (soft delete)
- Data preserved for restoration
- Separate table for ignored topics

### 5. Flexibility
- JSONB not used (explicit columns for type safety)
- Arrays for keywords/tags (GIN indexable)
- ENUMs for fixed value sets
- Nullable fields for optional data

### 6. Auditability
- `created_at` on all tables
- `updated_at` on mutable tables (auto-updated via trigger)
- Timestamps on associations (topic_articles, etc.)
- Error messages preserved on sources

## Scaling Considerations

### Current Design (< 100K articles)
- Single database instance
- All indexes fit in memory
- Query times < 100ms

### Medium Scale (100K - 1M articles)
- Consider partitioning `news_articles` by `published_at`
- Add read replicas for heavy read loads
- Implement article archival (move old articles to archive table)

### Large Scale (> 1M articles)
- Partition tables by user_id or time
- Separate hot/cold data storage
- Consider external search engine (ElasticSearch/MeiliSearch)
- Implement caching layer (Redis)

## Migration Path from localStorage

### Phase 1: One-time Import
1. Export localStorage data to JSON
2. Transform to match Supabase schema
3. Bulk insert via Supabase client

### Phase 2: Dual-Write
1. Write to both localStorage and Supabase
2. Read from Supabase, fallback to localStorage
3. Verify data consistency

### Phase 3: Supabase Only
1. Remove localStorage writes
2. Remove localStorage reads
3. Clean up old localStorage data

