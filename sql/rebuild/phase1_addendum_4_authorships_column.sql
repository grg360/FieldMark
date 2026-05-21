-- Add authorships column for OpenAlex-enriched author data
ALTER TABLE publications_v2 
  ADD COLUMN IF NOT EXISTS authorships JSONB;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'publications_v2' AND column_name = 'authorships';