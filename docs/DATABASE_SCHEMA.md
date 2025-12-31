# Database Schema Documentation

## Overview

This document describes the PostgreSQL database schema for the Informed News application, hosted on Supabase.

## Architecture Decisions

### Multi-Tenancy
- All user data is isolated using Row Level Security (RLS)
- Each table has a `user_id` foreign key to `profiles` table
- RLS policies ensure users can only access their own data

### Data Relationships
```
profiles (extends auth.users)
  ├── news_sources (1:N)
  │   └── news_articles (1:N)
  ├── feed_collections (1:N)
  │   └── feed_source_configs (N:M with sources)
  ├── topics (1:N)
  │   └── topic_articles (N:M with articles)
  └── ignored_topics (1:N)
      └── ignored_topic_articles (N:M with articles)
```

## Tables

### 1. profiles
Extends Supabase `auth.users` with application-specific data.

**Columns:**
- `id` (UUID, PK) - References auth.users(id)
- `email` (TEXT, UNIQUE) - User email
- `name` (TEXT) - Display name
- `created_at` (TIMESTAMPTZ) - Account creation timestamp
- `updated_at` (TIMESTAMPTZ) - Last update timestamp

**Indexes:**
- Primary key on `id`
- Index on `email` for lookups

**RLS Policies:**
- Users can view, insert, and update their own profile only

---

### 2. news_sources
User-defined news sources (RSS feeds, APIs, manual URLs, scrapers).

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `name` (TEXT) - Source display name
- `type` (ENUM: rss, api, manual, scrape)
- `url` (TEXT) - Source URL
- `enabled` (BOOLEAN) - Whether source is active
- `scrape_external_url` (BOOLEAN) - Enable scraping full article
- `created_at` (TIMESTAMPTZ)
- `last_fetched` (TIMESTAMPTZ) - Last successful fetch
- `error_message` (TEXT) - Last error (if any)

**Indexes:**
- Primary key on `id`
- Index on `user_id`
- Partial index on `enabled = true`
- Index on `type`

**RLS Policies:**
- Users have full CRUD access to their own sources

---

### 3. news_articles
Aggregated news articles from various sources.

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `source_id` (UUID, FK → news_sources)
- `title` (TEXT)
- `description` (TEXT)
- `url` (TEXT)
- `image_url` (TEXT, nullable)
- `author` (TEXT, nullable)
- `content` (TEXT, nullable) - Full article content if scraped
- `published_at` (TIMESTAMPTZ) - Original publication date
- `fetched_at` (TIMESTAMPTZ) - When article was fetched
- `is_read` (BOOLEAN)
- `is_favorite` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE(user_id, url) - Prevents duplicate articles per user

**Indexes:**
- Primary key on `id`
- Index on `user_id`
- Index on `source_id`
- Index on `published_at DESC` (for chronological queries)
- Partial index on `is_read = false`
- Partial index on `is_favorite = true`
- Composite index on `(user_id, published_at DESC)`
- GIN index for full-text search on `title` and `description`

**RLS Policies:**
- Users have full CRUD access to their own articles

---

