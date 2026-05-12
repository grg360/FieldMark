import { firstEmbedded } from "./cohort-metrics";
import { dedupeHCPs } from "./hcp-dedupe";
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

/** Indication UUIDs that roll up to each TA for `ta_cohort_counts_cache` (onboarding counts). */
const TA_INDICATION_IDS: Record<string, string[]> = {
  "rare-disease": ["833e7b38-d01b-409e-82c0-71eb29e138a0"],
  hepatology: ["9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e"],
  oncology: ["c0065b03-a25e-4e9a-bde4-4b4d0db7827d"], // NSCLC; add more oncology indication ids as they're loaded
  nsclc: ["c0065b03-a25e-4e9a-bde4-4b4d0db7827d"], // same rollup as oncology; slug used by getAllTACounts / getTASlug("Oncology")
  immunology: [], // coming soon
};

const INDUSTRY_PATTERNS = [
  "pfizer", "merck", "novartis", "roche", "genentech", "astrazeneca",
  "glaxosmithkline", "gsk", "sanofi", "bristol myers", "bristol-myers",
  "eli lilly", "johnson & johnson", "janssen", "abbvie", "vertex",
  "regeneron", "amgen", "biogen", "moderna", "gilead", "takeda",
  "bayer", "boehringer", "daiichi", "astellas", "servier", "novo nordisk",
  "eisai", "biomarin", "alnylam", "ionis", "blueprint", "mirati",
  "arvinas", "seagen", "incyte", "jazz pharm", "bluebird bio",
  "iqvia", "parexel", "syneos", "icon plc", "charles river",
];

function deriveProfileUrl(platform: "twitter" | "bluesky", handle: string): string {
  const normalizedHandle = handle.trim().replace(/^@/, "");
  if (platform === "twitter") return `https://twitter.com/${normalizedHandle}`;
  return `https://bsky.app/profile/${normalizedHandle}`;
}

function parseOptionalNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRisingStarRow(row: any, therapeuticArea: string): RisingStar {
  const hcp = row.hcps ?? {};
  const med = firstEmbedded(hcp.hcp_medicare_summary ?? row.hcp_medicare_summary);
  const pay = firstEmbedded(hcp.hcp_open_payments_summary ?? row.hcp_open_payments_summary);

  return {
    id: hcp.id ?? row.hcp_id ?? "",
    first_name: String(hcp.first_name ?? ""),
    last_name: String(hcp.last_name ?? ""),
    institution: String(hcp.institution ?? hcp.institution_short ?? ""),
    institution_short:
      hcp.institution_short != null && hcp.institution_short !== ""
        ? String(hcp.institution_short)
        : null,
    nppes_practice_city:
      hcp.nppes_practice_city != null && String(hcp.nppes_practice_city).trim() !== ""
        ? String(hcp.nppes_practice_city)
        : null,
    nppes_practice_state:
      hcp.nppes_practice_state != null && String(hcp.nppes_practice_state).trim() !== ""
        ? String(hcp.nppes_practice_state)
        : null,
    nppes_practice_setting:
      hcp.nppes_practice_setting != null && String(hcp.nppes_practice_setting).trim() !== ""
        ? String(hcp.nppes_practice_setting)
        : null,
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
    cohort_classification:
      hcp.cohort_classification != null && hcp.cohort_classification !== ""
        ? String(hcp.cohort_classification)
        : null,
    medicare_volume: parseOptionalNumber(med?.total_beneficiaries_3yr_unique_est),
    distinct_companies: parseOptionalNumber(pay?.distinct_companies_lifetime),
    open_payments_lifetime: parseOptionalNumber(pay?.total_payments_lifetime),
    career_years: parseOptionalNumber(hcp.nppes_career_stage_years ?? row.nppes_career_stage_years),
    total_career_pubs: parseOptionalNumber(hcp.total_career_pubs ?? row.total_career_pubs),
    cohort_score: parseOptionalNumber(hcp.cohort_score ?? row.cohort_score),
  };
}

export type FeedCohort = "rising_star" | "community" | "established";

