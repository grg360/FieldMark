-- ============================================================================
-- Trial-investigator correction path — items 1, 2, and the gated render view.
-- Date: 2026-08-03   Branch: foundation-rebuild
-- Decision: gate model (b), threshold 80 (render >=80 unless rejected).
--
-- STAGED — DO NOT RUN until reviewed. Mirrors the NPI provenance pattern
-- (npi_source / npi_verified_at stamped inside a guarded write).
--
-- NOT in this migration (kept as reports, per instruction):
--   • Item 3 stale-link reconciliation — no `stale` column, no marking pass.
--     last_seen_at IS added and bumped here so item 3 needs no backfill later;
--     the view intentionally omits a `NOT stale` predicate until item 3 ships.
--   • Item 4 physical dedup — dedup is render-time DISTINCT ON only; no raw
--     rows are deleted or merged.
-- ============================================================================

-- ── Item 1: review state ────────────────────────────────────────────────────
-- rejected is a first-class flag DISTINCT from never-reviewed: never-reviewed =
-- (NOT verified_by_human AND NOT rejected). This is the gap dol_matches_v2 had.
ALTER TABLE trial_investigators_v2
  ADD COLUMN IF NOT EXISTS verified_by_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS review_source     text,          -- 'human' | 'script' | 'llm', like npi_source
  ADD COLUMN IF NOT EXISTS last_seen_at      timestamptz;   -- bumped every crawl sighting (item-3 hook)

-- Backfill last_seen_at from created_at (first-seen proxy) so existing rows are
-- not treated as never-seen by a future reconciliation pass.
UPDATE trial_investigators_v2
   SET last_seen_at = created_at
 WHERE last_seen_at IS NULL;

-- ── Render threshold: the single named constant ─────────────────────────────
-- Raising the gate to 90 or 100-only is a one-line edit here, nowhere else.
CREATE OR REPLACE FUNCTION trial_match_render_threshold()
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 80 $$;

