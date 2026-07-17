-- ============================================================================
-- 2026_07_17_invite_email_send_log.sql
-- Rate-limit / audit log for the send-invite-email Edge Function.
--
-- The Edge Function (service role) inserts one row per successful send and counts
-- a sender's rows in the last 24h to enforce a per-user-per-day cap. This is the
-- spam guard: emailing an invite does NOT consume redemption quota (quota is
-- decremented at redeem_invite time), so a separate per-day cap is required.
--
-- Client-locked: RLS on, no policies, no anon/authenticated grants — no browser
-- client ever touches it. The Edge Function reaches it as service_role.
--
-- IMPORTANT (learned the hard way): service_role bypasses RLS but does NOT get a
-- table-level privilege automatically in this project — new public tables here do
-- not inherit default DML grants for service_role (the invite tables only have
-- REFERENCES/TRIGGER/TRUNCATE). RLS-bypass filters rows; it is NOT permission to
-- read/write the table. Without the explicit GRANT below, the Edge Function's
-- service-role count/insert fail with 42501 "permission denied". So grant exactly
-- what the function needs: SELECT (rate-limit count) + INSERT (send log).
--
-- HOW TO RUN: standalone statements in the Supabase SQL editor. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invite_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  invite_code text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_email_sends_sender_time
  ON public.invite_email_sends(sender_id, sent_at DESC);

ALTER TABLE public.invite_email_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invite_email_sends FROM anon, authenticated;

GRANT SELECT, INSERT ON public.invite_email_sends TO service_role;

-- The Edge Function also reads two EXISTING invite-system tables directly as
-- service_role — the caller's invite (code lookup) and their profile (name/TA).
-- Those tables were created (Stage 1) with no service_role DML grant either
-- (only REFERENCES/TRIGGER/TRUNCATE), because every prior path reached them via
-- SECURITY DEFINER RPCs that run as postgres. The Edge Function is the first
-- service_role .from() on them, so it needs explicit SELECT. Grant only SELECT
-- (the function never writes these two). RLS still governs non-service roles.
GRANT SELECT ON public.invites TO service_role;
GRANT SELECT ON public.msl_profiles TO service_role;

NOTIFY pgrst, 'reload schema';
