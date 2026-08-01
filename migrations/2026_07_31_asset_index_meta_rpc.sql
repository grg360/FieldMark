-- Drugs (Assets) Index — computed corpus meta, killing the hardcoded/stale
-- CORPUS_INDEX_DATE ("2026-07-24") and NSCLC_CORPUS_TOTAL (85302) drift.
--
--   index_date   = the real build timestamp of the asset-match corpus (max built_at
--                  on asset_publication_v1). The prior hardcoded "2026-07-24" was already
--                  5 days behind the real 2026-07-29 build.
--   corpus_total = the live NSCLC corpus size — publications ingested under source TA
--                  'nsclc', matching how scripts/assets/build_asset_matches.py scopes the
--                  match corpus (source_therapeutic_area_id, not the topic mapping).
--
-- SECURITY DEFINER: asset_publication_v1 and publications_v2 both have RLS enabled and the
-- index page runs as anon; this mirrors the existing asset_group_distinct /
-- asset_density_tiers RPCs (same reason). Read-only, STABLE, additive.

CREATE OR REPLACE FUNCTION public.asset_index_meta()
RETURNS TABLE (index_date date, corpus_total bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT max(built_at)::date FROM public.asset_publication_v1),
    (SELECT count(*) FROM public.publications_v2
       WHERE source_therapeutic_area_id =
             (SELECT id FROM public.therapeutic_areas WHERE slug = 'nsclc'));
$$;

GRANT EXECUTE ON FUNCTION public.asset_index_meta() TO anon, authenticated, service_role;