export async function getRisingStars(
  therapeuticArea: string,
  limit: number = 20,
  options: {
    cohort?: FeedCohort;
    darkHorseOnly?: boolean;
    workhorseOnly?: boolean;
    offset?: number;
  } = {},
): Promise<ApiResult<{ rows: RisingStar[]; total: number }>> {
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
      return { data: { rows: dedupeHCPs<RisingStar>([]), total: 0 }, error: null };
    }

    const offset = options.offset ?? 0;
    const cohort = options.cohort ?? "rising_star";
    const darkHorseOnly =
      cohort === "rising_star" && (options.darkHorseOnly ?? false);
    const workhorseOnly =
      cohort === "community" && (options.workhorseOnly ?? false);

    const countBase = () =>
      supabase
        .from("hcps")
        .select("id, hcp_scores!inner(therapeutic_area_id)", { count: "estimated", head: true })
        .eq("hcp_scores.therapeutic_area_id", taId);

    const listBase = () =>
      supabase
        .from("hcps")
        .select(
          `
        id,
        first_name,
        last_name,
        institution,
        institution_short,
        country,
        first_pub_year,
        cohort_classification,
        cohort_score,
        nppes_career_stage_years,
        nppes_practice_city,
        nppes_practice_state,
        nppes_practice_setting,
        total_career_pubs,
        hcp_scores!inner(
          hcp_id,
          composite_score,
          normalized_score,
          pub_velocity_score,
          citation_trajectory_score,
          trial_investigator_score,
          tier,
          therapeutic_area_id
        )
      `,
        )
        .eq("hcp_scores.therapeutic_area_id", taId);

    const listBaseViaHTA = () =>
      supabase
        .from("hcps")
        .select(
          `
        id,
        first_name,
        last_name,
        institution,
        institution_short,
        country,
        first_pub_year,
        cohort_classification,
        cohort_score,
        nppes_career_stage_years,
        nppes_practice_city,
        nppes_practice_state,
        nppes_practice_setting,
        total_career_pubs,
        hcp_therapeutic_areas!inner(
          therapeutic_area_id
        )
      `,
        )
        .eq("hcp_therapeutic_areas.therapeutic_area_id", taId);

    let countQuery;
    let listQuery;
    if (cohort === "rising_star") {
      if (darkHorseOnly) {
        countQuery = countBase().eq("cohort_classification", "dark_horse");
        listQuery = listBase()
          .eq("cohort_classification", "dark_horse")
          .order("normalized_score", { foreignTable: "hcp_scores", ascending: false })
          .range(offset, offset + limit - 1);
      } else {
        countQuery = countBase().eq("cohort_classification", "rising_star");
        listQuery = listBase()
          .eq("cohort_classification", "rising_star")
          .order("normalized_score", { foreignTable: "hcp_scores", ascending: false })
          .range(offset, offset + limit - 1);
      }
    } else if (cohort === "community") {
      if (workhorseOnly) {
        countQuery = countBase().eq("cohort_classification", "workhorse");
        listQuery = listBaseViaHTA()
          .eq("cohort_classification", "workhorse")
          .order("cohort_score", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);
      } else {
        countQuery = countBase().eq("cohort_classification", "community");
        listQuery = listBaseViaHTA()
          .eq("cohort_classification", "community")
          .order("cohort_score", { ascending: false, nullsFirst: false })
          .range(offset, offset + limit - 1);
      }
    } else {
      countQuery = countBase().eq("cohort_classification", "established");
      listQuery = listBase()
        .eq("cohort_classification", "established")
        .order("normalized_score", { foreignTable: "hcp_scores", ascending: false })
        .range(offset, offset + limit - 1);
    }

    let cachedTotalCount: number | null = null;
    if (cohort === "community") {
      const { data: cacheRow, error: cacheError } = await supabase
        .from("ta_cohort_counts_cache")
        .select("community, workhorses")
        .eq("therapeutic_area_id", taId)
        .maybeSingle();

      if (cacheError) {
        return { data: null, error: cacheError.message };
      }

      if (cacheRow) {
        cachedTotalCount = workhorseOnly ? (cacheRow.workhorses ?? 0) : (cacheRow.community ?? 0);
      } else {
        cachedTotalCount = 0;
      }
    }

    let totalCount: number | null;
    if (cachedTotalCount !== null) {
      totalCount = cachedTotalCount;
    } else {
      const { count: countResult, error: countError } = await countQuery;
      if (countError) {
        return { data: null, error: countError.message };
      }
      totalCount = countResult;
    }

    const { data: hcpRows, error: listError } = await listQuery;

    if (listError) {
      return { data: null, error: listError.message };
    }

    if (!hcpRows || hcpRows.length === 0) {
      return { data: { rows: dedupeHCPs<RisingStar>([]), total: totalCount ?? 0 }, error: null };
    }

    const hcpIds = (hcpRows || []).map((r) => r.id);

    const [medicareResult, opResult] = await Promise.all([
      supabase
        .from("hcp_medicare_summary")
        .select("hcp_id, total_beneficiaries_3yr_unique_est")
        .in("hcp_id", hcpIds),
      supabase
        .from("hcp_open_payments_summary")
        .select("hcp_id, distinct_companies_lifetime, total_payments_lifetime")
        .in("hcp_id", hcpIds),
    ]);

    if (medicareResult.error) {
      return { data: null, error: medicareResult.error.message };
    }
    if (opResult.error) {
      return { data: null, error: opResult.error.message };
    }

    const medicareMap = new Map(
      (medicareResult.data || []).map((r) => [String(r.hcp_id), r]),
    );
    const opMap = new Map(
      (opResult.data || []).map((r) => [String(r.hcp_id), r]),
    );

    const filteredRows = (hcpRows ?? []).filter((row) => {
      const inst = String(row.institution ?? row.institution_short ?? "").toLowerCase();
      if (!inst) return true;
      return !INDUSTRY_PATTERNS.some((pattern) => inst.includes(pattern));
    });

    const narrativeHcpIds = filteredRows.map((r) => r.id);

    const { data: narrativeData } = await supabase
      .from("hcp_narratives")
      .select("hcp_id, narrative")
      .in("hcp_id", narrativeHcpIds)
      .eq("therapeutic_area_id", taId);

    const narrativeMap = new Map(
      (narrativeData || []).map((n) => [String(n.hcp_id), n.narrative as string | null]),
    );

    const risingStars: RisingStar[] = filteredRows.flatMap((row) => {
      const scoresRaw = (row as { hcp_scores?: unknown }).hcp_scores;
      const scoresArr = Array.isArray(scoresRaw)
        ? scoresRaw
        : scoresRaw
          ? [scoresRaw]
          : [];
      let scoreRow: (typeof scoresArr)[0] | Record<string, unknown> | undefined = scoresArr[0];
      if (!scoreRow && cohort === "community") {
        scoreRow = {
          hcp_id: row.id,
          composite_score: 0,
          normalized_score: 0,
          pub_velocity_score: 0,
          citation_trajectory_score: null,
          trial_investigator_score: null,
          tier: null,
          therapeutic_area_id: taId,
          career_multiplier: 0,
          stored_pubs: 0,
        };
      }
      if (!scoreRow) return [];

      const hcp = {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        institution: row.institution,
        institution_short: row.institution_short,
        country: row.country,
        first_pub_year: row.first_pub_year,
        therapeutic_area: therapeuticArea,
        cohort_classification: row.cohort_classification,
        cohort_score: row.cohort_score,
        nppes_career_stage_years: row.nppes_career_stage_years,
        nppes_practice_city: row.nppes_practice_city,
        nppes_practice_state: row.nppes_practice_state,
        nppes_practice_setting: row.nppes_practice_setting,
        total_career_pubs: row.total_career_pubs,
      };

      const medicareData = medicareMap.get(String(row.id));
      const opData = opMap.get(String(row.id));

      const hcpWithSummaries = {
        ...hcp,
        hcp_medicare_summary: medicareData ? [medicareData] : null,
        hcp_open_payments_summary: opData ? [opData] : null,
      };

      const enrichedRow = {
        ...scoreRow,
        composite_score: scoreRow.composite_score,
        normalized_score: scoreRow.normalized_score,
        tier: scoreRow.tier ?? null,
        first_pub_year: row.first_pub_year,
        hcps: hcpWithSummaries,
      };

      const mapped = mapRisingStarRow(enrichedRow, therapeuticArea);
      return [
        {
          ...mapped,
          normalized_score: Number(scoreRow.normalized_score ?? 0),
          narrative: narrativeMap.get(String(mapped.id)) ?? null,
        },
      ];
    });

    const rows = dedupeHCPs(risingStars);

    return { data: { rows, total: totalCount ?? 0 }, error: null };
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
    const indicationIds = TA_INDICATION_IDS[taSlug] ?? [];

    if (indicationIds.length === 0) {
      return {
        data: {
          rising_stars: 0,
          dark_horses: 0,
          verified_dols: 0,
          community_pool: 0,
          workhorses: 0,
        },
        error: null,
      };
    }

    const { data: countRows, error: countsError } = await supabase
      .from("ta_cohort_counts_cache")
      .select("rising_stars, dark_horses, community, workhorses")
      .in("therapeutic_area_id", indicationIds);

    if (countsError) {
      return { data: null, error: countsError.message };
    }

    const totals = (countRows ?? []).reduce(
      (acc, row) => ({
        rising_stars: acc.rising_stars + (Number(row.rising_stars) || 0),
        dark_horses: acc.dark_horses + (Number(row.dark_horses) || 0),
        community: acc.community + (Number(row.community) || 0),
        workhorses: acc.workhorses + (Number(row.workhorses) || 0),
      }),
      { rising_stars: 0, dark_horses: 0, community: 0, workhorses: 0 },
    );

    const { data: verifiedHcps, error: verifiedHcpsError } = await supabase
      .from("hcps")
      .select("id")
      .eq("is_verified_dol", true);

    if (verifiedHcpsError) {
      return { data: null, error: verifiedHcpsError.message };
    }

    const verifiedIds = (verifiedHcps ?? []).map((h) => h.id);

    const verifiedDolsResult =
      verifiedIds.length === 0
        ? { count: 0, error: null }
        : await supabase
            .from("hcp_therapeutic_areas")
            .select("hcp_id", { count: "estimated", head: true })
            .in("therapeutic_area_id", indicationIds)
            .in("hcp_id", verifiedIds);

    if (verifiedDolsResult.error) {
      return { data: null, error: verifiedDolsResult.error.message };
    }

    return {
      data: {
        rising_stars: totals.rising_stars,
        dark_horses: totals.dark_horses,
        verified_dols: verifiedDolsResult.count ?? 0,
        community_pool: totals.community,
        workhorses: totals.workhorses,
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
      output[slug] = res.data ?? {
        rising_stars: 0,
        dark_horses: 0,
        verified_dols: 0,
        community_pool: 0,
        workhorses: 0,
      };
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
      .map((match): VerifiedDOL | null => {
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

        const row: VerifiedDOL = {
          hcp_id: String(hcp.id),
          first_name: String(hcp.first_name ?? ""),
          last_name: String(hcp.last_name ?? ""),
          institution: hcp.institution_short ?? null,
          country: hcp.country ?? null,
          therapeutic_area: taSlug,
          total_career_pubs: hcp.total_career_pubs == null ? null : Number(hcp.total_career_pubs),
          match_confidence: "high",
          social_user: socialUser,
        };
        return row;
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

    const dedupedDols = dedupeHCPs(
      joined.map((row) => ({ ...row, institution: row.institution ?? undefined })),
    ) as VerifiedDOL[];

    return { data: dedupedDols, error: null };
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
        normalized_score,
        pub_velocity,
        citation_trajectory,
        trial_score,
        career_multiplier,
        first_pub_year,
        stored_pubs,
        tier,
        hcps!inner (
          id,
          first_name,
          last_name,
          institution,
          institution_short,
          country,
          therapeutic_area,
          cohort_classification,
          cohort_score,
          nppes_career_stage_years,
          nppes_practice_city,
          nppes_practice_state,
          nppes_practice_setting,
          total_career_pubs,
          hcp_medicare_summary (
            total_beneficiaries_3yr_unique_est
          ),
          hcp_open_payments_summary (
            distinct_companies_lifetime,
            total_payments_lifetime
          )
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
      return { data: dedupeHCPs<RisingStar>([]), error: null };
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
          institution_short,
          country,
          therapeutic_area,
          nppes_practice_city,
          nppes_practice_state,
          nppes_practice_setting,
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

    return { data: dedupeHCPs(result), error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export type { HCP, HCPScore };
