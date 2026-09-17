CREATE TEMP TABLE b_snap AS
SELECT ta.slug, b.hcp_id, b.qualifies, b.evidence_tier
FROM public.community_board_v1 b
JOIN public.therapeutic_areas ta ON ta.id = b.ta_id;

CREATE TEMP TABLE e_snap AS
SELECT ta.slug, e.hcp_id, e.tier
FROM public.hcp_evidence_tier_v1 e
JOIN public.therapeutic_areas ta ON ta.id = e.ta_id
WHERE ta.slug = 'colorectal-cancer';

ANALYZE b_snap;

ANALYZE e_snap;

SELECT 'A. board members' AS section,
       slug,
       count(*)                          AS cohort_rows,
       count(*) FILTER (WHERE qualifies) AS board_members
FROM b_snap
GROUP BY 1, 2
ORDER BY 2;

SELECT 'B. on-board tiers' AS section,
       slug,
       coalesce(evidence_tier, '(null)') AS tier,
       count(*) FILTER (WHERE qualifies) AS board_members,
       count(*)                          AS cohort_rows
FROM b_snap
GROUP BY 1, 2, 3
ORDER BY 2, 3;

SELECT 'C. crc evidence vs membership' AS section,
       e.tier,
       count(*)                                AS in_cohort,
       count(*) FILTER (WHERE b.qualifies)     AS on_board,
       count(*) FILTER (WHERE NOT b.qualifies) AS still_excluded
FROM e_snap e
LEFT JOIN b_snap b ON b.hcp_id = e.hcp_id AND b.slug = e.slug
WHERE e.tier IN ('anchored', 'supported')
GROUP BY 1, 2
ORDER BY 2;

SELECT 'D. anchor_grade by drug_group' AS section,
       drug_group,
       anchor_grade,
       count(*)                  AS rows,
       count(DISTINCT hcp_id)    AS hcps
FROM public.hcp_part_d_oncology_v1
WHERE anchor_grade IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 2, 3;

SELECT 'E. part d table size' AS section,
       count(*)               AS rows,
       count(DISTINCT hcp_id) AS hcps,
       min(program_year)      AS first_year,
       max(program_year)      AS last_year
FROM public.hcp_part_d_oncology_v1;