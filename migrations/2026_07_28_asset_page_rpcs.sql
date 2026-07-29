-- Drug Intelligence — asset page RPCs (Stage 3).
--
-- PostgREST can't group across the un-FK'd v1 tables, and the page's rules (themed
-- denominator, the per-asset window, the citation-accrual ranking) belong in one
-- place. These are read-only aggregations exposed to the frontend anon role.
--
-- All SECURITY DEFINER with a pinned search_path: the anon role has no need for
-- direct grants on the underlying tables — it reaches them only through these
-- functions, which the definer (migration owner) can read. Every count names its
-- denominator on the surface; nothing here compares assets or scores them.
--
-- A publication is "themed" iff it carries an is_primary row in
-- publication_theme_v1 (exactly one per publication). Ahead-of-print records dated
-- past 2026 are capped to 2026 for every year axis.

-- ── Header stats ─────────────────────────────────────────────────────────────
create or replace function public.asset_overview(p_generic text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  ),
  p as (
    select v.* from publications_v2 v join pubs on pubs.id = v.id
  ),
  themed as (
    select distinct pt.publication_id
    from publication_theme_v1 pt
    join pubs on pubs.id = pt.publication_id
    where pt.is_primary
  ),
  auth as (
    select pa.hcp_id
    from publication_authors_v2 pa
    join pubs on pubs.id = pa.publication_id
    where pa.hcp_id is not null
    group by pa.hcp_id
  )
  select json_build_object(
    'generic', p_generic,
    'total_pubs', (select count(*) from p),
    'ytd_2026', (select count(*) from p where pub_year >= 2026),
    'themed', (select count(*) from themed),
    'open_access', (select count(*) from p where (open_access->>'is_oa')::boolean is true),
    'authors_resolved', (select count(*) from auth),
    'board_ranked', (
      select count(distinct a.hcp_id) from auth a
      join hcp_established_ranks_v3 r on r.hcp_id = a.hcp_id
      where r.therapeutic_area_id = (select id from therapeutic_areas where name = 'NSCLC')
    ),
    'author_strings', (
      select coalesce(sum(jsonb_array_length(coalesce(pubmed_authorships, '[]'::jsonb))), 0) from p
    ),
    'earliest_year', (select min(pub_year) from p),
    'trajectory_resolved', (
      select count(*) from p
      where citation_counts_by_year is not null
        and jsonb_array_length(citation_counts_by_year) > 0
    )
  );
$$;

-- ── Theme composition (per year × primary theme) ─────────────────────────────
create or replace function public.asset_composition(p_generic text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  ),
  p as (
    select v.id, least(v.pub_year, 2026) as yr
    from publications_v2 v join pubs on pubs.id = v.id
    where v.pub_year is not null
  ),
  prim as (
    select pt.publication_id, tc.short_name
    from publication_theme_v1 pt
    join theme_canonical_v1 tc on tc.id = pt.canonical_id
    where pt.is_primary
  ),
  per_year as (
    select p.yr as year,
           count(*) as corpus,
           count(*) filter (where pr.publication_id is not null) as themed
    from p left join prim pr on pr.publication_id = p.id
    group by p.yr
  ),
  per_theme as (
    select p.yr as year, pr.short_name, count(*) as n
    from p join prim pr on pr.publication_id = p.id
    group by p.yr, pr.short_name
  )
  select json_build_object(
    'per_year', (
      select coalesce(json_agg(json_build_object('year', year, 'corpus', corpus, 'themed', themed) order by year), '[]'::json)
      from per_year
    ),
    'per_theme', (
      select coalesce(json_agg(json_build_object('year', year, 'short_name', short_name, 'n', n)), '[]'::json)
      from per_theme
    )
  );
$$;

