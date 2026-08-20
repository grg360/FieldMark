-- REVERT ARTIFACT — pg_get_functiondef captured 2026-08-17, BEFORE the
-- ledger_meta country repoint (migrations/2026_08_17_ledger_meta_country_repoint.sql).
--
-- What this file restores:
--   RS branch  — counted r.country = 'US' AND r.us_rank IS NOT NULL (the STORED
--                column on the rank table), which disagreed with rising_ledger's
--                effective country by one: 57 against the 58 rows it rendered.
--   COM branch — counted hcp_community_scores_v2 where h.country = 'US' (12,970)
--                rather than the qualifying board community_ledger reads (4,913).
--                Discarded by the UI at CohortLedger.tsx:1880, so latent, not live.
--   EST branch — unchanged by that migration; present here only because
--                pg_get_functiondef emits the whole function.
--
-- Restoring this file restores the pre-repoint definition exactly.

CREATE OR REPLACE FUNCTION public.ledger_meta(p_cohort text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ta as (select id from therapeutic_areas where slug = 'nsclc')
  select case upper(p_cohort)
    when 'EST' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object(
          'sci', max(r.scientific_influence_pctile),
          'net', max(r.network_influence_pctile)
        )
      )
      from hcp_established_ranks_v3 r
      join hcps_v2 h on h.id = r.hcp_id, ta
      where r.therapeutic_area_id = ta.id and r.scope_type = 'region' and r.scope_value = 'US'
    )
    when 'RS' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object(
          'scimom', max(r.scientific_momentum_percentile),
          'netmom', max(r.network_momentum_percentile),
          'scivis', max(r.scientific_visibility_percentile),
          'netvis', max(r.network_visibility_percentile)
        )
      )
      from hcp_rising_star_ranks_v3 r
      join hcps_v2 h on h.id = r.hcp_id, ta
      where r.therapeutic_area_id = ta.id and r.country = 'US' and r.us_rank is not null
    )
    when 'COM' then (
      select json_build_object(
        'cohort_total', count(*),
        'ceilings', json_build_object() -- no percentile columns; nothing suppresses
      )
      from hcp_community_scores_v2 c
      join hcps_v2 h on h.id = c.hcp_id, ta
      where c.therapeutic_area_id = ta.id and h.country = 'US'
    )
    else null
  end;
$function$
