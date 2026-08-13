# Plan 1 Testing Guide

This guide provides comprehensive testing procedures to verify that the OSINT database schema migration (Plan 1) is working correctly.

## Testing Overview

The tests are organized into several categories:
1. **Schema Verification** - Confirm tables, constraints, indexes exist
2. **TypeScript Type Checking** - Verify types compile and match schema
3. **Data Integrity Tests** - Test constraints, foreign keys, cascades
4. **RLS Policy Tests** - Verify organization-based access control
5. **CRUD Operations** - Test basic create, read, update, delete
6. **Integration Tests** - Test with Supabase client

## Prerequisites

Before testing:
- ✅ All 4 migrations have been applied successfully
- ✅ You have access to Supabase Dashboard SQL Editor or psql
- ✅ You have at least one user in the `profiles` table
- ✅ TypeScript is installed (`npm install` if needed)

---

## 1. Schema Verification Tests

### Test 1.1: Verify All Tables Exist

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

**Expected Result:** 7 rows returned

**If Failed:** Check migration logs for errors, verify migrations ran in correct order

---

### Test 1.2: Verify All ENUM Types Exist

```sql
SELECT
  t.typname AS enum_name,
  array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname IN (
  'osint_source_type',
  'reliability_rating',
  'confidence_level',
  'artifact_type'
)
GROUP BY t.typname
ORDER BY t.typname;
```

**Expected Result:**
- `osint_source_type`: {rss, api, email, manual}
- `reliability_rating`: {HIGH, MEDIUM, LOW, UNKNOWN}
- `confidence_level`: {HIGH, MEDIUM, LOW}
- `artifact_type`: {summary, entity_extraction, tone_analysis, sentiment, key_facts, timeline, network_graph}

---

### Test 1.3: Verify Foreign Key Constraints

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
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

**Expected Result:** At least 10 foreign key relationships, most with CASCADE delete rule

**Key Relationships to Verify:**
- `org_members.organization_id` → `organizations.id` (CASCADE)
- `org_members.user_id` → `profiles.id` (CASCADE)
- `sources.organization_id` → `organizations.id` (CASCADE)
- `source_records.source_id` → `sources.id` (CASCADE)
- `osint_topics.organization_id` → `organizations.id` (CASCADE)
- `topic_source_links.topic_id` → `osint_topics.id` (CASCADE)
- `topic_source_links.source_record_id` → `source_records.id` (CASCADE)
- `analytic_artifacts.organization_id` → `organizations.id` (CASCADE)

---

### Test 1.4: Verify Indexes

```sql
SELECT
  tablename,
  COUNT(*) AS index_count
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
GROUP BY tablename
ORDER BY tablename;
```

**Expected Result:** Each table should have at least 2-3 indexes (primary key + foreign keys + custom indexes)

**Special Indexes to Verify:**
- `idx_source_records_search` - GIN index for full-text search
- `idx_osint_topics_keywords` - GIN index for keywords array
- `idx_organizations_slug` - Unique index on slug

---

### Test 1.5: Verify RLS is Enabled

```sql
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
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
ORDER BY tablename;
```

**Expected Result:** All tables should have `rls_enabled = true`

---

### Test 1.6: Verify RLS Policies Count

```sql
SELECT
  tablename,
  COUNT(*) AS policy_count
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
GROUP BY tablename
ORDER BY tablename;
```

**Expected Result:** Each table should have 3-4 policies (SELECT, INSERT, UPDATE, DELETE)

---

## 2. TypeScript Type Checking

### Test 2.1: Compile TypeScript Types

```bash
# From project root
npx tsc --noEmit src/types/osint.ts
```

**Expected Result:** No compilation errors

**If Failed:** Check that all types match the database schema exactly

---

### Test 2.2: Verify Type Exports

```bash
# From project root - create a test file in the project directory
cat > test-osint-types.ts << 'EOF'
import type {
  Organization,
  OrgMember,
  Source,
  SourceRecord,
  OsintTopic,
  TopicSourceLink,
  AnalyticArtifact,
  OsintSourceType,
  ReliabilityRating,
  ConfidenceLevel,
  ArtifactType
} from './src/types/osint';

// Type check - if this compiles, types are valid
const test: Organization = {
  id: 'test',
  name: 'Test',
  slug: 'test',
  createdAt: new Date(),
  updatedAt: new Date()
};
EOF

# Run TypeScript compiler from project root
npx tsc --noEmit test-osint-types.ts

# Clean up
rm test-osint-types.ts
```

