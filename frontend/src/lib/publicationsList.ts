import { supabase } from "./supabase";

export interface PublicationListRow {
  id: string;
  pmid: string | null;
  title: string;
  journal: string | null;
  pub_year: number | null;
  pub_date: string | null;
  citation_count: number | null;
  doi: string | null;
  is_first_author?: boolean;
  is_senior_author?: boolean;
  author_position?: number | null;
  // Raw pubmed_authorships JSON; PublicationCard formats it into a byline.
  pubmed_authorships?: unknown;
  // Pre-formatted byline (subject-anchored). When present, the card renders this
  // verbatim instead of formatting pubmed_authorships — used by the year
  // bibliography, whose byline comes from formatBibliographyByline upstream.
  bylineText?: string;
  // Characterisation line (enriched post-fetch). Either may be null; when both
  // are null the line renders nothing — no placeholder.
  studyType?: string | null;   // mapped from publication_types
  themeShort?: string | null;  // theme_canonical_v1.short_name, primary theme
}

// Map raw MeSH publication_types to a short study-type label, most specific first.
// "Phase 3 RCT" reads "Phase 3", not both. Returns null when nothing recognised.
export function mapStudyType(types: string[] | null | undefined): string | null {
  if (!types || types.length === 0) return null;
  const has = (needle: string) => types.some((t) => t.toLowerCase().includes(needle));
  if (has("phase iii")) return "Phase 3";
  if (has("phase iv")) return "Phase 4";
  if (has("phase ii")) return "Phase 2";
  if (has("phase i")) return "Phase 1";
  if (has("meta-analysis")) return "Meta-analysis";
  if (has("systematic review")) return "Systematic review";
  if (has("randomized controlled")) return "Randomised trial";
  if (has("observational study")) return "Observational";
  if (has("case reports")) return "Case report";
  if (has("review")) return "Review";
  return null;
}

// Enrich built rows with the characterisation-line inputs in two batched queries
// (publication_types by id; primary theme short_name by publication_id), uniform
// across every entry point — including the RPC-backed pair/partner lists whose
// rows don't carry publication_types.
export async function enrichCharacterisation(rows: PublicationListRow[]): Promise<PublicationListRow[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const CHUNK = 200;
  const typesById = new Map<string, string[] | null>();
  const themeById = new Map<string, string>();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [{ data: pubs }, { data: themes }] = await Promise.all([
      supabase.from("publications_v2").select("id, publication_types").in("id", chunk),
      supabase
        .from("publication_theme_v1")
        .select("publication_id, theme_canonical_v1(short_name, canonical_name)")
        .in("publication_id", chunk)
        .eq("is_primary", true),
    ]);
    for (const p of (pubs ?? []) as { id: string; publication_types: string[] | null }[]) {
      typesById.set(p.id, p.publication_types);
    }
    for (const t of (themes ?? []) as { publication_id: string; theme_canonical_v1: { short_name: string | null; canonical_name: string | null } | null }[]) {
      const tc = t.theme_canonical_v1;
      const label = tc?.short_name ?? tc?.canonical_name ?? null;
      if (label) themeById.set(t.publication_id, label);
    }
  }

  return rows.map((r) => ({
    ...r,
    studyType: mapStudyType(typesById.get(r.id)),
    themeShort: themeById.get(r.id) ?? null,
  }));
}

type PublicationDbRow = {
  id: string;
  pubmed_id: string | null;
  title: string | null;
  journal: string | null;
  pub_year: number | null;
  pub_date: string | null;
  citation_count: number | null;
  doi: string | null;
  pubmed_authorships: unknown;
};

function mapPublicationRow(row: PublicationDbRow): PublicationListRow {
  return {
    id: row.id,
    pmid: row.pubmed_id,
    title: row.title ?? "(Untitled)",
    journal: row.journal,
    pub_year: row.pub_year,
    pub_date: row.pub_date,
    citation_count: row.citation_count,
    doi: row.doi,
    pubmed_authorships: row.pubmed_authorships,
  };
}

