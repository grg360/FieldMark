import { firstEmbedded } from "./cohort-metrics";
import { dedupeHCPs } from "./hcp-dedupe";
import { resolveFilterScope } from "./rank-filters";
import { supabase } from "./supabase";
import type {
  FilterState,
  HCP,
  HCPScore,
  LatestPost,
  RisingStar,
  SocialUser,
  TACounts,
  VerifiedDOL,
} from "./types";

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

async function fetchLiveCohortCountsForTAIds(
  indicationIds: string[],
): Promise<
  ApiResult<
    Record<
      string,
      { established: number; rising_stars: number; community: number; total_hcps: number }
    >
  >
> {
  const { data, error } = await supabase
    .from("hcp_therapeutic_areas_v2")
    .select("therapeutic_area_id, hcp_id, hcps_v2!inner(id, cohort_classification)")
    .in("therapeutic_area_id", indicationIds);

  if (error) {
    return { data: null, error: error.message };
  }

  const countsByTa: Record<
    string,
    { established: number; rising_stars: number; community: number; total_hcps: number }
  > = {};
  const seenByTa: Record<string, Set<string>> = {};

  for (const row of data ?? []) {
    const taId = String(row.therapeutic_area_id ?? "");
    if (!taId) continue;
    if (!countsByTa[taId]) {
      countsByTa[taId] = {
        established: 0,
        rising_stars: 0,
        community: 0,
        total_hcps: 0,
      };
      seenByTa[taId] = new Set<string>();
    }

    const hcpRaw = firstEmbedded((row as { hcps_v2?: unknown }).hcps_v2);
    const hcpId = String(
      ((hcpRaw as { id?: unknown } | null)?.id ?? row.hcp_id ?? ""),
    );
    if (!hcpId || seenByTa[taId].has(hcpId)) continue;
    seenByTa[taId].add(hcpId);

    countsByTa[taId].total_hcps += 1;

    const cohort = String(
      (hcpRaw as { cohort_classification?: unknown } | null)
        ?.cohort_classification ?? "",
    ).toLowerCase();
    if (cohort === "established") countsByTa[taId].established += 1;
    else if (cohort === "rising_star") countsByTa[taId].rising_stars += 1;
    else if (cohort === "community") countsByTa[taId].community += 1;
  }

  return { data: countsByTa, error: null };
}

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

function mapPaymentsByYear(
  pay: Record<string, unknown> | null | undefined,
): HCP["paymentsByYear"] {
  if (!pay) return null;
  const py2022 = parseOptionalNumber(pay.py2022_total);
  const py2023 = parseOptionalNumber(pay.py2023_total);
  const py2024 = parseOptionalNumber(pay.py2024_total);
  if (py2022 == null && py2023 == null && py2024 == null) return null;
  return { py2022, py2023, py2024 };
}

function mapBeneficiariesByYear(
  med: Record<string, unknown> | null | undefined,
): HCP["beneficiariesByYear"] {
  if (!med) return null;
  const y2021 = parseOptionalNumber(med.beneficiaries_2021);
  const y2022 = parseOptionalNumber(med.beneficiaries_2022);
  const y2023 = parseOptionalNumber(med.beneficiaries_2023);
  if (y2021 == null && y2022 == null && y2023 == null) return null;
  return { y2021, y2022, y2023 };
}

