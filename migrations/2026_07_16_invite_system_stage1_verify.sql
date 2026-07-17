-- ============================================================================
-- 2026_07_16_invite_system_stage1_verify.sql
-- VERIFICATION harness for Stage 1. Run AFTER the migration, in the Supabase SQL
-- editor. This is a TEST script, not a migration: it is wrapped in a single
-- transaction that ROLLBACKs at the end, so it changes NOTHING. Attack attempts
-- run under a simulated `authenticated` role (SET ROLE + request.jwt.claims) and
-- self-report PASS/FAIL via NOTICE messages (see the "Messages"/output pane).
--
-- Expected: every scenario prints PASS. Any FAIL is a real security hole.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- SECTION A — structural assertions (deterministic, run as postgres)
-- ---------------------------------------------------------------------------

-- A1. The client INSERT policy on msl_profiles is GONE (gate cannot be bypassed
--     by a direct self-INSERT). Expect insert_policies = 0.
SELECT count(*) AS insert_policies_on_msl_profiles
FROM pg_policies WHERE schemaname='public' AND tablename='msl_profiles' AND cmd='INSERT';

-- A2. The entitlement column-lock trigger exists.
SELECT count(*) AS lock_triggers
FROM pg_trigger WHERE tgrelid='public.msl_profiles'::regclass AND tgname='msl_profiles_lock_entitlement';

-- A3. Admin/kill-switch/attribution tables are NOT readable/writable by clients
--     (no SELECT grant to anon/authenticated). Expect 0 rows.
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('admin_users','app_config','invite_redemptions')
  AND grantee IN ('anon','authenticated');

-- A4. Write-side entitlement source returns the live parent slugs (server-side).
--     Expect {oncology,immunology}.
SELECT public.live_ta_parent_slugs() AS live_parent_slugs;


-- ---------------------------------------------------------------------------
-- SECTION B — runtime attack simulation (as the `authenticated` role)
-- ---------------------------------------------------------------------------

-- (a) A user CANNOT self-promote to admin (admin_users is client-locked).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    PERFORM 1 FROM public.admin_users LIMIT 1;
    RAISE WARNING '(a1) FAIL: authenticated could READ admin_users';
  EXCEPTION WHEN others THEN
    RAISE NOTICE '(a1) PASS: admin_users read blocked -> %', SQLERRM;
  END;
  BEGIN
    INSERT INTO public.admin_users(user_id) VALUES ('00000000-0000-0000-0000-000000000001');
    RAISE WARNING '(a2) FAIL: authenticated could INSERT into admin_users (SELF-PROMOTE)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE '(a2) PASS: admin self-promote blocked -> %', SQLERRM;
  END;
  PERFORM set_config('role', 'postgres', true);
END $$;

-- (b) A user CANNOT self-edit their own allowed_ta_slugs / invited_by,
--     but CAN still edit an ordinary field (positive control).
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT user_id INTO v_uid FROM public.msl_profiles LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    UPDATE public.msl_profiles
       SET allowed_ta_slugs = ARRAY['oncology','immunology','hepatology','rare-disease']
     WHERE user_id = v_uid;
    RAISE WARNING '(b1) FAIL: user self-edited allowed_ta_slugs (SELF-GRANT ENTITLEMENT)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE '(b1) PASS: allowed_ta_slugs self-edit blocked -> %', SQLERRM;
  END;

  BEGIN
    UPDATE public.msl_profiles
       SET invited_by = v_uid
     WHERE user_id = v_uid;
    RAISE WARNING '(b2) FAIL: user self-edited invited_by';
  EXCEPTION WHEN others THEN
    RAISE NOTICE '(b2) PASS: invited_by self-edit blocked -> %', SQLERRM;
  END;

  BEGIN
    UPDATE public.msl_profiles SET company = 'VERIFY-TEMP' WHERE user_id = v_uid;
    RAISE NOTICE '(b3) PASS: ordinary field (company) still user-editable';
  EXCEPTION WHEN others THEN
    RAISE WARNING '(b3) FAIL: ordinary update wrongly blocked -> %', SQLERRM;
  END;

  PERFORM set_config('role', 'postgres', true);
END $$;

-- (c) A user CANNOT bypass the invite gate by directly INSERTing a profile.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    INSERT INTO public.msl_profiles(user_id, allowed_ta_slugs)
    VALUES ('00000000-0000-0000-0000-000000000002', ARRAY['oncology','immunology']);
    RAISE WARNING '(c) FAIL: user self-INSERTed a profile (GATE BYPASS)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE '(c) PASS: direct profile INSERT blocked -> %', SQLERRM;
  END;
  PERFORM set_config('role', 'postgres', true);
END $$;

-- (d) A user CANNOT flip the kill-switch (app_config is client-locked).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE public.app_config SET signups_enabled = false WHERE id = true;
    RAISE WARNING '(d) FAIL: authenticated could flip the kill-switch';
  EXCEPTION WHEN others THEN
    RAISE NOTICE '(d) PASS: kill-switch write blocked -> %', SQLERRM;
  END;
  PERFORM set_config('role', 'postgres', true);
END $$;

ROLLBACK;

-- ============================================================================
-- After running: check the Messages pane — every scenario should read PASS.
-- SECTION A expectations: A1 insert_policies = 0; A2 lock_triggers = 1;
-- A3 returns 0 rows; A4 = {oncology,immunology}. Nothing was persisted (ROLLBACK).
-- ============================================================================