**Expected Result:** Compiles without errors

**Alternative (simpler) approach:** Just verify the types file compiles:

```bash
# From project root
npx tsc --noEmit src/types/osint.ts
```

---

## 3. Data Integrity Tests

### Test 3.1: Test Unique Constraints

```sql
-- This should fail with duplicate key error
INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Test Org', 'test-org', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000002', 'Test Org 2', 'test-org', NOW(), NOW());
```

**Expected Result:** Error: `duplicate key value violates unique constraint "organizations_slug_key"`

**If Passed:** Unique constraint is working

---

### Test 3.2: Test Check Constraints

```sql
-- This should fail with check constraint violation
INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000999', '', 'empty-name', NOW(), NOW());
```

**Expected Result:** Error: `new row for relation "organizations" violates check constraint "organizations_name_length"`

**If Passed:** Check constraint is working

---

### Test 3.3: Test Foreign Key Constraints

```sql
-- This should fail - organization doesn't exist
INSERT INTO public.sources (
  id, organization_id, source_type, name, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000999',
  '00000000-0000-0000-0000-000000009999', -- Non-existent org
  'rss',
  'Test Source',
  NOW(),
  NOW()
);
```

**Expected Result:** Error: `insert or update on table "sources" violates foreign key constraint`

**If Passed:** Foreign key constraint is working

---

### Test 3.4: Test Cascade Deletes

```sql
-- Create test data
INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000009999', 'Test Delete Org', 'test-delete', NOW(), NOW());

INSERT INTO public.sources (id, organization_id, source_type, name, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000009998', '00000000-0000-0000-0000-000000009999', 'rss', 'Test Source', NOW(), NOW());

-- Delete organization - should cascade delete source
DELETE FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000009999';

-- Verify source was deleted
SELECT COUNT(*) FROM public.sources WHERE id = '00000000-0000-0000-0000-000000009998';
```

**Expected Result:** Count = 0 (source was cascade deleted)

**If Failed:** Cascade delete not working properly

---

### Test 3.5: Test ENUM Type Constraints

```sql
-- This should fail - invalid enum value
INSERT INTO public.sources (
  id, organization_id, source_type, name, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000999',
  (SELECT id FROM public.organizations LIMIT 1),
  'invalid_type', -- Invalid enum
  'Test Source',
  NOW(),
  NOW()
);
```

**Expected Result:** Error: `invalid input value for enum osint_source_type: "invalid_type"`

**If Passed:** ENUM constraint is working

---

## 4. RLS Policy Tests

**Important:** RLS tests require authentication. Choose one of the methods below:

### Authentication Methods for Testing

#### Method A: Supabase Dashboard (Recommended for Quick Testing)

When using the Supabase Dashboard SQL Editor, you need to set the user context:

1. Go to Supabase Dashboard → SQL Editor
2. First, get a valid user ID from your profiles table:
```sql
SELECT id, email FROM profiles LIMIT 1;
```
3. Set the user context for your session (replace with your user ID):
```sql
-- Set the session to act as a specific user
SET request.jwt.claims = '{"sub": "YOUR_USER_ID_HERE"}';
```
4. Now `auth.uid()` will return your user ID
5. Run your RLS tests

**Note:** This setting only lasts for the current SQL Editor session.

---

#### Method B: Using psql with JWT Token

If using psql directly, you can authenticate with a JWT token:

```bash
# Get a JWT token by logging in through your app or Supabase Auth API
# Then set it in your psql session:
psql "YOUR_CONNECTION_STRING" -c "
  SET request.jwt.claims = '{\"sub\": \"YOUR_USER_ID\"}';
  -- Your test queries here
"
```

---

#### Method C: Bypass RLS for Schema Testing (Not for RLS Tests)

