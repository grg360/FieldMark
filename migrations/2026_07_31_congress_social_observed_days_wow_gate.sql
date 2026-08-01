-- Congress social: unobserved days are not zeros; WoW gated on full observation
-- + minimum volume. (2026-07-31)
--
-- Context. Capture ran 20 May - 3 Jun, stopped, and resumed 21 Jul. The old
-- get_congress_social emitted a generate_series calendar from capture_start to
-- the latest post day, so the ~47-day capture gap reached clients as literal
-- zero-count days, and the WoW figure compared a 7-observed-day week against a
-- 3-observed-day week (9 posts vs 4 -> "+125%").
--
-- Fix 1: the daily series now contains only days that have captured posts.
-- A missing day means "no capture record", never zero. True zero days (capture
-- ran, nothing posted) are indistinguishable from unobserved days until
-- coverage is recorded, so they are also absent — that is the honest floor.
--
-- Fix 2: wow_pct is NULL unless (a) every one of the 14 days in the two
-- comparison windows has a social_capture_coverage row (fully observed on both
-- sides), and (b) both windows hold >= 50 posts. 50 because the tile renders an
-- integer percent: at a 50-post baseline one post moves the figure ~2 points —
-- the display's own resolution; below that the percent is unit noise (at 4
-- posts, one post is 25 points). Clients render nothing when wow_pct is NULL.
--
-- social_capture_coverage is the minimal observation signal: one row per
-- (platform, observed_date) a capture run actually queried. NOTHING populates
-- it yet — twitter_capture.py should insert its queried dates going forward
-- (out of scope here; capture code deliberately untouched). Until then wow_pct
-- is always NULL, which is correct: observation cannot currently be established.
-- Do NOT backfill this table from post presence — that inference is circular.

create table if not exists public.social_capture_coverage (
  platform      text not null,
  observed_date date not null,
  source        text,
  recorded_at   timestamptz not null default now(),
  primary key (platform, observed_date)
);

comment on table public.social_capture_coverage is
  'One row per (platform, date) a capture run actually queried. The observation signal for congress social series/WoW. Never backfill from post presence.';

alter table public.social_capture_coverage enable row level security;

drop policy if exists social_capture_coverage_public_read on public.social_capture_coverage;
create policy social_capture_coverage_public_read
  on public.social_capture_coverage for select using (true);

grant select on public.social_capture_coverage to anon, authenticated, service_role;
grant insert, update, delete on public.social_capture_coverage to service_role;

create or replace function public.get_congress_social(p_hashtags text[], p_capture_start date default null::date)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
WITH posts AS (
  SELECT posted_at, handle, display_name, hashtags
  FROM social_posts_v2
  WHERE hashtags && p_hashtags
),
bounds AS (
  SELECT
    coalesce(p_capture_start, min(posted_at)::date) AS d0,
    max(posted_at)::date AS d1,
    count(*) AS total,
    count(DISTINCT handle) AS voices
  FROM posts
),
-- Observed days only: a day appears iff it has captured posts. No calendar
-- generate_series — unobserved days must be ABSENT, not zero.
daily AS (
  SELECT posted_at::date AS d, count(*) AS n
  FROM posts
  GROUP BY posted_at::date
),
wow AS (
  SELECT
    count(*) FILTER (WHERE posted_at::date >  (SELECT d1 FROM bounds) - 7)  AS last7,
    count(*) FILTER (WHERE posted_at::date <= (SELECT d1 FROM bounds) - 7
                       AND posted_at::date >  (SELECT d1 FROM bounds) - 14) AS prior7
  FROM posts
),
-- Both comparison windows fully observed: all 14 days must carry a coverage row.
wow_coverage AS (
  SELECT count(DISTINCT observed_date) AS covered
  FROM social_capture_coverage
  WHERE platform = 'twitter'
    AND observed_date >  (SELECT d1 FROM bounds) - 14
    AND observed_date <= (SELECT d1 FROM bounds)
)
SELECT CASE WHEN (SELECT total FROM bounds) = 0 THEN NULL ELSE jsonb_build_object(
  'total_posts',   (SELECT total  FROM bounds),
  'voices',        (SELECT voices FROM bounds),
  'capture_start', (SELECT d0 FROM bounds),
  'last_day',      (SELECT d1 FROM bounds),
  -- Gated: NULL unless both windows fully observed AND both >= 50 posts.
  -- Clients render nothing on NULL (no zero, no dash).
  'wow_pct', CASE WHEN (SELECT covered FROM wow_coverage) = 14
                   AND (SELECT last7  FROM wow) >= 50
                   AND (SELECT prior7 FROM wow) >= 50
                  THEN round(100.0 * ((SELECT last7 FROM wow) - (SELECT prior7 FROM wow)) / (SELECT prior7 FROM wow))
                  ELSE NULL END,
  'daily', (SELECT jsonb_agg(jsonb_build_object('d', d, 'n', n) ORDER BY d) FROM daily),
  -- Top voices (engagement not modelled yet — ranked by post volume, share of total).
  -- LIMIT 30 (was 8): the detail page classifies voices into individual vs
  -- organizational panels client-side and shows the top 8 of EACH class, so it
  -- needs headroom beyond the overall top 8 (which ran 5 orgs / 3 individuals).
  'top_voices', (
    SELECT jsonb_agg(jsonb_build_object('handle', handle, 'name', dn, 'posts', n, 'share', share) ORDER BY n DESC)
    FROM (
      SELECT handle, mode() WITHIN GROUP (ORDER BY display_name) AS dn, count(*) AS n,
             round(100.0 * count(*) / nullif((SELECT total FROM bounds), 0)) AS share
      FROM posts GROUP BY handle ORDER BY count(*) DESC LIMIT 30
    ) v
  ),
  -- Topic share via co-occurring hashtags (the congress's own tags excluded).
  'hot_hashtags', (
    SELECT jsonb_agg(jsonb_build_object('tag', tag, 'posts', n, 'share', share) ORDER BY n DESC)
    FROM (
      SELECT tag, count(*) AS n, round(100.0 * count(*) / nullif((SELECT total FROM bounds), 0)) AS share
      FROM (SELECT unnest(hashtags) AS tag FROM posts) u
      WHERE tag <> ALL(p_hashtags)
      GROUP BY tag ORDER BY count(*) DESC LIMIT 8
    ) h
  )
) END
$function$;

notify pgrst, 'reload schema';
