-- ============================================================================
-- Phase 1 Addendum 5: OpenAlex enrichment columns for publications_v2
-- Date: 2026-05-21
-- 
-- openalex_pipeline.py writes these columns when enriching publications via
-- the OpenAlex API. The initial publications_v2 schema omitted them, causing
-- 100% write failure rate when openalex_pipeline.py first ran against v2.
-- ============================================================================

ALTER TABLE publications_v2 
  ADD COLUMN IF NOT EXISTS primary_location JSONB,
  ADD COLUMN IF NOT EXISTS publication_type TEXT,
  ADD COLUMN IF NOT EXISTS openalex_concepts JSONB,
  ADD COLUMN IF NOT EXISTS open_access JSONB;