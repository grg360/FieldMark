-- Part D oral-oncology anchor: reference mapping + target table.
-- Run this once before part_d_oncology_ingest.py. The stem->group and the
-- effective-dated stem->grade mapping live HERE (a table), not in the ingest
-- script, so they are auditable and correctable without a code change. Stems and
-- grades per docs/design/NSCLC_COHORT_EVIDENCE_TIERS.md sections 4-5 as amended.
--
-- ANCHOR GRADE IS DRUG *AND* YEAR. Indications change, so a stem may have several
-- rows with non-overlapping [valid_from_year, valid_to_year] ranges (valid_to_year
-- NULL = open-ended). The ingest resolves the grade for each Part D row by joining
-- on drug_stem AND program_year. "Anchored" downstream means the resolved
-- anchor_grade for the row's own program_year is 'strict' — never a drug-level flag.
--
-- Drug membership (what gets loaded) is stem presence in this table, independent of
-- year: a stem with no grade row covering a given year still loads, with a NULL
-- grade for that year, rather than silently dropping.

-- btree_gist lets an EXCLUDE constraint combine text equality (drug_stem WITH =)
-- with range overlap (&&) in one GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS public.part_d_oncology_drugs_v1 (
  drug_stem        text    NOT NULL,   -- lowercased bare stem; matched by PREFIX against Gnrc_Name
  drug_group       text    NOT NULL,   -- mix category: 'lung' (breast/heme/prostate/gi_renal added later)
  anchor_grade     text,               -- strict | dominant | cross_indication | supporting; NULL for non-anchor groups
  valid_from_year  integer NOT NULL,
  valid_to_year    integer,            -- NULL = open-ended
  note             text,
  PRIMARY KEY (drug_stem, valid_from_year),
  CHECK (anchor_grade IS NULL OR anchor_grade IN ('strict','dominant','cross_indication','supporting')),
  CHECK (valid_to_year IS NULL OR valid_to_year >= valid_from_year),
  -- No two rows for the same stem may cover overlapping years. Without this, the
  -- ingest's grade lookup would resolve an overlap silently (LIMIT 1) — the exact
  -- silent-wrong-value failure class this work exists to avoid. valid_to_year is
  -- INCLUSIVE, so the half-open upper bound is +1; NULL valid_to_year is open-ended.
  EXCLUDE USING gist (
    drug_stem WITH =,
    int4range(valid_from_year,
              CASE WHEN valid_to_year IS NULL THEN NULL ELSE valid_to_year + 1 END) WITH &&
  )
);

