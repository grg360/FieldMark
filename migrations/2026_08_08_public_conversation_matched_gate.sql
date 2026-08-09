-- 2026_08_08 — matched-gate fix: scored-and-DISMISSED matches are not matches.
--
-- The `matched` gate (and the corpus 'matched' count) accepted ANY
-- dol_matches_v2 row, including match_confidence='rejected' — rows the
-- matcher scored and dismissed. 98 accounts whose ONLY rows are rejected
-- registered as "matched" on the shipped surface. This re-issues the
-- 2026-08-07 tiered-order RPC verbatim with two changes, both excluding
-- rejected-tier rows: the per-row matched gate (drives tier 1 vs tier 2)
-- and the corpus 'matched' count (honesty panel, group-head note).
-- Measured effect at fix time: corpus.matched 495 -> 397 (8% -> 6% of
-- 6,247 accounts); ranked window: 40 of 234 MATCHED-band accounts move to
-- EVERYONE ELSE. CONFIRMED (verified_by_human) untouched: 118 window
-- accounts, 140 corpus rows. 'medium' and 'held' counts untouched.
--
-- Everything below is the 2026_08_07 migration body with only those edits.

-- Public conversation: corpus-match tiered ordering (2026-08-07).
--
-- The list ordered by raw response received, so any high-engagement account —
-- the Cuban-embassy case — outranked every identified clinician. The ordering
-- scoped weeks ago lands here: CONFIRMED corpus match first (a person confirmed
-- the physician match), then MATCHED (a database match exists, not
-- hand-confirmed), then UNMATCHED (never matched, not asserted to be a
-- clinician) — response received orders WITHIN each tier only.
--
-- position becomes the row's place under the tiered order (it was a raw
-- response rank), so the list numbering, the scatter overlay footer and
-- pagination all speak the same order. `tier` joins the row payload so the
-- surface can band by it and the group captions can state it. Pagination is
-- deterministic over (tier, resp desc, handle).
--
-- The frontend framing changes in the same commit: the response-boundary
-- group bands are replaced by match-tier bands, and every "ordered by
-- response received" caption is rewritten to state the tiering.

