/* Migration: reply capture schema additions for social_posts_v2 / social_users_v2
   Date: 2026-05-31
   Run order: BEFORE python twitter_capture.py --capture-replies
   Editor note: paste and execute each statement individually in Supabase SQL editor. */

ALTER TABLE public.social_posts_v2
  ADD COLUMN IF NOT EXISTS conversation_id text,
  ADD COLUMN IF NOT EXISTS parent_platform_post_id text,
  ADD COLUMN IF NOT EXISTS is_reply boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_social_posts_v2_parent_platform_post_id
  ON public.social_posts_v2(parent_platform_post_id)
  WHERE parent_platform_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_v2_conversation_id
  ON public.social_posts_v2(conversation_id);

ALTER TABLE public.social_users_v2
  ADD COLUMN IF NOT EXISTS discovery_source text;

UPDATE public.social_users_v2
  SET discovery_source = 'hashtag_capture'
  WHERE discovery_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_users_v2_discovery_source
  ON public.social_users_v2(discovery_source);

GRANT SELECT ON public.social_posts_v2 TO anon, authenticated;
GRANT ALL ON public.social_posts_v2 TO service_role;

GRANT SELECT ON public.social_users_v2 TO anon, authenticated;
GRANT ALL ON public.social_users_v2 TO service_role;