-- ============================================================================
-- Test Data Setup for Plan 2 Ingestion Testing
-- ============================================================================
-- This script creates test organizations and sources for testing the 
-- ingestion layer. Run this in Supabase SQL Editor.
--
-- After running, note the returned UUIDs for testing API endpoints.
-- ============================================================================

-- Step 1: Check for existing organizations
SELECT 
  'Existing Organizations:' as info,
  id, 
  name, 
  slug,
  created_at
FROM organizations
ORDER BY created_at DESC;

-- Step 2: Create a test organization (skip if you already have one)
-- Uncomment and run this if you need to create an organization:

/*
INSERT INTO organizations (name, slug) 
VALUES ('Test Organization', 'test-org')
RETURNING 
  id as organization_id,
  name,
  slug,
  '⬆️ Save this organization_id for testing!' as note;
*/

-- Step 3: Get your user ID (for adding yourself as org member)
-- Uncomment to find your user_id:

/*
SELECT 
  id as user_id,
  email,
  '⬆️ This is your user_id' as note
FROM auth.users
WHERE email = 'your-email@example.com'  -- Replace with your email
LIMIT 1;
*/

-- Step 4: Add yourself as organization member (optional but recommended)
-- Replace YOUR_ORG_ID and YOUR_USER_ID with values from steps 2 and 3:

/*
INSERT INTO org_members (organization_id, user_id, role)
VALUES (
  'YOUR_ORG_ID',   -- from step 2
  'YOUR_USER_ID',  -- from step 3
  'owner'
)
RETURNING 
  id,
  organization_id,
  user_id,
  role,
  '✅ You are now an owner of this organization' as note;
*/

-- Step 5: Create test RSS sources
-- Replace YOUR_ORG_ID with value from step 2:

/*
INSERT INTO sources (organization_id, source_type, name, url, reliability_rating, notes)
VALUES 
  (
    'YOUR_ORG_ID',
    'rss',
    'BBC News',
    'https://feeds.bbci.co.uk/news/rss.xml',
    'HIGH',
    'Reliable international news source'
  ),
  (
    'YOUR_ORG_ID',
    'rss',
    'Reuters Top News',
    'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
    'HIGH',
    'Breaking news and current events'
  ),
  (
    'YOUR_ORG_ID',
    'rss',
    'Hacker News',
    'https://news.ycombinator.com/rss',
    'MEDIUM',
    'Tech news and discussions'
  )
RETURNING 
  id as source_id,
  organization_id,
  name,
  url,
  '⬆️ Save these source_id values for testing!' as note;
*/

-- Step 6: Verify your setup
-- Run this to see all your organizations and sources:

SELECT 
  o.id as organization_id,
  o.name as org_name,
  o.slug as org_slug,
  COUNT(DISTINCT s.id) as source_count,
  COUNT(DISTINCT om.user_id) as member_count,
  '✅ Your test environment is ready!' as status
FROM organizations o
LEFT JOIN sources s ON s.organization_id = o.id
LEFT JOIN org_members om ON om.organization_id = o.id
GROUP BY o.id, o.name, o.slug
ORDER BY o.created_at DESC;

-- Step 7: View your sources in detail
SELECT 
  s.id as source_id,
  o.name as organization,
  s.name as source_name,
  s.source_type,
  s.url,
  s.reliability_rating,
  s.created_at
FROM sources s
JOIN organizations o ON s.organization_id = o.id
ORDER BY s.created_at DESC;

-- ============================================================================
-- Quick All-in-One Setup
-- ============================================================================

-- Option A: Simple setup (org + sources only, no member)
-- Uncomment to use:

/*
WITH new_org AS (
  INSERT INTO organizations (name, slug) 
  VALUES ('Test Organization', 'test-org')
  RETURNING id
),
new_sources AS (
  INSERT INTO sources (organization_id, source_type, name, url, reliability_rating, notes)
  SELECT 
    new_org.id,
    'rss'::osint_source_type,
    src.name::text,
    src.url::text,
    src.rating::reliability_rating,
    src.notes::text
  FROM new_org,
  (VALUES
    ('BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', 'HIGH', 'Reliable international news'),
    ('Reuters Top News', 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', 'HIGH', 'Breaking news'),
    ('Hacker News', 'https://news.ycombinator.com/rss', 'MEDIUM', 'Tech news')
  ) AS src(name, url, rating, notes)
  RETURNING id, organization_id, name
)
SELECT 
  new_org.id as organization_id,
  json_agg(json_build_object(
    'source_id', new_sources.id,
    'source_name', new_sources.name
  )) as sources,
  '✅ Setup complete! Copy these IDs for testing.' as status
FROM new_org
CROSS JOIN new_sources
GROUP BY new_org.id;
*/

-- Option B: Full setup (org + sources + add yourself as member)
-- Replace YOUR_EMAIL with your actual email. Uncomment to use:

/*
WITH new_org AS (
  INSERT INTO organizations (name, slug) 
  VALUES ('Test Organization', 'test-org')
  RETURNING id
),
app_user AS (
  SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com' LIMIT 1
),
new_member AS (
  INSERT INTO org_members (organization_id, user_id, role)
  SELECT new_org.id, app_user.id, 'owner'
  FROM new_org, app_user
  RETURNING organization_id
),
new_sources AS (
  INSERT INTO sources (organization_id, source_type, name, url, reliability_rating, notes)
  SELECT 
    new_org.id,
    'rss'::osint_source_type,
    src.name::text,
    src.url::text,
    src.rating::reliability_rating,
    src.notes::text
  FROM new_org,
  (VALUES
    ('BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', 'HIGH', 'Reliable international news'),
    ('Reuters Top News', 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best', 'HIGH', 'Breaking news'),
    ('Hacker News', 'https://news.ycombinator.com/rss', 'MEDIUM', 'Tech news')
  ) AS src(name, url, rating, notes)
  RETURNING id, organization_id, name
)
SELECT 
  new_org.id as organization_id,
  json_agg(json_build_object(
    'source_id', new_sources.id,
    'source_name', new_sources.name
  )) as sources,
  '✅ All setup complete! Use these IDs for testing.' as status
FROM new_org
CROSS JOIN new_sources
GROUP BY new_org.id;
*/

-- ============================================================================
-- Testing Commands
-- ============================================================================
-- After running this script, test the ingestion layer with these curl commands:
--
-- 1. Test RSS ingestion:
--    curl -X POST http://localhost:3001/api/ingest/rss \
--      -H "Content-Type: application/json" \
--      -d '{"organization_id": "YOUR_ORG_ID", "source_id": "YOUR_SOURCE_ID"}'
--
-- 2. Test manual input:
--    curl -X POST http://localhost:3001/api/ingest/manual \
--      -H "Content-Type: application/json" \
--      -d '{"organization_id": "YOUR_ORG_ID", "title": "Test", "content": "Test content"}'
--
-- 3. Verify records:
--    Run the query below in Supabase SQL Editor
-- ============================================================================

/*
SELECT 
  sr.id,
  sr.title,
  sr.url,
  sr.ingested_at,
  s.name as source_name,
  o.name as organization,
  sr.raw_metadata->>'content_hash' as content_hash
FROM source_records sr
JOIN sources s ON sr.source_id = s.id
JOIN organizations o ON s.organization_id = o.id
ORDER BY sr.ingested_at DESC
LIMIT 20;
*/

