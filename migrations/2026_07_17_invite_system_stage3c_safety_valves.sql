-- ============================================================================
-- 2026_07_17_invite_system_stage3c_safety_valves.sql
-- STAGE 3c — two reversible admin safety valves: deactivate/reactivate a user,
-- and revoke/reactivate an invite. NO service-role, NO Edge Function — both are
-- plain is_admin()-gated SECURITY DEFINER RPCs, same mold as Stage 3a.
--
-- Builds ON Stage 1 (column-lock trigger, invites.is_active, redeem_invite) and
-- Stage 3a (is_admin, list_users). Alters two existing objects deliberately:
--   * the column-lock trigger fn — to protect the new deactivated_at column
--   * list_users() — to surface deactivated_at (DROP+CREATE: return shape change)
--
-- THE LOAD-BEARING INVARIANT (Stage 3a §6), on both new RPCs:
--   * SECURITY DEFINER, owned by postgres (reaches the client-locked columns /
--     the column-locked deactivated_at / the client-write-revoked invites table).
--   * FIRST statement is the is_admin() gate.
--   * SET search_path = public. EXECUTE revoked from public, granted authenticated.
--   * The ACTOR is always auth.uid(). set_user_active/set_invite_active DO take a
--     target argument (p_user / p_code) — that is the OBJECT being acted on, gated
--     behind is_admin(); it is NOT an actor override. A non-admin cannot call them.
--
-- SELF-LOCKOUT GUARD (my call, flagged): set_user_active REJECTS an admin
-- deactivating their own account (p_user = auth.uid() AND NOT p_active). With one
-- admin today, self-deactivation would lock the only admin out of the very RPC
-- needed to undo it. Hard reject is safer than a warning.
--
-- SCOPE NOTE: deactivating a user blocks THEIR access only. It does NOT unwind
-- their invite tree or redemptions — referrals stand. Revoke specific invites
-- separately via set_invite_active.
--
-- HOW TO RUN: standalone statements in the Supabase SQL editor (runs as
-- postgres). No BEGIN/COMMIT. Then run the companion _verify.sql.
-- ============================================================================


-- 1. msl_profiles.deactivated_at (null = active) -----------------------------
ALTER TABLE public.msl_profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;


-- 2. Extend the column-lock trigger to protect deactivated_at ----------------
-- Same guard shape as allowed_ta_slugs / invited_by: a client (authenticated or
-- anon) cannot change deactivated_at, so a suspended user cannot self-reactivate.
-- A SECURITY DEFINER RPC runs as postgres (current_user = postgres), so it is NOT
-- caught by this guard and CAN set the column — which is exactly set_user_active.
CREATE OR REPLACE FUNCTION public.msl_profiles_lock_entitlement_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.allowed_ta_slugs IS DISTINCT FROM OLD.allowed_ta_slugs THEN
      RAISE EXCEPTION 'allowed_ta_slugs is server-controlled and cannot be modified by the user';
    END IF;
    IF NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
      RAISE EXCEPTION 'invited_by is server-controlled and cannot be modified by the user';
    END IF;
    IF NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at THEN
      RAISE EXCEPTION 'deactivated_at is server-controlled and cannot be modified by the user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- 3. set_user_active() — deactivate / reactivate a user ----------------------
DROP FUNCTION IF EXISTS public.set_user_active(uuid, boolean);

CREATE FUNCTION public.set_user_active(p_user uuid, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deactivated_at timestamptz;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_user IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'user and active are required';
  END IF;

  IF NOT p_active AND p_user = auth.uid() THEN
    RAISE EXCEPTION 'an admin cannot deactivate their own account';
  END IF;

  UPDATE msl_profiles
     SET deactivated_at = CASE WHEN p_active THEN NULL ELSE now() END
   WHERE user_id = p_user
  RETURNING deactivated_at INTO v_deactivated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  RETURN jsonb_build_object('user_id', p_user, 'deactivated_at', v_deactivated_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_active(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean) TO authenticated;


-- 4. set_invite_active() — revoke / reactivate an invite ---------------------
-- invites has client INSERT/UPDATE/DELETE revoked (Stage 1), so the definer
-- context is required to flip is_active. redeem_invite()'s UPDATE already filters
-- WHERE is_active = true, so setting is_active = false stops redemption instantly
-- (a revoked code then fails 'invalid or exhausted invite').
DROP FUNCTION IF EXISTS public.set_invite_active(text, boolean);

CREATE FUNCTION public.set_invite_active(p_code text, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active boolean;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_code IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'code and active are required';
  END IF;

  UPDATE invites
     SET is_active = p_active
   WHERE code = p_code
  RETURNING is_active INTO v_is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite not found';
  END IF;

  RETURN jsonb_build_object('code', p_code, 'is_active', v_is_active);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_invite_active(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_invite_active(text, boolean) TO authenticated;


-- 5. list_users() — surface deactivated_at (DROP+CREATE: return shape changes)
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
  deactivated_at timestamptz,
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
         p.deactivated_at,
         u.created_at
  FROM msl_profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  LEFT JOIN msl_profiles bp ON bp.user_id = p.invited_by
  ORDER BY u.created_at DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_users() FROM public;
GRANT EXECUTE ON FUNCTION public.list_users() TO authenticated;


-- 6. Reload PostgREST schema cache -------------------------------------------
NOTIFY pgrst, 'reload schema';
