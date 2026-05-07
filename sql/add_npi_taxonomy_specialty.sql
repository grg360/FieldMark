-- Run in Supabase SQL Editor (or psql) to align hcps with npi_gap_audit.py writes.
ALTER TABLE hcps
  ADD COLUMN IF NOT EXISTS npi_taxonomy text,
  ADD COLUMN IF NOT EXISTS npi_specialty text;
