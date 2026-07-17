-- ============================================================================
-- 2026_07_17_invite_system_stage3a_admin_rpcs.sql
-- STAGE 3a — the admin action layer (server-side RPCs only; NO frontend).
-- Per docs/ADMIN_PAGE_AUDIT.md §2 (the RPC table) and §7 (build plan, item 1).
--
-- Builds ON Stage 1 (admin_users, is_admin(), app_config, invites,
-- invite_redemptions, the column-lock trigger) and Stage 2 (job_function).
-- Alters NO existing security object.
--
-- THE LOAD-BEARING INVARIANT (audit §6) — every function below obeys it:
--   * SECURITY DEFINER, owned by postgres, so it can reach the client-locked
--     objects (app_config, admin_users, invite_redemptions, auth.users) and
--     bypass the own-row RLS on msl_profiles / the SELECT-own policy on invites.
--   * Because the definer bypass makes the gate the ONLY protection, the FIRST
--     statement of every function is:
--         IF NOT is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
--   * NO function takes an "actor" argument. The actor is ALWAYS auth.uid().
--     (The audit sketched mint_invite(p_inviter uuid) — deliberately dropped:
--     a client-supplied inviter id would let a caller act as someone else.)
--   * EXECUTE revoked from public, granted to authenticated. The grant is not
--     the fence — is_admin() is. authenticated is simply who may attempt a call.
--
-- The six minimum-for-launch RPCs (audit §7):
--   1. mint_invite(p_quota, p_note)  -> new code
--   2. list_invites()                -> all invites + redemption counts
--   3. referral_graph()              -> the edges query from audit §4
--   4. toggle_signups(p_enabled)     -> kill-switch
--   5. set_signup_cap(p_cap)         -> global cap
--   6. list_users()                  -> all profiles + email from auth.users
--
-- PREREQUISITE (audit §7 bootstrap): admin_users must be seeded, or every
-- function here raises 'not authorized' for everyone, including Garrett:
--   INSERT INTO public.admin_users (user_id) VALUES ('f0a8352f-...');
--
-- HOW TO RUN: standalone statements in the Supabase SQL editor (runs as
-- postgres). Do NOT wrap in BEGIN/COMMIT. Then run the companion
-- 2026_07_17_invite_system_stage3a_verify.sql — confirm the non-admin half
-- RAISES on all six before any frontend is built.
-- ============================================================================


-- 1. mint_invite() -----------------------------------------------------------
-- Admin mints an invite in their OWN name (inviter_id = auth.uid()). Code entropy
-- matches redeem_invite()'s auto-mint: a 32-hex-char v4 uuid, unguessable.

DROP FUNCTION IF EXISTS public.mint_invite(int, text);