If you only want to test schema structure (NOT RLS policies), use SERVICE_ROLE_KEY which bypasses RLS:

```typescript
// In TypeScript test
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypasses RLS
);
```

**Warning:** Don't use this method for RLS policy tests - it defeats the purpose!

---

### Test 4.1: Verify User Can See Their Organization

**Prerequisites:** You must be authenticated using one of the methods above

```sql
-- Verify you're authenticated (should return your user ID, not NULL)
SELECT auth.uid() AS current_user_id;

-- If auth.uid() returns NULL, set authentication first:
-- SET request.jwt.claims = '{"sub": "YOUR_USER_ID"}';

-- Create test organization and membership
INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000009997', 'My Test Org', 'my-test-org', NOW(), NOW());

INSERT INTO public.org_members (id, organization_id, user_id, role, joined_at)
VALUES (
  '00000000-0000-0000-0000-000000009996',
  '00000000-0000-0000-0000-000000009997',
  auth.uid(), -- Your user ID
  'owner',
  NOW()
);

-- Try to select - should work
SELECT * FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000009997';
```

**Expected Result:** Returns 1 row

**If Failed:** RLS policy may not be working correctly

---

### Test 4.2: Verify User Cannot See Other Organizations

```sql
-- Create organization without membership
INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000009995', 'Other Org', 'other-org', NOW(), NOW());

-- Try to select - should return 0 rows (RLS blocks it)
SELECT * FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000009995';
```

**Expected Result:** Returns 0 rows (RLS blocks access)

**If Failed:** RLS policy may be too permissive

---

### Test 4.3: Verify Organization Members Can Insert Sources

```sql
-- Using the organization from Test 4.1
INSERT INTO public.sources (
  id, organization_id, source_type, name, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000009994',
  '00000000-0000-0000-0000-000000009997', -- Your org from Test 4.1
  'rss',
  'My Test Source',
  NOW(),
  NOW()
);

-- Verify it was created
SELECT * FROM public.sources WHERE id = '00000000-0000-0000-0000-000000009994';
```

**Expected Result:** Returns 1 row

**If Failed:** RLS INSERT policy may not be working

---

## 5. CRUD Operations Tests

### Test 5.1: Create Full Data Chain

This test creates a complete data chain: Organization → Source → SourceRecord → Topic → Link

```sql
-- Step 1: Create organization
INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000009990', 'CRUD Test Org', 'crud-test', NOW(), NOW());

-- Step 2: Add yourself as member (replace YOUR_USER_ID)
INSERT INTO public.org_members (id, organization_id, user_id, role, joined_at)
VALUES (
  '00000000-0000-0000-0000-000000009989',
  '00000000-0000-0000-0000-000000009990',
  auth.uid(), -- Replace with your user ID
  'owner',
  NOW()
);

-- Step 3: Create source
INSERT INTO public.sources (id, organization_id, source_type, name, url, reliability_rating, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000009988',
  '00000000-0000-0000-0000-000000009990',
  'rss',
  'Test RSS Feed',
  'https://example.com/feed.xml',
  'HIGH',
  NOW(),
  NOW()
);

-- Step 4: Create source record
INSERT INTO public.source_records (
  id, source_id, title, url, content, published_at, ingested_at, language
)
VALUES (
  '00000000-0000-0000-0000-000000009987',
  '00000000-0000-0000-0000-000000009988',
  'Test Article Title',
  'https://example.com/article',
  'This is test article content for CRUD testing.',
  NOW() - INTERVAL '1 day',
  NOW(),
  'en'
);

-- Step 5: Create topic
INSERT INTO public.osint_topics (
  id, organization_id, name, description, keywords, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000009986',
  '00000000-0000-0000-0000-000000009990',
  'Test Topic',
  'A test topic for CRUD operations',
  '["test", "crud", "validation"]'::jsonb,
  NOW(),
  NOW()
);

-- Step 6: Create topic-source link
INSERT INTO public.topic_source_links (
  id, topic_id, source_record_id, relevance_score, confidence_level, linked_at
)
VALUES (
  '00000000-0000-0000-0000-000000009985',
  '00000000-0000-0000-0000-000000009986',
  '00000000-0000-0000-0000-000000009987',
  0.85,
  'HIGH',
  NOW()
);

-- Step 7: Create analytic artifact
INSERT INTO public.analytic_artifacts (
  id, source_record_id, topic_id, organization_id, type, payload, model_name, created_by, created_at
)
VALUES (
  '00000000-0000-0000-0000-000000009984',
  '00000000-0000-0000-0000-000000009987',
  '00000000-0000-0000-0000-000000009986',
  '00000000-0000-0000-0000-000000009990',
  'summary',
  '{"summary": "This is a test summary artifact"}'::jsonb,
  'test-model-v1',
  'system:test',
  NOW()
);

-- Verify all records exist
SELECT 'organizations' AS table_name, COUNT(*) AS count FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000009990'
UNION ALL
SELECT 'sources', COUNT(*) FROM public.sources WHERE id = '00000000-0000-0000-0000-000000009988'
UNION ALL
SELECT 'source_records', COUNT(*) FROM public.source_records WHERE id = '00000000-0000-0000-0000-000000009987'
UNION ALL
SELECT 'osint_topics', COUNT(*) FROM public.osint_topics WHERE id = '00000000-0000-0000-0000-000000009986'
UNION ALL
SELECT 'topic_source_links', COUNT(*) FROM public.topic_source_links WHERE id = '00000000-0000-0000-0000-000000009985'
UNION ALL
SELECT 'analytic_artifacts', COUNT(*) FROM public.analytic_artifacts WHERE id = '00000000-0000-0000-0000-000000009984';
```

