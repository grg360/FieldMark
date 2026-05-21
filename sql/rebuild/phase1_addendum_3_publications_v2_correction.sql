-- ============================================================================
-- Phase 1 Addendum 3: publications_v2 schema correction
-- Date: 2026-05-21
-- 
-- The initial publications_v2 schema mirrored v1's denormalized 
-- "row per author-publication" pattern. v2 architecture is 
-- "row per publication, authors as JSONB, HCP resolution later."
--
-- Dropping and recreating publications_v2 with the correct shape.
-- Also dropping publication_therapeutic_areas_v2 (depends on publications_v2).
-- Recreated below with same definition.
-- Adds publication_authors_v2 for Step F to populate later.
-- ============================================================================

DROP TABLE IF EXISTS publication_therapeutic_areas_v2 CASCADE;
DROP TABLE IF EXISTS publications_v2 CASCADE;

CREATE TABLE publications_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pubmed_id TEXT UNIQUE,
  doi TEXT,
  openalex_work_id TEXT,
  title TEXT,
  abstract TEXT,
  journal TEXT,
  pub_year INTEGER,
  pub_date DATE,
  language TEXT,
  pubmed_authorships JSONB,
  mesh_terms TEXT[],
  publication_types TEXT[],
  citation_count INTEGER,
  citation_counts_by_year JSONB,
  openalex_enriched_at TIMESTAMPTZ,
  source_therapeutic_area_id UUID REFERENCES therapeutic_areas(id),
  source TEXT NOT NULL,
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  ingestion_run_id UUID
);

CREATE UNIQUE INDEX idx_publications_v2_pubmed_id 
  ON publications_v2(pubmed_id) WHERE pubmed_id IS NOT NULL;
CREATE INDEX idx_publications_v2_doi 
  ON publications_v2(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_publications_v2_openalex_work 
  ON publications_v2(openalex_work_id) WHERE openalex_work_id IS NOT NULL;
CREATE INDEX idx_publications_v2_year ON publications_v2(pub_year);
CREATE INDEX idx_publications_v2_source_ta ON publications_v2(source_therapeutic_area_id);

ALTER TABLE publications_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publications_v2_public_read" ON publications_v2 FOR SELECT USING (true);

CREATE TABLE publication_therapeutic_areas_v2 (
  publication_id UUID NOT NULL REFERENCES publications_v2(id) ON DELETE CASCADE,
  therapeutic_area_id UUID NOT NULL REFERENCES therapeutic_areas(id),
  source TEXT,
  tagged_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (publication_id, therapeutic_area_id)
);

CREATE INDEX idx_pub_ta_v2_ta_id 
  ON publication_therapeutic_areas_v2(therapeutic_area_id);

ALTER TABLE publication_therapeutic_areas_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publication_therapeutic_areas_v2_public_read" 
  ON publication_therapeutic_areas_v2 FOR SELECT USING (true);

CREATE TABLE publication_authors_v2 (
  publication_id UUID NOT NULL REFERENCES publications_v2(id) ON DELETE CASCADE,
  hcp_id UUID NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  author_position INTEGER,
  is_first_author BOOLEAN,
  is_senior_author BOOLEAN,
  total_authors INTEGER,
  openalex_author_id TEXT,
  disambiguation_method TEXT,
  disambiguation_confidence TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (publication_id, hcp_id)
);

CREATE INDEX idx_pub_authors_v2_hcp ON publication_authors_v2(hcp_id);
CREATE INDEX idx_pub_authors_v2_position 
  ON publication_authors_v2(publication_id, author_position);

ALTER TABLE publication_authors_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publication_authors_v2_public_read" 
  ON publication_authors_v2 FOR SELECT USING (true);
