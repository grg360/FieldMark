/* Post-run backfill: populate conversation_id on existing root posts
   Date: 2026-05-31
   Run order: AFTER python twitter_capture.py --capture-replies completes
   Editor note: paste and execute as a single standalone statement. */

UPDATE public.social_posts_v2
  SET conversation_id = platform_post_id
  WHERE (is_reply IS NULL OR is_reply = false)
    AND conversation_id IS NULL
    AND platform = 'twitter';