**Expected Result:** All counts = 1

---

### Test 5.2: Update Operations

```sql
-- Update organization name
UPDATE public.organizations
SET name = 'Updated CRUD Test Org'
WHERE id = '00000000-0000-0000-0000-000000009990';

-- Verify update
SELECT name FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000009990';
-- Should return: 'Updated CRUD Test Org'

-- Update source reliability rating
UPDATE public.sources
SET reliability_rating = 'MEDIUM'
WHERE id = '00000000-0000-0000-0000-000000009988';

-- Verify update
SELECT reliability_rating FROM public.sources WHERE id = '00000000-0000-0000-0000-000000009988';
-- Should return: 'MEDIUM'
```

**Expected Result:** Updates succeed and are reflected in queries

---

### Test 5.3: Delete Operations (with Cascade)

```sql
-- Delete organization - should cascade delete all related records
DELETE FROM public.organizations WHERE id = '00000000-0000-0000-0000-000000009990';

-- Verify cascade delete
SELECT 
  (SELECT COUNT(*) FROM public.sources WHERE organization_id = '00000000-0000-0000-0000-000000009990') AS sources_count,
  (SELECT COUNT(*) FROM public.osint_topics WHERE organization_id = '00000000-0000-0000-0000-000000009990') AS topics_count,
  (SELECT COUNT(*) FROM public.analytic_artifacts WHERE organization_id = '00000000-0000-0000-0000-000000009990') AS artifacts_count;
```

**Expected Result:** All counts = 0 (cascade delete worked)

---

## 6. Seed Data Tests

### Test 6.1: Run Seed Script

```bash
# First, get a user_id
psql "YOUR_CONNECTION_STRING" -c "SELECT id FROM profiles LIMIT 1;"

# Edit seed_osint.sql to replace user_id placeholders
# Then run seed script
psql "YOUR_CONNECTION_STRING" -f supabase/seed_osint.sql
```

**Expected Result:** Script runs without errors

---

### Test 6.2: Verify Seed Data

```sql
-- Check counts
SELECT 
  (SELECT COUNT(*) FROM public.organizations) AS org_count,
  (SELECT COUNT(*) FROM public.sources) AS source_count,
  (SELECT COUNT(*) FROM public.source_records) AS record_count,
  (SELECT COUNT(*) FROM public.osint_topics) AS topic_count,
  (SELECT COUNT(*) FROM public.topic_source_links) AS link_count;
```

**Expected Result:**
- org_count: 1
- source_count: 2
- record_count: 5
- topic_count: 3
- link_count: 5

---

### Test 6.3: Verify Seed Data Relationships

