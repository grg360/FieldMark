-- ============================================================================
-- FieldMark Foundation Rebuild - Phase 1: RLS Policies
-- Date: 2026-05-21
-- Enables RLS on all _v2 tables with public-read policies
-- Matches existing pattern from v1 tables
-- ============================================================================

ALTER TABLE hcps_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hcps_v2_public_read" ON hcps_v2 FOR SELECT USING (true);

ALTER TABLE publications_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "publications_v2_public_read" ON publications_v2 FOR SELECT USING (true);

ALTER TABLE hcp_therapeutic_areas_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hcp_therapeutic_areas_v2_public_read" ON hcp_therapeutic_areas_v2 FOR SELECT USING (true);

ALTER TABLE hcp_openalex_authors_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hcp_openalex_authors_v2_public_read" ON hcp_openalex_authors_v2 FOR SELECT USING (true);

ALTER TABLE hcp_scores_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hcp_scores_v2_public_read" ON hcp_scores_v2 FOR SELECT USING (true);

ALTER TABLE hcp_narratives_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hcp_narratives_v2_public_read" ON hcp_narratives_v2 FOR SELECT USING (true);

ALTER TABLE trial_investigators_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trial_investigators_v2_public_read" ON trial_investigators_v2 FOR SELECT USING (true);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_runs_public_read" ON pipeline_runs FOR SELECT USING (true);

ALTER TABLE dol_canonical_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dol_canonical_overrides_public_read" ON dol_canonical_overrides FOR SELECT USING (true);

ALTER TABLE tracked_conferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tracked_conferences_public_read" ON tracked_conferences FOR SELECT USING (true);