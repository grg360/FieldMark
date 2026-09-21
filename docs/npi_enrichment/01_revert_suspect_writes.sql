/* ==== 01. REVERT THE SUSPECT NPI WRITES ====
   Run: 2026-09-08, against the targeted_nppes_enrichment.py CRC run of the same day
   (969 processed, 244 written).

   WHAT IS BEING UNDONE AND WHY
   The candidate filter trusts hcps_v2.country ('US'/'USA') and never looks at the
   institution string or the surname. That let three classes of write through:

     C  current_country says the person is not in the US (CN, CA, GB, NL, CH, IL, TH)
     I  the institution string is plainly non-US (Wuhan, Harbin, Changchun, Shaanxi,
        Western University)
     N  the surname block is >= 1,000 rows, where a single NPPES result on a name-only
        search is weak evidence rather than strong

   These are live NPI assignments on named physicians. A wrong one attaches another
   person's Medicare claims and Open Payments to them, so it comes out now and goes
   back later if review clears it -- not the other way round.

   17 ROWS, NOT 19. Two of the original 19 were false positives in the classifier that
   produced the list, and are deliberately EXCLUDED:
     * Ami Shah, Northwestern University -- 'western university' matched as a substring
       of "Northwestern University". US institution, current_country US, surname block 412.
     * Sheila Segura, Indiana University - Purdue University Indianapolis -- 'india'
       matched inside "Indiana"/"Indianapolis". US institution, current_country US,
       surname block 6.
   Both are US physicians flagged by a regex without word boundaries. Reverting them
   would be damage caused by the measurement, not by the run. To include them anyway,
   add '1053431593' and '1891061370' to revert_set below and re-run.

   PRE-RUN STATE, and how it is known. The run's write path sets exactly four columns on
   hcps_v2 -- npi_number, npi_source, npi_verified_at, nppes_career_stage_years -- under a
   write-time `npi_number IS NULL` guard, so npi_number/npi_source/npi_verified_at were
   provably NULL beforehand. nppes_career_stage_years is inferred NULL: only 2 of 331,197
   no-NPI rows in hcps_v2 carry a value, so the prior probability of a real value here is
   ~0.0006%. Verified for this set: 0 of 17 have hcps_v2.nppes_enriched_at set (the path
   does not write it), 17 of 17 carry npi_source='script' and npi_verified_at from this
   run, and 0 of 17 carry nppes_practice_state -- so nulling the NPI cannot trip
   nppes_state_has_nppes_provenance.

   hcp_nppes_detail_v2: all 17 rows were CREATED by this run. Checked by testing every
   column the upsert does not write (nppes_enumeration_date, nppes_organization_name,
   npi_taxonomy, raw_api_response, nppes_taxonomies, ingestion_run_id, nppes_practice_zip,
   nppes_career_stage) -- 0 of 17 has any of them populated, which a pre-existing row
   would. DELETE is therefore correct and nothing needs restoring.

   THE LOG IS NOT DELETED. The original high_confidence rows stay and are stamped
   reverted_at; a second row per HCP records the withdrawal and its trigger. What
   happened remains readable. */

BEGIN;

CREATE TEMP TABLE revert_set(npi text PRIMARY KEY, trigger text NOT NULL);
INSERT INTO revert_set(npi, trigger) VALUES
  ('1811284904', 'CIN'),  -- Manling Zhang   | Wuhan No.1 Hospital            | CN | freq 8094
  ('1609191741', 'CIN'),  -- Qiuyang Zhang   | Harbin Medical University      | CN | freq 8094
  ('1104234863', 'CIN'),  -- Wei Zhu         | Changchun Univ Chinese Medicine| CN | freq 1933
  ('1881271336', 'CIN'),  -- Jane Lin        | Western University             | CA | freq 1860
  ('1891629986', 'CI'),   -- Xuan Qu         | Shaanxi Univ Chinese Medicine  | CN | freq  242
  ('1942471636', 'C'),    -- Nipa Gandhi     | United Lincolnshire Hosp NHS   | GB | freq   48
  ('1568438075', 'C'),    -- Kevin Raskin    | UMC Groningen                  | NL | freq    6
  ('1588225213', 'C'),    -- Fabian Grass    | University of Lausanne         | CH | freq    2
  ('1942667647', 'C'),    -- Eli Sapir       | Assuta Medical Center          | IL | freq    2
  ('1740772425', 'C'),    -- Songphol Malakorn| Chulalongkorn University      | TH | freq    1
  ('1780852640', 'N'),    -- Sui Zhang       | Dana-Farber                    | US | freq 8094
  ('1063866069', 'N'),    -- Yusha Liu       | Univ of Chicago Medical Center | US | freq 6265
  ('1538351192', 'N'),    -- Jarvis Chen     | Harvard University             | US | freq 6093
  ('1679815567', 'N'),    -- Zhaomin Xu      | University of Rochester        | US | freq 2982
  ('1457328569', 'N'),    -- Sanghyun Kim    | NIH                            | US | freq 2851
  ('1922742428', 'N'),    -- Gang Zhou       | Augusta University             | US | freq 2568
  ('1053798272', 'N');    -- Jiayun Lu       | Johns Hopkins University       | US | freq 1227

