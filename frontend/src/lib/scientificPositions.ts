import { supabase } from "./supabase";

export type CorpusDepth = "deep" | "focused" | "signal_moment";
export type PositionType =
  | "positive_position"
  | "cautionary_position"
  | "unmet_need_position"
  | "hypothesis_position";
export type PositionCategory =
  | "efficacy"
  | "patient_selection"
  | "biomarker"
  | "safety"
  | "resistance"
  | "sequencing"
  | "access"
  | "diagnostics"
  | "methodology";
export type AuthorRole =
  | "first_author"
  | "senior_author"
  | "co_first_author"
  | "co_senior_author";

export interface AdvocacyTheme {
  theme: string;
  summary: string;
  evidence_count: number;
  supporting_paper_count: number | null;
  confidence: number;
  representative_position_ids: string[];
  primary_position_categories: string[];
}

export interface ResearchFocusItem {
  theme: string;
  weight: number;
  primary_position_categories: string[];
}

export interface ScientificNarrative {
  headline: string;
  strongly_advocates: AdvocacyTheme[];
  frequently_raises: AdvocacyTheme[];
  research_focus: ResearchFocusItem[];
  corpus_depth: CorpusDepth;
  paper_count: number;
  position_count: number;
}

export interface EvidencePosition {
  position_id: string;
  publication_id: string;
  author_role: AuthorRole;
  position_type: PositionType;
  position_category: PositionCategory | null;
  drug_name: string | null;
  biomarker: string | null;
  position_text: string;
  evidence_excerpt: string;
  confidence: number;
  pub_year: number | null;
  citation_count: number | null;
  pub_title: string | null;
  journal: string | null;
  doi: string | null;
  pubmed_id: string | null;
}

export interface EvidencePaper {
  publication_id: string;
  pub_title: string | null;
  pub_year: number | null;
  citation_count: number | null;
  journal: string | null;
  author_role: AuthorRole;
  doi: string | null;
  pubmed_id: string | null;
  positions: EvidencePosition[];
}

const CHUNK_SIZE = 100;

const VALID_CORPUS_DEPTHS = new Set<CorpusDepth>(["deep", "focused", "signal_moment"]);

type PositionRow = {
  id: string;
  publication_id: string;
  author_role: string;
  position_type: string;
  position_category: string | null;
  drug_name: string | null;
  biomarker: string | null;
  position_text: string;
  evidence_excerpt: string;
  confidence: number;
  pub_year: number | null;
  citation_count: number | null;
  publications_v2: { title: string | null; journal: string | null; doi: string | null; pubmed_id: string | null } | null;
};

function isAdvocacyTheme(value: unknown): value is AdvocacyTheme {
  if (!value || typeof value !== "object") return false;
  const row = value as AdvocacyTheme;
  const hasValidPaperCount = row.supporting_paper_count === undefined
    || row.supporting_paper_count === null
    || typeof row.supporting_paper_count === "number";
  return (
    typeof row.theme === "string"
    && typeof row.summary === "string"
    && typeof row.evidence_count === "number"
    && typeof row.confidence === "number"
    && Array.isArray(row.representative_position_ids)
    && Array.isArray(row.primary_position_categories)
    && hasValidPaperCount
  );
}

function isResearchFocusItem(value: unknown): value is ResearchFocusItem {
  if (!value || typeof value !== "object") return false;
  const row = value as ResearchFocusItem;
  return (
    typeof row.theme === "string"
    && typeof row.weight === "number"
    && Array.isArray(row.primary_position_categories)
  );
}

function parseScientificNarrative(body: string, hcpId: string): ScientificNarrative | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const row = parsed as ScientificNarrative;
    if (typeof row.headline !== "string") return null;
    if (!VALID_CORPUS_DEPTHS.has(row.corpus_depth)) return null;
    if (typeof row.paper_count !== "number" || typeof row.position_count !== "number") return null;
    if (!Array.isArray(row.strongly_advocates) || !row.strongly_advocates.every(isAdvocacyTheme)) {
      return null;
    }
    if (!Array.isArray(row.frequently_raises) || !row.frequently_raises.every(isAdvocacyTheme)) {
      return null;
    }
    if (!Array.isArray(row.research_focus) || !row.research_focus.every(isResearchFocusItem)) {
      return null;
    }

    const normalize = (theme: AdvocacyTheme): AdvocacyTheme => ({
      ...theme,
      supporting_paper_count: theme.supporting_paper_count ?? null,
    });

    return {
      ...row,
      strongly_advocates: row.strongly_advocates.map(normalize),
      frequently_raises: row.frequently_raises.map(normalize),
    };
  } catch (err) {
    console.warn(`getScientificNarrativeForHcp: parse failed for ${hcpId}`, err);
    return null;
  }
}