CREATE FUNCTION public.mint_invite(p_quota int DEFAULT 10, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_quota IS NULL OR p_quota < 1 THEN
    RAISE EXCEPTION 'quota must be at least 1';
  END IF;

  v_code := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO invites (code, inviter_id, uses_remaining, note)
  VALUES (v_code, auth.uid(), p_quota, p_note);

  RETURN v_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mint_invite(int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mint_invite(int, text) TO authenticated;


-- 2. list_invites() ----------------------------------------------------------
-- ALL invites, not just own — bypasses the invites_select_own policy (Stage 1 §4).
-- redemption_count is a scalar subquery, so an invite with 0 redemptions still
-- appears (a JOIN + GROUP BY would need an outer join to say the same thing).

DROP FUNCTION IF EXISTS public.list_invites();

CREATE FUNCTION public.list_invites()
RETURNS TABLE (
  code text,
  inviter_id uuid,
  inviter_name text,
  uses_remaining int,
  is_active boolean,
  note text,
  created_at timestamptz,
  redemption_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT i.code,
         i.inviter_id,
         nullif(trim(coalesce(ip.first_name, '') || ' ' || coalesce(ip.last_name, '')), '') AS inviter_name,
         i.uses_remaining,
         i.is_active,
         i.note,
         i.created_at,
         (SELECT count(*) FROM invite_redemptions r WHERE r.invite_code = i.code) AS redemption_count
  FROM invites i
  LEFT JOIN msl_profiles ip ON ip.user_id = i.inviter_id
  ORDER BY i.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_invites() FROM public;
GRANT EXECUTE ON FUNCTION public.list_invites() TO authenticated;


-- 3. referral_graph() --------------------------------------------------------
-- The edges query from audit §4, verbatim in shape. invite_redemptions is
-- client-locked (REVOKE ALL, Stage 1 §4), so this is the only read path.
-- Root nodes are rows where inviter_id IS NULL (admin-seeded invites) — hence
-- the LEFT JOINs on both sides.

DROP FUNCTION IF EXISTS public.referral_graph();

CREATE FUNCTION public.referral_graph()
RETURNS TABLE (
  redeemed_by uuid,
  inviter_id uuid,
  inviter_name text,
  inviter_company text,
  invitee_name text,
  invitee_company text,
  job_function text,
  invite_code text,
  redeemed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT r.redeemed_by,
         r.inviter_id,
         nullif(trim(coalesce(ip.first_name, '') || ' ' || coalesce(ip.last_name, '')), '') AS inviter_name,
         ip.company AS inviter_company,
         nullif(trim(coalesce(rp.first_name, '') || ' ' || coalesce(rp.last_name, '')), '') AS invitee_name,
         rp.company AS invitee_company,
         rp.job_function,
         r.invite_code,
         r.redeemed_at
  FROM invite_redemptions r
  LEFT JOIN msl_profiles ip ON ip.user_id = r.inviter_id
  LEFT JOIN msl_profiles rp ON rp.user_id = r.redeemed_by
  ORDER BY r.redeemed_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.referral_graph() FROM public;
GRANT EXECUTE ON FUNCTION public.referral_graph() TO authenticated;


-- 4. toggle_signups() --------------------------------------------------------
-- The kill-switch. app_config is client-locked (REVOKE ALL, Stage 1 §2), so this
-- RPC is the only write path. Returns the resulting config so the caller renders
-- server truth rather than its own optimistic guess.

DROP FUNCTION IF EXISTS public.toggle_signups(boolean);

CREATE FUNCTION public.toggle_signups(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row app_config%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'enabled must be true or false';
  END IF;

  UPDATE app_config
     SET signups_enabled = p_enabled,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'signups_enabled', v_row.signups_enabled,
    'global_signup_cap', v_row.global_signup_cap,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_signups(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.toggle_signups(boolean) TO authenticated;


-- 5. set_signup_cap() --------------------------------------------------------
-- NULL is a meaningful value here: it means "no cap" (redeem_invite() skips the
-- cap check when global_signup_cap IS NULL). So NULL is accepted, unlike in
-- toggle_signups above; only a negative cap is rejected.

DROP FUNCTION IF EXISTS public.set_signup_cap(int);

CREATE FUNCTION public.set_signup_cap(p_cap int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row app_config%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_cap IS NOT NULL AND p_cap < 0 THEN
    RAISE EXCEPTION 'cap cannot be negative';
  END IF;

  UPDATE app_config
     SET global_signup_cap = p_cap,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = true
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'signups_enabled', v_row.signups_enabled,
    'global_signup_cap', v_row.global_signup_cap,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_signup_cap(int) FROM public;
GRANT EXECUTE ON FUNCTION public.set_signup_cap(int) TO authenticated;


-- 6. list_users() ------------------------------------------------------------
-- ALL profiles (bypasses own-row RLS) joined to auth.users for email — auth.users
-- is unreachable from any client context, definer-only (audit §4 caveat).
-- This is the PII surface: it is is_admin-gated and nothing else guards it.

DROP FUNCTION IF EXISTS public.list_users();

CREATE FUNCTION public.list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  company text,
  job_function text,
  allowed_ta_slugs text[],
  invited_by uuid,
  invited_by_name text,
  is_admin boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT p.user_id,
         u.email::text,
         p.first_name,
         p.last_name,
         p.company,
         p.job_function,
         p.allowed_ta_slugs,
         p.invited_by,
         nullif(trim(coalesce(bp.first_name, '') || ' ' || coalesce(bp.last_name, '')), '') AS invited_by_name,
         EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id = p.user_id) AS is_admin,
         u.created_at
  FROM msl_profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN msl_profiles bp ON bp.user_id = p.invited_by
  ORDER BY u.created_at DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_users() FROM public;
GRANT EXECUTE ON FUNCTION public.list_users() TO authenticated;


-- 7. Reload PostgREST schema cache -------------------------------------------
NOTIFY pgrst, 'reload schema';