/* Snapshot BEFORE anything changes -- the join is on npi_number, which step 4 clears. */
CREATE TEMP TABLE revert_snapshot AS
SELECT h.id AS hcp_id, h.npi_number, h.npi_source, h.npi_verified_at,
       h.nppes_career_stage_years, r.trigger,
       trim(coalesce(h.first_name,'') || ' ' || coalesce(h.last_name,'')) AS hcp_name,
       coalesce(h.institution_canonical, h.current_institution,
                h.institution_normalized, h.institution_raw) AS institution,
       h.current_country
FROM public.hcps_v2 h
JOIN revert_set r ON r.npi = h.npi_number;

/* Guard: if the set does not resolve to exactly 17 live rows, something moved under us. */
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM revert_snapshot;
  IF n <> 17 THEN
    RAISE EXCEPTION 'revert_snapshot has % rows, expected 17 -- aborting', n;
  END IF;
END $$;

/* -- 1. the original write is marked reverted, NOT removed ------------------- */
UPDATE public.nppes_enrichment_log_v2 l
SET reverted_at = now()
FROM revert_snapshot s
WHERE l.hcp_id = s.hcp_id
  AND l.match_confidence = 'high_confidence'
  AND l.enriched_at >= '2026-09-07'
  AND l.reverted_at IS NULL;

/* -- 2. a withdrawal row per HCP, carrying the trigger ----------------------- */
/* 'withdrawn_write' is a distinct status ON PURPOSE. These are not search misses --
   the registry answered and we accepted the answer, then withdrew it. Calling them
   no_match would lose that, and would make them indistinguishable from the 515 rows
   where NPPES genuinely returned nothing. */
INSERT INTO public.nppes_enrichment_log_v2
  (hcp_id, matched_npi, match_confidence, match_reason, candidates_considered, enriched_at)
SELECT s.hcp_id, s.npi_number, 'withdrawn_write',
       'Write withdrawn 2026-09-08. The candidate filter trusted hcps_v2.country and '
       'ignored the institution string and surname frequency. trigger=' || s.trigger ||
       ' (C=non-US current_country, I=non-US institution string, N=surname block >=1000). '
       'NPI removed from hcps_v2 and hcp_nppes_detail_v2 row deleted. Restorable: the NPI '
       'and the original high_confidence log row are both retained.',
       jsonb_build_object(
         'withdrawn_npi', s.npi_number,
         'trigger', s.trigger,
         'hcp_name', s.hcp_name,
         'institution', s.institution,
         'current_country', s.current_country,
         'prior_npi_source', s.npi_source,
         'prior_npi_verified_at', s.npi_verified_at,
         'prior_nppes_career_stage_years', s.nppes_career_stage_years),
       now()
FROM revert_snapshot s;

/* -- 3. the detail row this run created ------------------------------------- */
DELETE FROM public.hcp_nppes_detail_v2 d
USING revert_snapshot s
WHERE d.hcp_id = s.hcp_id;

/* -- 4. hcps_v2 back to its pre-run state ----------------------------------- */
UPDATE public.hcps_v2 h
SET npi_number = NULL,
    npi_source = NULL,
    npi_verified_at = NULL,
    nppes_career_stage_years = NULL
FROM revert_snapshot s
WHERE h.id = s.hcp_id;

COMMIT;
