/* get_community_directory_filtered + _count
   Server-side filtered/paginated directory over the AD community practitioner spine.
   Base: community_practitioners (cp)  LEFT JOIN  community_practitioner_payments (pay)
         ON pay.npi_number = cp.npi_number
   Practitioners is the base (~19,351); ~5,200 have no payments row -> null engagement, KEPT.
   Grant posture mirrors get_established_filtered / get_rising_composite_filtered: authenticated only.

   STATUS: fresh migration. Run each CREATE as a standalone statement if using the Supabase SQL
   editor; do NOT wrap in BEGIN/COMMIT. NOTIFY pgrst reloads the PostgREST schema cache. */

-- =============================================================================
-- 1. Directory rows (filtered, sorted, paged)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_community_directory_filtered(
  p_state text,
  p_taxonomy_label text,
  p_ad_only boolean,
  p_search text,
  p_sort text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE(
  npi_number text,
  first_name text,
  last_name text,
  credentials text,
  practice_city text,
  practice_state text,
  primary_taxonomy_label text,
  is_sole_proprietor boolean,
  career_stage_years integer,
  matched_hcp_id uuid,
  total_payments_3yr numeric,
  ad_drug_payments_3yr numeric,
  top_manufacturers jsonb,
  top_drugs jsonb
)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    cp.npi_number,
    cp.first_name,
    cp.last_name,
    cp.credentials,
    cp.practice_city,
    cp.practice_state,
    cp.primary_taxonomy_label,
    cp.is_sole_proprietor,
    cp.career_stage_years,
    cp.matched_hcp_id,
    pay.total_payments_3yr,
    pay.ad_drug_payments_3yr,
    pay.top_manufacturers,
    pay.top_drugs
  FROM community_practitioners cp
  LEFT JOIN community_practitioner_payments pay
    ON pay.npi_number = cp.npi_number
  WHERE (p_state IS NULL OR p_state = 'All' OR cp.practice_state = p_state)
    AND (p_taxonomy_label IS NULL OR p_taxonomy_label = 'All'
         OR cp.primary_taxonomy_label = p_taxonomy_label)
    AND (NOT p_ad_only OR pay.ad_drug_payments_3yr > 0)
    AND (
      p_search IS NULL OR p_search = ''
      OR (cp.first_name || ' ' || cp.last_name) ILIKE '%' || p_search || '%'
      OR cp.practice_city ILIKE '%' || p_search || '%'
    )
  ORDER BY
    CASE WHEN p_sort = 'ad'     THEN pay.ad_drug_payments_3yr END DESC NULLS LAST,
    CASE WHEN p_sort = 'total'  THEN pay.total_payments_3yr   END DESC NULLS LAST,
    CASE WHEN p_sort = 'tenure' THEN cp.career_stage_years    END DESC NULLS LAST,
    CASE WHEN p_sort = 'name'   THEN cp.last_name  END ASC,
    CASE WHEN p_sort = 'name'   THEN cp.first_name END ASC,
    cp.last_name ASC, cp.first_name ASC, cp.npi_number ASC   -- deterministic paging tiebreak
  LIMIT p_limit OFFSET p_offset;
$function$;

-- =============================================================================
-- 2. Result count (same filters; no sort/page)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_community_directory_filtered_count(
  p_state text,
  p_taxonomy_label text,
  p_ad_only boolean,
  p_search text
)
RETURNS integer
LANGUAGE sql
STABLE
AS $function$
  SELECT COUNT(*)::int
  FROM community_practitioners cp
  LEFT JOIN community_practitioner_payments pay
    ON pay.npi_number = cp.npi_number
  WHERE (p_state IS NULL OR p_state = 'All' OR cp.practice_state = p_state)
    AND (p_taxonomy_label IS NULL OR p_taxonomy_label = 'All'
         OR cp.primary_taxonomy_label = p_taxonomy_label)
    AND (NOT p_ad_only OR pay.ad_drug_payments_3yr > 0)
    AND (
      p_search IS NULL OR p_search = ''
      OR (cp.first_name || ' ' || cp.last_name) ILIKE '%' || p_search || '%'
      OR cp.practice_city ILIKE '%' || p_search || '%'
    );
$function$;

-- =============================================================================
-- 3. Grants (mirror established/rising: authenticated only)
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_community_directory_filtered(text, text, boolean, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_community_directory_filtered_count(text, text, boolean, text) TO authenticated;

-- =============================================================================
-- 4. Reload PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';
