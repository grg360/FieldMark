ALTER TABLE hcp_scientific_positions_v1 ADD COLUMN position_category text;

ALTER TABLE hcp_scientific_positions_v1 ADD COLUMN pub_year integer;

ALTER TABLE hcp_scientific_positions_v1 ADD COLUMN citation_count integer;

ALTER TABLE hcp_scientific_positions_v1 ADD CONSTRAINT hcp_scientific_positions_v1_position_category_check CHECK (position_category IS NULL OR position_category IN ('efficacy', 'patient_selection', 'biomarker', 'safety', 'resistance', 'sequencing', 'access', 'diagnostics', 'methodology'));

CREATE INDEX idx_hcp_scientific_positions_v1_position_category ON hcp_scientific_positions_v1(position_category);

CREATE INDEX idx_hcp_scientific_positions_v1_pub_year ON hcp_scientific_positions_v1(pub_year);

NOTIFY pgrst, 'reload schema';
