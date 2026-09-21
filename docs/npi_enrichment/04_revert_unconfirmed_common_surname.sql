/* ==== 04. REVERT THE LIVE-BUT-UNCONFIRMED COMMON-SURNAME WRITES ====
   Run: 2026-09-08, third and final tranche. Follows 01 and 02.

   WHY THESE ARE COMING OUT, AND IT IS NOT THAT THEY ARE WRONG.

   These 10 are live for one reason: they were written by the run that PREDATED the
   surname gate. Under the rules as they now stand -- surname block >= 10 requires an
   independent confirming signal -- not one of them would have been written. A write that
   today's rules forbid should not survive because of its timestamp. That is the whole
   argument; it is a consistency decision, not a verdict on each of the 10.

   SEVERAL ARE PROBABLY CORRECT. Two worth naming:
     * Carmen Guerra (University of Pennsylvania) publishes on colorectal cancer screening
       disparities. She is a real Penn internist and this is plausibly her NPI.
     * Patrick Romano (UC Davis Health, 599 publications) is a real health services
       researcher and general internist.
   They fail only because their NPPES registration is Internal Medicine / Hospitalist,
   which the confirmer list deliberately excludes: as a corroborator, a primary-care code
   would confirm almost any name, which is the same as not confirming at all.

   RESTORABLE. If the clinical advisor admits any primary-care code -- 207R00000X Internal
   Medicine (6 of these 10), 207Q00000X Family Medicine (3), 208M00000X Hospitalist (3),
   207QH0002X Hospice & Palliative (1), or 3336C0002X Clinic Pharmacy (1, already held as
   a candidate in the CRC config) -- the corresponding rows here should be reinstated. The
   NPI, the original high_confidence log row and the full NPPES record are all retained
   below, so restoring is a re-write from stored evidence, not a re-search.

   Same mechanics as 01 and 02: hcps_v2 columns nulled, the run-created
   hcp_nppes_detail_v2 row deleted, the original log row stamped reverted_at and RETAINED,
   a withdrawn_write row added and memoised. Nothing is deleted from the log. */

BEGIN;

CREATE TEMP TABLE revert_set(npi text PRIMARY KEY, blk integer NOT NULL, codes text NOT NULL);
INSERT INTO revert_set(npi, blk, codes) VALUES
  ('1760484687', 527, '207Q00000X Family Medicine'),                                -- Byung Kang, UC San Diego
  ('1053431593', 412, '207R00000X Internal Medicine; 208M00000X Hospitalist'),       -- Ami Shah, Northwestern
  ('1518669563', 226, '207R00000X Internal Medicine'),                               -- Mazin Ali
  ('1427683358',  47, '3336C0002X Pharmacy, Clinic Pharmacy'),                       -- Jane Rogers, MD Anderson
  ('1386625986',  42, '207R00000X Internal Medicine; 208000000X Pediatrics'),        -- Patrick Romano, UC Davis
  ('1639133846',  42, '207Q00000X Family Medicine'),                                 -- Rashmi Sinha, NCI
  ('1356373781',  35, '207R00000X Internal Medicine; 208M00000X Hospitalist'),       -- Carmen Guerra, Penn
  ('1275868721',  11, '207R00000X Internal Medicine; 207QH0002X Hospice & Palliative'), -- Kara Bischoff, UCSF
  ('1942628136',  11, '207R00000X Internal Medicine; 208M00000X Hospitalist'),       -- Tyler Friedrich, CU Anschutz
  ('1336600543',  10, '207Q00000X Family Medicine');                                 -- Ryan McCabe, ACS

CREATE TEMP TABLE revert_snapshot AS
SELECT h.id AS hcp_id, h.npi_number, h.npi_source, h.npi_verified_at,
       h.nppes_career_stage_years, r.blk, r.codes,
       trim(coalesce(h.first_name,'') || ' ' || coalesce(h.last_name,'')) AS hcp_name,
       coalesce(h.institution_canonical, h.current_institution,
                h.institution_normalized, h.institution_raw) AS institution
FROM public.hcps_v2 h
JOIN revert_set r ON r.npi = h.npi_number;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM revert_snapshot;
  IF n <> 10 THEN
    RAISE EXCEPTION 'revert_snapshot has % rows, expected 10 -- aborting', n;
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
       'Write withdrawn 2026-09-08 (tranche 3). Live only because it predates the '
       'surname-block confirmation gate; under the rules as they now stand (block >= 10 '
       'requires an independent confirming signal) it would not have been written. '
       'CONSISTENCY, not a judgement that this match is wrong -- several in this tranche '
       'are probably correct. surname_block=' || s.blk || ' nppes_taxonomies=' || s.codes ||
       '. RESTORABLE from the retained high_confidence log row if the confirmer list is '
       'widened to admit a primary-care code.',
       jsonb_build_object(
         'withdrawn_npi', s.npi_number,
         'tranche', 3,
         'reason', 'predates_surname_gate',
         'surname_block', s.blk,
         'nppes_taxonomies', s.codes,
         'hcp_name', s.hcp_name,
         'institution', s.institution,
         'restorable_if', 'confirming_taxonomies widened to a primary-care code',
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