-- ── What is landing now (citation accrual, not lifetime) ─────────────────────
-- Ranked by citations accrued in the last full year (2025); 2026 is partial and
-- not used for ranking. Candidates need >= 2 years of citation history and a
-- publication year <= 2025 to carry a readable trajectory; everything newer is
-- reported as a count of papers with no trajectory yet, never fabricated into one.
create or replace function public.asset_landing(p_generic text, p_limit int default 6)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  ),
  prim as (
    select pt.publication_id, tc.short_name
    from publication_theme_v1 pt
    join theme_canonical_v1 tc on tc.id = pt.canonical_id
    where pt.is_primary
  ),
  cand as (
    select v.id, v.title, v.journal, least(v.pub_year, 2026) as pub_year,
           v.citation_count, v.publication_types, v.open_access, v.doi,
           v.citation_counts_by_year, pr.short_name,
           coalesce((
             select (e->>'cited_by_count')::int
             from jsonb_array_elements(v.citation_counts_by_year) e
             where (e->>'year')::int = 2025
           ), 0) as accrual_2025
    from publications_v2 v
    join pubs on pubs.id = v.id
    left join prim pr on pr.publication_id = v.id
    where v.pub_year <= 2025
      and v.citation_counts_by_year is not null
      and jsonb_array_length(v.citation_counts_by_year) >= 2
  )
  select json_build_object(
    'papers', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select * from cand order by accrual_2025 desc, citation_count desc nulls last limit p_limit
      ) t
    ),
    'total_pubs', (select count(*) from pubs),
    'no_trajectory_count', (
      select count(*) from publications_v2 v join pubs on pubs.id = v.id
      where v.pub_year >= 2026 or coalesce(jsonb_array_length(v.citation_counts_by_year), 0) < 2
    )
  );
$$;

-- ── Who publishes on this asset ──────────────────────────────────────────────
create or replace function public.asset_authors(p_generic text, p_limit int default 6)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  ),
  auth as (
    select pa.hcp_id, count(*) as c
    from publication_authors_v2 pa
    join pubs on pubs.id = pa.publication_id
    where pa.hcp_id is not null
    group by pa.hcp_id
  ),
  ranked as (
    select a.hcp_id, a.c, h.first_name, h.last_name,
           r.rank as board_rank, r.scope_value, r.scope_type
    from auth a
    join hcps_v2 h on h.id = a.hcp_id
    left join lateral (
      select rank, scope_value, scope_type
      from hcp_established_ranks_v3 r
      where r.hcp_id = a.hcp_id
        and r.therapeutic_area_id = (select id from therapeutic_areas where name = 'NSCLC')
      order by rank asc
      limit 1
    ) r on true
  )
  select json_build_object(
    'authors', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select hcp_id, c, first_name, last_name, board_rank, scope_value, scope_type
        from ranked order by c desc, board_rank asc nulls last limit p_limit
      ) t
    ),
    'resolved', (select count(*) from auth),
    'board_ranked', (select count(*) from ranked where board_rank is not null),
    'author_strings', (
      select coalesce(sum(jsonb_array_length(coalesce(v.pubmed_authorships, '[]'::jsonb))), 0)
      from publications_v2 v join pubs on pubs.id = v.id
    )
  );
$$;

-- ── Congress presence (confirmed presenters among the asset's authors) ───────
create or replace function public.asset_congress(p_generic text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  ),
  auth as (
    select distinct pa.hcp_id
    from publication_authors_v2 pa
    join pubs on pubs.id = pa.publication_id
    where pa.hcp_id is not null
  )
  select coalesce(json_agg(json_build_object(
    'hcp_id', c.hcp_id,
    'name', c.speaker_display_name,
    'congress', c.congress_slug,
    'established_rank', c.established_rank,
    'rising_rank', c.rising_rank
  )), '[]'::json)
  from congress_confirmed_presenters c
  join auth on auth.hcp_id = c.hcp_id;
$$;

-- ── Forum threads anchored to this asset's papers ────────────────────────────
create or replace function public.asset_forum(p_generic text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with pubs as (
    select ap.publication_id as id
    from asset_publication_v1 ap
    where ap.asset_generic = p_generic
  )
  select coalesce(json_agg(json_build_object(
    'id', t.id,
    'title', t.question_title,
    'reply_count', t.reply_count,
    'recency_label', t.recency_label,
    'scope_label', t.scope_label
  )), '[]'::json)
  from field_intel_threads t
  join pubs on pubs.id = t.anchor_id;
$$;

grant execute on function public.asset_overview(text)          to anon, authenticated;
grant execute on function public.asset_composition(text)       to anon, authenticated;
grant execute on function public.asset_landing(text, int)      to anon, authenticated;
grant execute on function public.asset_authors(text, int)      to anon, authenticated;
grant execute on function public.asset_congress(text)          to anon, authenticated;
grant execute on function public.asset_forum(text)             to anon, authenticated;
