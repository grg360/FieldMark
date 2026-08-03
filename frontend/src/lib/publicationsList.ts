import { supabase } from "./supabase";
import { assetByGeneric, assetSlug } from "./assetConfig";

export interface PublicationAssetRef {
  generic: string;
  slug: string;
}

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
  // Full-text access (enriched). fullTextUrl null → no DOI, render nothing.
  // fullTextIsOa true → open-access, readable at oa_url; false → DOI link, may
  // be paywalled ("View on publisher").
  fullTextUrl?: string | null;
  fullTextIsOa?: boolean;
  // Assets this publication matched (asset_publication_v1), for the lateral entry
  // point: asset names in the bibliography row link to /assets/:slug (frame 1e).
  assets?: PublicationAssetRef[];
  // Role structure (from publication_authors_v2): drives the SENIOR AUTHOR / CO-AUTHOR
  // bands. total_authors backs the "author lists are truncated by the data" note.
  total_authors?: number | null;
  // True when a Field Intelligence discussion thread is anchored to this paper's PMID.
  // The row-level "open discussion" affordance renders ONLY where this is true; there
  // is no "ask the first question" on a threadless row (that lives on the forum).
  hasThread?: boolean;
}

export interface PublicationYearLedgerRow {
  year: number;
  paper_count: number;
  citation_total: number;
  open_access_count: number;
  leading_journals: string[]; // top journals that year, by paper count
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
  const fullTextById = new Map<string, { url: string; isOa: boolean }>();
  const assetsById = new Map<string, PublicationAssetRef[]>();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [{ data: pubs }, { data: themes }, { data: assetRows }] = await Promise.all([
      supabase.from("publications_v2").select("id, publication_types, open_access, doi").in("id", chunk),
      supabase
        .from("publication_theme_v1")
        .select("publication_id, theme_canonical_v1(short_name, canonical_name)")
        .in("publication_id", chunk)
        .eq("is_primary", true),
      supabase.from("asset_publication_v1").select("publication_id, asset_generic").in("publication_id", chunk),
    ]);
    for (const a of (assetRows ?? []) as { publication_id: string; asset_generic: string }[]) {
      const cfg = assetByGeneric(a.asset_generic);
      if (!cfg) continue; // only assets in the config vocabulary become links
      const list = assetsById.get(a.publication_id) ?? [];
      if (!list.some((x) => x.generic === cfg.generic)) {
        list.push({ generic: cfg.generic, slug: assetSlug(cfg.generic) });
      }
      assetsById.set(a.publication_id, list);
    }
    for (const p of (pubs ?? []) as {
      id: string;
      publication_types: string[] | null;
      open_access: { is_oa?: boolean; oa_url?: string | null } | null;
      doi: string | null;
    }[]) {
      typesById.set(p.id, p.publication_types);
      // Open access with a URL is the readable case; else fall back to the DOI
      // (publisher page, possibly paywalled); no DOI → no link.
      const oa = p.open_access;
      if (oa?.is_oa && oa.oa_url) {
        fullTextById.set(p.id, { url: oa.oa_url, isOa: true });
      } else if (p.doi) {
        fullTextById.set(p.id, { url: `https://doi.org/${p.doi}`, isOa: false });
      }
    }
    for (const t of (themes ?? []) as { publication_id: string; theme_canonical_v1: { short_name: string | null; canonical_name: string | null } | null }[]) {
      const tc = t.theme_canonical_v1;
      const label = tc?.short_name ?? tc?.canonical_name ?? null;
      if (label) themeById.set(t.publication_id, label);
    }
  }

  return rows.map((r) => {
    const ft = fullTextById.get(r.id);
    return {
      ...r,
      studyType: mapStudyType(typesById.get(r.id)),
      themeShort: themeById.get(r.id) ?? null,
      fullTextUrl: ft?.url ?? null,
      fullTextIsOa: ft?.isOa ?? false,
      assets: (assetsById.get(r.id) ?? []).sort((a, b) => a.generic.localeCompare(b.generic)),
    };
  });
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

// Which of these PMIDs carry a Field Intelligence discussion thread (a forum anchor).
// One query; empty set on error. Threads exist on a rounding-error fraction of papers,
// so this is small.
async function getThreadedPmids(pmids: string[]): Promise<Set<string>> {
  const clean = pmids.filter(Boolean);
  if (clean.length === 0) return new Set();
  const out = new Set<string>();
  const CHUNK = 300;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const { data } = await supabase
      .from("field_intel_anchors")
      .select("pubmed_id")
      .in("pubmed_id", clean.slice(i, i + CHUNK));
    for (const r of (data ?? []) as { pubmed_id: string }[]) out.add(r.pubmed_id);
  }
  return out;
}

type PubAuthorJoinRow = PublicationDbRow & {
  is_first_author: boolean | null;
  is_senior_author: boolean | null;
  author_position: number | null;
  total_authors: number | null;
};

