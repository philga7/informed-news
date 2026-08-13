-- Speed up ingestion duplicate checks that filter by raw_metadata->>'content_hash'
-- (This is used by backend/src/services/ingestion/IngestionController.ts)
create index if not exists source_records_content_hash_idx
  on public.source_records ((raw_metadata->>'content_hash'));



