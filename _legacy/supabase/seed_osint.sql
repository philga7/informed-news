-- OSINT Seed Data (Non-Idempotent)
-- Creates sample data for testing the OSINT schema
-- Part of Plan 1: OSINT Data Model & Database Migrations
--
-- WARNING: This script is NOT idempotent. Running twice will fail with duplicate key errors.
-- To re-seed, first run: TRUNCATE organizations CASCADE;

-- ============================================================================
-- NOTE: This seed script requires at least one user in the profiles table
-- ============================================================================
-- The script assumes you have at least one user profile. If you don't have one,
-- create it first or modify the user_id values below to match an existing user.

-- ============================================================================
-- ORGANIZATION
-- ============================================================================

INSERT INTO public.organizations (id, name, slug, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'OSINT Research Team',
  'osint-research-team',
  NOW(),
  NOW()
);

-- ============================================================================
-- ORG MEMBER
-- ============================================================================
-- Note: Replace 'YOUR_USER_ID_HERE' with an actual user_id from profiles table
-- This is a placeholder - you'll need to update this with a real user ID

-- Example: Get a user ID first:
-- SELECT id FROM profiles LIMIT 1;

-- Then uncomment and update:
-- INSERT INTO public.org_members (id, organization_id, user_id, role, joined_at)
-- VALUES (
--   '00000000-0000-0000-0000-000000000010',
--   '00000000-0000-0000-0000-000000000001',
--   'YOUR_USER_ID_HERE',  -- Replace with actual user_id
--   'owner',
--   NOW()
-- );

-- ============================================================================
-- SOURCES
-- ============================================================================

INSERT INTO public.sources (id, organization_id, source_type, name, url, reliability_rating, notes, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000001',
    'rss',
    'BBC World RSS',
    'http://feeds.bbci.co.uk/news/world/rss.xml',
    'HIGH',
    'Reliable international news source with strong editorial standards',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'api',
    'Reuters API',
    'https://api.reuters.com/v1/news',
    'HIGH',
    'Professional news wire service with global coverage',
    NOW(),
    NOW()
  );

-- ============================================================================
-- SOURCE RECORDS
-- ============================================================================

INSERT INTO public.source_records (
  id,
  source_id,
  title,
  url,
  content,
  published_at,
  ingested_at,
  language,
  geographic_indicators,
  raw_metadata,
  initial_confidence_flags
)
VALUES
  (
    '00000000-0000-0000-0000-000000001000',
    '00000000-0000-0000-0000-000000000100',
    'EU Passes Comprehensive AI Act Regulating Large Language Models',
    'https://www.bbc.com/news/technology-12345678',
    'The European Union has passed landmark legislation regulating artificial intelligence, with specific provisions for large language models and foundation models. The AI Act requires transparency in training data, bias mitigation, and human oversight for high-risk AI systems. Companies developing LLMs must now disclose their training data sources and implement safety measures.',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day',
    'en',
    '{"countries": ["France", "Germany", "Italy", "Spain", "Netherlands"], "regions": ["Europe"]}'::jsonb,
    '{"author": "Jane Smith", "category": "Technology", "tags": ["ai", "regulation", "llm", "eu", "legislation"]}'::jsonb,
    '{"verified_source": true, "fact_checked": true, "bias_score": 0.1}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000001001',
    '00000000-0000-0000-0000-000000000100',
    'Leading AI Researchers Warn of Existential Risks from Advanced LLMs',
    'https://www.bbc.com/news/technology-12345679',
    'A group of prominent AI researchers and ethicists has published an open letter warning about potential existential risks posed by increasingly powerful large language models. The letter calls for mandatory safety audits, third-party evaluations, and restrictions on certain capabilities until proper safeguards are in place. Critics argue the warnings are overblown and could stifle innovation.',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '4 days',
    'en',
    '{"countries": ["USA", "UK", "Canada"], "regions": ["North America", "Europe"]}'::jsonb,
    '{"author": "John Doe", "category": "Technology", "tags": ["ai", "safety", "ethics", "llm", "risk"]}'::jsonb,
    '{"verified_source": true, "fact_checked": true, "bias_score": 0.15}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000001002',
    '00000000-0000-0000-0000-000000000101',
    'AI Automation Displaces Millions of Workers, Economic Impact Grows',
    'https://www.reuters.com/business/ai-jobs-123456',
    'New research indicates that AI and large language models have displaced over 2 million workers globally in the past year, with white-collar jobs in customer service, content creation, and data analysis most affected. Economists predict the trend will accelerate as LLMs become more capable. Governments are exploring retraining programs and universal basic income proposals.',
    NOW() - INTERVAL '1 week',
    NOW() - INTERVAL '6 days',
    'en',
    '{"countries": ["USA", "China", "India", "UK"], "regions": ["North America", "Asia", "Europe"]}'::jsonb,
    '{"author": "Sarah Johnson", "category": "Business", "tags": ["ai", "automation", "jobs", "economy", "llm"]}'::jsonb,
    '{"verified_source": true, "fact_checked": true, "bias_score": 0.2}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000001003',
    '00000000-0000-0000-0000-000000000100',
    'Major Tech Companies Invest Billions in LLM Infrastructure',
    'https://www.bbc.com/news/business-12345680',
    'Technology giants have announced combined investments exceeding $50 billion in large language model infrastructure, including new data centers, specialized chips, and research facilities. The investments reflect confidence in AI as the next major computing platform. Analysts predict the AI infrastructure market will reach $200 billion by 2027.',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '2 days',
    'en',
    '{"countries": ["USA", "China", "South Korea", "Taiwan"], "regions": ["North America", "Asia"]}'::jsonb,
    '{"author": "Michael Brown", "category": "Business", "tags": ["ai", "investment", "infrastructure", "llm", "chips"]}'::jsonb,
    '{"verified_source": true, "fact_checked": true, "bias_score": 0.1}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000001004',
    '00000000-0000-0000-0000-000000000101',
    'Deepfake Proliferation Raises Concerns About LLM-Generated Misinformation',
    'https://www.reuters.com/technology/deepfakes-123457',
    'Security experts report a dramatic increase in AI-generated deepfakes and misinformation created using large language models. The technology has been used to create convincing fake news articles, social media posts, and even video content. Governments and platforms are struggling to implement effective detection and mitigation strategies.',
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '3 days',
    'en',
    '{"countries": ["USA", "UK", "Germany", "Australia"], "regions": ["North America", "Europe", "Oceania"]}'::jsonb,
    '{"author": "David Wilson", "category": "Technology", "tags": ["ai", "deepfake", "misinformation", "llm", "security"]}'::jsonb,
    '{"verified_source": true, "fact_checked": true, "bias_score": 0.12}'::jsonb
  );

