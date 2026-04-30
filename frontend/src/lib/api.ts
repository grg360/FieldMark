import { supabase } from "./supabase";
import type { HCP, HCPScore, RisingStar } from "./types";

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

export interface HCPPublication {
  id: string;
  hcp_id: string;
  title: string;
  pub_year: number;
  [key: string]: unknown;
}

export interface HCPDetail extends RisingStar {
  publications: HCPPublication[];
  trial_count: number;
}

type RisingStarWithNarrative = RisingStar & { narrative: string | null };

function mapRisingStarRow(row: any, therapeuticArea: string): RisingStar {
  const hcp = row.hcps ?? {};

  return {
    id: hcp.id ?? row.hcp_id ?? "",
    first_name: String(hcp.first_name ?? ""),
    last_name: String(hcp.last_name ?? ""),
    institution: String(hcp.institution ?? ""),
    country: String(hcp.country ?? ""),
    therapeutic_area: String(
      hcp.therapeutic_area ?? therapeuticArea,
    ),
    hcp_id: row.hcp_id ?? hcp.id ?? "",
    composite_score: Number(row.composite_score ?? 0),
    pub_velocity: Number(row.pub_velocity_score ?? row.pub_velocity ?? 0),
    citation_trajectory: Number(
      row.citation_trajectory_score ?? row.citation_trajectory ?? 0,
    ),
    trial_score: Number(row.trial_investigator_score ?? row.trial_score ?? 0),
    career_multiplier: Number(row.career_multiplier ?? 0),
    first_pub_year: Number(row.first_pub_year ?? 0),
    stored_pubs: Number(row.stored_pubs ?? 0),
  };
}

export async function getRisingStars(
  therapeuticArea: string,
  limit: number = 20,
): Promise<ApiResult<RisingStarWithNarrative[]>> {
  try {
    const TA_ID_MAP: Record<string, string> = {
      "rare-disease": "833e7b38-d01b-409e-82c0-71eb29e138a0",
      hepatology: "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e",
      nsclc: "c0065b03-a25e-4e9a-bde4-4b4d0db7827d",
      oncology: "095bc902-c3dc-48a3-8167-52ee55795d60",
      immunology: "4cf07827-ff1c-451e-832e-0e0a14ea9c86",
    };

    const taSlug = therapeuticArea.toLowerCase().trim();
    const taId = TA_ID_MAP[taSlug];
    console.log("taId being used:", taId);

    if (!taId) {
      return { data: [], error: null };
    }

    const { data: scoreData, error: scoreError } = await supabase
      .from("hcp_scores")
      .select(
        "hcp_id, composite_score, pub_velocity_score, citation_trajectory_score, trial_investigator_score",
      )
      .eq("therapeutic_area_id", taId)
      .order("composite_score", { ascending: false })
      .limit(200);

    if (scoreError) {
      return { data: null, error: scoreError.message };
    }

    if (!scoreData || scoreData.length === 0) {
      return { data: [], error: null };
    }

    const hcpIds = scoreData.map((r) => r.hcp_id);
    console.log("hcpIds being queried:", hcpIds);
    const { data: hcpData, error: hcpError } = await supabase
      .from("hcps")
      .select("id, first_name, last_name, institution, country")
      .in("id", hcpIds)
      .eq("country", "USA")
      .limit(limit);

    if (hcpError) {
      return { data: null, error: hcpError.message };
    }

    const { data: narrativeData } = await supabase
      .from("hcp_narratives")
      .select("hcp_id, narrative")
      .in("hcp_id", hcpIds)
      .eq("therapeutic_area_id", taId);
    console.log("narrativeData returned:", narrativeData);

    const narrativeMap = new Map(
      (narrativeData || []).map((n) => [String(n.hcp_id), n.narrative as string | null]),
    );
    console.log("narrativeMap size:", narrativeMap?.size);

    const hcpById = new Map((hcpData ?? []).map((hcp) => [String(hcp.id), hcp]));

    const risingStars: RisingStarWithNarrative[] = scoreData
      .map((scoreRow) => {
        const hcp = hcpById.get(String(scoreRow.hcp_id));
        if (!hcp) return null;
        const row = mapRisingStarRow({ ...scoreRow, hcps: hcp }, therapeuticArea);
        return {
          ...row,
          narrative: narrativeMap.get(String(row.id)) || null,
        };
      })
      .filter((row): row is RisingStarWithNarrative => row !== null)
      .slice(0, limit);

    return { data: risingStars, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getHCPDetail(hcpId: string): Promise<ApiResult<HCPDetail>> {
  try {
    const { data: scoreRow, error: scoreError } = await supabase
      .from("hcp_scores")
      .select(
        `
        hcp_id,
        composite_score,
        pub_velocity,
        citation_trajectory,
        trial_score,
        career_multiplier,
        first_pub_year,
        stored_pubs,
        hcps!inner (
          id,
          first_name,
          last_name,
          institution,
          country,
          therapeutic_area
        )
      `,
      )
      .eq("hcp_id", hcpId)
      .single();

    if (scoreError) {
      return { data: null, error: scoreError.message };
    }

    const { data: publications, error: publicationsError } = await supabase
      .from("publications")
      .select("*")
      .eq("hcp_id", hcpId)
      .order("pub_year", { ascending: false })
      .limit(10);

    if (publicationsError) {
      return { data: null, error: publicationsError.message };
    }

    const { count: trialCount, error: trialError } = await supabase
      .from("trials")
      .select("id", { count: "exact", head: true })
      .eq("hcp_id", hcpId);

    if (trialError) {
      return { data: null, error: trialError.message };
    }

    const base = mapRisingStarRow(scoreRow, "");

    const detail: HCPDetail = {
      ...base,
      publications: (publications ?? []) as HCPPublication[],
      trial_count: trialCount ?? 0,
    };

    return { data: detail, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function searchHCPs(
  query: string,
  therapeuticArea: string,
): Promise<ApiResult<RisingStar[]>> {
  try {
    const search = query.trim();
    if (!search) {
      return { data: [], error: null };
    }

    const searchPattern = `%${search}%`;

    const { data, error } = await supabase
      .from("hcp_scores")
      .select(
        `
        hcp_id,
        composite_score,
        pub_velocity,
        citation_trajectory,
        trial_score,
        career_multiplier,
        first_pub_year,
        stored_pubs,
        hcps!inner (
          id,
          first_name,
          last_name,
          institution,
          country,
          therapeutic_area,
          hcp_therapeutic_areas!inner (
            therapeutic_areas!inner (
              slug
            )
          )
        )
      `,
      )
      .eq("hcps.country", "USA")
      .eq(
        "hcps.hcp_therapeutic_areas.therapeutic_areas.slug",
        therapeuticArea,
      )
      .or(
        `first_name.ilike.${searchPattern},last_name.ilike.${searchPattern}`,
        { foreignTable: "hcps" },
      )
      .order("composite_score", { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    const result: RisingStar[] = (data ?? []).map((row) =>
      mapRisingStarRow(row, therapeuticArea),
    );

    return { data: result, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export type { HCP, HCPScore };
