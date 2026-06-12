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
  therapeuticArea: string = "NSCLC",
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
