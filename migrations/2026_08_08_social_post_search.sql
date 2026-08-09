-- 2026_08_08_social_post_search.sql
--
-- Keyword search over CAPTURED tweet text. The surface states this on every
-- result set — it searches our capture, never the full record; zero results
-- means "no captured post mentions this", not "this was never discussed".
--
-- FTS over ILIKE for SEMANTICS, not speed (measured 2026-08-08 at 20,065
-- rows: ILIKE 101ms / un-indexed FTS 455ms — both fine): websearch_to_tsquery
-- gives multi-word AND, quoted phrases, and -exclusions, which a search box
-- implies. Stated tradeoff: word-boundary + English stemming, so partial
-- tokens don't match ("osimert" won't find osimertinib) and clinical vocab
-- may stem unintuitively (KNOWN_ISSUES: FTS stemming on clinical terms).
--
-- Index from day one: the STORED generated column + GIN cost a few MB and a
-- negligible per-insert write at daily-capture volume, and keep search flat
-- as the corpus grows. Cheaper now than a backfill later.
--
-- SECURITY INVOKER (default): social_posts_v2 is public-read since the
-- 2026-08-07 social_posts_v2_public_read policy — no elevated rights needed.

ALTER TABLE public.social_posts_v2
  ADD COLUMN post_text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(post_text, ''))) STORED;

CREATE INDEX idx_social_posts_v2_tsv
  ON public.social_posts_v2 USING gin (post_text_tsv);

CREATE OR REPLACE FUNCTION public.social_post_search(
  p_term    text,
  p_ta_slug text    DEFAULT NULL,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH q AS (SELECT websearch_to_tsquery('english', p_term) AS tsq),
  hits AS (
    SELECT p.* FROM social_posts_v2 p, q
    WHERE p.post_text_tsv @@ q.tsq
      AND (p_ta_slug IS NULL OR p_ta_slug = ANY(p.therapeutic_areas))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM hits),
    -- Engagement passes through as-is: a SQL NULL becomes JSON null, and the
    -- client renders it as an absence ("LIKES —"), never zero-filled.
    'posts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'handle', handle, 'display_name', display_name,
        'platform_post_id', platform_post_id, 'post_text', post_text,
        'posted_at', posted_at, 'likes', engagement_likes,
        'replies', engagement_replies, 'reposts', engagement_reposts,
        'quotes', engagement_quotes, 'is_reply', is_reply)
        ORDER BY posted_at DESC)
      FROM (SELECT * FROM hits ORDER BY posted_at DESC
            LIMIT p_limit OFFSET p_offset) page
    ), '[]'::jsonb)
  ) FROM q;
$$;

GRANT EXECUTE ON FUNCTION public.social_post_search(text, text, integer, integer)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
