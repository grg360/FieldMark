-- Affiliation re-derivation — additive DDL.
-- ADDS columns only. Does NOT touch hcps_v2.country, institution_normalized,
-- institution_raw, institution_ror or institution_canonical — those are preserved
-- verbatim so the historical value stays comparable against the re-derived one.
-- institution_secondary and institution_history already exist (0-populated) and are
-- reused rather than duplicated.

ALTER TABLE hcps_v2
  ADD COLUMN IF NOT EXISTS current_country          TEXT,
  ADD COLUMN IF NOT EXISTS current_institution      TEXT,
  ADD COLUMN IF NOT EXISTS current_institution_ror  TEXT,
  ADD COLUMN IF NOT EXISTS affiliation_confidence   TEXT,
  ADD COLUMN IF NOT EXISTS affiliation_as_of        INTEGER,
  ADD COLUMN IF NOT EXISTS affiliation_evidence_n   INTEGER,
  ADD COLUMN IF NOT EXISTS affiliation_dominance    NUMERIC,
  ADD COLUMN IF NOT EXISTS affiliation_derived_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hcps_v2_current_country
  ON hcps_v2 (current_country);
CREATE INDEX IF NOT EXISTS idx_hcps_v2_affiliation_confidence
  ON hcps_v2 (affiliation_confidence);
