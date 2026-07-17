-- ============================================================================
-- 2026_07_17_invite_link_sharing_grant_select_own.sql
-- LINK-SHARING prerequisite — grant the SELECT privilege that makes the Stage 1
-- invites_select_own RLS policy actually reachable from the client.
--
-- WHY THIS IS NEEDED:
-- Stage 1 created the policy `invites_select_own` (FOR SELECT … USING
-- (inviter_id = auth.uid())) but never granted the underlying table SELECT
-- privilege to `authenticated` (it only REVOKEd INSERT/UPDATE/DELETE). In
-- Postgres, an RLS policy filters ROWS but the role still needs the table-level
-- SELECT privilege to read at all — so a client `from("invites").select()`
-- currently fails with 42501 "permission denied for table invites", not an
-- empty result. This grant closes that gap.
--
-- WHY THIS IS SAFE:
-- The grant does NOT widen visibility. RLS is enabled on public.invites and the
-- only SELECT policy is invites_select_own, so with SELECT granted a user still
-- sees ONLY rows where inviter_id = auth.uid() — their own invite(s). No write
-- privilege is granted (INSERT/UPDATE/DELETE stay revoked; minting remains
-- server-side via redeem_invite()/mint_invite()). anon gets nothing.
--
-- HOW TO RUN: standalone statement in the Supabase SQL editor. No BEGIN/COMMIT.
-- ============================================================================

GRANT SELECT ON public.invites TO authenticated;

NOTIFY pgrst, 'reload schema';
