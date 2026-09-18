-- 63 — community_ledger: return part_b_present, a TA-CORRECT Part B presence fact.
-- Authored 2026-09-17. NOT YET APPLIED.
--
-- THE DEFECT. The ledger's MEDICARE / PART B cell rendered `patient_volume > 0`.
-- patient_volume is not a Part B presence flag; it is a beneficiary COUNT written by
-- scripts/score/community_scoring.py out of hcp_medicare_by_ta_v2, and that table holds:
--
--     hepatology   15,106 rows
--     nsclc         4,413 rows
--     rare-disease      1 row
--     colorectal-cancer  — NONE
--
-- community_scoring's parse_float(..., 0.0) turns the missing row into an EXPLICIT ZERO,
-- community_board_v1 coalesces null volume to 0, and the cell's `> 0` collapses it a third
-- time. Result: all 330 anchored colorectal HCPs printed a Part B dash — for the Part B
-- claims that are the entire definition of their tier. Measured the same day, every one of
-- those 330 has rows in hcp_hcpcs_detail against the colorectal code set (3–19 rows each,
-- 34–561 beneficiaries) and hcp_administered_volume returns 'matched' for 330 of 330.
--
-- THE FIX HERE IS THE DISPLAY HALF ONLY. part_b_present answers "does this HCP have Part B
-- claims against THIS TA's code set", which is TA-correct by construction and is the
-- question the cell was always asking. It does NOT touch patient_volume.
--
-- DELIBERATELY NOT DOING THE UPSTREAM HALF. Populating hcp_medicare_by_ta_v2 for colorectal
-- would move patient_volume, patient_volume feeds community_board_v1.qualifies, and those
-- 330 carry 34–561 beneficiaries — so building it would admit people to the board on volume
-- alone and change MEMBERSHIP. That is a separate measurement and a separate decision.
--
-- WHERE THE EXISTS SITS, AND WHY. In the `rows` projection over `page`, not in `base`.
-- base is every qualifying row for the TA (13,864 for colorectal) and exists only to be
-- counted; page is at most p_limit rows. Putting the lookup in base would cost ~13.8k index
-- probes per call to answer a question about ~1,000 of them.
--
-- BLAST RADIUS, MEASURED 2026-09-17 ACROSS BOTH BOARD TAs. The new test is a strict
-- SUPERSET of the old one — zero rows in either TA lose a check:
--
--     slug               dash→✓   ✓→dash
--     colorectal-cancer   1,678        0
--     nsclc                 785        0
--
-- So this only ever converts a false dash into a true check. Lung's ledger DOES change:
-- 144 rows on the default anchored+supported view gain a PART B ✓ (136 anchored, 8
-- supported). Every one of them bills Part B against the NSCLC code set and was reading a
-- false dash for the same reason colorectal was — the defect was never colorectal-only, it
-- was merely total there. If that lung movement is not wanted, this block is the thing to
-- hold back; the frontend falls back to the old test whenever the column is absent.
--
-- APPLY:
--   $env:PYTHONIOENCODING = "utf-8"
--   python scripts/utilities/run_sql.py --file docs/crc_community/63_ledger_part_b_present.sql
--
-- NO DROP NEEDED. The argument list is unchanged, so CREATE OR REPLACE replaces the
-- 7-argument overload in place and does not create a second one. The 6-argument pinned shim
-- is untouched and keeps its current behaviour.

