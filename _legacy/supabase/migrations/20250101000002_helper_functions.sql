-- Helper Functions and Views
-- Useful utilities for common operations

-- ============================================================================
-- FUNCTION: Get article count by source
-- ============================================================================

CREATE OR REPLACE FUNCTION get_article_count_by_source(p_user_id UUID)
RETURNS TABLE (
  source_id UUID,
  source_name TEXT,
  article_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id AS source_id,
    s.name AS source_name,
    COUNT(a.id) AS article_count
  FROM public.news_sources s
  LEFT JOIN public.news_articles a ON s.id = a.source_id
  WHERE s.user_id = p_user_id
  GROUP BY s.id, s.name
  ORDER BY article_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get topic with article count
-- ============================================================================

CREATE OR REPLACE FUNCTION get_topics_with_counts(p_user_id UUID)
RETURNS TABLE (
  topic_id UUID,
  topic_name TEXT,
  article_count BIGINT,
  followed BOOLEAN,
  status topic_status,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id AS topic_id,
    t.name AS topic_name,
    COUNT(ta.article_id) AS article_count,
    t.followed,
    t.status,
    t.created_at
  FROM public.topics t
  LEFT JOIN public.topic_articles ta ON t.id = ta.topic_id
  WHERE t.user_id = p_user_id
  GROUP BY t.id, t.name, t.followed, t.status, t.created_at
  ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Search articles with full-text search
-- ============================================================================

CREATE OR REPLACE FUNCTION search_articles(
  p_user_id UUID,
  p_search_query TEXT,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  source_name TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title,
    a.description,
    a.url,
    a.published_at,
    s.name AS source_name,
    ts_rank(
      to_tsvector('english', a.title || ' ' || a.description),
      plainto_tsquery('english', p_search_query)
    ) AS rank
  FROM public.news_articles a
  JOIN public.news_sources s ON a.source_id = s.id
  WHERE 
    a.user_id = p_user_id
    AND to_tsvector('english', a.title || ' ' || a.description) @@ plainto_tsquery('english', p_search_query)
  ORDER BY rank DESC, a.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get recent articles with source info
-- ============================================================================

CREATE OR REPLACE FUNCTION get_recent_articles(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_source_id UUID DEFAULT NULL,
  p_favorites_only BOOLEAN DEFAULT FALSE,
  p_unread_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  url TEXT,
  image_url TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  is_read BOOLEAN,
  is_favorite BOOLEAN,
  source_id UUID,
  source_name TEXT,
  source_type source_type
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title,
    a.description,
    a.url,
    a.image_url,
    a.author,
    a.published_at,
    a.is_read,
    a.is_favorite,
    s.id AS source_id,
    s.name AS source_name,
    s.type AS source_type
  FROM public.news_articles a
  JOIN public.news_sources s ON a.source_id = s.id
  WHERE 
    a.user_id = p_user_id
    AND (p_source_id IS NULL OR a.source_id = p_source_id)
    AND (NOT p_favorites_only OR a.is_favorite = TRUE)
    AND (NOT p_unread_only OR a.is_read = FALSE)
  ORDER BY a.published_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get articles for a topic
-- ============================================================================

CREATE OR REPLACE FUNCTION get_topic_articles(
  p_topic_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  url TEXT,
  published_at TIMESTAMPTZ,
  source_name TEXT,
  is_read BOOLEAN,
  is_favorite BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title,
    a.description,
    a.url,
    a.published_at,
    s.name AS source_name,
    a.is_read,
    a.is_favorite
  FROM public.news_articles a
  JOIN public.topic_articles ta ON a.id = ta.article_id
  JOIN public.news_sources s ON a.source_id = s.id
  WHERE 
    ta.topic_id = p_topic_id
    AND a.user_id = p_user_id
  ORDER BY a.published_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Bulk insert topic articles
-- ============================================================================

CREATE OR REPLACE FUNCTION add_articles_to_topic(
  p_topic_id UUID,
  p_article_ids UUID[]
)
RETURNS INTEGER AS $$
DECLARE
  v_article_id UUID;
  v_inserted_count INTEGER := 0;
BEGIN
  FOREACH v_article_id IN ARRAY p_article_ids
  LOOP
    INSERT INTO public.topic_articles (topic_id, article_id)
    VALUES (p_topic_id, v_article_id)
    ON CONFLICT (topic_id, article_id) DO NOTHING;
    
    IF FOUND THEN
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Archive expired topics automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION archive_expired_topics()
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE public.topics
  SET 
    status = 'archived',
    archived_at = NOW()
  WHERE 
    status = 'active'
    AND expiry_date IS NOT NULL
    AND expiry_date < NOW();
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEW: User statistics summary
-- ============================================================================

CREATE OR REPLACE VIEW user_stats AS
SELECT 
  p.id AS user_id,
  p.email,
  p.name,
  COUNT(DISTINCT a.id) AS total_articles,
  COUNT(DISTINCT CASE WHEN a.is_read = FALSE THEN a.id END) AS unread_articles,
  COUNT(DISTINCT CASE WHEN a.is_favorite = TRUE THEN a.id END) AS favorite_articles,
  COUNT(DISTINCT s.id) AS total_sources,
  COUNT(DISTINCT CASE WHEN s.enabled = TRUE THEN s.id END) AS enabled_sources,
  COUNT(DISTINCT t.id) AS total_topics,
  COUNT(DISTINCT CASE WHEN t.followed = TRUE THEN t.id END) AS followed_topics,
  COUNT(DISTINCT c.id) AS total_collections
FROM public.profiles p
LEFT JOIN public.news_articles a ON p.id = a.user_id
LEFT JOIN public.news_sources s ON p.id = s.user_id
LEFT JOIN public.topics t ON p.id = t.user_id
LEFT JOIN public.feed_collections c ON p.id = c.user_id
GROUP BY p.id, p.email, p.name;

-- Grant access to authenticated users
GRANT SELECT ON user_stats TO authenticated;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON FUNCTION get_article_count_by_source IS 'Get article counts grouped by source for a user';
COMMENT ON FUNCTION get_topics_with_counts IS 'Get all topics with article counts for a user';
COMMENT ON FUNCTION search_articles IS 'Full-text search across article titles and descriptions';
COMMENT ON FUNCTION get_recent_articles IS 'Get recent articles with filtering options';
COMMENT ON FUNCTION get_topic_articles IS 'Get all articles associated with a specific topic';
COMMENT ON FUNCTION add_articles_to_topic IS 'Bulk insert articles into a topic (ignores duplicates)';
COMMENT ON FUNCTION archive_expired_topics IS 'Automatically archive topics past their expiry date';
COMMENT ON VIEW user_stats IS 'Aggregated statistics for each user';

