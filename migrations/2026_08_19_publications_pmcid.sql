-- ============================================================================
-- publications_v2 — store the PMCID. Date: 2026-08-19   Branch: resurfacing
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- The corpus holds pubmed_id on 435,974 of 435,974 rows and doi on 428,536,
-- but no PMCID anywhere. Full-text retrieval from PMC is keyed on PMCID, so
-- every question about "can we read the discussion section" was unanswerable
-- from stored data.
--
-- The nearest proxies both mislead:
--   * open_access->>'oa_url' pointing at PMC covers 380 of the 4,011 papers
--     positions were extracted from (9.5%), but that is OpenAlex's BEST-LOCATION
--     pick, not a deposit fact — for a gold-OA paper it names the publisher even
--     when a PMC copy exists. It also skews 15.0% US vs 2.2% Europe, which is an
--     artifact of that pick, not of deposit.
--   * open_access->>'any_repository_has_fulltext' is flat across regions
--     (66/68/61%) but does not say WHICH repository, so it cannot be fetched from.
--
-- PMID -> PMCID resolution is a fact about the corpus, cheap to obtain once
-- (NCBI ID Converter, 200 ids per request, no LLM cost) and expensive to keep
-- re-deriving. Hence a column, not a scratch file.
--
-- ── Two columns, not one ────────────────────────────────────────────────────
-- pmcid_resolved_at is stamped on EVERY row the resolver asks about, including
-- the ones that come back with no PMCID. Without it, pmcid IS NULL conflates
-- "not in PMC" with "never asked" — the same trap hcps_v2.npi_number had before
-- npi_source / npi_verified_at were added. Query intent:
--
--   pmcid IS NOT NULL                              -> in PMC, fetchable
--   pmcid IS NULL AND pmcid_resolved_at IS NOT NULL -> asked, not in PMC
--   pmcid_resolved_at IS NULL                       -> never asked
--
-- ── Scope ───────────────────────────────────────────────────────────────────
-- Additive only. No existing column is read or written. Nothing selects on
-- these yet, so applying this changes no surface and no score.
--
-- Revert:  ALTER TABLE public.publications_v2
--            DROP COLUMN IF EXISTS pmcid,
--            DROP COLUMN IF EXISTS pmcid_resolved_at;
-- ============================================================================

ALTER TABLE public.publications_v2
  ADD COLUMN IF NOT EXISTS pmcid            text,
  ADD COLUMN IF NOT EXISTS pmcid_resolved_at timestamptz;

COMMENT ON COLUMN public.publications_v2.pmcid IS
  'PMC identifier in canonical PMC<digits> form, resolved from pubmed_id via the '
  'NCBI ID Converter. NULL means either not in PMC or not yet asked — disambiguate '
  'with pmcid_resolved_at.';

COMMENT ON COLUMN public.publications_v2.pmcid_resolved_at IS
  'When the PMID->PMCID resolver last asked about this row. Stamped even when no '
  'PMCID came back, so "not in PMC" is distinguishable from "never asked".';

-- Partial: the fetchable set is the only one anything will scan for.
CREATE INDEX IF NOT EXISTS idx_publications_v2_pmcid
  ON public.publications_v2 (pmcid) WHERE pmcid IS NOT NULL;
