import { supabase } from "./supabase";
import type { HCP, HCPScore, RisingStar, SocialUser, TACounts, VerifiedDOL } from "./types";

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

const TA_ID_MAP: Record<string, string> = {
  "rare-disease": "833e7b38-d01b-409e-82c0-71eb29e138a0",
  hepatology: "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e",
  nsclc: "c0065b03-a25e-4e9a-bde4-4b4d0db7827d",
  oncology: "095bc902-c3dc-48a3-8167-52ee55795d60",
  immunology: "4cf07827-ff1c-451e-832e-0e0a14ea9c86",
};

function deriveProfileUrl(platform: "twitter" | "bluesky", handle: string): string {
  const normalizedHandle = handle.trim().replace(/^@/, "");
  if (platform === "twitter") return `https://twitter.com/${normalizedHandle}`;
  return `https://bsky.app/profile/${normalizedHandle}`;
}

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
    normalized_score: Number(row.normalized_score ?? 0),
    pub_velocity: Number(row.pub_velocity_score ?? row.pub_velocity ?? 0),
    citation_trajectory: Number(
      row.citation_trajectory_score ?? row.citation_trajectory ?? 0,
    ),
    trial_score: Number(row.trial_investigator_score ?? row.trial_score ?? 0),
    citTraj: row.citation_trajectory_score ?? row.citation_trajectory ?? null,
    trialScore: row.trial_investigator_score ?? row.trial_score ?? null,
    career_multiplier: Number(row.career_multiplier ?? 0),
    first_pub_year: Number(row.first_pub_year ?? 0),
    stored_pubs: Number(row.stored_pubs ?? 0),
    narrative: row.narrative ?? null,
    tier: row.tier ?? null,
  };
}

