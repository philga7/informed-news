-- Initial Schema for Informed News Application
-- This migration creates the core tables and relationships

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Note: Supabase Auth will manage users in auth.users table
-- This table extends the auth system with application-specific data

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- ============================================================================
-- NEWS SOURCES TABLE
-- ============================================================================

CREATE TYPE source_type AS ENUM ('rss', 'api', 'manual', 'scrape');

CREATE TABLE public.news_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type source_type NOT NULL,
  url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  scrape_external_url BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_fetched TIMESTAMPTZ,
  error_message TEXT,
  CONSTRAINT news_sources_name_length CHECK (char_length(name) > 0),
  CONSTRAINT news_sources_url_length CHECK (char_length(url) > 0)
);

-- Indexes for common queries
CREATE INDEX idx_news_sources_user_id ON public.news_sources(user_id);
CREATE INDEX idx_news_sources_enabled ON public.news_sources(enabled) WHERE enabled = true;
CREATE INDEX idx_news_sources_type ON public.news_sources(type);

-- ============================================================================
-- NEWS ARTICLES TABLE
-- ============================================================================

CREATE TABLE public.news_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.news_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT,
  author TEXT,
  content TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT news_articles_title_length CHECK (char_length(title) > 0),
  CONSTRAINT news_articles_url_length CHECK (char_length(url) > 0),
  -- Prevent duplicate articles per user
  UNIQUE(user_id, url)
);

-- Indexes for common queries and filtering
CREATE INDEX idx_news_articles_user_id ON public.news_articles(user_id);
CREATE INDEX idx_news_articles_source_id ON public.news_articles(source_id);
CREATE INDEX idx_news_articles_published_at ON public.news_articles(published_at DESC);
CREATE INDEX idx_news_articles_is_read ON public.news_articles(is_read) WHERE is_read = false;
CREATE INDEX idx_news_articles_is_favorite ON public.news_articles(is_favorite) WHERE is_favorite = true;
CREATE INDEX idx_news_articles_user_published ON public.news_articles(user_id, published_at DESC);

-- Full-text search index on title and description
CREATE INDEX idx_news_articles_search ON public.news_articles 
  USING GIN(to_tsvector('english', title || ' ' || description));

-- ============================================================================
-- FEED COLLECTIONS TABLE
-- ============================================================================

CREATE TABLE public.feed_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feed_collections_name_length CHECK (char_length(name) > 0)
);

-- Index for user's collections
CREATE INDEX idx_feed_collections_user_id ON public.feed_collections(user_id);

-- ============================================================================
-- FEED SOURCE CONFIGS (Many-to-Many: Collections <-> Sources)
-- ============================================================================

CREATE TYPE sort_by_type AS ENUM ('date', 'title');

CREATE TABLE public.feed_source_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES public.feed_collections(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.news_sources(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 10,
  sort_by sort_by_type NOT NULL DEFAULT 'date',
  ascending BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feed_source_configs_count_positive CHECK (count > 0),
  -- Prevent duplicate source in same collection
  UNIQUE(collection_id, source_id)
);

-- Indexes for lookups
CREATE INDEX idx_feed_source_configs_collection_id ON public.feed_source_configs(collection_id);
CREATE INDEX idx_feed_source_configs_source_id ON public.feed_source_configs(source_id);

-- ============================================================================
-- TOPICS TABLE
-- ============================================================================

CREATE TYPE topic_status AS ENUM ('active', 'archived', 'ignored');

CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  followed BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status topic_status NOT NULL DEFAULT 'active',
  potential_relevance_score NUMERIC(3, 2),
  expiry_date TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topics_name_length CHECK (char_length(name) > 0),
  CONSTRAINT topics_relevance_score_range CHECK (
    potential_relevance_score IS NULL OR 
    (potential_relevance_score >= 0 AND potential_relevance_score <= 1)
  )
);

-- Indexes for common queries
CREATE INDEX idx_topics_user_id ON public.topics(user_id);
CREATE INDEX idx_topics_status ON public.topics(status);
CREATE INDEX idx_topics_followed ON public.topics(followed) WHERE followed = true;
CREATE INDEX idx_topics_user_status ON public.topics(user_id, status);

-- GIN index for keyword search
CREATE INDEX idx_topics_keywords ON public.topics USING GIN(keywords);
CREATE INDEX idx_topics_tags ON public.topics USING GIN(tags);

-- ============================================================================
-- TOPIC ARTICLES (Many-to-Many: Topics <-> Articles)
-- ============================================================================

CREATE TABLE public.topic_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate article in same topic
  UNIQUE(topic_id, article_id)
);

-- Indexes for efficient joins
CREATE INDEX idx_topic_articles_topic_id ON public.topic_articles(topic_id);
CREATE INDEX idx_topic_articles_article_id ON public.topic_articles(article_id);

-- ============================================================================
-- IGNORED TOPICS TABLE (Soft Delete)
-- ============================================================================

CREATE TABLE public.ignored_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_topic_id UUID NOT NULL,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ignored_topics_name_length CHECK (char_length(name) > 0)
);

-- Index for user's ignored topics
CREATE INDEX idx_ignored_topics_user_id ON public.ignored_topics(user_id);
CREATE INDEX idx_ignored_topics_original_id ON public.ignored_topics(original_topic_id);

-- ============================================================================
-- IGNORED TOPIC ARTICLES (Preserve article associations)
-- ============================================================================

CREATE TABLE public.ignored_topic_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ignored_topic_id UUID NOT NULL REFERENCES public.ignored_topics(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.news_articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ignored_topic_id, article_id)
);

CREATE INDEX idx_ignored_topic_articles_ignored_topic_id ON public.ignored_topic_articles(ignored_topic_id);
CREATE INDEX idx_ignored_topic_articles_article_id ON public.ignored_topic_articles(article_id);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_news_articles_updated_at
  BEFORE UPDATE ON public.news_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feed_collections_updated_at
  BEFORE UPDATE ON public.feed_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase auth.users';
COMMENT ON TABLE public.news_sources IS 'User-defined news sources (RSS, API, manual, scraping)';
COMMENT ON TABLE public.news_articles IS 'Aggregated news articles from various sources';
COMMENT ON TABLE public.feed_collections IS 'User-created collections of news sources';
COMMENT ON TABLE public.feed_source_configs IS 'Configuration for sources within collections';
COMMENT ON TABLE public.topics IS 'Auto-extracted or manual topics grouping related articles';
COMMENT ON TABLE public.topic_articles IS 'Many-to-many relationship between topics and articles';
COMMENT ON TABLE public.ignored_topics IS 'Soft-deleted topics preserved for potential restoration';
COMMENT ON TABLE public.ignored_topic_articles IS 'Article associations for ignored topics';

