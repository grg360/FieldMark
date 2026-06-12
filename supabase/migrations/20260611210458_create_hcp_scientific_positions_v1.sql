CREATE TABLE hcp_scientific_positions_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES publications_v2(id) ON DELETE CASCADE,
  hcp_id uuid NOT NULL REFERENCES hcps_v2(id) ON DELETE CASCADE,
  therapeutic_area_id uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('first_author', 'senior_author', 'co_first_author', 'co_senior_author')),
  position_type text NOT NULL CHECK (position_type IN ('positive_position', 'cautionary_position', 'unmet_need_position', 'hypothesis_position')),
  drug_name text,
  drug_class text,
  biomarker text,
  disease_context text,
  position_text text NOT NULL,
  evidence_excerpt text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  model_name text NOT NULL,
  extracted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hcp_scientific_positions_v1_hcp_id ON hcp_scientific_positions_v1(hcp_id);

CREATE INDEX idx_hcp_scientific_positions_v1_publication_id ON hcp_scientific_positions_v1(publication_id);

CREATE INDEX idx_hcp_scientific_positions_v1_hcp_ta ON hcp_scientific_positions_v1(hcp_id, therapeutic_area_id);

CREATE INDEX idx_hcp_scientific_positions_v1_position_type ON hcp_scientific_positions_v1(position_type);

ALTER TABLE hcp_scientific_positions_v1 ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON hcp_scientific_positions_v1 TO service_role;

GRANT SELECT ON hcp_scientific_positions_v1 TO authenticated;

GRANT SELECT ON hcp_scientific_positions_v1 TO anon;

CREATE POLICY "service_role_full_access" ON hcp_scientific_positions_v1 FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_all" ON hcp_scientific_positions_v1 FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon_read_all" ON hcp_scientific_positions_v1 FOR SELECT TO anon USING (true);

NOTIFY pgrst, 'reload schema';
