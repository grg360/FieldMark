-- REVERT ARTIFACT — the definition of hcp_profile_spine() as it stood on the live
-- database immediately before migrations/2026_08_14_profile_spine_board_membership.sql
-- was applied (2026-08-14). Captured with pg_get_functiondef.
--
-- Routes on EXTRACTOR COVERAGE (positions/themes), which is US-scoped, so every
-- non-US HCP falls through to the community spine. Apply this file to undo.

CREATE OR REPLACE FUNCTION public.hcp_profile_spine(p_hcp_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when exists (
    select 1 from hcp_scientific_positions_v1 p
    join therapeutic_areas ta on ta.id = p.therapeutic_area_id and ta.name = 'NSCLC'
    where p.hcp_id = p_hcp_id
  ) or exists (
    select 1 from hcp_research_themes_v2 t
    where t.hcp_id = p_hcp_id and t.display_rank is not null
  ) then 'academic' else 'community' end;
$function$;
