-- ============================================================================
-- 2026_07_17_invite_system_stage3a_addendum_get_app_config.sql
-- STAGE 3a ADDENDUM — get_app_config(), the missing READ side of the kill-switch.
--
-- WHY THIS EXISTS (a gap the audit's six-RPC list did not cover):
-- app_config is client-locked (RLS on, no policies, REVOKE ALL from anon and
-- authenticated), so the admin page CANNOT read it via .from(). The only two
-- functions that expose it -- toggle_signups() and set_signup_cap() -- are both
-- WRITES that happen to return the resulting config. With no read RPC, the admin
-- page has no way to render current server state on mount, and the only way to
-- "read" the switch would be to write it -- which would silently flip signups on
-- every page load. Hence a read-only seventh function.
--
-- Same load-bearing invariant as the other six (audit §6):
--   * SECURITY DEFINER, owned by postgres (app_config is client-locked).
--   * FIRST statement is the is_admin() gate.
--   * No actor argument -- is_admin() reads auth.uid().
--   * EXECUTE revoked from public, granted to authenticated.
-- STABLE, and it writes nothing: reading the kill-switch must never move it.
--
-- Returns the same jsonb shape as toggle_signups()/set_signup_cap() so the page
-- renders one config type from every call.
--
-- HOW TO RUN: standalone statements in the Supabase SQL editor. No BEGIN/COMMIT.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_app_config();

CREATE FUNCTION public.get_app_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row app_config%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row FROM app_config WHERE id = true;

  RETURN jsonb_build_object(
    'signups_enabled', v_row.signups_enabled,
    'global_signup_cap', v_row.global_signup_cap,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_app_config() FROM public;
GRANT EXECUTE ON FUNCTION public.get_app_config() TO authenticated;

NOTIFY pgrst, 'reload schema';
