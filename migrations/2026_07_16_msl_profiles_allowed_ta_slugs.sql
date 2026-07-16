-- ============================================================================
-- 2026_07_16_msl_profiles_allowed_ta_slugs.sql
-- Entitlement model, READ SIDE: add msl_profiles.allowed_ta_slugs (PARENT slugs)
-- and grandfather every existing user to all current live TAs.
--
-- WHY: foundation for the TopBar TA-switcher. The switcher will show only a
-- user's entitled TAs = allowed_ta_slugs (intersected with live TAs). Existing
-- users grandfather to ALL current TAs (oncology + immunology); new-user
-- registration will set the list later (separate step). Resolver: entitledTASlugs()
-- in frontend/src/lib/api.ts, FAIL-OPEN when the list is empty/null.
--
-- HOW TO RUN: execute each statement standalone in the Supabase SQL editor
-- (or python scripts/utilities/run_sql.py --file migrations/2026_07_16_msl_profiles_allowed_ta_slugs.sql).
-- Do NOT wrap in BEGIN/COMMIT.
--
-- GRANT/RLS: msl_profiles RLS is row-level (auth.uid() = user_id) and the
-- `authenticated` role already holds a TABLE-level SELECT/UPDATE/INSERT grant,
-- which automatically covers new columns. So allowed_ta_slugs needs NO new GRANT
-- and NO policy change — it inherits exactly what states_covered already has.
--
-- SAFE FOR PIPELINES: service_role / postgres bypass RLS; ingestion/scoring
-- scripts (DATABASE_URL) are unaffected.
-- ============================================================================

ALTER TABLE public.msl_profiles ADD COLUMN IF NOT EXISTS allowed_ta_slugs text[] DEFAULT ARRAY[]::text[];

UPDATE public.msl_profiles SET allowed_ta_slugs = ARRAY['oncology', 'immunology'];

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- CONFIG-TABLE READABILITY (required for getLiveTASlugs to work in-browser)
--
-- getLiveTASlugs() needs the live therapeutic_area_ids from
-- therapeutic_area_ingestion_config. That base table has RLS ENABLED with NO
-- policies, so it returns 0 rows to anon AND authenticated (only service_role /
-- postgres bypass RLS) — verified: even an explicit select of scoring_weights /
-- pubmed_query returns 0 rows. It must STAY that way: under public signup,
-- "authenticated" is anyone, and scoring_weights / pubmed_query are core IP.
--
-- So expose ONLY therapeutic_area_id, pre-filtered to the live set, via a view.
-- The view is owned by postgres (this SQL editor session), runs with the owner's
-- rights (default security_invoker = off), and therefore reads the base table
-- despite its RLS — but it has no other columns, so nothing else is reachable.
-- Grant SELECT to authenticated only (the switcher runs post-login). The base
-- table itself remains fully RLS-blocked to authenticated; only the id leaks,
-- which is already implied by the visible UI.
-- ============================================================================

CREATE OR REPLACE VIEW public.live_therapeutic_areas AS
  SELECT therapeutic_area_id
  FROM public.therapeutic_area_ingestion_config
  WHERE is_visible_in_ui = true AND is_active = true;

GRANT SELECT ON public.live_therapeutic_areas TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY (service role / run_sql.py or psql on DATABASE_URL):
--   SELECT count(*) FROM public.msl_profiles WHERE allowed_ta_slugs = ARRAY['oncology','immunology'];
--     -> expect 4
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='msl_profiles' AND column_name='allowed_ta_slugs';
--     -> expect 1 row
--   SELECT count(*) FROM public.live_therapeutic_areas;   -> expect 2 (nsclc + AD ids)
--
-- VERIFY (AUTHENTICATED browser session, e.g. devtools console on app.*):
--   supabase.from('live_therapeutic_areas').select('*')
--     -> 2 rows, each { therapeutic_area_id }, and NO other columns
--   supabase.from('therapeutic_area_ingestion_config').select('therapeutic_area_id,scoring_weights,pubmed_query')
--     -> 0 rows (base table still RLS-blocked; IP columns unreachable)
--   getLiveTASlugs() -> ["oncology","immunology"]  (Hepatology parked -> excluded)
-- ============================================================================
