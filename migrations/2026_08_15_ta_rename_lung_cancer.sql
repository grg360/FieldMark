-- Rename the therapeutic area: NSCLC -> Lung Cancer.
-- Date: 2026-08-15
--
-- WHY. The corpus already contains 2,732 SCLC-only publications and 99
-- NSCLC/SCLC transformation papers. They were not a tagging error and the
-- nsclc.json anchoring fix cannot remove them: "lung cancer" is an anchor term,
-- and 2,567 of those titles read "Small-Cell LUNG CANCER" — the phrase that
-- makes them SCLC also satisfies the anchor. Excluding them would have cost 934
-- established and 922 rising_eligible reclassifications, 28 Rising board members
-- and 920 Established, with 16 of 170 top-200 moves landing on HCPs with no SCLC
-- exposure at all. Widening the name to match what the corpus actually holds
-- costs none of that.
--
-- ORDERING. migrations/2026_08_15_ta_resolve_by_slug.sql MUST be applied first.
-- Ten live functions resolved this TA by literal name and would silently return
-- EMPTY (not error) once the name changed. That migration repoints them to the
-- slug, which is not changing.
--
-- EXPLICITLY NOT IN SCOPE:
--   * The slug stays 'nsclc'. Routes, config/therapeutic_areas/nsclc.json and
--     hcp_narratives_v2.therapeutic_area_slug are untouched.
--   * The TA uuid is unchanged, so the 29 files hardcoding it are unaffected.
--   * The 4,720 stored narratives that say "NSCLC" in their prose are NOT
--     regenerated and NOT find-replaced. That prose is frequently a clinical
--     claim rather than a TA label — "NSCLC immunotherapy decisions", an ALK+/
--     ROS1+ scope — and a mechanical replace would make true sentences false.
--     A Lung Cancer surface containing NSCLC-specific prose is coherent.
--   * The denormalised therapeutic_area TEXT columns (hcp_research_themes_v2
--     10,640 rows, hcp_leadership_evidence 955, hcp_ai_overviews 293,
--     theme_canonical_v1 25) are SLUG-derived — bucket_themes.py builds them as
--     ta.upper() from the CLI slug — so they keep reading 'NSCLC' and the
--     hcp_belief_claims filter keeps matching. Verified, not assumed.

BEGIN;

UPDATE therapeutic_areas
SET name = 'Lung Cancer'
WHERE slug = 'nsclc' AND name = 'NSCLC';

DO $$
DECLARE
  v_name text;
  v_slug text;
  v_id   uuid;
BEGIN
  SELECT id, name, slug INTO v_id, v_name, v_slug
  FROM therapeutic_areas WHERE slug = 'nsclc';

  IF v_name IS DISTINCT FROM 'Lung Cancer' THEN
    RAISE EXCEPTION 'rename did not apply: name is %', v_name;
  END IF;
  IF v_slug IS DISTINCT FROM 'nsclc' THEN
    RAISE EXCEPTION 'slug must stay nsclc, found %', v_slug;
  END IF;
  IF v_id IS DISTINCT FROM 'c0065b03-a25e-4e9a-bde4-4b4d0db7827d'::uuid THEN
    RAISE EXCEPTION 'TA uuid changed, expected c0065b03-...: %', v_id;
  END IF;

  -- Nothing may still resolve this TA by its old name.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) ~* 'therapeutic_areas[[:space:]]+where[[:space:]]+name[[:space:]]*=[[:space:]]*''NSCLC'''
  ) THEN
    RAISE EXCEPTION 'a live function still resolves this TA by name — repoint first';
  END IF;

  RAISE NOTICE 'renamed: % (slug %, id %)', v_name, v_slug, v_id;
END $$;

COMMIT;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
--   UPDATE therapeutic_areas SET name = 'NSCLC' WHERE slug = 'nsclc';
-- COMMIT;
-- The slug repoint does NOT need reverting alongside it — resolving by slug is
-- correct under either name. sql/revert/2026_08_15_ta_name_repoint_REVERT.sql
-- exists only if the repoint itself must be undone.
