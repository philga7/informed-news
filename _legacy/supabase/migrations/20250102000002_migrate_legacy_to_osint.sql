-- Migration: Legacy Data to OSINT Tables
-- Purpose: Migrate data from legacy news_sources, news_articles, topics tables to OSINT schema
-- Note: This migration assumes the default organization (00000000-0000-0000-0000-000000009997) exists

-- Step 1: Migrate news_sources -> sources
INSERT INTO public.sources (
  id,
  organization_id,
  source_type,
  name,
  url,
  reliability_rating,
  notes,
  created_at,
  updated_at
)
SELECT 
  ns.id,
  '00000000-0000-0000-0000-000000009997'::uuid, -- Default organization ID
  ns.type::text::osint_source_type, -- Cast source_type enum to osint_source_type
  ns.name,
  ns.url,
  'UNKNOWN'::reliability_rating, -- Default reliability rating for migrated sources
  CASE 
    WHEN ns.error_message IS NOT NULL THEN 'Migrated from legacy. Last error: ' || ns.error_message
    ELSE 'Migrated from legacy system'
  END,
  ns.created_at,
  COALESCE(ns.last_fetched, ns.created_at) -- Use last_fetched as updated_at, fallback to created_at
FROM public.news_sources ns
WHERE NOT EXISTS (
  SELECT 1 FROM public.sources s WHERE s.id = ns.id
); -- Skip if already migrated

-- Step 2: Migrate news_articles -> source_records
INSERT INTO public.source_records (
  id,
  source_id,
  title,
  url,
  content,
  published_at,
  ingested_at,
  raw_metadata
)
SELECT 
  na.id,
  na.source_id,
  na.title,
  na.url,
  COALESCE(na.content, na.description), -- Use content if available, fallback to description
  na.published_at,
  COALESCE(na.fetched_at, na.created_at), -- Use fetched_at as ingested_at, fallback to created_at
  jsonb_build_object(
    'description', na.description,
    'author', na.author,
    'image_url', na.image_url,
    'is_read', na.is_read,
    'is_favorite', na.is_favorite,
    'legacy_user_id', na.user_id::text,
    'legacy_created_at', na.created_at,
    'migrated_from', 'news_articles'
  )
FROM public.news_articles na
WHERE NOT EXISTS (
  SELECT 1 FROM public.source_records sr WHERE sr.id = na.id
); -- Skip if already migrated

-- Step 3: Migrate topics -> osint_topics
-- Note: Legacy topics are user-specific, but OSINT topics are organization-specific
-- We'll migrate to the default organization
-- Note: OSINT topics don't have a status column, so we skip that field
INSERT INTO public.osint_topics (
  id,
  organization_id,
  name,
  keywords,
  created_at,
  updated_at
)
SELECT 
  t.id,
  '00000000-0000-0000-0000-000000009997'::uuid, -- Default organization ID
  t.name,
  to_jsonb(t.keywords) as keywords, -- Convert TEXT[] array to JSONB
  t.created_at,
  t.updated_at
FROM public.topics t
WHERE NOT EXISTS (
  SELECT 1 FROM public.osint_topics ot WHERE ot.id = t.id
); -- Skip if already migrated

-- Step 4: Migrate topic_articles -> topic_source_links
-- This links topics to source_records (formerly articles)
INSERT INTO public.topic_source_links (
  topic_id,
  source_record_id,
  relevance_score,
  confidence_level,
  linked_at
)
SELECT 
  ta.topic_id,
  ta.article_id, -- article_id maps to source_record_id
  0.5, -- Default relevance score
  'LOW'::confidence_level, -- Default confidence for migrated links
  ta.created_at
FROM public.topic_articles ta
WHERE NOT EXISTS (
  SELECT 1 FROM public.topic_source_links tsl 
  WHERE tsl.topic_id = ta.topic_id AND tsl.source_record_id = ta.article_id
); -- Skip duplicates

-- Migration Summary
DO $$
DECLARE
  sources_count INTEGER;
  records_count INTEGER;
  topics_count INTEGER;
  links_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO sources_count FROM public.sources WHERE notes LIKE '%Migrated from legacy%';
  SELECT COUNT(*) INTO records_count FROM public.source_records WHERE raw_metadata->>'migrated_from' = 'news_articles';
  SELECT COUNT(*) INTO topics_count FROM public.osint_topics WHERE organization_id = '00000000-0000-0000-0000-000000009997';
  SELECT COUNT(*) INTO links_count FROM public.topic_source_links;
  
  RAISE NOTICE '=== Legacy to OSINT Migration Complete ===';
  RAISE NOTICE 'Sources migrated: %', sources_count;
  RAISE NOTICE 'Source records migrated: %', records_count;
  RAISE NOTICE 'Topics migrated: %', topics_count;
  RAISE NOTICE 'Topic-Record links migrated: %', links_count;
END $$;

