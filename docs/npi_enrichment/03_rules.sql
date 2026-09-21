/* ==== 03. THE TWO APPROVED RULES -- SUPPORTING DB OBJECTS ====
   Written 2026-09-08. APPLIED. Both objects are additive; nothing is dropped, altered or
   backfilled, and no existing row changes.

   APPLIED STATUS, VERIFIED AGAINST THE LIVE DATABASE 2026-09-21. The header previously
   read NOT YET APPLIED; that was true when it was written and is not true now.
     * hcp_surname_block_v1         EXISTS (view), 124,476 surname blocks
     * hcp_country_disagreement_v1  EXISTS (table), POPULATED -- 4,050 rows:
         current_country  2,714
         both               930
         institution        406
   Not TA-scoped, as the VERIFY block below says, so the total exceeds the 1,299
   CRC-linked disagreements measured on 2026-09-08.

   Re-running is safe and is a no-op: the view is CREATE OR REPLACE, the table is
   CREATE TABLE IF NOT EXISTS, and the INSERT carries ON CONFLICT (hcp_id) DO NOTHING.

   targeted_nppes_enrichment.py already implements both rules and DEGRADES LOUDLY without
   these: the surname gate prints a WARNING and does not run rather than silently treating
   every surname as rare. That gate is now live rather than pending. */


/* -- A. SURNAME BLOCK FREQUENCIES -------------------------------------------
   Feeds the confirmation gate at block >= 10.

   WHY A VIEW AND NOT A SCRIPT-SIDE COUNT: the frequency is defined over ALL of hcps_v2
   (381k rows), not over the candidate set, so the script cannot compute it from what it
   already loads. Counting per candidate over PostgREST would be ~700 extra round-trips a
   run. hcps_v2.last_name_lower already exists and is the same key dedup_detect blocks on.

   A plain view, not materialised: it is read once per run against an indexed column, and
   a materialised copy would go stale silently every time an HCP is created. */
CREATE OR REPLACE VIEW public.hcp_surname_block_v1 AS
SELECT last_name_lower,
       count(*)::integer AS freq
FROM public.hcps_v2
WHERE last_name_lower IS NOT NULL AND last_name_lower <> ''
GROUP BY last_name_lower;

COMMENT ON VIEW public.hcp_surname_block_v1 IS
  'How many hcps_v2 rows share each normalised surname. Read by '
  'targeted_nppes_enrichment.py to gate name-only NPPES matches: at block >= 10 the '
  'measured ambiguity rate jumps from 12.9% to 57.1%, so a single registry result stops '
  'being strong evidence and requires an independent confirming signal.';

GRANT SELECT ON public.hcp_surname_block_v1 TO anon, authenticated, service_role;


/* -- B. THE COUNTRY DISAGREEMENTS, RECORDED NOT ABSORBED ---------------------
   1,299 of the 14,405 CRC-linked HCPs flagged country='US'/'USA' are contradicted by
   another column -- 701 by a resolved non-US institution, 1,128 by current_country, 1,299
   by either. That is 9.0% of the US-flagged population.

   The enrichment filter now skips them, but skipping is not the same as knowing. If the
   filter simply absorbed the contradiction, the next consumer of hcps_v2.country would
   inherit the identical bug, and the defect would be invisible because the one process
   that noticed it had quietly routed around it. So the disagreement is written down, with
   both sides recorded and NEITHER treated as the winner -- this table asserts that the two
   columns disagree, not which one is right.

   Same shape as institution_state_source and hcp_therapeutic_areas_v2.source: the
   provenance travels as data. */
CREATE TABLE IF NOT EXISTS public.hcp_country_disagreement_v1 (
  hcp_id                uuid PRIMARY KEY REFERENCES public.hcps_v2(id) ON DELETE CASCADE,
  country               text,        -- hcps_v2.country, the column the filter used to trust
  current_country       text,        -- affiliation-derived
  institution_name      text,        -- the string that resolved
  institution_country   text,        -- institution_geo_lookup.country_code
  disagreement          text NOT NULL,  -- 'institution' | 'current_country' | 'both'
  detected_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hcp_country_disagreement_v1 IS
  'HCPs whose country column says US while their resolved institution country or '
  'current_country says otherwise. A record of the contradiction, NOT a resolution of it: '
  'neither side is treated as correct here. Populated read-only from existing columns.';

GRANT SELECT ON public.hcp_country_disagreement_v1 TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON public.hcp_country_disagreement_v1 TO service_role;

INSERT INTO public.hcp_country_disagreement_v1
  (hcp_id, country, current_country, institution_name, institution_country, disagreement)
SELECT h.id, h.country, h.current_country, inst.nm, inst.cc,
       CASE WHEN inst.cc IS NOT NULL AND inst.cc <> 'US'
                 AND h.current_country IS NOT NULL AND upper(h.current_country) NOT IN ('US','USA')
            THEN 'both'
            WHEN inst.cc IS NOT NULL AND inst.cc <> 'US' THEN 'institution'
            ELSE 'current_country' END
FROM public.hcps_v2 h
CROSS JOIN LATERAL (
  SELECT n.nm,
         (SELECT g.country_code FROM public.institution_geo_lookup g
           WHERE g.institution_display_name = n.nm LIMIT 1) AS cc
  FROM (SELECT coalesce(h.institution_canonical, h.current_institution,
                        h.institution_normalized, h.institution_raw) AS nm) n
) inst
WHERE upper(coalesce(h.country,'')) IN ('US','USA')
  AND ((inst.cc IS NOT NULL AND inst.cc <> 'US')
    OR (h.current_country IS NOT NULL AND upper(h.current_country) NOT IN ('US','USA')))
ON CONFLICT (hcp_id) DO NOTHING;


/* -- VERIFY -----------------------------------------------------------------
   Expected for the CRC-linked population, measured 2026-09-08:
     institution      701
     current_country  1128
     either           1299
   The table is NOT TA-scoped -- the defect is in hcps_v2, not in colorectal -- so its
   total will exceed 1,299. The CRC slice below is the comparable number. */

SELECT disagreement, count(*) FROM public.hcp_country_disagreement_v1 GROUP BY 1 ORDER BY 2 DESC;

SELECT count(DISTINCT d.hcp_id) AS crc_linked_disagreements
FROM public.hcp_country_disagreement_v1 d
JOIN public.hcp_therapeutic_areas_v2 t ON t.hcp_id = d.hcp_id
JOIN public.therapeutic_areas ta ON ta.id = t.therapeutic_area_id AND ta.slug = 'colorectal-cancer';