### 4. feed_collections
User-created collections grouping multiple news sources.

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `name` (TEXT)
- `description` (TEXT, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Indexes:**
- Primary key on `id`
- Index on `user_id`

**RLS Policies:**
- Users have full CRUD access to their own collections

---

### 5. feed_source_configs
Many-to-many relationship between collections and sources with configuration.

**Columns:**
- `id` (UUID, PK)
- `collection_id` (UUID, FK → feed_collections)
- `source_id` (UUID, FK → news_sources)
- `count` (INTEGER) - Max articles to include from this source
- `sort_by` (ENUM: date, title)
- `ascending` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE(collection_id, source_id) - Prevent duplicate source in collection

**Indexes:**
- Primary key on `id`
- Index on `collection_id`
- Index on `source_id`

**RLS Policies:**
- Users can CRUD configs for their own collections

---

### 6. topics
Auto-extracted or manually created topics grouping related articles.

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `name` (TEXT)
- `keywords` (TEXT[]) - Array of keywords for topic matching
- `followed` (BOOLEAN) - User is following this topic
- `tags` (TEXT[]) - User-defined tags
- `status` (ENUM: active, archived, ignored)
- `potential_relevance_score` (NUMERIC(3,2)) - 0.00 to 1.00
- `expiry_date` (TIMESTAMPTZ, nullable) - Auto-archive after this date
- `archived_at` (TIMESTAMPTZ, nullable)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Indexes:**
- Primary key on `id`
- Index on `user_id`
- Index on `status`
- Partial index on `followed = true`
- Composite index on `(user_id, status)`
- GIN indexes on `keywords` and `tags` arrays

**RLS Policies:**
- Users have full CRUD access to their own topics

---

### 7. topic_articles
Many-to-many relationship between topics and articles.

**Columns:**
- `id` (UUID, PK)
- `topic_id` (UUID, FK → topics)
- `article_id` (UUID, FK → news_articles)
- `created_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE(topic_id, article_id) - Prevent duplicate article in topic

**Indexes:**
- Primary key on `id`
- Index on `topic_id` (for topic → articles queries)
- Index on `article_id` (for article → topics queries)

**RLS Policies:**
- Users can view/insert/delete associations for their own topics

---

### 8. ignored_topics
Soft-deleted topics preserved for potential restoration.

**Columns:**
- `id` (UUID, PK)
- `user_id` (UUID, FK → profiles)
- `original_topic_id` (UUID) - Reference to original topic
- `name` (TEXT)
- `keywords` (TEXT[])
- `tags` (TEXT[])
- `deleted_at` (TIMESTAMPTZ)

**Indexes:**
- Primary key on `id`
- Index on `user_id`
- Index on `original_topic_id`

**RLS Policies:**
- Users can view, insert, and delete their own ignored topics

---

### 9. ignored_topic_articles
Preserves article associations for ignored topics.

**Columns:**
- `id` (UUID, PK)
- `ignored_topic_id` (UUID, FK → ignored_topics)
- `article_id` (UUID, FK → news_articles)
- `created_at` (TIMESTAMPTZ)

**Constraints:**
- UNIQUE(ignored_topic_id, article_id)

**Indexes:**
- Primary key on `id`
- Index on `ignored_topic_id`
- Index on `article_id`

**RLS Policies:**
- Users can view/insert/delete associations for their own ignored topics

---

## Helper Functions

### get_article_count_by_source(user_id)
Returns article counts grouped by source.

```sql
SELECT * FROM get_article_count_by_source('user-uuid');
```

### get_topics_with_counts(user_id)
Returns topics with article counts.

```sql
SELECT * FROM get_topics_with_counts('user-uuid');
```

### search_articles(user_id, search_query, limit, offset)
Full-text search across articles.

```sql
SELECT * FROM search_articles('user-uuid', 'climate change', 50, 0);
```

### get_recent_articles(user_id, limit, offset, source_id, favorites_only, unread_only)
Get recent articles with filtering.

```sql
-- Get 50 most recent articles
SELECT * FROM get_recent_articles('user-uuid', 50, 0, NULL, FALSE, FALSE);

-- Get unread favorites from specific source
SELECT * FROM get_recent_articles('user-uuid', 50, 0, 'source-uuid', TRUE, TRUE);
```

### get_topic_articles(topic_id, user_id, limit)
Get all articles for a topic.

```sql
SELECT * FROM get_topic_articles('topic-uuid', 'user-uuid', 50);
```

### add_articles_to_topic(topic_id, article_ids[])
Bulk insert articles into a topic.

```sql
SELECT add_articles_to_topic(
  'topic-uuid',
  ARRAY['article-uuid-1', 'article-uuid-2', 'article-uuid-3']::UUID[]
);
```

### archive_expired_topics()
Automatically archive topics past expiry date.

```sql
-- Returns count of archived topics
SELECT archive_expired_topics();
```

---

## Views

### user_stats
Aggregated statistics for each user.

**Columns:**
- `user_id`
- `email`
- `name`
- `total_articles`
- `unread_articles`
- `favorite_articles`
- `total_sources`
- `enabled_sources`
- `total_topics`
- `followed_topics`
- `total_collections`

```sql
SELECT * FROM user_stats WHERE user_id = auth.uid();
```

---

## Performance Considerations

### Indexing Strategy
1. **Foreign Keys**: All foreign keys are indexed for efficient joins
2. **Filters**: Partial indexes on boolean columns (is_read, is_favorite, enabled)
3. **Sorting**: Indexes on commonly sorted columns (published_at, created_at)
4. **Search**: GIN indexes for full-text search and array searches
5. **Composite Indexes**: For common multi-column queries (user_id + published_at)

### Query Optimization Tips
1. Use helper functions for complex queries (they're optimized)
2. Limit results with LIMIT/OFFSET for pagination
3. Use partial indexes by including filter conditions in WHERE clause
4. For search, use `search_articles()` function instead of raw queries
5. Batch operations using `add_articles_to_topic()` instead of individual inserts

### Expected Query Performance
- Article listing (50 records): < 50ms
- Full-text search: < 100ms
- Topic article retrieval: < 50ms
- User stats aggregation: < 200ms

---

## Security

### Row Level Security (RLS)
All tables have RLS enabled. Users can only access data they own.

### Authentication
- Uses Supabase Auth (`auth.users`)
- Frontend uses `ANON_KEY` (respects RLS)
- Backend can use `SERVICE_ROLE_KEY` (bypasses RLS) for admin operations

### Best Practices
1. ✅ Always use `auth.uid()` in queries from frontend
2. ✅ Use parameterized queries to prevent SQL injection
3. ✅ Validate input on both frontend and backend
4. ✅ Use SERVICE_ROLE_KEY only in trusted backend code
5. ✅ Never expose SERVICE_ROLE_KEY to the browser

---

## Migration Files

1. `20250101000000_initial_schema.sql` - Core tables and relationships
2. `20250101000001_row_level_security.sql` - RLS policies
3. `20250101000002_helper_functions.sql` - Utility functions and views

---

## Applying Migrations

### Option 1: Supabase Dashboard
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of each migration file
3. Execute in order (000000 → 000001 → 000002)

### Option 2: Supabase CLI (Recommended)
```bash
# Link to your project
supabase link --project-ref fwiswypygzosanbgesgb

# Apply all migrations
supabase db push
```

### Option 3: Direct psql
```bash
psql "postgresql://postgres.fwiswypygzosanbgesgb:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require" \
  -f supabase/migrations/20250101000000_initial_schema.sql

psql "..." -f supabase/migrations/20250101000001_row_level_security.sql
psql "..." -f supabase/migrations/20250101000002_helper_functions.sql
```

---

## Next Steps

1. Apply migrations to Supabase
2. Test connection from frontend and backend
3. Create Supabase client utilities in codebase
4. Begin localStorage → Supabase migration
5. Set up data sync/export utilities
6. Implement backup strategy

