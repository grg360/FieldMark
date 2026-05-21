-- ============================================================================
-- Phase 1 Addendum 2: publication_therapeutic_areas_v2
-- Date: 2026-05-21
-- Missed in initial schema; needed for ingest_publications.py v2 targeting
-- ============================================================================

CREATE TABLE IF NOT EXISTS publication_therapeutic_areas_v2 (
  publication_id UUID NOT NULL REFERENCES publications_v2(id) ON DELETE CASCADE,
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  source TEXT,
  tagged_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (publication_id, therapeutic_area_id)
);

CREATE INDEX IF NOT EXISTS idx_pub_ta_v2_ta_id 
  ON publication_therapeutic_areas_v2(therapeutic_area_id);

-- RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'publication_therapeutic_areas_v2' 
    AND policyname = 'publication_therapeutic_areas_v2_public_read'
  ) THEN
    EXECUTE 'ALTER TABLE publication_therapeutic_areas_v2 ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "publication_therapeutic_areas_v2_public_read" 
             ON publication_therapeutic_areas_v2 FOR SELECT USING (true)';
  END IF;
END $$;