export async function getRisingStars(
  therapeuticArea: string,
  limit: number = 20,
  options: { tier?: string } = {},
): Promise<ApiResult<RisingStar[]>> {
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

    if (!taId) {
      return { data: [], error: null };
    }

    let scoreQuery = supabase
      .from("hcp_normalized_scores")
      .select("hcp_id, raw_score, normalized_score, pub_velocity_score, citation_trajectory_score, trial_investigator_score, tier")
      .eq("therapeutic_area_id", taId);

    if (options.tier) {
      scoreQuery = scoreQuery.eq("tier", options.tier);
    }

    const { data: scoreData, error: scoreError } = await scoreQuery
      .order("normalized_score", { ascending: false })
      .limit(200);

    if (scoreError) {
      return { data: null, error: scoreError.message };
    }

    if (!scoreData || scoreData.length === 0) {
      return { data: [], error: null };
    }

    const hcpIds = scoreData.map((r) => r.hcp_id);

    const { data: hcpData, error: hcpError } = await supabase
      .from("hcps")
      .select("id, first_name, last_name, institution, country, first_pub_year")
      .in("id", hcpIds);

    if (hcpError) {
      return { data: null, error: hcpError.message };
    }

    const { data: narrativeData } = await supabase
      .from("hcp_narratives")
      .select("hcp_id, narrative")
      .in("hcp_id", hcpIds)
      .eq("therapeutic_area_id", taId);

    const narrativeMap = new Map(
      (narrativeData || []).map((n) => [String(n.hcp_id), n.narrative as string | null]),
    );

    const hcpById = new Map((hcpData ?? []).map((hcp) => [String(hcp.id), hcp]));

    const risingStars: RisingStar[] = scoreData
      .flatMap((scoreRow) => {
        const hcp = hcpById.get(String(scoreRow.hcp_id));
        if (!hcp) return [];
        const enrichedRow = {
          ...scoreRow,
          composite_score: scoreRow.raw_score,
          normalized_score: scoreRow.normalized_score,
          tier: scoreRow.tier,
          first_pub_year: hcp.first_pub_year,
          hcps: hcp,
        };
        const row = mapRisingStarRow(enrichedRow, therapeuticArea);
        return [{
          ...row,
          normalized_score: Number(scoreRow.normalized_score ?? 0),
          narrative: narrativeMap.get(String(row.id)) ?? null,
        }];
      })
      .slice(0, limit);

    return { data: risingStars, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getTACounts(
  therapeuticArea: string,
): Promise<ApiResult<TACounts>> {
  try {
    const taSlug = therapeuticArea.toLowerCase().trim();
    const taId = TA_ID_MAP[taSlug];
    if (!taId) {
      return {
        data: { rising_stars: 0, dark_horses: 0, verified_dols: 0 },
        error: null,
      };
    }

    const { data: verifiedHcps, error: verifiedHcpsError } = await supabase
      .from("hcps")
      .select("id")
      .eq("is_verified_dol", true);

    if (verifiedHcpsError) {
      return { data: null, error: verifiedHcpsError.message };
    }

    const verifiedIds = (verifiedHcps ?? []).map((h) => h.id);

    const risingPromise = supabase
      .from("hcp_scores")
      .select("hcp_id", { count: "exact" })
      .eq("therapeutic_area_id", taId)
      .eq("tier", "rising_star")
      .limit(1);

    const darkHorsePromise = supabase
      .from("hcp_scores")
      .select("hcp_id", { count: "exact", head: true })
      .eq("therapeutic_area_id", taId)
      .eq("tier", "dark_horse");

    const [risingRes, darkHorseRes] = await Promise.all([
      risingPromise,
      darkHorsePromise,
    ]);

    const verifiedDolsResult = verifiedIds.length === 0
      ? { count: 0, error: null }
      : await supabase
          .from("hcp_therapeutic_areas")
          .select("hcp_id", { count: "exact", head: true })
          .eq("therapeutic_area_id", taId)
          .in("hcp_id", verifiedIds);

    if (risingRes.error) {
      return { data: null, error: risingRes.error.message };
    }
    if (darkHorseRes.error) {
      return { data: null, error: darkHorseRes.error.message };
    }
    if (verifiedDolsResult.error) {
      return { data: null, error: verifiedDolsResult.error.message };
    }

    return {
      data: {
        rising_stars: risingRes.count ?? 0,
        dark_horses: darkHorseRes.count ?? 0,
        verified_dols: verifiedDolsResult.count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getAllTACounts(): Promise<ApiResult<Record<string, TACounts>>> {
  try {
    const slugs = ["rare-disease", "hepatology", "nsclc", "immunology"] as const;
    const results = await Promise.all(slugs.map((slug) => getTACounts(slug)));
    const output: Record<string, TACounts> = {};
    for (let i = 0; i < slugs.length; i += 1) {
      const slug = slugs[i];
      const res = results[i];
      if (res.error) {
        return { data: null, error: `Failed loading counts for ${slug}: ${res.error}` };
      }
      output[slug] = res.data ?? { rising_stars: 0, dark_horses: 0, verified_dols: 0 };
    }
    return { data: output, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getVerifiedDOLs(
  therapeuticArea: string,
  limit: number = 20,
): Promise<ApiResult<VerifiedDOL[]>> {
  try {
    const taSlug = therapeuticArea.toLowerCase().trim();
    const taId = TA_ID_MAP[taSlug];

    if (!taId) {
      return { data: [], error: null };
    }

    const { data: hcpRows, error: hcpError } = await supabase
      .from("hcps")
      .select("id, first_name, last_name, institution_short, country, total_career_pubs")
      .eq("is_verified_dol", true);
    console.log(
      "[getVerifiedDOLs] hcps query error=",
      hcpError,
      "count=",
      hcpRows?.length ?? null,
      "all rows=",
      hcpRows,
    );

    if (hcpError) {
      return { data: null, error: hcpError.message };
    }

    const verifiedHcps = hcpRows ?? [];
    const verifiedHcpIds = verifiedHcps.map((h) => String(h.id)).filter(Boolean);
    console.log("[getVerifiedDOLs] taSlug=", taSlug, "taId=", taId, "verifiedHcpIds count=", verifiedHcpIds.length);
    console.log("[getVerifiedDOLs] verified hcp count=", verifiedHcps.length, "first hcp:", verifiedHcps[0]);
    if (verifiedHcpIds.length === 0) {
      return { data: [], error: null };
    }

    const { data: taRows, error: taError } = await supabase
      .from("hcp_therapeutic_areas")
      .select("hcp_id, therapeutic_area_id")
      .in("hcp_id", verifiedHcpIds);

    if (taError) {
      return { data: null, error: taError.message };
    }

    const matchingHcpIds = new Set(
      (taRows ?? [])
        .filter((r) => String(r.therapeutic_area_id) === taId)
        .map((r) => String(r.hcp_id)),
    );
    const filteredHcps = verifiedHcps.filter((h) => matchingHcpIds.has(String(h.id)));
    console.log(
      "[getVerifiedDOLs] TA filter matchingHcpIds=",
      [...matchingHcpIds],
      "filteredHcps count=",
      filteredHcps.length,
      "filteredHcps=",
      filteredHcps,
    );
    const filteredHcpIds = filteredHcps.map((h) => String(h.id));
    if (filteredHcpIds.length === 0) {
      return { data: [], error: null };
    }

    const { data: matchRows, error: matchError } = await supabase
      .from("dol_matches")
      .select("hcp_id, social_user_id, match_confidence")
      .in("hcp_id", filteredHcpIds)
      .eq("match_confidence", "high");

    if (matchError) {
      return { data: null, error: matchError.message };
    }

    const matches = (matchRows ?? []).filter((m) => m.social_user_id);
    console.log("[getVerifiedDOLs] matches count=", matches.length);
    if (matches.length === 0) {
      return { data: [], error: null };
    }

    const socialUserIds = [...new Set(matches.map((m) => String(m.social_user_id)).filter(Boolean))];
    const { data: socialRows, error: socialError } = await supabase
      .from("social_users")
      .select("id, platform, handle, display_name, bio, follower_count, verified, profile_url, data_quality_flag")
      .in("id", socialUserIds)
      .neq("data_quality_flag", "rejected");

    if (socialError) {
      return { data: null, error: socialError.message };
    }

    const hcpById = new Map(filteredHcps.map((h) => [String(h.id), h]));
    const socialById = new Map((socialRows ?? []).map((s) => [String(s.id), s]));

    const joined: VerifiedDOL[] = matches
      .map((match) => {
        const hcp = hcpById.get(String(match.hcp_id));
        const social = socialById.get(String(match.social_user_id));
        if (!hcp || !social) return null;

        const platform = String(social.platform) as "twitter" | "bluesky";
        const handle = String(social.handle ?? "").trim();
        if (!handle || (platform !== "twitter" && platform !== "bluesky")) return null;

        const socialUser: SocialUser = {
          id: String(social.id),
          platform,
          handle,
          display_name: social.display_name ?? null,
          bio: social.bio ?? null,
          follower_count: social.follower_count == null ? null : Number(social.follower_count),
          verified: Boolean(social.verified),
          profile_url: social.profile_url ?? deriveProfileUrl(platform, handle),
        };

        return {
          hcp_id: String(hcp.id),
          first_name: String(hcp.first_name ?? ""),
          last_name: String(hcp.last_name ?? ""),
          institution: hcp.institution_short ?? null,
          country: hcp.country ?? null,
          therapeutic_area: taSlug,
          total_career_pubs: hcp.total_career_pubs == null ? null : Number(hcp.total_career_pubs),
          match_confidence: "high",
          social_user: socialUser,
        } satisfies VerifiedDOL;
      })
      .filter((row): row is VerifiedDOL => row !== null)
      .sort((a, b) => {
        const aFollowers = a.social_user.follower_count;
        const bFollowers = b.social_user.follower_count;
        if (aFollowers == null && bFollowers == null) return 0;
        if (aFollowers == null) return 1;
        if (bFollowers == null) return -1;
        return bFollowers - aFollowers;
      })
      .slice(0, limit);
    console.log("[getVerifiedDOLs] social count=", socialRows?.length, "joined count=", joined.length);

    return { data: joined, error: null };
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
