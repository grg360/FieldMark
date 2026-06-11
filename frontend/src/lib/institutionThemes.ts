import { supabase } from "./supabase";
import type { ThemeCentrality } from "../types/researchTheme";

export interface InstitutionResearchTheme {
  theme_name: string;
  total_paper_count: number;
  investigator_count: number;
  core_count: number;
  supporting_count: number;
  peripheral_count: number;
  top_contributor: {
    hcp_id: string;
    name: string;
    paper_count: number;
  } | null;
}

export async function getInstitutionResearchThemes(
  institutionName: string,
  therapeuticArea: string = "NSCLC",
  limit: number = 20,
): Promise<InstitutionResearchTheme[]> {
  try {
    const { data: hcpRows, error: hcpError } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name")
      .or(`institution_canonical.eq.${institutionName},institution_normalized.eq.${institutionName}`);

    if (hcpError) {
      console.warn("getInstitutionResearchThemes: hcp fetch error", hcpError);
      return [];
    }

    const hcps = (hcpRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>;
    if (hcps.length === 0) return [];

    const hcpIdSet = new Set(hcps.map((h) => h.id));
    const hcpNameMap = new Map(hcps.map((h) => [h.id, `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown"]));

    const CHUNK_SIZE = 100;
    const hcpIdList = Array.from(hcpIdSet);
    type ThemeRow = {
      hcp_id: string;
      theme_name: string;
      centrality: ThemeCentrality;
      paper_count: number;
      therapeutic_area: string;
    };
    const allThemeRows: ThemeRow[] = [];

    for (let i = 0; i < hcpIdList.length; i += CHUNK_SIZE) {
      const chunk = hcpIdList.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from("hcp_research_themes_v2")
        .select("hcp_id, theme_name, centrality, paper_count, therapeutic_area")
        .in("hcp_id", chunk)
        .eq("therapeutic_area", therapeuticArea)
        .gte("display_rank", 1);

      if (error) {
        console.warn("getInstitutionResearchThemes: theme chunk error", error);
        continue;
      }
      for (const row of (data ?? []) as ThemeRow[]) {
        allThemeRows.push(row);
      }
    }

    type Aggregation = {
      total_paper_count: number;
      investigators: Set<string>;
      core_count: number;
      supporting_count: number;
      peripheral_count: number;
      per_hcp_papers: Map<string, number>;
    };
    const byTheme = new Map<string, Aggregation>();

    for (const row of allThemeRows) {
      if (!byTheme.has(row.theme_name)) {
        byTheme.set(row.theme_name, {
          total_paper_count: 0,
          investigators: new Set(),
          core_count: 0,
          supporting_count: 0,
          peripheral_count: 0,
          per_hcp_papers: new Map(),
        });
      }
      const agg = byTheme.get(row.theme_name)!;
      agg.total_paper_count += row.paper_count;
      agg.investigators.add(row.hcp_id);
      if (row.centrality === "core") agg.core_count += 1;
      else if (row.centrality === "supporting") agg.supporting_count += 1;
      else if (row.centrality === "peripheral") agg.peripheral_count += 1;
      agg.per_hcp_papers.set(row.hcp_id, (agg.per_hcp_papers.get(row.hcp_id) ?? 0) + row.paper_count);
    }

    const themes: InstitutionResearchTheme[] = [];
    for (const [theme_name, agg] of byTheme.entries()) {
      let topContributorId: string | null = null;
      let topContributorPapers = -1;
      for (const [hcpId, papers] of agg.per_hcp_papers.entries()) {
        if (papers > topContributorPapers) {
          topContributorId = hcpId;
          topContributorPapers = papers;
        }
      }

      themes.push({
        theme_name,
        total_paper_count: agg.total_paper_count,
        investigator_count: agg.investigators.size,
        core_count: agg.core_count,
        supporting_count: agg.supporting_count,
        peripheral_count: agg.peripheral_count,
        top_contributor: topContributorId
          ? {
              hcp_id: topContributorId,
              name: hcpNameMap.get(topContributorId) ?? "Unknown",
              paper_count: topContributorPapers,
            }
          : null,
      });
    }

    themes.sort((a, b) => {
      if (b.total_paper_count !== a.total_paper_count) return b.total_paper_count - a.total_paper_count;
      return b.investigator_count - a.investigator_count;
    });

    return themes.slice(0, limit);
  } catch (err) {
    console.warn("getInstitutionResearchThemes: error", err);
    return [];
  }
}