```sql
-- Verify all source_records have valid source_id
SELECT COUNT(*) 
FROM public.source_records sr
LEFT JOIN public.sources s ON sr.source_id = s.id
WHERE s.id IS NULL;
-- Should return 0 (all records have valid sources)

-- Verify all topic_source_links have valid topic_id and source_record_id
SELECT COUNT(*)
FROM public.topic_source_links tsl
LEFT JOIN public.osint_topics ot ON tsl.topic_id = ot.id
LEFT JOIN public.source_records sr ON tsl.source_record_id = sr.id
WHERE ot.id IS NULL OR sr.id IS NULL;
-- Should return 0 (all links have valid references)
```

**Expected Result:** Both queries return 0

---

## 7. Full-Text Search Test

### Test 7.1: Test Full-Text Search Index

```sql
-- Insert test record with searchable content
INSERT INTO public.source_records (
  id, source_id, title, content, ingested_at
)
VALUES (
  '00000000-0000-0000-0000-000000009980',
  (SELECT id FROM public.sources LIMIT 1),
  'AI Regulation and LLM Safety',
  'This article discusses artificial intelligence regulation and large language model safety concerns in detail.',
  NOW()
);

-- Test full-text search
SELECT id, title, 
  ts_rank(to_tsvector('english', title || ' ' || COALESCE(content, '')), 
          to_tsquery('english', 'regulation & safety')) AS rank
FROM public.source_records
WHERE to_tsvector('english', title || ' ' || COALESCE(content, '')) 
      @@ to_tsquery('english', 'regulation & safety')
ORDER BY rank DESC;
```

**Expected Result:** Returns the test record with a rank > 0

**If Slow:** Full-text search index may not be working properly

---

## 8. Integration Test with Supabase Client

### Test 8.1: Test Basic Query from TypeScript

Create a test file `test-osint-query.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Organization, Source } from './src/types/osint';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testQuery() {
  // Test query organizations (will be filtered by RLS)
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('*')
    .limit(5);

  if (error) {
    console.error('Query failed:', error);
    return false;
  }

  console.log('Organizations:', orgs);
  return true;
}

testQuery();
```

**Expected Result:** Query succeeds (may return empty array if no orgs for current user, which is fine - RLS is working)

---

## Test Summary Checklist

After running all tests, verify:

- [ ] All 7 tables exist
- [ ] All 4 ENUM types exist with correct values
- [ ] All foreign key constraints are in place
- [ ] All indexes are created
- [ ] RLS is enabled on all tables
- [ ] RLS policies exist (3-4 per table)
- [ ] TypeScript types compile without errors
- [ ] Unique constraints work
- [ ] Check constraints work
- [ ] Foreign key constraints prevent invalid data
- [ ] Cascade deletes work correctly
- [ ] ENUM constraints prevent invalid values
- [ ] RLS allows access to user's own organizations
- [ ] RLS blocks access to other organizations
- [ ] CRUD operations work end-to-end
- [ ] Seed data can be inserted
- [ ] Full-text search works
- [ ] Supabase client can query tables

---

## Troubleshooting

### Tests Fail with "relation does not exist"
- Migrations may not have been applied
- Check migration order (00010 → 00011 → 00012 → 00013)

### RLS Tests Fail
- **Not authenticated:** Use one of the authentication methods in section 4
- **Check authentication:** Run `SELECT auth.uid();` - should return your user ID, not NULL
- If `auth.uid()` returns NULL, you're not authenticated - set the JWT claims:
  ```sql
  SET request.jwt.claims = '{"sub": "YOUR_USER_ID"}';
  ```
- Check you're a member of the organization
- Verify RLS policies were created in migration 00013

### Foreign Key Tests Fail
- Verify parent records exist before creating child records
- Check that organization_id references are valid

### TypeScript Compilation Fails
- Verify `src/types/osint.ts` exists
- Check that all types match the database schema exactly
- Ensure TypeScript is installed: `npm install`

---

## Next Steps After Testing

Once all tests pass:

1. ✅ Plan 1 is verified and ready
2. → Proceed to Plan 2 (when ready)
3. → Document any issues found during testing
4. → Consider creating automated test suite for future migrations

