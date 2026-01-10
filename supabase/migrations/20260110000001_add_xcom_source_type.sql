-- Add 'xcom' to the osint_source_type enum
-- This allows sources to be marked as X.com scraping sources

-- PostgreSQL doesn't support adding enum values directly in a transaction-safe way
-- We need to use ALTER TYPE ... ADD VALUE which cannot be rolled back
-- This is safe because adding a value won't break existing data

DO $$ 
BEGIN
    -- Check if 'xcom' already exists (idempotent)
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'xcom' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'osint_source_type')
    ) THEN
        ALTER TYPE osint_source_type ADD VALUE 'xcom';
    END IF;
END $$;

COMMENT ON TYPE osint_source_type IS 'Type of OSINT source: rss, api, email, manual, or xcom (X.com scraping)';
