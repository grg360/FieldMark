-- ============================================================================
-- 2026_07_09_ad_tables_rls_lockdown.sql
-- Enable RLS + authenticated-only read on the four new Atopic Dermatitis tables.
--
-- WHY: These four tables shipped with RLS DISABLED and no policies, so they were
-- readable by the public anon key (which is committed in the frontend bundle).
-- That exposed Sunshine Act payment detail on ~19k named practitioners to
-- unauthenticated callers. This aligns them with hcp_established_ranks_v3, whose
-- policy is: SELECT TO authenticated USING (true).
--
-- HOW TO RUN: execute each block as a standalone statement in the Supabase SQL
-- editor (or: python scripts/utilities/run_sql.py --file migrations/2026_07_09_ad_tables_rls_lockdown.sql).
-- Do NOT wrap in BEGIN/COMMIT.
--
-- SAFE FOR PIPELINES: service_role / postgres bypass RLS, so ingestion and
-- scoring scripts (which connect via DATABASE_URL) are unaffected.
--
-- DECISION NOTE: all four are set to `authenticated`, matching hcp_established_ranks_v3.
-- The legacy hcp_rising_star_ranks_v3 is instead `public`-read. If you want the AD
-- Rising feed readable pre-login to match that precedent, change `TO authenticated`
-- -> `TO public` on blocks 1 and 2 ONLY. Keep 3 and 4 authenticated; never make
-- community_practitioner_payments public.
-- ============================================================================

-- 1. hcp_rising_composite_v1 -------------------------------------------------
ALTER TABLE public.hcp_rising_composite_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hcp_rising_composite_v1_authenticated_read" ON public.hcp_rising_composite_v1;
CREATE POLICY "hcp_rising_composite_v1_authenticated_read"
  ON public.hcp_rising_composite_v1 FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.hcp_rising_composite_v1 FROM anon;

-- 2. hcp_scientific_emergence_v1 ---------------------------------------------
ALTER TABLE public.hcp_scientific_emergence_v1 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hcp_scientific_emergence_v1_authenticated_read" ON public.hcp_scientific_emergence_v1;
CREATE POLICY "hcp_scientific_emergence_v1_authenticated_read"
  ON public.hcp_scientific_emergence_v1 FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.hcp_scientific_emergence_v1 FROM anon;

-- 3. community_practitioners -------------------------------------------------
ALTER TABLE public.community_practitioners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_practitioners_authenticated_read" ON public.community_practitioners;
CREATE POLICY "community_practitioners_authenticated_read"
  ON public.community_practitioners FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.community_practitioners FROM anon;

-- 4. community_practitioner_payments  (Sunshine Act $$ - most sensitive) ------
ALTER TABLE public.community_practitioner_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_practitioner_payments_authenticated_read" ON public.community_practitioner_payments;
CREATE POLICY "community_practitioner_payments_authenticated_read"
  ON public.community_practitioner_payments FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.community_practitioner_payments FROM anon;

-- 5. Reload PostgREST schema cache -------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
--   service role (run_sql.py): still populated, e.g.
--     SELECT count(*) FROM community_practitioner_payments;
--   anon key via PostgREST: should now return HTTP 200, Content-Range */0, body []
--     GET /rest/v1/community_practitioner_payments?select=id&limit=1
-- ============================================================================