/**
 * The FULL per-HCP publication record for the publications surface — every paper the
 * HCP authored (from publication_authors_v2), NOT just the positions-backing subset.
 * Carries the role flags that drive the SENIOR AUTHOR / CO-AUTHOR bands, is enriched
 * with the provenance line (study type, theme, assets, full-text access), and marks
 * which papers have a discussion thread. Optionally scoped to one publication year.
 */
export async function getFullPublicationsForHcp(
  hcpId: string,
  opts: { year?: number } = {},
): Promise<PublicationListRow[]> {
  try {
    // One join, paged by PostgREST's implicit cap via range. A prolific HCP tops out
    // around 300 papers (Heymach: 291), well under a single range window, but we page
    // defensively so growth never silently truncates.
    const PAGE = 1000;
    const rows: PubAuthorJoinRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from("publication_authors_v2")
        .select(
          "is_first_author, is_senior_author, author_position, total_authors, " +
            "publications_v2!inner(id, pubmed_id, title, journal, pub_year, pub_date, citation_count, doi, pubmed_authorships)",
        )
        .eq("hcp_id", hcpId)
        .range(from, from + PAGE - 1);
      if (opts.year != null) q = q.eq("publications_v2.pub_year", opts.year);
      const { data, error } = await q;
      if (error) {
        console.warn("getFullPublicationsForHcp: query error", error);
        break;
      }
      const batch = (data ?? []) as unknown as { is_first_author: boolean | null; is_senior_author: boolean | null; author_position: number | null; total_authors: number | null; publications_v2: PublicationDbRow }[];
      for (const b of batch) {
        rows.push({ ...b.publications_v2, is_first_author: b.is_first_author, is_senior_author: b.is_senior_author, author_position: b.author_position, total_authors: b.total_authors });
      }
      if (batch.length < PAGE) break;
    }

    // Dedupe by publication (a pair could yield two link rows in theory), keeping the
    // strongest role.
    const byPub = new Map<string, PubAuthorJoinRow>();
    for (const r of rows) {
      const prev = byPub.get(r.id);
      if (!prev || (r.is_senior_author && !prev.is_senior_author)) byPub.set(r.id, r);
    }

    const mapped: PublicationListRow[] = [...byPub.values()].map((r) => ({
      ...mapPublicationRow(r),
      is_first_author: r.is_first_author ?? undefined,
      is_senior_author: r.is_senior_author ?? undefined,
      author_position: r.author_position,
      total_authors: r.total_authors,
    }));

    const enriched = await enrichCharacterisation(mapped);
    const threaded = await getThreadedPmids(enriched.map((r) => r.pmid ?? "").filter(Boolean));
    return enriched.map((r) => ({ ...r, hasThread: !!r.pmid && threaded.has(r.pmid) }));
  } catch (err) {
    console.warn("getFullPublicationsForHcp: error", err);
    return [];
  }
}

/**
 * Co-author year ledger for the full-career view: one grouped aggregate query, one
 * row per year (citation total, paper count, OA count, leading journals). Cheap — a
 * single GROUP BY, no per-row enrichment. Senior-author papers are shown individually
 * above the ledger and are excluded here.
 */
export async function getCoAuthorYearLedger(hcpId: string): Promise<PublicationYearLedgerRow[]> {
  try {
    // journals need per-year grouping too; PostgREST can't array_agg, so we fetch the
    // co-author (year, journal, citation, oa) tuples once and fold client-side. Still
    // one round trip; the payload is one small row per co-authored paper.
    const rows: { pub_year: number | null; journal: string | null; citation_count: number | null; open_access: { is_oa?: boolean } | null }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("publication_authors_v2")
        .select("publications_v2!inner(pub_year, journal, citation_count, open_access)")
        .eq("hcp_id", hcpId)
        .eq("is_senior_author", false)
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = (data ?? []) as unknown as { publications_v2: { pub_year: number | null; journal: string | null; citation_count: number | null; open_access: { is_oa?: boolean } | null } }[];
      for (const b of batch) rows.push(b.publications_v2);
      if (batch.length < PAGE) break;
    }
    const byYear = new Map<number, { papers: number; cites: number; oa: number; journals: Map<string, number> }>();
    for (const r of rows) {
      if (r.pub_year == null) continue;
      const y = byYear.get(r.pub_year) ?? { papers: 0, cites: 0, oa: 0, journals: new Map() };
      y.papers += 1;
      y.cites += r.citation_count ?? 0;
      if (r.open_access?.is_oa) y.oa += 1;
      if (r.journal) y.journals.set(r.journal, (y.journals.get(r.journal) ?? 0) + 1);
      byYear.set(r.pub_year, y);
    }
    return [...byYear.entries()]
      .map(([year, v]) => ({
        year,
        paper_count: v.papers,
        citation_total: v.cites,
        open_access_count: v.oa,
        leading_journals: [...v.journals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0]),
      }))
      .sort((a, b) => b.year - a.year);
  } catch (err) {
    console.warn("getCoAuthorYearLedger: error", err);
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