CREATE OR REPLACE FUNCTION public.public_conversation(p_ta_slug text, p_limit integer DEFAULT 7, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with win as (
  select timestamptz '2026-05-20' as t0, timestamptz '2026-06-04' as t1
),
posts as (
  select p.*, (coalesce(p.engagement_likes,0)+coalesce(p.engagement_replies,0)
              +coalesce(p.engagement_reposts,0)+coalesce(p.engagement_quotes,0)) as resp
  from social_posts_v2 p
  where p_ta_slug = any(p.therapeutic_areas)
),
inc as (
  select * from posts, win where posted_at >= win.t0 and posted_at < win.t1
),
acct as (
  select lower(handle) as h,
         count(*) as n_included,
         count(*) filter (where not coalesce(is_reply,false)) as n_original,
         count(*) filter (where coalesce(is_reply,false)) as n_reply,
         sum(resp) as resp,
         sum(coalesce(engagement_likes,0)) as likes,
         sum(coalesce(engagement_replies,0)) as replies,
         sum(coalesce(engagement_reposts,0)) as reposts,
         sum(coalesce(engagement_quotes,0)) as quotes
  from inc group by 1
),
cap as ( -- captured (any date) per account, this TA
  select lower(handle) as h, count(*) as n_captured from posts group by 1
),
via as ( -- dominant capture query per account over included posts
  select h, captured_via_query from (
    select lower(handle) as h, captured_via_query,
           row_number() over (partition by lower(handle) order by count(*) desc) rn
    from inc group by 1, 2
  ) s where rn = 1
),
joined0 as (
  select a.*, c.n_captured, v.captured_via_query,
         su.id as social_id, su.display_name, su.bio, su.profile_url,
         coalesce(su.follower_count, 0) as f,
         exists (select 1 from dol_matches_v2 dm
                 where dm.social_user_id = su.id and dm.verified_by_human) as verified,
         exists (select 1 from dol_matches_v2 dm
                 where dm.social_user_id = su.id
                   and dm.match_confidence <> 'rejected') as matched
  from acct a
  join cap c using (h)
  left join via v using (h)
  left join social_users_v2 su on lower(su.handle) = a.h
),
joined as (
  -- tier: 0 confirmed corpus match · 1 matched, not hand-confirmed · 2 unmatched.
  -- position is the row's place under the TIERED order — the number the list,
  -- the scatter overlay and pagination all share.
  select j0.*,
         (case when j0.verified then 0 when j0.matched then 1 else 2 end) as tier,
         row_number() over (order by
           (case when j0.verified then 0 when j0.matched then 1 else 2 end),
           j0.resp desc, j0.h) as position
  from joined0 j0
),
plotted as (
  select * from joined where n_included >= 3 and f > 0 and resp > 0
),
toppost as ( -- most-response NON-reply included post per listed account
  select h, post_text, posted_at, platform_post_id, likes, replies, reposts, quotes from (
    select lower(handle) as h, post_text, posted_at, platform_post_id,
           coalesce(engagement_likes,0) likes, coalesce(engagement_replies,0) replies,
           coalesce(engagement_reposts,0) reposts, coalesce(engagement_quotes,0) quotes,
           row_number() over (partition by lower(handle) order by resp desc, posted_at desc) rn
    from inc where not coalesce(is_reply, false)
  ) s where rn = 1
),
listed as (
  select j.*, tp.post_text tp_text, tp.posted_at tp_at, tp.platform_post_id tp_id,
         tp.likes tp_likes, tp.replies tp_replies, tp.reposts tp_reposts, tp.quotes tp_quotes
  from joined j left join toppost tp using (h)
  order by j.tier, j.resp desc, j.h
  limit p_limit offset p_offset
),
tags as (
  select lower(t) tag, count(distinct id) nn
  from inc, unnest(hashtags) t group by 1 order by 2 desc limit 4
)
select jsonb_build_object(
  'ta_slug', p_ta_slug,
  'window', jsonb_build_object('start', '2026-05-20', 'end', '2026-06-03'),
  'posts_captured', (select count(*) from posts),
  'posts_included', (select count(*) from inc),
  'accounts_in_window', (select count(*) from acct),
  -- honesty panel: corpus-wide account/match facts (not TA-scoped by design)
  'corpus', jsonb_build_object(
    'accounts_total', (select count(*) from social_users_v2),
    'untagged_posts', (select count(*) from social_posts_v2
                       where therapeutic_areas is null or cardinality(therapeutic_areas) = 0),
    'matched', (select count(distinct social_user_id) from dol_matches_v2 where match_confidence <> 'rejected'),
    'confirmed', (select count(distinct social_user_id) from dol_matches_v2 where verified_by_human),
    'medium', (select count(distinct social_user_id) from dol_matches_v2 where match_confidence = 'medium'),
    'held', (select count(distinct social_user_id) from dol_matches_v2 where match_confidence = 'high' and not verified_by_human)
  ),
  'hashtags', jsonb_build_object(
    'top', (select coalesce(jsonb_agg(jsonb_build_object('tag', tag,
              'pct', round(100.0 * nn / nullif((select count(*) from inc),0), 1)) order by nn desc), '[]'::jsonb) from tags),
    'none_pct', (select round(100.0 * count(*) filter (where hashtags is null or cardinality(hashtags)=0)
              / nullif(count(*),0), 1) from inc)
  ),
  'scatter', jsonb_build_object(
    'floor', 3,
    'plotted', (select count(*) from plotted),
    'zero_follower_excluded', (select count(*) from joined where n_included >= 3 and f = 0),
    'zero_response_excluded', (select count(*) from joined where n_included >= 3 and f > 0 and resp = 0),
    'gold', (select count(*) filter (where verified) from plotted),
    'points', (select coalesce(jsonb_agg(jsonb_build_object(
        'h', h, 'name', display_name, 'f', f, 'resp', resp, 'n', n_included,
        'cap', n_captured, 'verified', verified, 'pos', position, 'bio', bio,
        'url', profile_url) order by resp desc), '[]'::jsonb) from plotted)
  ),
  'rows', (select coalesce(jsonb_agg(jsonb_build_object(
      'pos', position, 'h', h, 'name', display_name, 'bio', bio, 'url', profile_url,
      'f', f, 'resp', resp, 'n', n_included, 'cap', n_captured,
      'orig', n_original, 'reply', n_reply,
      'likes', likes, 'replies', replies, 'reposts', reposts, 'quotes', quotes,
      'verified', verified, 'via', captured_via_query,
      'tier', (case tier when 0 then 'confirmed' when 1 then 'matched' else 'unmatched' end),
      'top_post', case when tp_text is null then null else jsonb_build_object(
        'text', tp_text, 'at', to_char(tp_at, 'DD Mon YYYY'),
        'id', tp_id, 'likes', tp_likes, 'replies', tp_replies,
        'reposts', tp_reposts, 'quotes', tp_quotes) end
    ) order by tier, resp desc, h), '[]'::jsonb) from listed)
) from win;
$function$;
