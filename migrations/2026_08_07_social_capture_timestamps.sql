-- 2026_08_07_social_capture_timestamps.sql
--
-- captured_at / profile_fetched_at were added in phase1_addendum_7 but no
-- writer ever set them; both are NULL corpus-wide (20,065 posts / 6,233
-- profiles as of 2026-08-07). Writers upsert with ON CONFLICT DO NOTHING and
-- omit both columns from the payload, so a DEFAULT is sufficient AND
-- server-clock-true: every new row gets now() at write time, existing rows
-- are never revisited.
--
-- NO BACKFILL. The capture events are gone; existing NULLs stay NULL and
-- mean "captured before the first populated date" (MIN(captured_at)).
-- Surfaces reading these columns must render that absence, not a blank:
--   "capture time not recorded before <MIN(captured_at)>"
--
-- If a writer ever switches to merge-mode upsert (ignore_duplicates=False),
-- it must set these columns explicitly — DEFAULT only fires on INSERT.

ALTER TABLE public.social_posts_v2
  ALTER COLUMN captured_at SET DEFAULT now();

ALTER TABLE public.social_users_v2
  ALTER COLUMN profile_fetched_at SET DEFAULT now();

-- Semantics guard (2026-08-07): profile_fetched_at stamps FIRST-SEEN, not
-- freshness. Profiles are fetched once at handle discovery and never
-- re-fetched (twitter_capture.py upserts DO NOTHING); the name promises a
-- refresh cycle the pipeline does not have. No surface may render this as
-- "last refreshed". Re-fetch gap logged in KNOWN_ISSUES.md.
COMMENT ON COLUMN public.social_users_v2.profile_fetched_at IS
  'First-seen stamp, NOT freshness: set once by DB DEFAULT when the handle is first discovered; profiles are never re-fetched. NULL = discovered before 2026-08-07 (pre-default era, capture time not recorded).';

COMMENT ON COLUMN public.social_posts_v2.captured_at IS
  'Server-side ingest stamp (DB DEFAULT now() on insert). NULL = captured before 2026-08-07 (pre-default era, capture time not recorded).';