INSERT INTO public.part_d_oncology_drugs_v1
  (drug_stem, drug_group, anchor_grade, valid_from_year, valid_to_year, note) VALUES
  -- strict, all data years (open-ended)
  ('osimertinib',  'lung', 'strict',           2022, NULL, 'EGFR NSCLC; lung-exclusive'),
  ('alectinib',    'lung', 'strict',           2022, NULL, 'ALK NSCLC'),
  ('lorlatinib',   'lung', 'strict',           2022, NULL, 'ALK NSCLC'),
  ('brigatinib',   'lung', 'strict',           2022, NULL, 'ALK NSCLC'),
  ('ceritinib',    'lung', 'strict',           2022, NULL, 'ALK NSCLC'),
  ('capmatinib',   'lung', 'strict',           2022, NULL, 'MET exon14 NSCLC'),
  ('tepotinib',    'lung', 'strict',           2022, NULL, 'MET exon14 NSCLC'),
  ('dacomitinib',  'lung', 'strict',           2022, NULL, 'EGFR NSCLC'),
  ('gefitinib',    'lung', 'strict',           2022, NULL, 'EGFR NSCLC'),
  ('lazertinib',   'lung', 'strict',           2022, NULL, 'EGFR NSCLC'),
  ('afatinib',     'lung', 'strict',           2022, NULL, 'EGFR TKI for NSCLC; strict confirmed — in a US Medicare community oncology population it is lung'),
  -- strict now, but year-bounded so a later load regrades correctly
  ('sotorasib',    'lung', 'strict',           2022, 2024, 'KRAS G12C NSCLC; colorectal arrived Jan 2025 — bounded at 2024 so a 2025 load regrades'),
  ('mobocertinib', 'lung', 'strict',           2022, 2024, 'EGFR exon20 NSCLC; withdrawn from market after Jul 2024 — no rows expected later'),
  -- adagrasib: strict through 2023, cross-indication once colorectal was approved (Jun 2024)
  ('adagrasib',    'lung', 'strict',           2022, 2023, 'KRAS G12C NSCLC'),
  ('adagrasib',    'lung', 'cross_indication', 2024, NULL, 'colorectal indication approved Jun 2024'),
  -- dominant: lung-led but not lung-exclusive
  ('crizotinib',   'lung', 'dominant',         2022, NULL, 'ALK/ROS1 NSCLC, but also ALK+ ALCL and inflammatory myofibroblastic tumour'),
  -- cross-indication
  ('erlotinib',    'lung', 'cross_indication', 2022, NULL, 'EGFR NSCLC, but also pancreatic cancer'),
  -- supporting, never anchoring
  ('selpercatinib','lung', 'supporting',       2022, NULL, 'RET fusion — also thyroid'),
  ('pralsetinib',  'lung', 'supporting',       2022, NULL, 'RET fusion — also thyroid'),
  ('entrectinib',  'lung', 'supporting',       2022, NULL, 'NTRK — solid tumours'),
  ('repotrectinib','lung', 'supporting',       2022, NULL, 'NTRK / ROS1 — solid tumours')
  -- amivantamab intentionally ABSENT: IV antibody, lives in the Part B set as J9061.
ON CONFLICT (drug_stem, valid_from_year) DO UPDATE
  SET drug_group    = EXCLUDED.drug_group,
      anchor_grade  = EXCLUDED.anchor_grade,
      valid_to_year = EXCLUDED.valid_to_year,
      note          = EXCLUDED.note;

CREATE TABLE IF NOT EXISTS public.hcp_part_d_oncology_v1 (
  hcp_id          uuid    NOT NULL,
  npi             text    NOT NULL,
  program_year    integer NOT NULL,    -- parsed from the source FILENAME, not a column
  gnrc_name       text    NOT NULL,    -- raw CMS Gnrc_Name (salt form preserved for audit)
  brnd_name       text,                -- representative brand at this grain (max Tot_Clms)
  drug_stem       text    NOT NULL,    -- the matched reference stem
  drug_group      text    NOT NULL,
  anchor_grade    text,                -- resolved for THIS program_year (may be NULL); 'strict' == Anchored
  tot_clms        integer,
  tot_30day_fills numeric,             -- CMS reports this fractional; do NOT round
  tot_benes       integer,             -- NULL when CMS suppressed (<11); never zero
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hcp_id, program_year, gnrc_name)
);

CREATE INDEX IF NOT EXISTS ix_hcp_part_d_oncology_v1_npi   ON public.hcp_part_d_oncology_v1 (npi);
CREATE INDEX IF NOT EXISTS ix_hcp_part_d_oncology_v1_stem  ON public.hcp_part_d_oncology_v1 (drug_stem);
CREATE INDEX IF NOT EXISTS ix_hcp_part_d_oncology_v1_year  ON public.hcp_part_d_oncology_v1 (program_year);
CREATE INDEX IF NOT EXISTS ix_hcp_part_d_oncology_v1_grade ON public.hcp_part_d_oncology_v1 (anchor_grade);

-- ---------------------------------------------------------------------------
-- Run these three as separate statements after the tables exist.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.part_d_oncology_drugs_v1 TO anon, authenticated;

GRANT SELECT ON public.hcp_part_d_oncology_v1 TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
