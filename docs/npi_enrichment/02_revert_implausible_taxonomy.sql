/* ==== 02. REVERT WRITES WHOSE MATCHED NPPES TAXONOMY IS IMPLAUSIBLE FOR CRC ====
   Run: 2026-09-08, second tranche. Follows 01_revert_suspect_writes.sql.

   THE TEST, as specified: could a person REGISTERED UNDER THIS TAXONOMY plausibly treat
   or diagnose colorectal cancer? Where the answer is no, the taxonomy is evidence that
   the name search landed on a different human, and a wrong NPI on a named physician is
   not a threshold question -- it comes out.

   SCOPE: the 43 live writes with surname block >= 10 that the approved confirmation gate
   would have blocked. 17 fail the test and are reverted here. The other 26 are HELD, not
   reverted -- they are candidates for a widened confirmer list and are listed in the
   review set that accompanies this file.

   THREE OF THE 17 ARE FLAGGED, and they are the ones to look at first if any get restored.
   For these the taxonomy matches the NAMED PERSON'S OWN specialty, so the write is
   probably on the RIGHT human -- it is the colorectal relevance that is absent, not the
   identity:
     * Pinchas Cohen  -- 2080P0205X Pediatric Endocrinology. He is a paediatric
       endocrinologist. (Corrects a mislabel in the prior report, which called this code
       Pediatric Nephrology.)
     * Eben Rosenthal -- 207YX0007X Otolaryngology / Head & Neck Plastic Surgery. He is a
       head and neck surgeon.
     * Sabha Bhatti   -- 207RC0000X Cardiovascular Disease. Plausibly a cardiologist.
   They are reverted because the specified test is colorectal plausibility, and on that
   test they fail. Restoring any of them is a one-line change.

   FOUR share 390200000X "Student in an Organized Health Care Education/Training Program".
   That is not a specialty, and on a 334-publication professor (Daniela Friedman) it is
   near-conclusive evidence of a different human or a stale trainee registration.

   Same mechanics as 01: hcps_v2 columns nulled, the run-created hcp_nppes_detail_v2 row
   deleted, the original log row stamped reverted_at and RETAINED, a withdrawn_write row
   added and memoised. */

BEGIN;

CREATE TEMP TABLE revert_set(npi text PRIMARY KEY, why text NOT NULL);
INSERT INTO revert_set(npi, why) VALUES
  ('1982334991', '172V00000X Community Health Worker -- not a clinician who treats or diagnoses CRC'),
  ('1548266083', '208100000X Physical Medicine & Rehabilitation -- no colorectal care pathway'),
  ('1366682163', '235Z00000X Speech-Language Pathologist -- not a clinician who treats or diagnoses CRC'),
  ('1336858448', '101YA0400X Counselor, Addiction -- not a clinician who treats or diagnoses CRC'),
  ('1558007757', '390200000X Student in Health Care Education -- not a specialty; 334-pub professor'),
  ('1053052399', '390200000X Student in Health Care Education -- not a specialty'),
  ('1740927490', '390200000X Student in Health Care Education -- not a specialty'),
  ('1437629896', '390200000X Student in Health Care Education -- not a specialty'),
  ('1700488301', '3747P1801X Technician, Personal Care Attendant -- not a clinician'),
  ('1588748354', '1041C0700X Social Worker, Clinical -- not a clinician who treats or diagnoses CRC'),
  ('1265779995', '367500000X Nurse Anesthetist CRNA -- no colorectal diagnostic or treatment role'),
  ('1457566366', '1223G0001X Dentist, General Practice -- different human'),
  ('1619998796', '208000000X Pediatrics -- CRC is not a paediatric disease'),
  ('1851956833', '207P00000X Emergency Medicine -- no colorectal care pathway'),
  ('1790708386', '2080P0205X Pediatric Endocrinology -- FLAGGED: likely the right human, no CRC relevance'),
  ('1265457287', '207YX0007X Otolaryngology/Head & Neck -- FLAGGED: likely the right human, no CRC relevance'),
  ('1164472049', '207RC0000X Cardiovascular Disease -- FLAGGED: likely the right human, no CRC relevance');

CREATE TEMP TABLE revert_snapshot AS
SELECT h.id AS hcp_id, h.npi_number, h.npi_source, h.npi_verified_at,
       h.nppes_career_stage_years, r.why,
       trim(coalesce(h.first_name,'') || ' ' || coalesce(h.last_name,'')) AS hcp_name,
       coalesce(h.institution_canonical, h.current_institution,
                h.institution_normalized, h.institution_raw) AS institution
FROM public.hcps_v2 h
JOIN revert_set r ON r.npi = h.npi_number;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM revert_snapshot;
  IF n <> 17 THEN
    RAISE EXCEPTION 'revert_snapshot has % rows, expected 17 -- aborting', n;
  END IF;
END $$;

UPDATE public.nppes_enrichment_log_v2 l
SET reverted_at = now()
FROM revert_snapshot s
WHERE l.hcp_id = s.hcp_id
  AND l.match_confidence = 'high_confidence'
  AND l.enriched_at >= '2026-09-07'
  AND l.reverted_at IS NULL;

INSERT INTO public.nppes_enrichment_log_v2
  (hcp_id, matched_npi, match_confidence, match_reason, candidates_considered, enriched_at)
SELECT s.hcp_id, s.npi_number, 'withdrawn_write',
       'Write withdrawn 2026-09-08 (tranche 2). Matched NPPES taxonomy is implausible for a '
       'clinician who treats or diagnoses colorectal cancer, which is evidence the name '
       'search landed on a different human. ' || s.why ||
       '. NPI removed from hcps_v2 and hcp_nppes_detail_v2 row deleted; the original '
       'high_confidence log row is retained and stamped reverted_at.',
       jsonb_build_object(
         'withdrawn_npi', s.npi_number,
         'reason', s.why,
         'tranche', 2,
         'hcp_name', s.hcp_name,
         'institution', s.institution,
         'prior_npi_source', s.npi_source,
         'prior_npi_verified_at', s.npi_verified_at,
         'prior_nppes_career_stage_years', s.nppes_career_stage_years),
       now()
FROM revert_snapshot s;

DELETE FROM public.hcp_nppes_detail_v2 d
USING revert_snapshot s
WHERE d.hcp_id = s.hcp_id;

UPDATE public.hcps_v2 h
SET npi_number = NULL,
    npi_source = NULL,
    npi_verified_at = NULL,
    nppes_career_stage_years = NULL
FROM revert_snapshot s
WHERE h.id = s.hcp_id;

COMMIT;
