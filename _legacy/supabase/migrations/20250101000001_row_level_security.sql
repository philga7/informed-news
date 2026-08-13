-- Row Level Security (RLS) Policies
-- Ensures users can only access their own data

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_source_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ignored_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ignored_topic_articles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile (during registration)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- NEWS SOURCES POLICIES
-- ============================================================================

-- Users can view their own sources
CREATE POLICY "Users can view own sources"
  ON public.news_sources
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own sources
CREATE POLICY "Users can insert own sources"
  ON public.news_sources
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sources
CREATE POLICY "Users can update own sources"
  ON public.news_sources
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own sources
CREATE POLICY "Users can delete own sources"
  ON public.news_sources
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- NEWS ARTICLES POLICIES
-- ============================================================================

-- Users can view their own articles
CREATE POLICY "Users can view own articles"
  ON public.news_articles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert articles
CREATE POLICY "Users can insert own articles"
  ON public.news_articles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own articles
CREATE POLICY "Users can update own articles"
  ON public.news_articles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own articles
CREATE POLICY "Users can delete own articles"
  ON public.news_articles
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FEED COLLECTIONS POLICIES
-- ============================================================================

-- Users can view their own collections
CREATE POLICY "Users can view own collections"
  ON public.feed_collections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own collections
CREATE POLICY "Users can insert own collections"
  ON public.feed_collections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own collections
CREATE POLICY "Users can update own collections"
  ON public.feed_collections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own collections
CREATE POLICY "Users can delete own collections"
  ON public.feed_collections
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- FEED SOURCE CONFIGS POLICIES
-- ============================================================================

-- Users can view configs for their collections
CREATE POLICY "Users can view own feed configs"
  ON public.feed_source_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_collections
      WHERE feed_collections.id = feed_source_configs.collection_id
      AND feed_collections.user_id = auth.uid()
    )
  );

-- Users can insert configs for their collections
CREATE POLICY "Users can insert own feed configs"
  ON public.feed_source_configs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.feed_collections
      WHERE feed_collections.id = feed_source_configs.collection_id
      AND feed_collections.user_id = auth.uid()
    )
  );

-- Users can update configs for their collections
CREATE POLICY "Users can update own feed configs"
  ON public.feed_source_configs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_collections
      WHERE feed_collections.id = feed_source_configs.collection_id
      AND feed_collections.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.feed_collections
      WHERE feed_collections.id = feed_source_configs.collection_id
      AND feed_collections.user_id = auth.uid()
    )
  );

-- Users can delete configs for their collections
CREATE POLICY "Users can delete own feed configs"
  ON public.feed_source_configs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_collections
      WHERE feed_collections.id = feed_source_configs.collection_id
      AND feed_collections.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TOPICS POLICIES
-- ============================================================================

-- Users can view their own topics
CREATE POLICY "Users can view own topics"
  ON public.topics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own topics
CREATE POLICY "Users can insert own topics"
  ON public.topics
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own topics
CREATE POLICY "Users can update own topics"
  ON public.topics
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own topics
CREATE POLICY "Users can delete own topics"
  ON public.topics
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- TOPIC ARTICLES POLICIES
-- ============================================================================

-- Users can view topic-article associations for their topics
CREATE POLICY "Users can view own topic articles"
  ON public.topic_articles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.topics
      WHERE topics.id = topic_articles.topic_id
      AND topics.user_id = auth.uid()
    )
  );

-- Users can insert topic-article associations for their topics
CREATE POLICY "Users can insert own topic articles"
  ON public.topic_articles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.topics
      WHERE topics.id = topic_articles.topic_id
      AND topics.user_id = auth.uid()
    )
  );

-- Users can delete topic-article associations for their topics
CREATE POLICY "Users can delete own topic articles"
  ON public.topic_articles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.topics
      WHERE topics.id = topic_articles.topic_id
      AND topics.user_id = auth.uid()
    )
  );

-- ============================================================================
-- IGNORED TOPICS POLICIES
-- ============================================================================

-- Users can view their own ignored topics
CREATE POLICY "Users can view own ignored topics"
  ON public.ignored_topics
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own ignored topics
CREATE POLICY "Users can insert own ignored topics"
  ON public.ignored_topics
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own ignored topics (permanent removal)
CREATE POLICY "Users can delete own ignored topics"
  ON public.ignored_topics
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- IGNORED TOPIC ARTICLES POLICIES
-- ============================================================================

-- Users can view ignored topic-article associations
CREATE POLICY "Users can view own ignored topic articles"
  ON public.ignored_topic_articles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ignored_topics
      WHERE ignored_topics.id = ignored_topic_articles.ignored_topic_id
      AND ignored_topics.user_id = auth.uid()
    )
  );

-- Users can insert ignored topic-article associations
CREATE POLICY "Users can insert own ignored topic articles"
  ON public.ignored_topic_articles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ignored_topics
      WHERE ignored_topics.id = ignored_topic_articles.ignored_topic_id
      AND ignored_topics.user_id = auth.uid()
    )
  );

-- Users can delete ignored topic-article associations
CREATE POLICY "Users can delete own ignored topic articles"
  ON public.ignored_topic_articles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.ignored_topics
      WHERE ignored_topics.id = ignored_topic_articles.ignored_topic_id
      AND ignored_topics.user_id = auth.uid()
    )
  );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant authenticated users access to tables
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.news_sources TO authenticated;
GRANT ALL ON public.news_articles TO authenticated;
GRANT ALL ON public.feed_collections TO authenticated;
GRANT ALL ON public.feed_source_configs TO authenticated;
GRANT ALL ON public.topics TO authenticated;
GRANT ALL ON public.topic_articles TO authenticated;
GRANT ALL ON public.ignored_topics TO authenticated;
GRANT ALL ON public.ignored_topic_articles TO authenticated;

-- Grant sequence access (for serial IDs if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

