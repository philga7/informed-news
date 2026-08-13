# Supabase Database Migrations

## Quick Start

### Apply Migrations via Supabase Dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project → **SQL Editor**
3. Apply migrations in order:

#### Migration 1: Initial Schema
```bash
# Copy and execute: migrations/20250101000000_initial_schema.sql
```
Creates all tables, relationships, indexes, and constraints.

#### Migration 2: Row Level Security
```bash
# Copy and execute: migrations/20250101000001_row_level_security.sql
```
Enables RLS and creates security policies.

#### Migration 3: Helper Functions
```bash
# Copy and execute: migrations/20250101000002_helper_functions.sql
```
Adds utility functions and views.

---

## Migration Files

### 20250101000000_initial_schema.sql
**Purpose:** Core database structure

**Creates:**
- `profiles` table (extends auth.users)
- `news_sources` table (user's news feeds)
- `news_articles` table (aggregated articles)
- `feed_collections` table (source groupings)
- `feed_source_configs` table (collection ↔ source configs)
- `topics` table (article topic groupings)
- `topic_articles` table (topic ↔ article associations)
- `ignored_topics` table (soft-deleted topics)
- `ignored_topic_articles` table (ignored topic associations)
- Indexes for performance
- Constraints for data integrity
- Triggers for `updated_at` auto-update

**Key Features:**
- UUID primary keys
- Proper foreign key relationships with CASCADE deletes
- Enum types for `source_type`, `topic_status`, `sort_by_type`
- Full-text search indexes (GIN)
- Partial indexes for boolean filters
- Composite indexes for common queries

---

### 20250101000001_row_level_security.sql
**Purpose:** Multi-tenant security

**Creates:**
- RLS policies for all tables
- Ensures users can only access their own data
- Grants appropriate permissions to authenticated users

**Security Model:**
- Users identified by `auth.uid()`
- All data scoped by `user_id`
- Frontend uses ANON_KEY (respects RLS)
- Backend can use SERVICE_ROLE_KEY (bypasses RLS)

---

### 20250101000002_helper_functions.sql
**Purpose:** Utility functions for common operations

**Creates:**
- `get_article_count_by_source(user_id)` - Article counts per source
- `get_topics_with_counts(user_id)` - Topics with article counts
- `search_articles(...)` - Full-text search
- `get_recent_articles(...)` - Filtered article retrieval
- `get_topic_articles(...)` - Articles for a topic
- `add_articles_to_topic(...)` - Bulk insert topic associations
- `archive_expired_topics()` - Auto-archive expired topics
- `user_stats` view - Aggregated user statistics

---

## Verification

After applying migrations, verify the setup:

### Check Tables
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Expected tables:
- profiles
- news_sources
- news_articles
- feed_collections
- feed_source_configs
- topics
- topic_articles
- ignored_topics
- ignored_topic_articles

### Check RLS Policies
```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';
```

Should show multiple policies per table.

### Test Helper Functions
```sql
-- Should return empty result set (no data yet)
SELECT * FROM user_stats;
```

---

## Rolling Back

If you need to rollback migrations:

```sql
-- Drop all tables (CAUTION: Destroys all data)
DROP TABLE IF EXISTS public.ignored_topic_articles CASCADE;
DROP TABLE IF EXISTS public.ignored_topics CASCADE;
DROP TABLE IF EXISTS public.topic_articles CASCADE;
DROP TABLE IF EXISTS public.topics CASCADE;
DROP TABLE IF EXISTS public.feed_source_configs CASCADE;
DROP TABLE IF EXISTS public.feed_collections CASCADE;
DROP TABLE IF EXISTS public.news_articles CASCADE;
DROP TABLE IF EXISTS public.news_sources CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop helper functions
DROP FUNCTION IF EXISTS get_article_count_by_source CASCADE;
DROP FUNCTION IF EXISTS get_topics_with_counts CASCADE;
DROP FUNCTION IF EXISTS search_articles CASCADE;
DROP FUNCTION IF EXISTS get_recent_articles CASCADE;
DROP FUNCTION IF EXISTS get_topic_articles CASCADE;
DROP FUNCTION IF EXISTS add_articles_to_topic CASCADE;
DROP FUNCTION IF EXISTS archive_expired_topics CASCADE;
DROP VIEW IF EXISTS user_stats CASCADE;

-- Drop custom types
DROP TYPE IF EXISTS source_type CASCADE;
DROP TYPE IF EXISTS topic_status CASCADE;
DROP TYPE IF EXISTS sort_by_type CASCADE;
```

---

## Database Statistics

After running for a while, check database health:

### Table Sizes
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Index Usage
```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Slow Queries (if enabled)
```sql
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

---

## Troubleshooting

### "relation already exists" error
Tables already exist. Either:
1. Drop existing tables first (see Rolling Back)
2. Skip to next migration

### "permission denied" error
Ensure you're connected with proper credentials:
- Use `postgres` user or SERVICE_ROLE_KEY for migrations
- Regular users cannot create tables

### RLS blocking queries
If testing with SERVICE_ROLE_KEY in frontend:
- Switch to ANON_KEY for testing RLS
- Ensure `auth.uid()` returns valid user ID
- Check RLS policies with `SELECT * FROM pg_policies;`

---

## Next Steps

1. ✅ Apply all three migrations
2. ✅ Verify tables and policies exist
3. → Create Supabase client utilities in codebase
4. → Test authentication flow
5. → Begin localStorage → Supabase migration
6. → Set up data export/backup strategy

