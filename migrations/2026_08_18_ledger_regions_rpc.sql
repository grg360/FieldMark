-- ledger_regions() — the territory menu's source of fact.
-- Date: 2026-08-18. Branch: resurfacing.
-- Revert: sql/revert/2026_08_18_ledger_regions_rpc_REVERT.sql
--
-- WHY AN RPC AND NOT A TABLE READ. `regions` and `region_countries` both have RLS
-- ENABLED WITH ZERO POLICIES while SELECT is granted to anon and authenticated.
-- Under Postgres that grant is inert: a role that does not bypass RLS gets zero
-- rows. Nothing has failed to date because every existing reader is either a
-- SECURITY DEFINER function or the scorer's own connection. A direct client read
-- would render an EMPTY territory menu, silently.
--
-- The fix for that is NOT to add a policy as a side effect of shipping a menu:
-- RLS-with-no-policy is a state someone chose, and rediscovering why belongs in its
-- own change (logged: docs/REGIONS_FRONTEND_DUPLICATE_LIST.md). SECURITY DEFINER
-- here matches how every other client read on this surface already works.
--
-- SHAPE. Every region, with its countries, ordered as the menu should render. The
-- caller filters -- the tree wants aggregates for its parent nodes, and skips the
-- global and catchall rows, but other callers may want the whole list, and one RPC
-- returning reference data is cheaper than three that each answer half.
--
-- countries is ORDER BY country_code, i.e. stable but not display order; the ledger
-- applies its own "primary markets first, then alphabetical" ordering per region.

BEGIN;

CREATE OR REPLACE FUNCTION public.ledger_regions()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(json_agg(row_to_json(t) order by t.sort_order, t.region_key), '[]'::json)
  from (
    select r.region_key,
           r.display_name,
           r.sort_order,
           r.is_global,
           r.is_catchall,
           r.aggregate_scope,
           coalesce(
             (select array_agg(rc.country_code order by rc.country_code)
              from region_countries rc where rc.region_key = r.region_key),
             '{}'::text[]
           ) as countries
    from regions r
  ) t;
$function$;

-- Explicit grants: a new function is not reachable from PostgREST without them, and
-- SECURITY DEFINER without a grant is a function nobody can call.
GRANT EXECUTE ON FUNCTION public.ledger_regions() TO anon, authenticated, service_role;

COMMIT;
