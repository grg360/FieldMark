-- ============================================================================
-- 2026_07_16_invite_system_stage1.sql
-- STAGE 1 — server-side security foundation for invite-gated public signup.
-- Server-controlled entitlement: redemption, quota, allowed_ta_slugs, admin
-- identity, and the kill-switch all live server-side and are NOT client-writable.
--
-- Contents:
--   1. live_ta_parent_slugs()        write-side twin of getLiveTASlugs()
--   2. app_config                    single-row kill-switch (signups_enabled + cap)
--   3. admin_users + is_admin()      admin identity OFF msl_profiles (R1)
--   4. invites, invite_redemptions   invite + referral-graph tables
--   5. msl_profiles.invited_by       attribution column
--   6. redeem_invite()               atomic SECURITY DEFINER redemption RPC
--   7. RLS + column-lock (R2)        clients cannot self-grant entitlement / admin,
--                                    cannot self-INSERT a profile (gate bypass)
--
-- HOW TO RUN: execute in the Supabase SQL editor (runs as postgres). Standalone
-- statements; do NOT wrap in BEGIN/COMMIT. Then run the companion
-- 2026_07_16_invite_system_stage1_verify.sql and confirm the attack scenarios FAIL.
--
-- SAFETY: profiles become creatable ONLY via redeem_invite() (service/definer).
-- The legacy client-side WelcomeWizard INSERT path is intentionally disabled by
-- this migration (no active users depend on it; all existing users have profiles).
-- Stage 2 rewires WelcomeWizard to UPDATE the row redeem_invite() pre-creates.
-- ============================================================================


-- 1. live_ta_parent_slugs() --------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_ta_parent_slugs()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT slug), ARRAY[]::text[])
  FROM (
    SELECT coalesce(parent.slug, child.slug) AS slug
    FROM therapeutic_area_ingestion_config cfg
    JOIN therapeutic_areas child ON child.id = cfg.therapeutic_area_id
    LEFT JOIN therapeutic_areas parent ON parent.id = child.parent_ta_id
    WHERE cfg.is_visible_in_ui = true AND cfg.is_active = true
  ) s
  WHERE slug IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.live_ta_parent_slugs() FROM public;


-- 2. app_config (kill-switch) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
  id boolean PRIMARY KEY DEFAULT true,
  signups_enabled boolean NOT NULL DEFAULT true,
  global_signup_cap int,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT app_config_singleton CHECK (id = true)
);

INSERT INTO public.app_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_config FROM anon, authenticated;


-- 3. admin_users + is_admin()  (R1 — admin identity is NOT a msl_profiles column)
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_users FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- 4. invites + invite_redemptions --------------------------------------------
CREATE TABLE IF NOT EXISTS public.invites (
  code text PRIMARY KEY,
  inviter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uses_remaining int NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invites_uses_nonneg CHECK (uses_remaining >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invites_inviter ON public.invites(inviter_id);

CREATE TABLE IF NOT EXISTS public.invite_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text REFERENCES public.invites(code) ON DELETE SET NULL,
  redeemed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_inviter ON public.invite_redemptions(inviter_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_redeemed_by ON public.invite_redemptions(redeemed_by);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_redemptions ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.invites FROM anon, authenticated;
REVOKE ALL ON public.invite_redemptions FROM anon, authenticated;

CREATE POLICY "invites_select_own" ON public.invites
  FOR SELECT TO authenticated USING (inviter_id = auth.uid());


-- 5. msl_profiles.invited_by (attribution) -----------------------------------
ALTER TABLE public.msl_profiles ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_msl_profiles_invited_by ON public.msl_profiles(invited_by);


-- 6. redeem_invite() — atomic SECURITY DEFINER redemption --------------------
CREATE OR REPLACE FUNCTION public.redeem_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inviter uuid;
  v_enabled boolean;
  v_cap int;
  v_count int;
  v_slugs text[];
  v_new_code text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;

  SELECT signups_enabled, global_signup_cap INTO v_enabled, v_cap FROM app_config WHERE id = true;
  IF NOT coalesce(v_enabled, false) THEN
    RAISE EXCEPTION 'signups are currently paused';
  END IF;
  IF v_cap IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM msl_profiles;
    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'signup cap reached';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM msl_profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'profile already exists';
  END IF;

  UPDATE invites
     SET uses_remaining = uses_remaining - 1
   WHERE code = p_code
     AND is_active = true
     AND uses_remaining > 0
  RETURNING inviter_id INTO v_inviter;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or exhausted invite';
  END IF;

  IF v_inviter = v_uid THEN
    RAISE EXCEPTION 'cannot redeem your own invite';
  END IF;

  v_slugs := live_ta_parent_slugs();

  INSERT INTO msl_profiles (user_id, allowed_ta_slugs, invited_by)
  VALUES (v_uid, v_slugs, v_inviter);

  INSERT INTO invite_redemptions (invite_code, redeemed_by, inviter_id)
  VALUES (p_code, v_uid, v_inviter);

  v_new_code := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO invites (code, inviter_id, uses_remaining) VALUES (v_new_code, v_uid, 10);

  RETURN jsonb_build_object('ok', true, 'allowed_ta_slugs', v_slugs, 'invite_code', v_new_code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated;


-- 7a. msl_profiles column-lock (R2) — clients cannot change entitlement cols --
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS msl_profiles_lock_entitlement ON public.msl_profiles;
CREATE TRIGGER msl_profiles_lock_entitlement
  BEFORE UPDATE ON public.msl_profiles
  FOR EACH ROW EXECUTE FUNCTION public.msl_profiles_lock_entitlement_cols();


-- 7b. Close the client INSERT path (gate bypass + INSERT self-grant) ----------
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.msl_profiles;


-- 8. Reload PostgREST schema cache -------------------------------------------
NOTIFY pgrst, 'reload schema';