export async function getPublicationsByTheme(
  institutionName: string,
  themeName: string,
  therapeuticArea: string = "NSCLC",
  limit: number = 50,
): Promise<PublicationListRow[]> {
  try {
    const { data: hcpRows } = await supabase
      .from("hcps_v2")
      .select("id")
      .or(`institution_canonical.eq.${institutionName},institution_normalized.eq.${institutionName}`);

    const hcpIds = (hcpRows ?? []).map((h: { id: string }) => h.id);
    if (hcpIds.length === 0) return [];

    const CHUNK_SIZE = 100;
    const pmidSet = new Set<string>();

    for (let i = 0; i < hcpIds.length; i += CHUNK_SIZE) {
      const chunk = hcpIds.slice(i, i + CHUNK_SIZE);
      const { data } = await supabase
        .from("hcp_research_themes_v2")
        .select("example_pmids")
        .in("hcp_id", chunk)
        .eq("theme_name", themeName)
        .eq("therapeutic_area", therapeuticArea);

      for (const row of (data ?? []) as { example_pmids: string[] | null }[]) {
        if (Array.isArray(row.example_pmids)) {
          for (const pmid of row.example_pmids) {
            if (pmid) pmidSet.add(pmid);
          }
        }
      }
    }

    if (pmidSet.size === 0) return [];

    const pmids = Array.from(pmidSet);
    const allPubs: PublicationListRow[] = [];

    for (let i = 0; i < pmids.length; i += CHUNK_SIZE) {
      const chunk = pmids.slice(i, i + CHUNK_SIZE);
      const { data } = await supabase
        .from("publications_v2")
        .select("id, pubmed_id, title, journal, pub_year, pub_date, citation_count, doi, pubmed_authorships")
        .in("pubmed_id", chunk);

      for (const row of (data ?? []) as PublicationDbRow[]) {
        allPubs.push(mapPublicationRow(row));
      }
    }

    allPubs.sort((a, b) => {
      const aCites = a.citation_count ?? 0;
      const bCites = b.citation_count ?? 0;
      if (bCites !== aCites) return bCites - aCites;
      return (b.pub_year ?? 0) - (a.pub_year ?? 0);
    });

    return enrichCharacterisation(allPubs.slice(0, limit));
  } catch (err) {
    console.warn("getPublicationsByTheme: error", err);
    return [];
  }
}

export async function getPublicationsByInternalPair(
  hcp1Id: string,
  hcp2Id: string,
  limit: number = 50,
): Promise<PublicationListRow[]> {
  try {
    // DB-side intersection (get_shared_publications RPC): a single
    // publication_authors_v2 self-join, ordered + limited in SQL. Replaces the
    // former client-side fetch-both-then-intersect, which relied on the implicit
    // 1000-row PostgREST cap and would silently drop shared papers for any author
    // exceeding it as the corpus grows.
    const { data, error } = await supabase.rpc("get_shared_publications", {
      p_hcp1: hcp1Id,
      p_hcp2: hcp2Id,
      p_limit: limit,
    });
    if (error || !data) return [];
    return enrichCharacterisation((data as PublicationDbRow[]).map(mapPublicationRow));
  } catch (err) {
    console.warn("getPublicationsByInternalPair: error", err);
    return [];
  }
}

export async function getPublicationsByPartner(
  sourceInstitutionName: string,
  partnerInstitutionName: string,
  limit: number = 50,
): Promise<PublicationListRow[]> {
  try {
    // DB-side intersection (get_partner_publications RPC): a publication_authors_v2
    // self-join across the two institutions, ordered + limited in SQL. Replaces the
    // former client-side fetch-both-then-intersect — the more exposed of the two
    // intersections, since institutions have many HCPs: the hcps_v2 fetch alone
    // capped at 1000 (MD Anderson has 1,199), and the per-chunk publication_authors_v2
    // fetches truncated too, silently undercounting shared papers (verified: MD
    // Anderson <-> Memorial Sloan Kettering returned 329 client-side vs the correct 423).
    const { data, error } = await supabase.rpc("get_partner_publications", {
      p_source: sourceInstitutionName,
      p_partner: partnerInstitutionName,
      p_limit: limit,
    });
    if (error || !data) return [];
    return enrichCharacterisation((data as PublicationDbRow[]).map(mapPublicationRow));
  } catch (err) {
    console.warn("getPublicationsByPartner: error", err);
    return [];
  }
}

export async function getPublicationsForHcp(
  hcpId: string,
  taId: string,
  limit: number = 50,
): Promise<PublicationListRow[]> {
  try {
    const { data: positions, error: posError } = await supabase
      .from("hcp_scientific_positions_v1")
      .select("publication_id")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId);

    if (posError) {
      console.warn("getPublicationsForHcp: positions query error", posError);
      return [];
    }

    const publicationIds = Array.from(
      new Set((positions ?? []).map((p: { publication_id: string }) => p.publication_id))
    );

    if (publicationIds.length === 0) return [];

    const CHUNK_SIZE = 100;
    const allRows: PublicationListRow[] = [];

    for (let i = 0; i < publicationIds.length; i += CHUNK_SIZE) {
      const chunk = publicationIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("publications_v2")
        .select("id, pubmed_id, title, journal, pub_year, pub_date, citation_count, doi, pubmed_authorships")
        .in("id", chunk);

      if (error) {
        console.warn("getPublicationsForHcp: publications query error", error);
        return [];
      }

      for (const row of (data ?? []) as PublicationDbRow[]) {
        allRows.push(mapPublicationRow(row));
      }
    }

    const sorted = allRows.sort((a, b) => {
      const aCites = a.citation_count ?? -1;
      const bCites = b.citation_count ?? -1;
      if (bCites !== aCites) return bCites - aCites;
      return (b.pub_year ?? 0) - (a.pub_year ?? 0);
    });

    return enrichCharacterisation(sorted.slice(0, limit));
  } catch (err) {
    console.warn("getPublicationsForHcp: error", err);
    return [];
  }
}
