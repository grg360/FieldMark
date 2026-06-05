-- Run once in Supabase SQL editor before backfill_trial_investigators.py
-- Tracks per-NCT progress so the backfill is resume-safe.

CREATE TABLE IF NOT EXISTS trial_backfill_progress (
  nct_id text PRIMARY KEY,
  processed_at timestamptz DEFAULT now(),
  officials_added int,
  contacts_added int,
  skipped_existing int,
  status text,  -- 'success' | 'http_error' | 'parse_error' | 'no_data'
  error_message text
);

GRANT SELECT, INSERT, UPDATE ON trial_backfill_progress TO service_role;
