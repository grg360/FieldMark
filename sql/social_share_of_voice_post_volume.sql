-- Share of Voice: engagement-weighted -> post-volume-weighted (applied to the
-- live DB 2026-07-28 via run_sql.py; captured per sql/README.md convention).
--
-- Why: one on-topic viral post (@embacubaus on Cuba's VAXIRA NSCLC vaccine,
-- 22,546 engagements) became 21% of engagement-weighted SoV. That measures
-- virality, not opinion leadership; this surface exists to find SUSTAINED
-- voices in the NSCLC conversation. Ranking by post volume matches the congress
-- page's "TOP VOICES · BY POST VOLUME", which deliberately implies no
-- engagement model we don't have.
--
-- Only rank_within_ta changes: total_engagement DESC -> post_count DESC
-- (engagement as the stable tiebreak). The 90-day window and every other column
-- (engagement_pct is retained as valid engagement data, unused by the SoV pie)
-- are byte-identical to the live definition. add_pct-style post share is
-- computed client-side from post_count, so no new column is needed.

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
    row_number() OVER (PARTITION BY a.ta_slug ORDER BY a.post_count DESC, a.total_engagement DESC) AS rank_within_ta,
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
COMMIT;

REFRESH MATERIALIZED VIEW public.mv_social_share_of_voice_by_ta;