function mapEngagementMix(
  pay: Record<string, unknown> | null | undefined,
): HCP["engagementMix"] {
  if (!pay) return null;
  const mix = {
    speakerBureau: parseOptionalNumber(pay.speaker_bureau_3yr),
    consulting: parseOptionalNumber(pay.consulting_3yr),
    honoraria: parseOptionalNumber(pay.honoraria_3yr),
    education: parseOptionalNumber(pay.education_3yr),
    royalty: parseOptionalNumber(pay.royalty_3yr),
    foodBeverage: parseOptionalNumber(pay.food_beverage_3yr),
    travelLodging: parseOptionalNumber(pay.travel_lodging_3yr),
  };
  const hasValue = Object.values(mix).some((v) => v != null && v > 0);
  if (!hasValue) return null;
  return mix;
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
    nppes_practice_address:
      hcp.nppes_practice_address != null && String(hcp.nppes_practice_address).trim() !== ""
        ? String(hcp.nppes_practice_address)
        : null,
    nppes_practice_zip:
      hcp.nppes_practice_zip != null && String(hcp.nppes_practice_zip).trim() !== ""
        ? String(hcp.nppes_practice_zip)
        : null,
    institution_full:
      hcp.institution_full != null && String(hcp.institution_full).trim() !== ""
        ? String(hcp.institution_full)
        : null,
    npi_number:
      hcp.npi_number != null && String(hcp.npi_number).trim() !== ""
        ? String(hcp.npi_number)
        : null,
    npi_specialty:
      hcp.npi_specialty != null && String(hcp.npi_specialty).trim() !== ""
        ? String(hcp.npi_specialty)
        : null,
    country: String(hcp.country ?? ""),
    // TODO: Source therapeutic_area via hcp_therapeutic_areas join (not an hcps column).
    therapeutic_area: therapeuticArea.trim() !== "" ? therapeuticArea : null,
    hcp_id: row.hcp_id ?? hcp.id ?? "",
    composite_score: Number(row.composite_score ?? 0),
    normalized_score: Number(row.normalized_score ?? 0),
    pub_velocity: Number(row.pub_velocity_score ?? 0),
    citation_trajectory: Number(row.citation_trajectory_score ?? 0),
    trial_score: Number(row.trial_investigator_score ?? 0),
    citTraj: row.citation_trajectory_score ?? null,
    trialScore: row.trial_investigator_score ?? null,
    career_multiplier: 1,
    first_pub_year: Number(hcp.first_pub_year ?? 0),
    stored_pubs: Number(hcp.total_career_pubs ?? 0),
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
    paymentsByYear: mapPaymentsByYear(pay as Record<string, unknown> | undefined),
    beneficiariesByYear: mapBeneficiariesByYear(med as Record<string, unknown> | undefined),
    engagementMix: mapEngagementMix(pay as Record<string, unknown> | undefined),
  };
}

export type FeedCohort = "rising_star" | "community" | "established";

function resolveTAId(therapeuticArea: string | undefined): string | undefined {
  if (!therapeuticArea?.trim()) return undefined;
  const normalized = therapeuticArea.toLowerCase().trim();
  const slugByLabel: Record<string, string> = {
    "rare disease": "rare-disease",
    hepatology: "hepatology",
    nsclc: "nsclc",
    oncology: "oncology",
    immunology: "immunology",
  };
  const slug = slugByLabel[normalized] ?? normalized.replace(/\s+/g, "-");
  return TA_ID_MAP[slug];
}

