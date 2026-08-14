-- Affiliation re-derivation — apply staging to hcps_v2.
--
-- Writes ONLY the additive columns + the two pre-existing 0-populated ones.
-- hcps_v2.country / institution_normalized / institution_raw / institution_ror /
-- institution_canonical are NOT in any SET clause -- historical values preserved.

SET statement_timeout = '30min';

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
