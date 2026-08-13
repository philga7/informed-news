# OSINT Database Schema Migration

## Overview

This migration creates the foundational OSINT (Open-Source Intelligence) database schema as part of Plan 1. The new tables are created **parallel to existing tables**, so the current app continues to function normally.

## Migration Files

Apply these migrations in order:

1. **20250101000010_osint_organizations.sql** - Organizations and org_members tables
2. **20250101000011_osint_records_topics.sql** - Sources, source_records, and osint_topics tables
3. **20250101000012_osint_links_artifacts.sql** - topic_source_links and analytic_artifacts tables
4. **20250101000013_osint_rls.sql** - Row Level Security policies

## Applying Migrations

### Option 1: Supabase Dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project → **SQL Editor**
3. Execute each migration file in order (00010 → 00011 → 00012 → 00013)

### Option 2: Supabase CLI

```bash
# Link to your project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Apply all new migrations
supabase db push
```

### Option 3: Direct psql

```bash
psql "YOUR_CONNECTION_STRING" -f supabase/migrations/20250101000010_osint_organizations.sql
psql "YOUR_CONNECTION_STRING" -f supabase/migrations/20250101000011_osint_records_topics.sql
psql "YOUR_CONNECTION_STRING" -f supabase/migrations/20250101000012_osint_links_artifacts.sql
psql "YOUR_CONNECTION_STRING" -f supabase/migrations/20250101000013_osint_rls.sql
```

## Verification

After applying migrations, verify the schema was created correctly:

### 1. Check Tables Exist

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'organizations',
    'org_members',
    'sources',
    'source_records',
    'osint_topics',
    'topic_source_links',
    'analytic_artifacts'
  )
ORDER BY table_name;
```

Expected: 7 rows

### 2. Check Foreign Key Constraints

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'organizations',
    'org_members',
    'sources',
    'source_records',
    'osint_topics',
    'topic_source_links',
    'analytic_artifacts'
  )
ORDER BY tc.table_name, kcu.column_name;
```

Expected: Multiple foreign key relationships

### 3. Check Indexes

```sql
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'org_members',
    'sources',
    'source_records',
    'osint_topics',
    'topic_source_links',
    'analytic_artifacts'
  )
ORDER BY tablename, indexname;
```

Expected: Multiple indexes per table

### 4. Check RLS Policies

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'org_members',
    'sources',
    'source_records',
    'osint_topics',
    'topic_source_links',
    'analytic_artifacts'
  )
ORDER BY tablename, policyname;
```

Expected: Multiple policies per table (SELECT, INSERT, UPDATE, DELETE)

### 5. Check ENUM Types

```sql
SELECT
  t.typname AS enum_name,
  e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN (
  'osint_source_type',
  'reliability_rating',
  'confidence_level',
  'artifact_type'
)
ORDER BY t.typname, e.enumsortorder;
```

Expected: All enum types with their values

## Seeding Data

After migrations are applied, you can seed sample data:

```bash
# First, get a user_id from your profiles table
psql "YOUR_CONNECTION_STRING" -c "SELECT id FROM profiles LIMIT 1;"

# Edit seed_osint.sql to replace 'YOUR_USER_ID_HERE' with the actual user_id
# Then run the seed script
psql "YOUR_CONNECTION_STRING" -f supabase/seed_osint.sql
```

**Note:** The seed script is **non-idempotent**. Running it twice will fail with duplicate key errors. To re-seed:

```sql
TRUNCATE organizations CASCADE;
```

Then run the seed script again.

## Schema Summary

### Tables Created

1. **organizations** - Team/project containers
2. **org_members** - User-organization relationships with roles
3. **sources** - OSINT sources (RSS, API, email, manual)
4. **source_records** - Individual records/articles from sources
5. **osint_topics** - Topic-centric analysis units
6. **topic_source_links** - Links records to topics with analysis metadata
7. **analytic_artifacts** - AI-assisted analysis outputs

### Key Features

- **Organization-based multi-tenancy** - Data is scoped by organization, not just user
- **Role-based access** - Owner, admin, analyst, member roles
- **Full-text search** - GIN indexes on source_records for fast searching
- **JSONB metadata** - Flexible storage for geographic indicators, raw metadata, confidence flags
- **RLS policies** - Organization members can only access their org's data

## Next Steps

After verifying the schema:

1. ✅ TypeScript types are available in `src/types/osint.ts`
2. ⏳ Create data services for OSINT tables (future plan)
3. ⏳ Build UI components for OSINT features (future plan)
4. ⏳ Integrate with existing app (future plan)

## Troubleshooting

### Migration Fails with "relation already exists"
- The table already exists. Check if you've already run this migration.
- To start fresh: `DROP TABLE IF EXISTS table_name CASCADE;`

### RLS Policy Errors
- Ensure you're authenticated: `SELECT auth.uid();`
- Check you're a member of the organization: `SELECT * FROM org_members WHERE user_id = auth.uid();`

### Foreign Key Violations
- Ensure parent records exist before inserting child records
- Check that organization_id references exist before creating sources/topics

### Seed Script Fails
- Ensure you've updated `YOUR_USER_ID_HERE` with an actual user_id
- Check that the user exists in the profiles table
- Verify migrations have been applied successfully