/** TA-specific narrative first, then most recent narrative for this HCP. */
export async function getHCPNarrative(
  hcpId: string,
  therapeuticArea?: string,
): Promise<ApiResult<string | null>> {
  try {
    const taId = resolveTAId(therapeuticArea);

    if (taId) {
      const { data, error } = await supabase
        .from("hcp_narratives_v2")
        .select("narrative")
        .eq("hcp_id", hcpId)
        .eq("therapeutic_area_id", taId)
        .maybeSingle();

      if (error) {
        return { data: null, error: error.message };
      }
      if (data?.narrative) {
        return { data: data.narrative as string, error: null };
      }
    }

    const fallback = await supabase
      .from("hcp_narratives_v2")
      .select("narrative")
      .eq("hcp_id", hcpId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallback.error) {
      return { data: null, error: fallback.error.message };
    }

    return { data: (fallback.data?.narrative as string | null) ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getRisingStars(
  therapeuticArea: string,
  limit: number = 20,
  options: {
    cohort?: FeedCohort;
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

    const countBase = () =>
      supabase
        .from("hcps_v2")
        .select("id, hcp_scores!inner(therapeutic_area_id)", { count: "estimated", head: true })
        .eq("hcp_scores.therapeutic_area_id", taId);

    const listBase = () =>
      supabase
        .from("hcps_v2")
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
        .from("hcps_v2")
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
      countQuery = countBase().eq("cohort_classification", "rising_star").eq("country", "USA");
      listQuery = listBase()
        .eq("cohort_classification", "rising_star")
        .eq("country", "USA")
        .order("cohort_score", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
    } else if (cohort === "community") {
      // Community requires NPI (US-only); no country filter needed here.
      countQuery = countBase().eq("cohort_classification", "community");
      listQuery = listBaseViaHTA()
        .eq("cohort_classification", "community")
        .order("cohort_score", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
    } else {
      countQuery = countBase().eq("cohort_classification", "established").eq("country", "USA");
      listQuery = listBase()
        .eq("cohort_classification", "established")
        .eq("country", "USA")
        .order("cohort_score", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
    }

    let cachedTotalCount: number | null = null;
    if (cohort === "community") {
      const liveCounts = await fetchLiveCohortCountsForTAIds([taId]);
      if (liveCounts.error) {
        return { data: null, error: liveCounts.error };
      }
      cachedTotalCount = liveCounts.data?.[taId]?.community ?? 0;
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
        .from("hcp_medicare_summary_v2")
        .select("hcp_id, total_beneficiaries_3yr_unique_est")
        .in("hcp_id", hcpIds),
      supabase
        .from("hcp_open_payments_summary_v2")
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

    const narrativeMap = new Map<string, string | null>();

    if (narrativeHcpIds.length > 0) {
      const { data: narrativeData, error: narrativeError } = await supabase
        .from("hcp_narratives_v2")
        .select("hcp_id, narrative")
        .in("hcp_id", narrativeHcpIds)
        .eq("therapeutic_area_id", taId);

      if (narrativeError) {
        return { data: null, error: narrativeError.message };
      }

      for (const n of narrativeData || []) {
        narrativeMap.set(String(n.hcp_id), n.narrative as string | null);
      }

      const missingNarrativeIds = narrativeHcpIds.filter(
        (id) => !narrativeMap.get(String(id)),
      );

      if (missingNarrativeIds.length > 0) {
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("hcp_narratives_v2")
          .select("hcp_id, narrative, generated_at")
          .in("hcp_id", missingNarrativeIds)
          .order("generated_at", { ascending: false });

        if (fallbackError) {
          return { data: null, error: fallbackError.message };
        }

        for (const n of fallbackRows || []) {
          const hid = String(n.hcp_id);
          if (!narrativeMap.get(hid)) {
            narrativeMap.set(hid, n.narrative as string | null);
          }
        }
      }
    }

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

/**
 * Read cohort counts for a TA from hcp_score_ranks_v2.
 *
 * Accepts a FilterState. Defaults region to "US" if not provided.
 * Counts are queried from the precomputed ranks table — one count query
 * per cohort, no joins, no row caps.
 *
 * The therapeuticArea slug must resolve via TA_ID_MAP; unknown slugs return
 * zeroed counts.
 *
 * @param filtersOrSlug - Either a FilterState object or a legacy slug string.
 *                       String form is supported for backwards compatibility
 *                       and defaults region to "US".
 */
export async function getTACounts(
  filtersOrSlug: FilterState | string,
): Promise<ApiResult<TACounts>> {
  try {
    const filters: FilterState =
      typeof filtersOrSlug === "string"
        ? { therapeuticArea: filtersOrSlug }
        : filtersOrSlug;

    const taSlug = filters.therapeuticArea.toLowerCase().trim();
    const taId = TA_ID_MAP[taSlug];

    const zeroCounts: TACounts = {
      rising_stars: 0,
      dark_horses: 0,
      verified_dols: 0,
      community_pool: 0,
      workhorses: 0,
      established: 0,
      total_hcps: 0,
    };

    if (!taId) {
      return { data: zeroCounts, error: null };
    }

    const scope = resolveFilterScope(filters);

    // Build the scope filter for hcp_score_ranks_v2. Note: scope_value can be
    // null (global scope), so we use .is() for null comparisons.
    const applyScope = (q: ReturnType<typeof supabase.from>) => {
      let query = q.eq("therapeutic_area_id", taId).eq("scope_type", scope.scopeType);
      if (scope.scopeValue === null) {
        query = query.is("scope_value", null);
      } else {
        query = query.eq("scope_value", scope.scopeValue);
      }
      return query;
    };

    // Rising star pool count + threshold-selected count + established + community.
    // The rising star tier filter requires joining rank rows to hcp_scores_v2 to read tier.
    const [risingPoolResult, risingSelectedResult, establishedResult, communityResult] = await Promise.all([
      // Pool: all scored rising-cohort HCPs in scope
      applyScope(
        supabase
          .from("hcp_score_ranks_v2")
          .select("hcp_id", { count: "exact", head: true })
          .eq("cohort", "rising"),
      ),
      // Selected: rank rows in scope where the joined score's tier = 'rising_star'
      applyScope(
        supabase
          .from("hcp_score_ranks_v2")
          .select("hcp_id, hcp_scores_v2!inner(tier)", { count: "exact", head: true })
          .eq("cohort", "rising")
          .eq("hcp_scores_v2.therapeutic_area_id", taId)
          .eq("hcp_scores_v2.tier", "rising_star"),
      ),
      applyScope(
        supabase
          .from("hcp_score_ranks_v2")
          .select("hcp_id", { count: "exact", head: true })
          .eq("cohort", "established"),
      ),
      applyScope(
        supabase
          .from("hcp_score_ranks_v2")
          .select("hcp_id", { count: "exact", head: true })
          .eq("cohort", "community"),
      ),
    ]);

    if (risingPoolResult.error) {
      return { data: null, error: `Rising star pool count failed: ${risingPoolResult.error.message}` };
    }
    if (risingSelectedResult.error) {
      return { data: null, error: `Rising star selected count failed: ${risingSelectedResult.error.message}` };
    }
    if (establishedResult.error) {
      return { data: null, error: `Established count failed: ${establishedResult.error.message}` };
    }
    if (communityResult.error) {
      return { data: null, error: `Community count failed: ${communityResult.error.message}` };
    }

    const risingPool = risingPoolResult.count ?? 0;
    const risingSelected = risingSelectedResult.count ?? 0;
    const established = establishedResult.count ?? 0;
    const community = communityResult.count ?? 0;

    // total_hcps for this TA in this scope = sum across cohorts.
    // (Some HCPs MAY be in more than one cohort across TAs, but within a single
    // TA+cohort+scope the rank rows are unique by hcp_id.)
    // total_hcps uses the candidate pool, not the threshold-selected count.
    // This is the "how deep is the platform's coverage in this TA+scope" number.
    const totalHcps = risingPool + established + community;

    // Verified DOLs count is cohort-independent. Filter HCPs by is_verified_dol
    // and intersect with the TA + scope. For now, we use the hcp_therapeutic_areas_v2
    // join because verified DOL status lives on hcps_v2, not on score ranks.
    // Future: denormalize is_verified_dol onto hcp_score_ranks_v2.
    let verifiedDols = 0;
    try {
      // Find HCPs in this TA+scope from rank rows, then intersect with verified DOLs.
      // For simplicity and correctness, fetch the hcp_ids first, then count verified.
      // Note: this query is bounded by the cohort populations above.
      const { data: hcpIdRows, error: hcpIdError } = await applyScope(
        supabase.from("hcp_score_ranks_v2").select("hcp_id"),
      ).limit(10000);

      if (!hcpIdError && hcpIdRows && hcpIdRows.length > 0) {
        const hcpIds = Array.from(new Set(hcpIdRows.map((r) => String(r.hcp_id))));
        if (hcpIds.length > 0) {
          const { count: dolCount, error: dolError } = await supabase
            .from("hcps_v2")
            .select("id", { count: "exact", head: true })
            .in("id", hcpIds)
            .eq("is_verified_dol", true);
          if (!dolError) {
            verifiedDols = dolCount ?? 0;
          }
        }
      }
    } catch {
      // Verified DOL count is non-critical; failure here returns 0, not an error.
      verifiedDols = 0;
    }

    return {
      data: {
        rising_stars: risingSelected,
        rising_stars_pool: risingPool,
        dark_horses: 0, // Deprecated; tier-based filtering removed. Field kept for type compatibility.
        verified_dols: verifiedDols,
        community_pool: community,
        workhorses: 0, // Deprecated; tier-based filtering removed.
        established: established,
        total_hcps: totalHcps,
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
        established: 0,
        total_hcps: 0,
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
      .from("hcps_v2")
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
      .from("hcp_therapeutic_areas_v2")
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
      .from("dol_matches_v2")
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
      .from("social_users_v2")
      .select("id, platform, handle, display_name, bio, follower_count, verified, profile_url, data_quality_flag")
      .in("id", socialUserIds)
      .neq("data_quality_flag", "rejected");

    if (socialError) {
      return { data: null, error: socialError.message };
    }

    const ascoActiveSocialIds = new Set<string>();
    if (socialUserIds.length > 0) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const handles = (socialRows ?? [])
        .map((s) => String(s.handle ?? "").toLowerCase())
        .filter(Boolean);

      if (handles.length > 0) {
        const { data: ascoPosts } = await supabase
          .from("social_posts_v2")
          .select("handle, platform, hashtags")
          .in("handle", handles)
          .gte("posted_at", sevenDaysAgo.toISOString());

        const ascoTagsLower = new Set(["#asco", "#asco26", "#asco2026"]);
        for (const post of ascoPosts ?? []) {
          const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
          const hasAscoTag = hashtags.some((tag) =>
            ascoTagsLower.has(String(tag).toLowerCase()),
          );
          if (hasAscoTag) {
            const postHandle = String(post.handle ?? "").toLowerCase();
            const matchingSocial = (socialRows ?? []).find(
              (s) =>
                String(s.handle ?? "").toLowerCase() === postHandle &&
                String(s.platform) === String(post.platform),
            );
            if (matchingSocial) {
              ascoActiveSocialIds.add(String(matchingSocial.id));
            }
          }
        }
      }
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
          is_asco_active: ascoActiveSocialIds.has(String(social.id)),
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

export async function getHCPDetail(
  hcpId: string,
  therapeuticArea?: string,
): Promise<ApiResult<HCPDetail>> {
  try {
    const { data: scoreRow, error: scoreError } = await supabase
      .from("hcp_scores_v2")
      .select(
        `
        hcp_id,
        composite_score,
        normalized_score,
        pub_velocity_score,
        citation_trajectory_score,
        trial_investigator_score,
        tier,
        hcps!inner (
          id,
          first_name,
          last_name,
          institution,
          institution_short,
          institution_full,
          country,
          cohort_classification,
          cohort_score,
          first_pub_year,
          nppes_career_stage_years,
          nppes_practice_city,
          nppes_practice_state,
          nppes_practice_zip,
          nppes_practice_address,
          nppes_practice_setting,
          npi_number,
          npi_specialty,
          total_career_pubs,
          hcp_medicare_summary (
            total_beneficiaries_3yr_unique_est,
            beneficiaries_2021,
            beneficiaries_2022,
            beneficiaries_2023
          ),
          hcp_open_payments_summary (
            distinct_companies_lifetime,
            total_payments_lifetime,
            py2022_total,
            py2023_total,
            py2024_total,
            speaker_bureau_3yr,
            consulting_3yr,
            honoraria_3yr,
            education_3yr,
            royalty_3yr,
            food_beverage_3yr,
            travel_lodging_3yr
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
      .from("publications_v2")
      .select("*")
      .eq("hcp_id", hcpId)
      .order("pub_year", { ascending: false })
      .limit(10);

    if (publicationsError) {
      return { data: null, error: publicationsError.message };
    }

    const { count: trialCount, error: trialError } = await supabase
      .from("clinical_trials_v2")
      .select("id", { count: "exact", head: true })
      .eq("hcp_id", hcpId);

    if (trialError) {
      return { data: null, error: trialError.message };
    }

    const base = mapRisingStarRow(scoreRow, therapeuticArea ?? "");
    const narrativeResult = await getHCPNarrative(hcpId, therapeuticArea);

    const detail: HCPDetail = {
      ...base,
      narrative: narrativeResult.data ?? base.narrative ?? null,
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

export interface HCPSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  institution: string | null;
  cohortClassification: "established" | "rising_star" | "community" | "unclassified" | null;
  cohortScore: number | null;
  therapeuticAreaIds: string[];
  therapeuticAreaName?: string;
}

const TA_DISPLAY_BY_ID: Record<string, string> = {
  "833e7b38-d01b-409e-82c0-71eb29e138a0": "Rare Disease",
  "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e": "Hepatology",
  "c0065b03-a25e-4e9a-bde4-4b4d0db7827d": "Oncology",
  "095bc902-c3dc-48a3-8167-52ee55795d60": "Oncology",
  "4cf07827-ff1c-451e-832e-0e0a14ea9c86": "Immunology",
};

const SEARCH_COHORT_ORDER: Record<string, number> = {
  established: 0,
  rising_star: 1,
  community: 2,
  unclassified: 3,
};

export function getTAIdForLabel(therapeuticArea: string): string | undefined {
  return resolveTAId(therapeuticArea);
}

export function getTADisplayName(taId: string): string {
  return TA_DISPLAY_BY_ID[taId] ?? "Other TA";
}

function mapSearchCohortClassification(
  raw: string | null | undefined,
): HCPSearchResult["cohortClassification"] {
  if (raw == null || String(raw).trim() === "") return "unclassified";
  const v = String(raw).trim().toLowerCase();
  if (v === "established") return "established";
  if (v === "rising_star" || v === "dark_horse") return "rising_star";
  if (v === "community" || v === "workhorse") return "community";
  return "unclassified";
}

function parseTherapeuticAreaLinks(
  links: unknown,
): { ids: string[]; names: string[] } {
  const arr = Array.isArray(links) ? links : links ? [links] : [];
  const ids: string[] = [];
  const names: string[] = [];
  for (const link of arr) {
    if (!link || typeof link !== "object") continue;
    const row = link as Record<string, unknown>;
    const tid = row.therapeutic_area_id;
    if (tid != null && String(tid).trim() !== "") {
      ids.push(String(tid));
    }
    const ta = row.therapeutic_areas;
    const taRow = Array.isArray(ta) ? ta[0] : ta;
    if (taRow && typeof taRow === "object" && "name" in taRow) {
      const name = (taRow as { name?: unknown }).name;
      if (name != null && String(name).trim() !== "") {
        names.push(String(name));
      }
    }
  }
  return { ids: [...new Set(ids)], names };
}

function sortInCurrentTA(results: HCPSearchResult[]): HCPSearchResult[] {
  return [...results].sort((a, b) => {
    const cohortA = a.cohortClassification ?? "unclassified";
    const cohortB = b.cohortClassification ?? "unclassified";
    const orderA = SEARCH_COHORT_ORDER[cohortA] ?? 3;
    const orderB = SEARCH_COHORT_ORDER[cohortB] ?? 3;
    if (orderA !== orderB) return orderA - orderB;
    if (cohortA === "unclassified" || cohortB === "unclassified") {
      return a.lastName.localeCompare(b.lastName);
    }
    return (b.cohortScore ?? -Infinity) - (a.cohortScore ?? -Infinity);
  });
}

function sortOtherTAs(results: HCPSearchResult[]): HCPSearchResult[] {
  return [...results].sort((a, b) => a.lastName.localeCompare(b.lastName));
}

export async function searchHCPs(
  query: string,
  currentTaId: string,
): Promise<{ inCurrentTA: HCPSearchResult[]; inOtherTAs: HCPSearchResult[] }> {
  const sanitized = query.trim();
  if (sanitized.length < 2) {
    return { inCurrentTA: [], inOtherTAs: [] };
  }

  const searchPattern = `%${sanitized.replace(/%/g, "\\%")}%`;

  const { data, error } = await supabase
    .from("hcps_v2")
    .select(
      `
      id,
      first_name,
      last_name,
      institution,
      cohort_classification,
      cohort_score,
      hcp_therapeutic_areas (
        therapeutic_area_id,
        therapeutic_areas ( name )
      )
    `,
    )
    .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern}`)
    .limit(50);

  if (error || !data) {
    return { inCurrentTA: [], inOtherTAs: [] };
  }

  const byHcpId = new Map<string, HCPSearchResult>();

  for (const row of data) {
    const id = String(row.id ?? "");
    if (!id) continue;

    const { ids: therapeuticAreaIds } = parseTherapeuticAreaLinks(row.hcp_therapeutic_areas);

    if (!byHcpId.has(id)) {
      byHcpId.set(id, {
        id,
        firstName: String(row.first_name ?? ""),
        lastName: String(row.last_name ?? ""),
        institution: row.institution != null ? String(row.institution) : null,
        cohortClassification: mapSearchCohortClassification(row.cohort_classification),
        cohortScore:
          row.cohort_score == null ? null : Number(row.cohort_score),
        therapeuticAreaIds,
      });
    } else {
      const existing = byHcpId.get(id)!;
      existing.therapeuticAreaIds = [
        ...new Set([...existing.therapeuticAreaIds, ...therapeuticAreaIds]),
      ];
    }
  }

  const inCurrentTA: HCPSearchResult[] = [];
  const inOtherTAs: HCPSearchResult[] = [];

  for (const hcp of byHcpId.values()) {
    const hasCurrentTa = hcp.therapeuticAreaIds.includes(currentTaId);
    if (hasCurrentTa) {
      inCurrentTA.push(hcp);
      continue;
    }

    const otherTaId = hcp.therapeuticAreaIds.find((tid) => tid !== currentTaId);
    const label =
      hcp.therapeuticAreaIds.length === 0
        ? "Untagged"
        : otherTaId
          ? getTADisplayName(otherTaId)
          : "Other TA";

    inOtherTAs.push({
      ...hcp,
      therapeuticAreaName: label,
    });
  }

  return {
    inCurrentTA: sortInCurrentTA(inCurrentTA),
    inOtherTAs: sortOtherTAs(inOtherTAs),
  };
}

export async function getLatestPostForHandle(
  platform: string,
  handle: string,
): Promise<ApiResult<LatestPost | null>> {
  try {
    const { data, error } = await supabase
      .from("social_posts_v2")
      .select(
        "platform, handle, post_text, posted_at, engagement_likes, engagement_replies, engagement_reposts, engagement_quotes, hashtags, captured_via_query",
      )
      .eq("platform", platform)
      .eq("handle", handle.toLowerCase())
      .order("posted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: null };
    }

    const post: LatestPost = {
      platform: String(data.platform),
      handle: String(data.handle),
      post_text: data.post_text ?? null,
      posted_at: String(data.posted_at),
      engagement_likes: Number(data.engagement_likes ?? 0),
      engagement_replies: Number(data.engagement_replies ?? 0),
      engagement_reposts: Number(data.engagement_reposts ?? 0),
      engagement_quotes: Number(data.engagement_quotes ?? 0),
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
      captured_via_query: data.captured_via_query ?? null,
    };

    return { data: post, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export type { HCP, HCPScore, LatestPost };