function mapPositionRow(row: PositionRow): EvidencePosition {
  const pub = row.publications_v2;
  return {
    position_id: row.id,
    publication_id: row.publication_id,
    author_role: row.author_role as AuthorRole,
    position_type: row.position_type as PositionType,
    position_category: row.position_category as PositionCategory | null,
    drug_name: row.drug_name,
    biomarker: row.biomarker,
    position_text: row.position_text,
    evidence_excerpt: row.evidence_excerpt,
    confidence: row.confidence,
    pub_year: row.pub_year,
    citation_count: row.citation_count,
    pub_title: pub?.title ?? null,
    journal: pub?.journal ?? null,
    doi: pub?.doi ?? null,
    pubmed_id: pub?.pubmed_id ?? null,
  };
}

function sortPapers(a: EvidencePaper, b: EvidencePaper): number {
  const aCites = a.citation_count ?? -1;
  const bCites = b.citation_count ?? -1;
  if (bCites !== aCites) return bCites - aCites;
  return (b.pub_year ?? 0) - (a.pub_year ?? 0);
}

export async function getScientificNarrativeForHcp(
  hcpId: string,
  therapeuticArea: string,
): Promise<ScientificNarrative | null> {
  try {
    const { data, error } = await supabase
      .from("hcp_ai_overviews")
      .select("body")
      .eq("hcp_id", hcpId)
      .eq("synthesis_type", "scientific_positions")
      .eq("therapeutic_area", therapeuticArea)
      .maybeSingle();

    if (error) {
      console.warn(`getScientificNarrativeForHcp: query error for ${hcpId}`, error);
      return null;
    }

    if (!data?.body || typeof data.body !== "string") {
      return null;
    }

    return parseScientificNarrative(data.body, hcpId);
  } catch (err) {
    console.warn(`getScientificNarrativeForHcp: error for ${hcpId}`, err);
    return null;
  }
}

export async function getEvidenceForTheme(positionIds: string[]): Promise<EvidencePaper[]> {
  if (positionIds.length === 0) return [];

  try {
    const allRows: PositionRow[] = [];

    for (let i = 0; i < positionIds.length; i += CHUNK_SIZE) {
      const chunk = positionIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("hcp_scientific_positions_v1")
        .select(`
          id,
          publication_id,
          author_role,
          position_type,
          position_category,
          drug_name,
          biomarker,
          position_text,
          evidence_excerpt,
          confidence,
          pub_year,
          citation_count,
          publications_v2 (
            title,
            journal,
            doi,
            pubmed_id
          )
        `)
        .in("id", chunk);

      if (error) {
        console.warn("getEvidenceForTheme: query error", error);
        return [];
      }

      for (const row of (data ?? []) as PositionRow[]) {
        allRows.push(row);
      }
    }

    const byPublication = new Map<string, EvidencePosition[]>();

    for (const row of allRows) {
      const position = mapPositionRow(row);
      const existing = byPublication.get(position.publication_id) ?? [];
      existing.push(position);
      byPublication.set(position.publication_id, existing);
    }

    const papers: EvidencePaper[] = [];

    for (const [publicationId, positions] of byPublication.entries()) {
      const sortedPositions = [...positions].sort((a, b) => b.confidence - a.confidence);
      const first = sortedPositions[0];
      papers.push({
        publication_id: publicationId,
        pub_title: first.pub_title,
        pub_year: first.pub_year,
        citation_count: first.citation_count,
        journal: first.journal,
        author_role: first.author_role,
        doi: first.doi,
        pubmed_id: first.pubmed_id,
        positions: sortedPositions,
      });
    }

    return papers.sort(sortPapers);
  } catch (err) {
    console.warn("getEvidenceForTheme: error", err);
    return [];
  }
}

