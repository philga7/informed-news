-- Source Metrics Function
-- Efficiently calculates source metrics (record counts, linked counts, dates) for multiple sources
-- This replaces the N+1 query problem in the sources API route

CREATE OR REPLACE FUNCTION get_source_metrics(p_source_ids UUID[])
RETURNS TABLE (
  source_id UUID,
  record_count BIGINT,
  linked_count BIGINT,
  oldest_record_date TIMESTAMPTZ,
  most_recent_link_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH source_record_stats AS (
    -- Get record counts and oldest record date per source
    SELECT 
      sr.source_id AS stats_source_id,
      COUNT(*)::BIGINT AS record_count,
      MIN(sr.ingested_at) AS oldest_record_date
    FROM source_records sr
    WHERE sr.source_id = ANY(p_source_ids)
    GROUP BY sr.source_id
  ),
  all_linked_records AS (
    -- Get all unique linked record IDs and their most recent link date
    -- Union topic_source_links and watch_item_records
    SELECT 
      alr.source_record_id,
      MAX(alr.linked_at) AS most_recent_link_date
    FROM (
      SELECT tsl.source_record_id, tsl.linked_at
      FROM topic_source_links tsl
      WHERE tsl.source_record_id IN (
        SELECT sr2.id FROM source_records sr2 WHERE sr2.source_id = ANY(p_source_ids)
      )
      UNION ALL
      SELECT wir.source_record_id, wir.linked_at
      FROM watch_item_records wir
      WHERE wir.source_record_id IN (
        SELECT sr3.id FROM source_records sr3 WHERE sr3.source_id = ANY(p_source_ids)
      )
    ) alr
    GROUP BY alr.source_record_id
  ),
  source_linked_stats AS (
    -- Aggregate linked stats back to source level
    SELECT 
      sr4.source_id AS linked_source_id,
      COUNT(DISTINCT alr2.source_record_id)::BIGINT AS linked_count,
      MAX(alr2.most_recent_link_date) AS most_recent_link_date
    FROM source_records sr4
    INNER JOIN all_linked_records alr2 ON sr4.id = alr2.source_record_id
    WHERE sr4.source_id = ANY(p_source_ids)
    GROUP BY sr4.source_id
  )
  SELECT 
    s.id AS source_id,
    COALESCE(srs.record_count, 0) AS record_count,
    COALESCE(sls.linked_count, 0) AS linked_count,
    srs.oldest_record_date,
    sls.most_recent_link_date
  FROM (SELECT unnest(p_source_ids) AS id) s
  LEFT JOIN source_record_stats srs ON s.id = srs.stats_source_id
  LEFT JOIN source_linked_stats sls ON s.id = sls.linked_source_id;
END;
$$ LANGUAGE plpgsql STABLE;