-- ── Item 2: match-preserving upsert that bypasses the ratchet for humans ─────
-- Change from addendum 10: a row where verified_by_human OR rejected is true is
-- HUMAN-OWNED — the crawl may not overwrite its hcp_id, match_confidence, or
-- source. The GREATEST/COALESCE ratchet still applies to machine-owned rows.
-- last_seen_at is bumped on EVERY sighting, human-owned or not, so a verified
-- row that stops appearing becomes a review case (item 3), not a silent vanish.
-- Descriptive raw fields (name/affiliation/facility/geo) still refresh on every
-- sighting — they describe the crawl record, not the match decision.
CREATE OR REPLACE FUNCTION upsert_trial_investigators_v2_preserving_match(rows_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO trial_investigators_v2 (
    hcp_id,
    trial_id,
    role,
    investigator_name,
    investigator_raw_first_name,
    investigator_raw_middle_name,
    investigator_raw_last_name,
    investigator_raw_affiliation,
    investigator_raw_facility,
    investigator_raw_city,
    investigator_raw_state,
    investigator_raw_country,
    match_confidence,
    source,
    last_seen_at
  )
  SELECT
    NULLIF(r.hcp_id, '')::uuid,
    r.trial_id::uuid,
    r.role,
    r.investigator_name,
    r.investigator_raw_first_name,
    r.investigator_raw_middle_name,
    r.investigator_raw_last_name,
    r.investigator_raw_affiliation,
    r.investigator_raw_facility,
    r.investigator_raw_city,
    r.investigator_raw_state,
    r.investigator_raw_country,
    r.match_confidence,
    r.source,
    now()
  FROM jsonb_to_recordset(rows_data) AS r(
    hcp_id text,
    trial_id text,
    role text,
    investigator_name text,
    investigator_raw_first_name text,
    investigator_raw_middle_name text,
    investigator_raw_last_name text,
    investigator_raw_affiliation text,
    investigator_raw_facility text,
    investigator_raw_city text,
    investigator_raw_state text,
    investigator_raw_country text,
    match_confidence integer,
    source text
  )
  ON CONFLICT (trial_id, investigator_raw_first_name, investigator_raw_last_name, role, source)
  DO UPDATE SET
    -- match decision — FROZEN on human-owned rows, ratchet otherwise
    hcp_id = CASE
      WHEN trial_investigators_v2.verified_by_human OR trial_investigators_v2.rejected
        THEN trial_investigators_v2.hcp_id
      ELSE COALESCE(EXCLUDED.hcp_id, trial_investigators_v2.hcp_id)
    END,
    match_confidence = CASE
      WHEN trial_investigators_v2.verified_by_human OR trial_investigators_v2.rejected
        THEN trial_investigators_v2.match_confidence
      ELSE GREATEST(
        COALESCE(EXCLUDED.match_confidence, 0),
        COALESCE(trial_investigators_v2.match_confidence, 0)
      )
    END,
    source = CASE
      WHEN trial_investigators_v2.verified_by_human OR trial_investigators_v2.rejected
        THEN trial_investigators_v2.source
      WHEN EXCLUDED.hcp_id IS NOT NULL
        THEN EXCLUDED.source
      ELSE trial_investigators_v2.source
    END,
    -- descriptive fields — always refreshed (crawl record, not match decision)
    investigator_name = COALESCE(EXCLUDED.investigator_name, trial_investigators_v2.investigator_name),
    investigator_raw_middle_name = COALESCE(
      EXCLUDED.investigator_raw_middle_name,
      trial_investigators_v2.investigator_raw_middle_name
    ),
    investigator_raw_affiliation = COALESCE(
      EXCLUDED.investigator_raw_affiliation,
      trial_investigators_v2.investigator_raw_affiliation
    ),
    investigator_raw_facility = COALESCE(
      EXCLUDED.investigator_raw_facility,
      trial_investigators_v2.investigator_raw_facility
    ),
    investigator_raw_city = COALESCE(
      EXCLUDED.investigator_raw_city,
      trial_investigators_v2.investigator_raw_city
    ),
    investigator_raw_state = COALESCE(
      EXCLUDED.investigator_raw_state,
      trial_investigators_v2.investigator_raw_state
    ),
    investigator_raw_country = COALESCE(
      EXCLUDED.investigator_raw_country,
      trial_investigators_v2.investigator_raw_country
    ),
    -- sighting stamp — ALWAYS bumped, human-owned or not
    last_seen_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_trial_investigators_v2_preserving_match(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_trial_investigators_v2_preserving_match(jsonb) TO service_role;

-- ── The gated render view: gate (b) + render-time dedup ─────────────────────
-- One structural surface. Because it is a standing predicate at the serve layer,
-- it covers the backlog AND every future crawl the moment rows land — the July
-- <80 inflow is auto-held with no per-crawl cleanup. Consumers read this view,
-- never trial_investigators_v2 directly.
--
-- Gate:   render hcp_id IS NOT NULL, NOT rejected, and (confidence >= threshold
--         OR verified_by_human). Rejection is PER RAW ROW — to remove an HCP
--         from a trial entirely, every row for that (trial, hcp) must be rejected.
-- Dedup:  DISTINCT ON (trial_id, hcp_id) collapses the same HCP appearing on one
--         trial via different role/source/spelling. Winner: human-verified, then
--         highest confidence, then overall_official source, then oldest sighting.
--         Raw rows are untouched (no physical merge).
CREATE OR REPLACE VIEW trial_investigators_rendered_v1
WITH (security_invoker = true) AS
SELECT DISTINCT ON (ti.trial_id, ti.hcp_id)
  ti.*
FROM trial_investigators_v2 ti
WHERE ti.hcp_id IS NOT NULL
  AND NOT ti.rejected
  AND (ti.match_confidence >= trial_match_render_threshold() OR ti.verified_by_human)
ORDER BY
  ti.trial_id,
  ti.hcp_id,
  ti.verified_by_human DESC,
  ti.match_confidence DESC NULLS LAST,
  (ti.source = 'overall_official') DESC,
  ti.created_at ASC;

GRANT SELECT ON trial_investigators_rendered_v1 TO anon;
GRANT SELECT ON trial_investigators_rendered_v1 TO authenticated;
GRANT SELECT ON trial_investigators_rendered_v1 TO service_role;

NOTIFY pgrst, 'reload schema';