-- ============================================================================
-- OSINT TOPICS
-- ============================================================================

INSERT INTO public.osint_topics (
  id,
  organization_id,
  name,
  description,
  keywords,
  related_topics,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000010000',
    '00000000-0000-0000-0000-000000000001',
    'AI Regulation',
    'Analysis of AI and LLM regulatory frameworks, legislation, and policy developments worldwide',
    '["ai", "regulation", "legislation", "llm", "policy", "governance", "compliance"]'::jsonb,
    '[]'::jsonb,
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000010001',
    '00000000-0000-0000-0000-000000000001',
    'LLM Safety & Ethics',
    'Safety concerns, ethical implications, and risk mitigation strategies for large language models',
    '["llm", "safety", "ethics", "risk", "bias", "alignment", "transparency", "audit"]'::jsonb,
    '[]'::jsonb,
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000010002',
    '00000000-0000-0000-0000-000000000001',
    'AI Economic Impact',
    'Economic implications of AI and LLMs including job displacement, investment trends, and market effects',
    '["ai", "economy", "jobs", "automation", "investment", "market", "llm", "workforce"]'::jsonb,
    '[]'::jsonb,
    NOW(),
    NOW()
  );

-- ============================================================================
-- TOPIC SOURCE LINKS
-- ============================================================================
-- Note: linked_by_user_id should be set to an actual user_id if available
-- For now, leaving it NULL as it's nullable

INSERT INTO public.topic_source_links (
  id,
  topic_id,
  source_record_id,
  relevance_score,
  confidence_level,
  assumptions,
  analyst_notes,
  linked_by_user_id,
  linked_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000100000',
    '00000000-0000-0000-0000-000000010000',
    '00000000-0000-0000-0000-000000001000',
    0.95,
    'HIGH',
    'Article directly discusses EU AI Act and LLM regulation',
    'Strong match - article is primary source for AI regulation topic, specifically covers LLM provisions',
    NULL,
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000100001',
    '00000000-0000-0000-0000-000000010001',
    '00000000-0000-0000-0000-000000001001',
    0.92,
    'HIGH',
    'Article directly addresses LLM safety concerns and existential risks',
    'Perfect match for LLM Safety & Ethics topic - covers key safety warnings from researchers',
    NULL,
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000100002',
    '00000000-0000-0000-0000-000000010002',
    '00000000-0000-0000-0000-000000001002',
    0.90,
    'HIGH',
    'Article directly discusses AI job displacement and economic impact',
    'Strong match for AI Economic Impact topic - covers workforce displacement and economic implications',
    NULL,
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000100003',
    '00000000-0000-0000-0000-000000010002',
    '00000000-0000-0000-0000-000000001003',
    0.85,
    'HIGH',
    'AI infrastructure investments are closely related to economic impact',
    'Relevant to AI Economic Impact topic - shows investment trends and market growth',
    NULL,
    NOW()
  ),
  (
    '00000000-0000-0000-0000-000000100004',
    '00000000-0000-0000-0000-000000010001',
    '00000000-0000-0000-0000-000000001004',
    0.75,
    'MEDIUM',
    'Deepfake and misinformation relate to LLM safety but focus on malicious use cases',
    'Partial relevance - addresses safety concerns but from misuse perspective rather than technical safety',
    NULL,
    NOW()
  );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after seeding to verify the data:

-- SELECT COUNT(*) as org_count FROM organizations;
-- SELECT COUNT(*) as source_count FROM sources;
-- SELECT COUNT(*) as record_count FROM source_records;
-- SELECT COUNT(*) as topic_count FROM osint_topics;
-- SELECT COUNT(*) as link_count FROM topic_source_links;