/**
 * Order positions so consecutive entries come from DIFFERENT publications.
 *
 * WHY. The previous ordering was citation_count DESC, confidence DESC — which sorts by a
 * property of the PAPER, so every position from the most-cited paper lands before any position
 * from the second. Measured on Heymach (49 positions, NSCLC): the top 20 was four papers
 * contributing five positions each — 286c x5, 283c x5, 218c x5, 177c x5. A reader scrolling
 * the Belief Profile saw four topics where the data held twenty.
 *
 * WHAT THIS DOES. Round-robin across publications: every paper's best position first, then
 * every paper's second-best, and so on. The same 49 positions in the same viewport now surface
 * ~20 distinct papers instead of 4.
 *
 * WITHIN A ROUND, and for picking each paper's "best", the comparator is:
 *   1. senior_author before first_author
 *   2. citation_count DESC (nulls last)
 *   3. confidence DESC
 *
 * WHY SENIORITY OUTRANKS CITATIONS. Senior authorship is a stronger indicator of a scientist's
 * core beliefs than first authorship. A senior author chooses the project's direction, shapes
 * the central hypotheses, secures the funding the work must align with, and signs off on the
 * final conclusions. A first author is often executing an idea handed down by a mentor — the
 * work reflects a training phase rather than settled conviction, and may be adapted to a
 * supervisor's viewpoint.
 *
 * So this surface orders by WHOSE BELIEFS THE PAPER REPRESENTS, not by impact. That is why a
 * senior-authored paper can sort above a more-cited first-authored one, and it is a deliberate
 * departure from the citation-first ordering used everywhere else in the product. Concretely,
 * on Heymach the change moves his 650-citation first-author paper from positions 1-5 down to
 * 10: the most-cited item on the profile is no longer the first thing a reader sees, because
 * it is the least likely of his papers to represent his own settled view.
 *
 * If this surface is ever repurposed to rank by influence rather than by conviction, this
 * comparator is the thing to change — not the interleave.
 *
 * author_role IS USED DELIBERATELY, AND IT IS NOT A GUESS. It is written by
 * extract_scientific_positions.TOP_PAPERS_SQL as
 *   CASE WHEN is_senior_author THEN 'senior_author' ELSE 'first_author' END
 * i.e. computed in SQL straight from publication_authors_v2.is_senior_author. Verified
 * 2026-08-27 against that table with the correct two-column join (publication_id AND hcp_id):
 * 19,585 of 19,585 NSCLC rows agree — 100%. So ordering on it needs no join, and adding one
 * would return the same answer more slowly. (A join on publication_id ALONE fans each position
 * out to every co-author and appears to show ~21-36% agreement; that is the join being wrong,
 * not the column.)
 *
 * There is no middle_author tier to order below these two: TOP_PAPERS_SQL selects only papers
 * where the HCP is first or senior, so a middle-author position is never extracted.
 *
 * STABLE for equal keys — Array.prototype.sort is stable in every engine we target, and the
 * DB already returns rows in a deterministic order, so repeat loads do not reshuffle.
 */
function comparePositions(a: PositionRow, b: PositionRow): number {
  const seniority = (r: PositionRow) => (r.author_role === "senior_author" ? 0 : 1);
  const bySeniority = seniority(a) - seniority(b);
  if (bySeniority !== 0) return bySeniority;
  // nulls last, matching the query's nullsFirst: false
  const cite = (r: PositionRow) =>
    r.citation_count === null || r.citation_count === undefined ? -1 : r.citation_count;
  const byCitation = cite(b) - cite(a);
  if (byCitation !== 0) return byCitation;
  return (b.confidence ?? 0) - (a.confidence ?? 0);
}

export function interleaveByPublication(rows: PositionRow[]): PositionRow[] {
  if (rows.length < 2) return rows;

  // Group by publication. A row with no publication_id gets its own bucket keyed by row id, so
  // it is never merged with unrelated rows and never silently dropped.
  const byPub = new Map<string, PositionRow[]>();
  for (const row of rows) {
    const key = row.publication_id ?? `__nopub__${row.id}`;
    const bucket = byPub.get(key);
    if (bucket) bucket.push(row);
    else byPub.set(key, [row]);
  }

  // Rank within each paper, so round N takes each paper's Nth-best.
  for (const bucket of byPub.values()) bucket.sort(comparePositions);

  // Order the papers themselves by their own best position, so round 1 reads strongest-first.
  const buckets = [...byPub.values()].sort((x, y) => comparePositions(x[0], y[0]));

  const out: PositionRow[] = [];
  const deepest = Math.max(...buckets.map((b) => b.length));
  for (let round = 0; round < deepest; round++) {
    const thisRound = buckets.filter((b) => b.length > round).map((b) => b[round]);
    thisRound.sort(comparePositions);
    out.push(...thisRound);
  }

  // Never lose or duplicate a row: the interleave is a permutation, nothing more.
  if (out.length !== rows.length) {
    console.warn(
      `interleaveByPublication: ${rows.length} in, ${out.length} out — falling back to input order`,
    );
    return rows;
  }
  return out;
}

export async function getAllPositionsForHcp(
  hcpId: string,
  taId: string,
): Promise<EvidencePosition[]> {
  try {
    const { data, error } = await supabase
      .from("hcp_scientific_positions_v1")
      .select(`
        id,
        publication_id,
        author_role,
        position_type,
        position_category,
        drug_name,
        biomarker,
        position_text,
        evidence_excerpt,
        confidence,
        pub_year,
        citation_count,
        publications_v2 (
          title,
          journal,
          doi,
          pubmed_id
        )
      `)
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .order("citation_count", { ascending: false, nullsFirst: false })
      .order("confidence", { ascending: false });

    if (error) {
      console.warn("getAllPositionsForHcp: query error", error);
      return [];
    }

    const rows = (data ?? []) as PositionRow[];
    return interleaveByPublication(rows).map(mapPositionRow);
  } catch (err) {
    console.warn("getAllPositionsForHcp: error", err);
    return [];
  }
}
