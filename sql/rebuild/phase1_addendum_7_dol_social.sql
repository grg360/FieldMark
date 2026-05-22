-- ============================================================
-- FieldMark v2 — Phase 1 Addendum 7: DOL/social tables
-- ============================================================
-- Date applied: 2026-05-22
-- Branch: foundation-rebuild
--
-- Purpose:
-- Creates v2 tables for the DOL (Digital Opinion Leader) workstream.
-- Schema design pre-built ahead of Day 5-6 execution to allow
-- twitter_capture.py / bluesky_capture.py / dol_matching.py work to
-- proceed straight to script patching without schema work in the loop.
--
-- v1 row counts at design time (May 22 evening):
--   social_users: 809
--   social_posts: 1,526
--   dol_matches:  66
--
-- Migration approach for Day 5-6:
-- All v1 rows will be copied verbatim into v2 tables.
-- dol_matches.hcp_id values will need re-resolution against hcps_v2
-- (hcps_v2.id is not the same as hcps.id even for matched HCPs).
-- That re-resolution is part of dol_matching.py's v2 patch work,
-- not this migration.
--
-- Design decisions:
-- 1. social_posts_v2 deliberately has NO FK to social_users_v2.
--    Linkage is handle-based string match, same as v1. Reason:
--    posts get captured before user profiles. Tightening to FK
--    would create ingestion-order coupling.
--
-- 2. dol_matches_v2.hcp_id is FK to hcps_v2 (was FK to hcps in v1).
--    Standard v2 pattern.
--
-- 3. UNIQUE constraints carry forward from v1 unchanged:
--    - social_users_v2: (platform, handle)
--    - social_posts_v2: (platform, platform_post_id)
--    - dol_matches_v2: (hcp_id, social_user_id)
--
-- 4. Default values added where v1 left nullable (matched_at,
--    verified_by_human). These are semantic defaults that v1
--    happened to omit; v2 makes them explicit.
--
-- 5. Explicit indexes added beyond what UNIQUE constraints create
--    implicitly. social_posts_v2.posted_at indexed DESC for the
--    common "recent posts" query pattern.
--
-- Architectural note on filtering:
-- The frontend displays "33 verified DOLs" via filtering on
-- dol_matches.match_confidence and/or dol_canonical_overrides.
-- v2 schema preserves this filtering pattern unchanged. No new
-- semantic "status" column added — let confidence + override
-- carry the filter signal as in v1.
-- ============================================================


-- ============================================================
-- Section 1: social_users_v2
-- ============================================================
-- Mirror of v1 social_users schema. 14 columns. UNIQUE(platform, handle)
-- ensures one row per (platform, handle) pair across Twitter and Bluesky.
CREATE TABLE social_users_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  handle text NOT NULL,
  display_name text,
  bio text,
  location text,
  website text,
  follower_count integer,
  following_count integer,
  post_count integer,
  verified boolean,
  profile_url text,
  profile_fetched_at timestamp with time zone,
  data_quality_flag text,
  UNIQUE(platform, handle)
);

CREATE INDEX idx_social_users_v2_handle ON social_users_v2(handle);
CREATE INDEX idx_social_users_v2_platform ON social_users_v2(platform);


-- ============================================================
-- Section 2: social_posts_v2
-- ============================================================
-- Mirror of v1 social_posts. 14 columns. Handle-based linkage to
-- social_users_v2 (no FK by design — see header notes).
CREATE TABLE social_posts_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  platform_post_id text NOT NULL,
  handle text NOT NULL,
  display_name text,
  post_text text,
  posted_at timestamp with time zone NOT NULL,
  engagement_likes integer,
  engagement_replies integer,
  engagement_reposts integer,
  engagement_quotes integer,
  hashtags text[],
  captured_at timestamp with time zone,
  captured_via_query text,
  UNIQUE(platform, platform_post_id)
);

CREATE INDEX idx_social_posts_v2_handle ON social_posts_v2(handle);
CREATE INDEX idx_social_posts_v2_platform ON social_posts_v2(platform);
CREATE INDEX idx_social_posts_v2_posted_at ON social_posts_v2(posted_at DESC);


-- ============================================================
-- Section 3: dol_matches_v2
-- ============================================================
-- HCP <-> social user matches. 7 columns. FK to hcps_v2 (new pattern,
-- was FK to hcps in v1). UNIQUE(hcp_id, social_user_id) prevents
-- duplicate match rows for the same HCP/social pairing.
--
-- match_confidence values (carried forward from v1):
--   'high', 'medium', 'low'
-- "Verified DOL" = match_confidence='high' AND verified_by_human=true
-- (or override row in dol_canonical_overrides). This filtering
-- pattern is preserved unchanged from v1.
CREATE TABLE dol_matches_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hcp_id uuid REFERENCES hcps_v2(id) ON DELETE CASCADE,
  social_user_id uuid REFERENCES social_users_v2(id) ON DELETE CASCADE,
  match_confidence text NOT NULL,
  match_signals jsonb,
  matched_at timestamp with time zone DEFAULT now(),
  verified_by_human boolean DEFAULT false,
  UNIQUE(hcp_id, social_user_id)
);

CREATE INDEX idx_dol_matches_v2_hcp_id ON dol_matches_v2(hcp_id);
CREATE INDEX idx_dol_matches_v2_social_user_id ON dol_matches_v2(social_user_id);
CREATE INDEX idx_dol_matches_v2_confidence ON dol_matches_v2(match_confidence);


-- ============================================================
-- End-of-migration state
-- ============================================================
-- Expected state after migration:
--   - v2 table count: 23 (was 20)
--   - New tables: social_users_v2 (14 cols), social_posts_v2 (14 cols),
--     dol_matches_v2 (7 cols)
--
-- Next steps (Day 5-6):
--   1. Copy v1 rows into v2 tables (verbatim for social_users/_posts;
--      hcp_id re-resolution for dol_matches against hcps_v2)
--   2. Patch twitter_capture.py with --target-version flag (mechanical)
--   3. Build bluesky_capture.py from outline (real work)
--   4. Patch dol_matching.py with --target-version flag (mechanical)
--   5. Retire or rebase social_cleanup_stage1.py / _stage2.py
--      (currently read hcps columns absent from hcps_v2; design call
--      needed before patching)
--   6. Frontend cutover for DOL display