CREATE OR REPLACE FUNCTION public.community_ledger(p_ta_id uuid, p_limit integer DEFAULT 1000, p_after_tier_priority integer DEFAULT 0, p_after_patient_volume numeric DEFAULT 0, p_after_hcp_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, p_tiers text[] DEFAULT NULL::text[], p_states text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- ta_slug joins sel rather than sitting inline at the two narrative subqueries: one
  -- resolution, one place to read, and no slug literal anywhere in this body.
  with sel as (select coalesce(p_tiers, array['anchored','supported']) as tiers,
                      (select ta.slug from therapeutic_areas ta where ta.id = p_ta_id) as ta_slug),
  base as (
    select b.hcp_id,
           b.evidence_tier,
           coalesce(b.patient_volume, 0) as patient_volume,
           b.part_d_present,
           case b.evidence_tier when 'anchored' then 1 when 'supported' then 2
                                when 'heme_dominant' then 3 when 'candidate' then 4
                                else 5 end as tier_priority,
           h.first_name, h.last_name, h.npi_specialty as specialty,
           h.nppes_practice_city as city, h.nppes_practice_state as state,
           h.nppes_career_stage_years as years,
           e.recurrence_band, e.supported_evidence, e.supported_evidence_rank,
           e.lung_weighted, e.anchor_stem, e.anchor_stems, e.anchor_years
    from community_board_v1 b
    join hcps_v2 h on h.id = b.hcp_id
    -- ON BOTH KEYS. e.ta_id = b.ta_id rather than = p_ta_id: the tier is tied to the board
    -- row it decorates, so it stays correct no matter what the WHERE below is later asked
    -- to do. 7,513 HCPs hold a tier in more than one TA; on hcp_id alone every one of them
    -- would carry another TA's evidence into this row.
    left join hcp_evidence_tier_v1 e on e.hcp_id = b.hcp_id and e.ta_id = b.ta_id
    where b.qualifies
      and b.ta_id = p_ta_id
      and (cardinality(p_states) = 0 or h.nppes_practice_state = any(p_states))
  ),
  filtered as (
    select * from base cross join sel where base.evidence_tier = any(sel.tiers)
  ),
  page as (
    select * from filtered f
    where (f.tier_priority, -f.patient_volume, f.hcp_id)
        > (p_after_tier_priority, -p_after_patient_volume, p_after_hcp_id)
    order by f.tier_priority, -f.patient_volume, f.hcp_id
    limit p_limit
  )
  select json_build_object(
    'cohort_total',   (select count(*) from base),
    'filtered_total', (select count(*) from filtered),
    'tier_counts',    (select json_object_agg(evidence_tier, cnt) from (select evidence_tier, count(*) cnt from base group by evidence_tier) g),
    'tiers',          (select tiers from sel),
    'states',         p_states,
    'rows', (
      select coalesce(json_agg(row_to_json(t) order by t.tier_priority, t.patient_volume desc, t.hcp_id), '[]'::json) from (
        select page.hcp_id, page.tier_priority, page.patient_volume, page.part_d_present,
               -- PART B PRESENCE, SCOPED TO THIS TA'S OWN CODE SET. p_ta_id and not a
               -- literal, and not page's (absent) ta_id: base already constrains
               -- b.ta_id = p_ta_id, so every row on this page belongs to that TA.
               --
               -- NOT THE SAME FACT AS patient_volume, and the two must not be conflated
               -- again: this is "are there claims", that is "how many beneficiaries", and
               -- the count is unpopulated for some board TAs while this is computable for
               -- every TA that has a code set. A TA with an EMPTY ta_hcpcs_codes returns
               -- false here for everyone, which reads as absence rather than as
               -- cannot-assess -- the same trap hcp_administered_volume guards with its
               -- no_code_set state. Both board TAs have a code set (nsclc 49, colorectal
               -- 10); revisit this if a third mounts without one.
               (exists (select 1
                          from hcp_hcpcs_detail d
                          join ta_hcpcs_codes k
                            on k.hcpcs_code = d.hcpcs_code
                           and k.therapeutic_area_id = p_ta_id
                         where d.hcp_id = page.hcp_id)) as part_b_present,
               page.first_name, page.last_name, page.specialty, page.city, page.state,
               s.total_payments_lifetime     as eng,
               s.distinct_companies_lifetime as companies,
               page.years,
               page.evidence_tier as tier, page.recurrence_band, page.supported_evidence,
               page.supported_evidence_rank, page.lung_weighted,
               page.anchor_stem, page.anchor_stems, page.anchor_years,
               (select n.narrative_text from hcp_narratives_v2 n
                 where n.hcp_id = page.hcp_id and n.therapeutic_area_slug = (select ta_slug from sel)
                   and n.cohort = 'community'
                 limit 1) as summary,
               (select narrative_is_current(n.cohort, n.prompt_version) from hcp_narratives_v2 n
                 where n.hcp_id = page.hcp_id and n.therapeutic_area_slug = (select ta_slug from sel)
                   and n.cohort = 'community'
                 limit 1) as summary_is_current
        from page
        left join hcp_open_payments_summary_v2 s on s.hcp_id = page.hcp_id
      ) t
    )
  );
$function$;

-- VERIFY. Expect for colorectal-cancer: 330 anchored rows, part_b_present true on all 330,
-- patient_volume 0 on all 330 -- i.e. the cell now says what the tier already implied.
-- For nsclc: anchored 980 rows, 950 true (up from the 814 that patient_volume > 0 showed).
with ta as (select id, slug from therapeutic_areas where slug in ('nsclc','colorectal-cancer'))
select ta.slug,
       (r->>'tier') as tier,
       count(*)                                                    as rows_,
       count(*) filter (where (r->>'part_b_present')::boolean)      as part_b_true,
       count(*) filter (where (r->>'patient_volume')::numeric > 0)  as old_test_true
from ta
cross join lateral json_array_elements(
  (community_ledger(ta.id, 20000, 0, 0, '00000000-0000-0000-0000-000000000000',
                    array['anchored','supported','candidate','unresolved','heme_dominant'])->'rows')
) as r
group by 1, 2
order by 1, 2;
