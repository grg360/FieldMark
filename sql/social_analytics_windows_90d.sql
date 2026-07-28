-- Social analytics windows: 30 -> 90 days (applied to the live DB 2026-07-28
-- via run_sql.py; captured here per sql/README.md convention).
--
-- Why 90: 30 days falls between congresses (613 posts / 344 accounts in the
-- trailing 30d - ~1.8 posts/account, no per-account emergence signal). Opinion
-- leaders do their leading during congress weeks; a 90-day window spans the
-- spikes instead of only the quiet gaps. Definitions are otherwise byte-
-- identical to the originals (see sql/schema_full.sql), interval + period_start
-- changed only. Matviews cannot ALTER their query, hence drop/create.

BEGIN;
DROP MATERIALIZED VIEW IF EXISTS public.mv_social_share_of_voice_by_ta;
CREATE MATERIALIZED VIEW public.mv_social_share_of_voice_by_ta AS
 WITH expanded AS (
         SELECT unnest(sp.therapeutic_areas) AS ta_slug,
            sp.handle,
            (((COALESCE(sp.engagement_likes, 0) + COALESCE(sp.engagement_replies, 0)) + COALESCE(sp.engagement_reposts, 0)) + COALESCE(sp.engagement_quotes, 0)) AS engagement
           FROM public.social_posts_v2 sp
          WHERE ((sp.therapeutic_areas IS NOT NULL) AND (sp.posted_at >= (now() - '90 days'::interval)))
        ), aggregated AS (
         SELECT expanded.ta_slug,
            expanded.handle,
            count(*) AS post_count,
            sum(expanded.engagement) AS total_engagement
           FROM expanded
          GROUP BY expanded.ta_slug, expanded.handle
        ), ta_totals AS (
         SELECT aggregated.ta_slug,
            sum(aggregated.total_engagement) AS ta_total
           FROM aggregated
          GROUP BY aggregated.ta_slug
        )
 SELECT a.ta_slug,
    a.handle,
    su.display_name,
    a.post_count,
    a.total_engagement,
    round(((100.0 * (a.total_engagement)::numeric) / NULLIF(t.ta_total, (0)::numeric)), 2) AS engagement_pct,
    row_number() OVER (PARTITION BY a.ta_slug ORDER BY a.total_engagement DESC) AS rank_within_ta,
    now() AS computed_at,
    ((now() - '90 days'::interval))::date AS period_start,
    (now())::date AS period_end
   FROM ((aggregated a
     JOIN ta_totals t ON ((a.ta_slug = t.ta_slug)))
     LEFT JOIN public.social_users_v2 su ON ((lower(su.handle) = lower(a.handle))))
  WITH NO DATA;
CREATE INDEX idx_mv_social_sov_ta_rank ON public.mv_social_share_of_voice_by_ta USING btree (ta_slug, rank_within_ta);
GRANT ALL ON TABLE public.mv_social_share_of_voice_by_ta TO anon;
GRANT ALL ON TABLE public.mv_social_share_of_voice_by_ta TO authenticated;
GRANT ALL ON TABLE public.mv_social_share_of_voice_by_ta TO service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_social_hot_topics_by_ta;
CREATE MATERIALIZED VIEW public.mv_social_hot_topics_by_ta AS
 WITH expanded AS (
         SELECT unnest(social_posts_v2.therapeutic_areas) AS ta_slug,
            lower(unnest(social_posts_v2.hashtags)) AS hashtag,
            (((COALESCE(social_posts_v2.engagement_likes, 0) + COALESCE(social_posts_v2.engagement_replies, 0)) + COALESCE(social_posts_v2.engagement_reposts, 0)) + COALESCE(social_posts_v2.engagement_quotes, 0)) AS engagement
           FROM public.social_posts_v2
          WHERE ((social_posts_v2.therapeutic_areas IS NOT NULL) AND (social_posts_v2.hashtags IS NOT NULL) AND (social_posts_v2.posted_at >= (now() - '90 days'::interval)))
        ), filtered AS (
         SELECT expanded.ta_slug,
            expanded.hashtag,
            expanded.engagement
           FROM expanded
          WHERE (expanded.hashtag <> ALL (ARRAY['#asco26'::text, '#asco2026'::text, '#esmo2026'::text, '#easl2026'::text, '#aasld2026'::text, '#eha2026'::text]))
        ), aggregated AS (
         SELECT filtered.ta_slug,
            filtered.hashtag,
            count(*) AS post_count,
            sum(filtered.engagement) AS total_engagement
           FROM filtered
          GROUP BY filtered.ta_slug, filtered.hashtag
         HAVING (count(*) >= 3)
        ), ta_totals AS (
         SELECT aggregated.ta_slug,
            sum(aggregated.total_engagement) AS ta_total
           FROM aggregated
          GROUP BY aggregated.ta_slug
        )
 SELECT a.ta_slug,
    a.hashtag,
    a.post_count,
    a.total_engagement,
    round(((100.0 * (a.total_engagement)::numeric) / NULLIF(t.ta_total, (0)::numeric)), 2) AS engagement_pct,
    row_number() OVER (PARTITION BY a.ta_slug ORDER BY a.total_engagement DESC) AS rank_within_ta,
    now() AS computed_at,
    ((now() - '90 days'::interval))::date AS period_start,
    (now())::date AS period_end
   FROM (aggregated a
     JOIN ta_totals t ON ((a.ta_slug = t.ta_slug)))
  WITH NO DATA;
