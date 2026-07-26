-- get_partner_publications — DB-side co-authored-publications intersection for a
-- pair of INSTITUTIONS (applied to the live DB 2026-07-26).
--
-- Companion to get_shared_publications (HCP-pair intersection). Replaces the
-- client-side fetch-both-then-intersect in getPublicationsByPartner
-- (publicationsList.ts) — the more exposed of the two, because institutions have
-- many HCPs. That path was truncating in two places against the implicit 1000-row
-- PostgREST cap: the hcps_v2 fetch itself (MD Anderson has 1,199 HCPs, only 1,000
-- returned) and the per-100-HCP publication_authors_v2 fetches. Result: silent
-- undercounts — verified MD Anderson <-> Memorial Sloan Kettering returned 329
-- shared client-side vs the correct 423. The self-join below computes it in SQL
-- with no truncation.
--
-- A publication qualifies if >=1 author is at the source institution AND >=1 at
-- the partner, matching on institution_canonical OR institution_normalized (same
-- linkage the frontend used). publication_authors_v2 is the authoritative
-- canonical hcp_id linkage — not author_pub_flat.

create or replace function public.get_partner_publications(
  p_source text, p_partner text, p_limit int default 200
)
returns table(
  id uuid, pubmed_id text, title text, journal text,
  pub_year integer, pub_date date, citation_count integer, doi text,
  pubmed_authorships jsonb
)
language sql stable
as $func$
  select distinct p.id, p.pubmed_id, p.title, p.journal, p.pub_year, p.pub_date,
         p.citation_count, p.doi, p.pubmed_authorships
  from publication_authors_v2 a
  join hcps_v2 hs on hs.id = a.hcp_id
  join publication_authors_v2 b on b.publication_id = a.publication_id
  join hcps_v2 hp on hp.id = b.hcp_id
  join publications_v2 p on p.id = a.publication_id
  where (hs.institution_canonical = p_source or hs.institution_normalized = p_source)
    and (hp.institution_canonical = p_partner or hp.institution_normalized = p_partner)
  order by p.citation_count desc nulls last, p.pub_year desc nulls last
  limit p_limit;
$func$;

grant execute on function public.get_partner_publications(text, text, int) to anon, authenticated;
