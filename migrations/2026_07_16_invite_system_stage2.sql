-- ============================================================================
-- 2026_07_16_invite_system_stage2.sql
-- STAGE 2 — user-facing signup/wizard support. Builds ON Stage 1; does NOT alter
-- any Stage 1 security object (redeem_invite, triggers, policies, admin/config).
--
-- 1. msl_profiles.job_function  — segmentation signal (medical affairs / clinical
--    development / commercial / other). USER-EDITABLE, NOT locked (the column-lock
--    trigger guards only allowed_ta_slugs / invited_by).
-- 2. check_invite(code)         — read-only validity pre-check for the signup UI
--    (so a bad/exhausted code is caught before account creation). Returns a bare
--    boolean; reveals no invite details. Callable pre-auth (anon) + authenticated.
--
-- HOW TO RUN: standalone statements in the Supabase SQL editor. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE public.msl_profiles ADD COLUMN IF NOT EXISTS job_function text;

CREATE OR REPLACE FUNCTION public.check_invite(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM invites
    WHERE code = p_code AND is_active = true AND uses_remaining > 0
  );
$$;

REVOKE EXECUTE ON FUNCTION public.check_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_invite(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