CREATE INDEX idx_mv_social_topics_ta_rank ON public.mv_social_hot_topics_by_ta USING btree (ta_slug, rank_within_ta);
GRANT ALL ON TABLE public.mv_social_hot_topics_by_ta TO anon;
GRANT ALL ON TABLE public.mv_social_hot_topics_by_ta TO authenticated;
GRANT ALL ON TABLE public.mv_social_hot_topics_by_ta TO service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_social_voice_emergence_by_ta;
CREATE MATERIALIZED VIEW public.mv_social_voice_emergence_by_ta AS
 WITH expanded AS (
         SELECT unnest(sp.therapeutic_areas) AS ta_slug,
            sp.handle,
            sp.captured_via_query,
            (((COALESCE(sp.engagement_likes, 0) + COALESCE(sp.engagement_replies, 0)) + COALESCE(sp.engagement_reposts, 0)) + COALESCE(sp.engagement_quotes, 0)) AS engagement
           FROM public.social_posts_v2 sp
          WHERE ((sp.therapeutic_areas IS NOT NULL) AND (sp.posted_at >= (now() - '90 days'::interval)))
        ), aggregated AS (
         SELECT expanded.ta_slug,
            expanded.handle,
            sum(expanded.engagement) AS total_engagement,
            count(*) AS post_count
           FROM expanded
          GROUP BY expanded.ta_slug, expanded.handle
         HAVING (count(*) >= 2)
        ), source_counts AS (
         SELECT expanded.ta_slug,
            expanded.handle,
            expanded.captured_via_query,
            count(*) AS query_count,
            row_number() OVER (PARTITION BY expanded.ta_slug, expanded.handle ORDER BY (count(*)) DESC) AS rn
           FROM expanded
          GROUP BY expanded.ta_slug, expanded.handle, expanded.captured_via_query
        ), dominant_source AS (
         SELECT source_counts.ta_slug,
            source_counts.handle,
            source_counts.captured_via_query AS dominant_source_hashtag
           FROM source_counts
          WHERE (source_counts.rn = 1)
        )
 SELECT a.ta_slug,
    a.handle,
    a.post_count,
    a.total_engagement,
    COALESCE(su.follower_count, 0) AS follower_count,
        CASE
            WHEN (COALESCE(su.follower_count, 0) > 0) THEN round(((a.total_engagement)::numeric / (su.follower_count)::numeric), 4)
            ELSE NULL::numeric
        END AS engagement_per_follower,
    su.display_name,
    su.bio,
    su.platform,
    ds.dominant_source_hashtag,
        CASE
            WHEN (dm.hcp_id IS NOT NULL) THEN true
            ELSE false
        END AS hcp_matched,
    now() AS computed_at,
    ((now() - '90 days'::interval))::date AS period_start,
    (now())::date AS period_end
   FROM (((aggregated a
     LEFT JOIN public.social_users_v2 su ON ((lower(su.handle) = lower(a.handle))))
     LEFT JOIN public.dol_matches_v2 dm ON ((dm.social_user_id = su.id)))
     LEFT JOIN dominant_source ds ON (((ds.ta_slug = a.ta_slug) AND (ds.handle = a.handle))))
  WITH NO DATA;
CREATE INDEX idx_mv_social_emergence_ta_eng ON public.mv_social_voice_emergence_by_ta USING btree (ta_slug, engagement_per_follower DESC);
GRANT ALL ON TABLE public.mv_social_voice_emergence_by_ta TO anon;
GRANT ALL ON TABLE public.mv_social_voice_emergence_by_ta TO authenticated;
GRANT ALL ON TABLE public.mv_social_voice_emergence_by_ta TO service_role;

COMMIT;

REFRESH MATERIALIZED VIEW public.mv_social_share_of_voice_by_ta;
REFRESH MATERIALIZED VIEW public.mv_social_hot_topics_by_ta;
REFRESH MATERIALIZED VIEW public.mv_social_voice_emergence_by_ta;
