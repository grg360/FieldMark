CREATE TABLE IF NOT EXISTS theme_canonical_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  description text,
  therapeutic_area text NOT NULL,
  display_order int,
  created_at timestamptz DEFAULT now(),
  UNIQUE (canonical_name, therapeutic_area)
);

CREATE TABLE IF NOT EXISTS theme_to_canonical_v1 (
  raw_theme_name text NOT NULL,
  therapeutic_area text NOT NULL,
  canonical_id uuid NOT NULL REFERENCES theme_canonical_v1(id),
  confidence text,
  assigned_at timestamptz DEFAULT now(),
  PRIMARY KEY (raw_theme_name, therapeutic_area)
);

CREATE INDEX IF NOT EXISTS idx_theme_to_canonical_canonical
  ON theme_to_canonical_v1(canonical_id);

-- Public read RLS policies
ALTER TABLE theme_canonical_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_to_canonical_v1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY theme_canonical_v1_public_read ON theme_canonical_v1
  FOR SELECT USING (true);
CREATE POLICY theme_to_canonical_v1_public_read ON theme_to_canonical_v1
  FOR SELECT USING (true);
