-- get_shared_publications — DB-side co-authored-publications intersection for a
-- pair of HCPs (applied to the live DB 2026-07-26).
--
-- Replaces the frontend's client-side fetch-both-then-intersect in
-- getPublicationsByInternalPair (publicationsList.ts). That pattern fetched each
-- HCP's full publication_authors_v2 rows into the browser and intersected in JS,
-- relying on the implicit 1000-row PostgREST cap — so once any author exceeds
-- 1000 authorship rows, shared papers beyond the window would silently vanish,
-- diverging from the precomputed rail count (hcp_top_collaborators_v2). The
-- self-join below does the intersection in SQL with no client truncation.
--
-- publication_authors_v2 is the authoritative canonical linkage (hcp_id, with
-- openalex_author_id/disambiguation provenance). Do NOT resolve co-authorship
-- through author_pub_flat (raw OpenAlex author_id, no hcp_id).

create or replace function public.get_shared_publications(
  p_hcp1 uuid, p_hcp2 uuid, p_limit int default 200
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
  join publication_authors_v2 b on a.publication_id = b.publication_id
  join publications_v2 p on p.id = a.publication_id
  where a.hcp_id = p_hcp1 and b.hcp_id = p_hcp2
  order by p.citation_count desc nulls last, p.pub_year desc nulls last
  limit p_limit;
$func$;

grant execute on function public.get_shared_publications(uuid, uuid, int) to anon, authenticated;
