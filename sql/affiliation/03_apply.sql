-- Affiliation re-derivation — apply staging to hcps_v2.
--
-- Writes ONLY the additive columns + the two pre-existing 0-populated ones.
-- hcps_v2.country / institution_normalized / institution_raw / institution_ror /
-- institution_canonical are NOT in any SET clause -- historical values preserved.

-- RAISED 30min -> 60min on 2026-08-31. This is the only step that writes patient-facing
-- data, and it is the slower half: two UPDATEs over a 523 MB table, 334,791 rows on the
-- first and ~46,538 on the second, ten columns including the institution_history jsonb.
-- It fitted 30min at 289,311 rows on 2026-08-14; the corpus is 381,329 now.
--
-- THIS LINE, NOT --statement-timeout, IS WHAT GOVERNS. run_sql.py sets the GUC as a libpq
-- connect option, and this SET runs as the first statement of the transaction and overrides
-- it. Passing the flag without editing here is inert.
--
-- 02_build_staging.sql deliberately stays at 30min: its derivation was measured at 54s
-- read-only on 2026-08-31, so 30min is already ~20x headroom and a longer ceiling would only
-- delay the discovery of a pathological plan.
SET statement_timeout = '60min';

UPDATE hcps_v2 h
SET current_country         = s.current_country,
    current_institution     = s.current_institution,
    current_institution_ror = s.current_institution_ror,
    affiliation_confidence  = s.affiliation_confidence,
    affiliation_as_of       = s.affiliation_as_of,
    affiliation_evidence_n  = s.affiliation_evidence_n,
    affiliation_dominance   = s.affiliation_dominance,
    institution_secondary   = s.institution_secondary,
    institution_history     = s.institution_history,
    affiliation_derived_at  = NOW()
FROM hcp_affiliation_rederived_v1 s
WHERE h.id = s.hcp_id;

-- Everyone with no ROR'd affiliation anywhere in the corpus: stamped explicitly as
-- unknown rather than left NULL, so "we have no evidence" is distinguishable from
-- "this row was never processed".
UPDATE hcps_v2 h
SET affiliation_confidence = 'unknown',
    affiliation_derived_at = NOW()
WHERE NOT EXISTS (SELECT 1 FROM hcp_affiliation_rederived_v1 s WHERE s.hcp_id = h.id);
