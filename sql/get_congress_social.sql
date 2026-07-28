-- get_congress_social — per-congress social aggregation over social_posts_v2,
-- keyed by the congress's hashtag set (lowercase, # prefix). Applied to the live
-- DB 2026-07-27 (see sql/README.md).
--
-- Returns NULL when no posts carry the hashtags (caller renders the honest empty
-- state). The daily series starts at p_capture_start — days before capture began
-- are UNOBSERVED and absent, never drawn as zero; observed-but-quiet days inside
-- the window are a real 0.
--
-- SECURITY DEFINER so the read works regardless of the caller's grants on
-- social_posts_v2; it returns only aggregates.

CREATE OR REPLACE FUNCTION public.get_congress_social(
  p_hashtags text[],
  p_capture_start date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH posts AS (
  SELECT posted_at, handle
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
days AS (
  SELECT gs::date AS d
  FROM bounds, generate_series(bounds.d0, bounds.d1, interval '1 day') gs
),
daily AS (
  SELECT d.d, count(p.posted_at) AS n
  FROM days d
  LEFT JOIN posts p ON p.posted_at::date = d.d
  GROUP BY d.d
),
wow AS (
  SELECT
    count(*) FILTER (WHERE posted_at::date >  (SELECT d1 FROM bounds) - 7)  AS last7,
    count(*) FILTER (WHERE posted_at::date <= (SELECT d1 FROM bounds) - 7
                       AND posted_at::date >  (SELECT d1 FROM bounds) - 14) AS prior7
  FROM posts
)
SELECT CASE WHEN (SELECT total FROM bounds) = 0 THEN NULL ELSE jsonb_build_object(
  'total_posts',   (SELECT total  FROM bounds),
  'voices',        (SELECT voices FROM bounds),
  'capture_start', (SELECT d0 FROM bounds),
  'last_day',      (SELECT d1 FROM bounds),
  'wow_pct', CASE WHEN (SELECT prior7 FROM wow) > 0
                  THEN round(100.0 * ((SELECT last7 FROM wow) - (SELECT prior7 FROM wow)) / (SELECT prior7 FROM wow))
                  ELSE NULL END,
  'daily', (SELECT jsonb_agg(jsonb_build_object('d', d, 'n', n) ORDER BY d) FROM daily)
) END
$function$;

GRANT EXECUTE ON FUNCTION public.get_congress_social(text[], date) TO anon, authenticated, service_role;
