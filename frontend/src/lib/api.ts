import { firstEmbedded } from "./cohort-metrics";
import { dedupeHCPs } from "./hcp-dedupe";
import { countriesForRegion, type RegionKey } from "./regions";
import { resolveFilterScope } from "./rank-filters";
import { institutionToSlug } from "./institutionUtils";
import { supabase } from "./supabase";
import type { ResearchTheme } from "../types/researchTheme";
import type { SocialCandidate, SocialConfidenceTier } from "../types/social";
import type {
  FilterState,
  HCP,
  HCPDetailResponse,
  HCPScore,
  LatestPost,
  CohortFeedResult,
  RisingStar,
  SocialUser,
  TACounts,
  VerifiedDOL,
} from "./types";

interface RpcScopeParams {
  scopeType: string;
  scopeValues: string[];
  states: string[];
  scopeLabel: string;
  scopeIncludesUs: boolean;
}

function resolveRpcScopeParams(filters: FilterState): RpcScopeParams {
  const scope = resolveFilterScope(filters);
  const scopeLabel = scopeDisplayLabel(scope);
  const requestedRegion = filters.region as RegionKey | undefined;

  let scopeType = "region";
  let scopeValues: string[] = [];

  if (scope.scopeType === "global") {
    scopeType = "global";
    scopeValues = [];
  } else if (scope.scopeType === "country") {
    scopeValues = [scope.scopeValue!];
  } else if (scope.scopeType === "region" && requestedRegion) {
    const countries = countriesForRegion(requestedRegion);
    if (countries === null) {
      scopeType = "global";
      scopeValues = [];
    } else if (countries.length === 0) {
      scopeValues = [];
    } else {
      scopeValues = countries;
    }
  } else {
    scopeValues = [scope.scopeValue ?? "US"];
  }

  const scopeIncludesUs = scopeValues.includes("US");
  // National mode (the default) sends no state filter, so all US HCPs surface —
  // including the ~68% with a null nppes_practice_state and DC-based HCPs. A
  // specific-state selection (national=false) narrows to those states.
  const states =
    !filters.national && filters.states && filters.states.length > 0 && scopeIncludesUs
      ? filters.states.map((s) => s.toUpperCase())
      : [];

  return { scopeType, scopeValues, states, scopeLabel, scopeIncludesUs };
}

type CohortKind = "rising_star" | "established" | "community";

async function enrichAndMapCohortRows(
  rankRows: any[],
  filters: FilterState,
  taSlug: string,
  taId: string,
  scopeLabel: string,
  rankTable: string,
  cohort: CohortKind,
): Promise<{ rows: RisingStar[]; error: string | null }> {
  if (rankRows.length === 0) {
    return { rows: [], error: null };
  }

  const hcpIds = rankRows.map((r: any) => String(r.hcp_id));

  let v3ByHcp = new Map<string, Record<string, unknown>>();
  if (cohort === "established") {
    const scopeParams = resolveRpcScopeParams(filters);
    let v3Query = supabase
      .from("hcp_established_ranks_v3")
      .select(
        "hcp_id, rank, cohort_score, scientific_influence_pctile, network_influence_pctile, pharma_engagement_pctile",
      )
      .eq("therapeutic_area_id", taId)
      .eq("scope_type", scopeParams.scopeType)
      .in("hcp_id", hcpIds);
    if (scopeParams.scopeValues.length > 0) {
      v3Query = v3Query.in("scope_value", scopeParams.scopeValues);
    }
    const { data: v3Rows, error: v3Err } = await v3Query;
    if (v3Err) {
      return { rows: [], error: `Established v3 ranks query failed: ${v3Err.message}` };
    }
    for (const row of v3Rows ?? []) {
      v3ByHcp.set(String(row.hcp_id), row as Record<string, unknown>);
    }
  }

  const { data: globalRankRows } =
    cohort === "rising_star"
      ? { data: null }
      : await supabase
          .from(rankTable)
          .select("hcp_id, rank")
          .eq("therapeutic_area_id", taId)
          .eq("scope_type", "global")
          .is("scope_value", null)
          .in("hcp_id", hcpIds);
  const globalRankByHcp = new Map<string, number>();
  for (const r of globalRankRows ?? []) {
    globalRankByHcp.set(String(r.hcp_id), Number(r.rank));
  }

  const [hcpResult, medicareResult, opResult, metricsResult] = await Promise.all([
    supabase
      .from("hcps_v2")
      .select(
        `
          id,
          first_name,
          last_name,
          institution_normalized,
          institution_raw,
          country,
          career_first_pub_year,
          cohort_classification,
          cohort_score,
          nppes_career_stage_years,
          nppes_practice_city,
          nppes_practice_state,
          nppes_practice_setting,
          nppes_practice_zip,
          npi_number,
          npi_specialty,
          total_career_pubs
        `,
      )
      .in("id", hcpIds),
    supabase
      .from("hcp_medicare_summary_v2")
      .select(
        "hcp_id, total_beneficiaries_3yr_unique_est, beneficiaries_2021, beneficiaries_2022, beneficiaries_2023",
      )
      .in("hcp_id", hcpIds),
    supabase
      .from("hcp_open_payments_summary_v2")
      .select(
        `
          hcp_id,
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
        `,
      )
      .in("hcp_id", hcpIds),
    supabase
      .from("hcp_author_metrics_latest_v2")
      .select("hcp_id, cited_by_count, h_index, works_count, i10_index")
      .in("hcp_id", hcpIds),
  ]);

  if (hcpResult.error) {
    return { rows: [], error: `HCP details query failed: ${hcpResult.error.message}` };
  }
  if (medicareResult.error) {
    return { rows: [], error: `Medicare query failed: ${medicareResult.error.message}` };
  }
  if (opResult.error) {
    return { rows: [], error: `Open Payments query failed: ${opResult.error.message}` };
  }
  if (metricsResult.error) {
    return { rows: [], error: `Author metrics query failed: ${metricsResult.error.message}` };
  }

  const hcpById = new Map((hcpResult.data ?? []).map((h: any) => [String(h.id), h]));
  const medicareMap = new Map((medicareResult.data ?? []).map((r: any) => [String(r.hcp_id), r]));
  const opById = new Map((opResult.data ?? []).map((r: any) => [String(r.hcp_id), r]));
  const metricsById = new Map((metricsResult.data ?? []).map((r: any) => [String(r.hcp_id), r]));

  const filteredRankRows = rankRows.filter((rr: any) => {
    const hcp = hcpById.get(String(rr.hcp_id));
    if (cohort === "rising_star") {
      if (!hcp) return false;
      const inst = String(hcp.institution_normalized ?? hcp.institution_raw ?? "").toLowerCase();
      if (!inst) return true;
      return !INDUSTRY_REGEX.test(inst);
    }
    const inst = String(
      rr.institution_normalized ??
        rr.institution_key ??
        hcp?.institution_normalized ??
        hcp?.institution_raw ??
        "",
    ).toLowerCase();
    if (!inst) return true;
    return !INDUSTRY_REGEX.test(inst);
  });

  const narrativeIds = filteredRankRows.map((r: any) => String(r.hcp_id));
  const narrativeMap = new Map<string, {
    narrative_text: string | null;
    why_now: string | null;
    engagement_angle: string | null;
    caution_flags: string | null;
    signal_strength: string | null;
  }>();

  if (narrativeIds.length > 0) {
    const { data: taNarratives, error: taNarrError } = await supabase
      .from("hcp_narratives_v2")
      .select("hcp_id, narrative_text, why_now, engagement_angle, caution_flags, signal_strength, therapeutic_area_slug")
      .in("hcp_id", narrativeIds)
      .eq("therapeutic_area_slug", taSlug);

    if (taNarrError) {
      return { rows: [], error: `Narrative query failed: ${taNarrError.message}` };
    }
    for (const n of taNarratives ?? []) {
      narrativeMap.set(String(n.hcp_id), {
        narrative_text: (n as any).narrative_text ?? null,
        why_now: (n as any).why_now ?? null,
        engagement_angle: (n as any).engagement_angle ?? null,
        caution_flags: (n as any).caution_flags ?? null,
        signal_strength: (n as any).signal_strength ?? null,
      });
    }

    const missingIds = narrativeIds.filter((id: string) => !narrativeMap.has(id));
    if (missingIds.length > 0) {
      const { data: fallbackNarratives, error: fbError } = await supabase
        .from("hcp_narratives_v2")
        .select("hcp_id, narrative_text, why_now, engagement_angle, caution_flags, signal_strength, generated_at")
        .in("hcp_id", missingIds)
        .order("generated_at", { ascending: false });

      if (fbError) {
        return { rows: [], error: `Narrative fallback query failed: ${fbError.message}` };
      }
      for (const n of fallbackNarratives ?? []) {
        const hid = String(n.hcp_id);
        if (!narrativeMap.has(hid)) {
          narrativeMap.set(hid, {
            narrative_text: (n as any).narrative_text ?? null,
            why_now: (n as any).why_now ?? null,
            engagement_angle: (n as any).engagement_angle ?? null,
            caution_flags: (n as any).caution_flags ?? null,
            signal_strength: (n as any).signal_strength ?? null,
          });
        }
      }
    }
  }

  const rows: RisingStar[] = filteredRankRows.flatMap((rr: any): RisingStar[] => {
    const hcp = hcpById.get(String(rr.hcp_id));
    if (!hcp) return [];

    const medicareData = medicareMap.get(String(rr.hcp_id));
    const opData = opById.get(String(rr.hcp_id));
    const metricsData = metricsById.get(String(rr.hcp_id));

    if (cohort === "rising_star") {
      const risingStarPercentile = parseOptionalNumber(rr.rising_star_percentile) ?? 0;
      const scopeRank = parseOptionalNumber(rr.scope_rank) ?? parseOptionalNumber(rr.rank) ?? 0;
      const momentumComponent = parseOptionalNumber(rr.momentum_component);
      const visibilityComponent = parseOptionalNumber(rr.visibility_component);
      const archetype = rr.archetype != null ? String(rr.archetype) : null;

      const enrichedRow = {
        composite_score: 0,
        normalized_score: risingStarPercentile,
        cohort_score: risingStarPercentile,
        pub_velocity_score: null,
        citation_trajectory_score: null,
        trial_investigator_score: null,
        career_first_pub_year: rr.career_first_pub_year ?? null,
        total_career_pubs: rr.total_career_pubs ?? null,
        tier: "rising_star",
        hcps: {
          ...hcp,
          first_name: rr.first_name ?? hcp.first_name,
          last_name: rr.last_name ?? hcp.last_name,
          institution_normalized:
            rr.institution_normalized ?? rr.institution_key ?? hcp.institution_normalized,
          country: rr.country ?? hcp.country,
          career_first_pub_year: rr.career_first_pub_year ?? hcp.career_first_pub_year,
          total_career_pubs: rr.total_career_pubs ?? hcp.total_career_pubs,
          cohort_classification: "rising_star",
          therapeutic_area: filters.therapeuticArea,
          hcp_medicare_summary: medicareData ? [medicareData] : null,
          hcp_open_payments_summary: opData ? [opData] : null,
          npi_specialty: archetype,
        },
      };

      const mapped = mapRisingStarRow(enrichedRow, filters.therapeuticArea);
      return [
        {
          ...mapped,
          normalized_score: risingStarPercentile,
          cohort_score: risingStarPercentile,
          composite_score: 0,
          rising_star_percentile: risingStarPercentile,
          momentum_component: parseOptionalNumber(rr.momentum_component) ?? 0,
          visibility_component: parseOptionalNumber(rr.visibility_component) ?? 0,
          scientific_momentum_percentile: parseOptionalNumber(rr.scientific_momentum_percentile) ?? 0,
          network_momentum_percentile: parseOptionalNumber(rr.network_momentum_percentile) ?? 0,
          scientific_visibility_percentile: parseOptionalNumber(rr.scientific_visibility_percentile) ?? 0,
          network_visibility_percentile: parseOptionalNumber(rr.network_visibility_percentile) ?? 0,
          archetype: rr.archetype != null ? String(rr.archetype) : null,
          us_rank: parseOptionalNumber(rr.us_rank),
          scope_rank: parseOptionalNumber(rr.scope_rank) ?? parseOptionalNumber(rr.rank) ?? 0,
          pub_velocity: 0,
          citation_trajectory: 0,
          pubVel: "—",
          citTraj: null,
          trial_score: 0,
          trialScore: 0,
          narrative: narrativeMap.get(String(rr.hcp_id))?.narrative_text ?? null,
          why_now: narrativeMap.get(String(rr.hcp_id))?.why_now ?? null,
          engagement_angle: narrativeMap.get(String(rr.hcp_id))?.engagement_angle ?? null,
          caution_flags: narrativeMap.get(String(rr.hcp_id))?.caution_flags ?? null,
          signal_strength: narrativeMap.get(String(rr.hcp_id))?.signal_strength ?? null,
          rank: scopeRank,
          global_rank: parseOptionalNumber(rr.rank),
          percentile: risingStarPercentile,
          scope_size: undefined,
          scope: scopeLabel,
          tier: "rising_star",
          cohort_classification: "rising_star",
          scientific_influence_pctile: momentumComponent,
          network_influence_pctile: visibilityComponent,
          pharma_engagement_pctile: null,
          citedByCount: metricsData?.cited_by_count ?? null,
          hIndex: metricsData?.h_index ?? null,
          worksCount: metricsData?.works_count ?? null,
          total_citations: metricsData?.cited_by_count ?? null,
          h_index: metricsData?.h_index ?? null,
          works_count: metricsData?.works_count ?? null,
        } as RisingStar,
      ];
    }

    const normalizedScore = Number(rr.normalized_score ?? 0);
    const rank = Number(rr.rank);
    const scopeSize = Number(rr.scope_size);
    const percentile =
      scopeSize > 0 ? 100 - (rank / scopeSize) * 100 : 100;

    const enrichedRow = {
      composite_score: Number(
        rr.composite_score ?? rr.score_at_rank ?? normalizedScore,
      ),
      normalized_score: normalizedScore,
      cohort_score: normalizedScore,
      pub_velocity_score: rr.pub_velocity_score ?? null,
      citation_trajectory_score: rr.citation_trajectory_score ?? null,
      trial_investigator_score: rr.trial_score ?? null,
      career_first_pub_year: rr.career_first_pub_year ?? null,
      total_career_pubs: rr.total_career_pubs ?? null,
      tier: cohort,
      hcps: {
        ...hcp,
        first_name: rr.first_name ?? hcp.first_name,
        last_name: rr.last_name ?? hcp.last_name,
        institution_normalized:
          rr.institution_normalized ?? rr.institution_key ?? hcp.institution_normalized,
        country: rr.country ?? hcp.country,
        career_first_pub_year: rr.career_first_pub_year ?? hcp.career_first_pub_year,
        total_career_pubs: rr.total_career_pubs ?? hcp.total_career_pubs,
        nppes_career_stage_years: rr.nppes_career_stage_years ?? hcp.nppes_career_stage_years,
        nppes_practice_city: rr.nppes_practice_city ?? hcp.nppes_practice_city,
        nppes_practice_state: rr.nppes_practice_state ?? hcp.nppes_practice_state,
        nppes_practice_setting: rr.nppes_practice_setting ?? hcp.nppes_practice_setting,
        npi_specialty: rr.npi_specialty ?? hcp.npi_specialty,
        cohort_classification: cohort,
        therapeutic_area: filters.therapeuticArea,
        hcp_medicare_summary: medicareData ? [medicareData] : null,
        hcp_open_payments_summary: opData ? [opData] : null,
      },
    };

    const mapped = mapRisingStarRow(enrichedRow, filters.therapeuticArea);
    const base: RisingStar = {
      ...mapped,
      normalized_score: normalizedScore,
      cohort_score: normalizedScore,
      narrative: narrativeMap.get(String(rr.hcp_id))?.narrative_text ?? null,
      why_now: narrativeMap.get(String(rr.hcp_id))?.why_now ?? null,
      engagement_angle: narrativeMap.get(String(rr.hcp_id))?.engagement_angle ?? null,
      caution_flags: narrativeMap.get(String(rr.hcp_id))?.caution_flags ?? null,
      signal_strength: narrativeMap.get(String(rr.hcp_id))?.signal_strength ?? null,
      rank,
      percentile,
      scope_size: scopeSize,
      global_rank: globalRankByHcp.get(String(rr.hcp_id)) ?? null,
      scope: scopeLabel,
      citedByCount: rr.cited_by_count ?? metricsData?.cited_by_count ?? null,
      hIndex: rr.h_index ?? metricsData?.h_index ?? null,
      worksCount: rr.works_count ?? metricsData?.works_count ?? null,
      total_citations: rr.cited_by_count ?? metricsData?.cited_by_count ?? null,
      h_index: rr.h_index ?? metricsData?.h_index ?? null,
      works_count: rr.works_count ?? metricsData?.works_count ?? null,
    };

    if (cohort === "established") {
      const v3 = v3ByHcp.get(String(rr.hcp_id));
      const v3CohortScore = parseOptionalNumber(v3?.cohort_score);
      return [
        {
          ...base,
          cohort_score: v3CohortScore ?? normalizedScore,
          cohort_classification: "established",
          tier: "established",
          scientific_influence_pctile: parseOptionalNumber(v3?.scientific_influence_pctile),
          network_influence_pctile: parseOptionalNumber(v3?.network_influence_pctile),
          pharma_engagement_pctile: parseOptionalNumber(v3?.pharma_engagement_pctile),
          pubVel: "—",
          citTraj: null,
          pub_velocity: 0,
          citation_trajectory: 0,
          trial_score: rr.trial_score != null ? Number(rr.trial_score) : null,
          trialScore: rr.trial_score ?? null,
          firstPubYear: rr.career_first_pub_year ?? null,
          total_career_pubs: parseOptionalNumber(rr.total_career_pubs),
        } as RisingStar,
      ];
    }

    return [
      {
        ...base,
        cohort_classification: "community",
        tier: "community",
        composite_score: Number(rr.composite_score ?? normalizedScore),
      } as RisingStar,
    ];
  });

  return { rows, error: null };
}

async function fetchCohortViaRpc(
  filters: FilterState,
  taId: string,
  taSlug: string,
  limit: number,
  offset: number,
  countRpc: string,
  rowsRpc: string,
  rankTable: string,
  cohort: CohortKind,
): Promise<{ rows: RisingStar[]; total: number; error: string | null }> {
  const rpcScope = resolveRpcScopeParams(filters);
  const scope = resolveFilterScope(filters);

  if (scope.scopeType === "global" || rpcScope.scopeValues.length === 0) {
    return { rows: [], total: 0, error: null };
  }

  const rpcParams = {
    p_ta_id: taId,
    p_scope_type: rpcScope.scopeType,
    p_scope_values: rpcScope.scopeValues,
    p_states: rpcScope.states,
    p_canonical_theme_ids: filters.themeIds ?? [],
  };

  const { data: countData, error: countErr } = await supabase.rpc(countRpc, rpcParams);
  if (countErr) {
    return { rows: [], total: 0, error: `${countRpc} failed: ${countErr.message}` };
  }
  const totalCount: number = countData ?? 0;

  const { data: rowsData, error: rowsErr } = await supabase.rpc(rowsRpc, {
    ...rpcParams,
    p_limit: limit,
    p_offset: offset,
  });
  if (rowsErr) {
    return { rows: [], total: 0, error: `${rowsRpc} failed: ${rowsErr.message}` };
  }

  if (!rowsData || rowsData.length === 0) {
    return { rows: [], total: totalCount, error: null };
  }

  const { rows, error } = await enrichAndMapCohortRows(
    rowsData,
    filters,
    taSlug,
    taId,
    rpcScope.scopeLabel,
    rankTable,
    cohort,
  );
  if (error) {
    return { rows: [], total: 0, error };
  }

  return { rows: dedupeHCPs(rows), total: totalCount, error: null };
}

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

export interface ScientificInfluenceData {
  percentile: number;
  senior_pub_count: number;
  senior_pub_total_citations: number;
  guideline_pub_count: number;
  senior_pub_recent_5yr: number;
}

export interface NetworkInfluenceData {
  score: number;
  collaborator_count: number;
  degree_percentile: number;
  eigenvector_percentile: number;
  betweenness_percentile: number;
}

export interface IndustryEngagementData {
  percentile: number;
  total_payments_3yr: number;
  distinct_companies_3yr: number;
  distinct_drugs_3yr: number;
  payment_count_3yr: number;
}

export interface TopCollaborator {
  hcp_id: string;
  rank: number;
  name: string;
  institution: string | null;
  shared_publications: number;
  cohort_score: number | null;
  cohort_kind: "rising_star" | "established" | null;
}

export interface EstablishedScoreBreakdown {
  cohort_score: number;
  us_rank: number | null;
  global_rank: number | null;
  scientific: ScientificInfluenceData | null;
  network: NetworkInfluenceData | null;
  industry: IndustryEngagementData | null;
  top_collaborators: TopCollaborator[];
}

export interface RisingStarScoreBreakdown {
  hcp_id: string;
  rising_star_percentile: number;
  momentum_component: number;
  visibility_component: number;
  scientific_momentum_percentile: number;
  network_momentum_percentile: number;
  scientific_visibility_percentile: number;
  network_visibility_percentile: number;
  archetype: string;
  rank: number;
  us_rank: number | null;
  top_collaborators: TopCollaborator[];
  external_collaborators: TopCollaborator[];
  early_collaborator_count?: number | null;
  recent_collaborator_count?: number | null;
}

export interface CommunityScoreBreakdown {
  hcp_id: string;
  composite_score: number;
  rank: number | null;
  patient_volume_3yr: number | null;
  lifetime_payments: number | null;
  distinct_companies: number | null;
  distinct_drugs: number | null;
}

export interface WebSignal {
  signal_type: string;
  signal_value: string;
  source_url: string | null;
  source_title: string | null;
  confidence: "high" | "medium" | "low";
}

const TA_ID_MAP: Record<string, string> = {
  "rare-disease": "833e7b38-d01b-409e-82c0-71eb29e138a0",
  hepatology: "9b31947b-5ce2-41fd-bed8-0c09b9e5ad3e",
  nsclc: "c0065b03-a25e-4e9a-bde4-4b4d0db7827d",
  oncology: "095bc902-c3dc-48a3-8167-52ee55795d60",
  immunology: "4cf07827-ff1c-451e-832e-0e0a14ea9c86",
  "atopic-dermatitis": "9e4139d2-e062-4a58-8728-cdabb2d7dca1",
};

const SLUG_BY_TA_ID: Record<string, string> = Object.fromEntries(
  Object.entries(TA_ID_MAP).map(([slug, id]) => [id, slug]),
);

export function apiSlugForTaId(taId: string): string | undefined {
  return SLUG_BY_TA_ID[taId];
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

// Word-boundary matcher so a pharma token can't match inside a longer word —
// e.g. "roche" must not match "University of Rochester". inst is pre-lowercased.
const INDUSTRY_REGEX = new RegExp(
  `\\b(${INDUSTRY_PATTERNS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
);

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

function scopeDisplayLabel(scope: { scopeType: string; scopeValue: string | null }): string {
  if (scope.scopeValue) return scope.scopeValue.toUpperCase();
  if (scope.scopeType === "global") return "GLOBAL";
  return scope.scopeType.toUpperCase();
}

function mapRisingStarRow(row: any, therapeuticArea: string): RisingStar {
  const hcp = row.hcps ?? {};
  const med = firstEmbedded(hcp.hcp_medicare_summary ?? row.hcp_medicare_summary);
  const pay = firstEmbedded(hcp.hcp_open_payments_summary ?? row.hcp_open_payments_summary);

  return {
    id: hcp.id ?? row.hcp_id ?? "",
    first_name: String(hcp.first_name ?? ""),
    last_name: String(hcp.last_name ?? ""),
    institution: String(hcp.institution ?? hcp.institution_normalized ?? ""),
    institution_normalized:
      hcp.institution_normalized != null && hcp.institution_normalized !== ""
        ? String(hcp.institution_normalized)
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
    pubVel: row.pub_velocity_score == null ? "?" : `${Number(row.pub_velocity_score).toFixed(1)}`,
    firstPubYear: row.career_first_pub_year ?? null,
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
    rising_star_percentile: parseOptionalNumber(row.rising_star_percentile),
    momentum_component: parseOptionalNumber(row.momentum_component),
    visibility_component: parseOptionalNumber(row.visibility_component),
    scientific_momentum_percentile: parseOptionalNumber(row.scientific_momentum_percentile),
    network_momentum_percentile: parseOptionalNumber(row.network_momentum_percentile),
    scientific_visibility_percentile: parseOptionalNumber(row.scientific_visibility_percentile),
    network_visibility_percentile: parseOptionalNumber(row.network_visibility_percentile),
    archetype: row.archetype != null ? String(row.archetype) : null,
    us_rank: parseOptionalNumber(row.us_rank),
    scope_rank: parseOptionalNumber(row.scope_rank),
  };
}

export type FeedCohort = "rising_star" | "community" | "established";

function resolveTASlug(therapeuticArea: string | undefined): string | undefined {
  if (!therapeuticArea?.trim()) return undefined;
  const normalized = therapeuticArea.toLowerCase().trim();
  const slugByLabel: Record<string, string> = {
    "rare disease": "rare-disease",
    hepatology: "hepatology",
    nsclc: "nsclc",
    oncology: "oncology",
    immunology: "immunology",
  };
  return slugByLabel[normalized] ?? normalized.replace(/\s+/g, "-");
}

function resolveTAId(therapeuticArea: string | undefined): string | undefined {
  const slug = resolveTASlug(therapeuticArea);
  if (!slug) return undefined;
  return TA_ID_MAP[slug];
}

const PAGINATION_PAGE_SIZE = 1000;

async function fetchAllPaginated<T>(
  buildQuery: (offset: number, pageSize: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize: number = PAGINATION_PAGE_SIZE,
): Promise<{ data: T[]; error: any }> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery(offset, pageSize);
    if (error) return { data: allRows, error };
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return { data: allRows, error: null };
}

/** TA-specific narrative first, then most recent narrative for this HCP. */
export async function getHCPNarrative(
  hcpId: string,
  therapeuticArea?: string,
): Promise<ApiResult<string | null>> {
  try {
    const taSlug = resolveTASlug(therapeuticArea);

    if (taSlug) {
      const { data, error } = await supabase
        .from("hcp_narratives_v2")
        .select("narrative_text")
        .eq("hcp_id", hcpId)
        .eq("therapeutic_area_slug", taSlug)
        .maybeSingle();

      if (error) {
        return { data: null, error: error.message };
      }
      if (data?.narrative_text) {
        return { data: data.narrative_text as string, error: null };
      }
    }

    const fallback = await supabase
      .from("hcp_narratives_v2")
      .select("narrative_text")
      .eq("hcp_id", hcpId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallback.error) {
      return { data: null, error: fallback.error.message };
    }

    return { data: (fallback.data?.narrative_text as string | null) ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function fetchHcpThemes(hcpId: string): Promise<ApiResult<ResearchTheme[]>> {
  try {
    const { data, error } = await supabase
      .from("hcp_research_themes_v2")
      .select("*")
      .eq("hcp_id", hcpId)
      .gte("display_rank", 1)
      .order("display_rank", { ascending: true });

    if (error) {
      return { data: null, error: error.message };
    }

    const rows = (data ?? []).map((row) => ({
      ...row,
      example_pmids: Array.isArray(row.example_pmids) ? row.example_pmids : [],
    })) as ResearchTheme[];

    return { data: rows, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getRisingStars(
  filtersOrSlug: FilterState | string,
  limit: number = 20,
  options: { offset?: number } = {},
): Promise<ApiResult<{ rows: RisingStar[]; total: number }>> {
  try {
    const filters: FilterState =
      typeof filtersOrSlug === "string"
        ? { therapeuticArea: filtersOrSlug }
        : filtersOrSlug;

    const taSlug = filters.therapeuticArea.toLowerCase().trim();
    const taId = filters.taId ?? TA_ID_MAP[taSlug];

    if (!taId) {
      return { data: { rows: dedupeHCPs<RisingStar>([]), total: 0 }, error: null };
    }

    const offset = options.offset ?? 0;
    const { rows, total, error: fetchError } = await fetchCohortViaRpc(
      filters,
      taId,
      taSlug,
      limit,
      offset,
      "get_rising_star_filtered_count",
      "get_rising_star_filtered",
      "hcp_rising_star_ranks_v3",
      "rising_star",
    );
    if (fetchError) {
      return { data: null, error: `Rising star fetch failed: ${fetchError}` };
    }
    return { data: { rows, total }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getEstablished(
  filtersOrSlug: FilterState | string,
  limit: number = 20,
  options: { offset?: number } = {},
): Promise<ApiResult<{ rows: RisingStar[]; total: number }>> {
  try {
    const filters: FilterState =
      typeof filtersOrSlug === "string"
        ? { therapeuticArea: filtersOrSlug }
        : filtersOrSlug;

    const taSlug = filters.therapeuticArea.toLowerCase().trim();
    const taId = filters.taId ?? TA_ID_MAP[taSlug];

    if (!taId) {
      return { data: { rows: dedupeHCPs<RisingStar>([]), total: 0 }, error: null };
    }

    const offset = options.offset ?? 0;
    const { rows, total, error: fetchError } = await fetchCohortViaRpc(
      filters,
      taId,
      taSlug,
      limit,
      offset,
      "get_established_filtered_count",
      "get_established_filtered",
      "hcp_established_ranks_v3",
      "established",
    );
    if (fetchError) {
      return { data: null, error: `Established fetch failed: ${fetchError}` };
    }
    return { data: { rows, total }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getCommunity(
  filtersOrSlug: FilterState | string,
  limit: number = 20,
  options: { offset?: number } = {},
): Promise<ApiResult<CohortFeedResult>> {
  try {
    const filters: FilterState =
      typeof filtersOrSlug === "string"
        ? { therapeuticArea: filtersOrSlug }
        : filtersOrSlug;

    const taSlug = filters.therapeuticArea.toLowerCase().trim();
    const taId = filters.taId ?? TA_ID_MAP[taSlug];

    if (!taId) {
      return { data: { rows: dedupeHCPs<RisingStar>([]), total: 0 }, error: null };
    }

    const rpcScope = resolveRpcScopeParams(filters);
    if (!rpcScope.scopeIncludesUs) {
      return {
        data: {
          rows: [],
          total: 0,
          emptyReason: "community-non-us",
        },
        error: null,
      };
    }

    const offset = options.offset ?? 0;
    const { rows, total, error: fetchError } = await fetchCohortViaRpc(
      filters,
      taId,
      taSlug,
      limit,
      offset,
      "get_community_filtered_count",
      "get_community_filtered",
      "hcp_community_ranks_v2",
      "community",
    );
    if (fetchError) {
      return { data: null, error: `Community fetch failed: ${fetchError}` };
    }
    return { data: { rows, total }, error: null };
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
 * Counts are queried from the precomputed ranks table ? one count query
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
    const applyScope = (q: any): any => {
      let query = q.eq("therapeutic_area_id", taId).eq("scope_type", scope.scopeType);
      if (scope.scopeValue === null) {
        query = query.is("scope_value", null);
      } else {
        query = query.eq("scope_value", scope.scopeValue);
      }
      return query;
    };

    let risingStarsQuery: any;
    if (scope.scopeType === "global" || scope.scopeValue === null) {
      risingStarsQuery = supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id", { count: "exact", head: true })
        .eq("therapeutic_area_id", taId);
    } else if (scope.scopeValue === "US") {
      risingStarsQuery = supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id", { count: "exact", head: true })
        .eq("therapeutic_area_id", taId)
        .not("us_rank", "is", null);
    } else {
      risingStarsQuery = supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id", { count: "exact", head: true })
        .eq("therapeutic_area_id", taId);
    }
    const risingStarCountResult = await risingStarsQuery;
    if (risingStarCountResult.error) {
      return { data: null, error: `Rising star selected count failed: ${risingStarCountResult.error.message}` };
    }

    let risingPoolQuery: any;
    if (scope.scopeType === "global") {
      // Global branch: scope_type='global' rows only to avoid per-region duplicates.
      risingPoolQuery = supabase
        .from("hcp_score_ranks_v2")
        .select("hcp_id", { count: "exact", head: true })
        .eq("therapeutic_area_id", taId)
        .eq("cohort", "rising")
        .eq("scope_type", "global");
    } else {
      risingPoolQuery = supabase
        .from("hcp_score_ranks_v2")
        .select("hcp_id", { count: "exact", head: true })
        .eq("therapeutic_area_id", taId)
        .eq("cohort", "rising")
        .eq("scope_type", scope.scopeType);
      if (scope.scopeValue === null) {
        risingPoolQuery = risingPoolQuery.is("scope_value", null);
      } else {
        risingPoolQuery = risingPoolQuery.eq("scope_value", scope.scopeValue);
      }
    }

    const [
      risingPoolResult,
      establishedResult,
      communityResult,
    ] = await Promise.all([
      risingPoolQuery,
      supabase
        .from("hcp_established_scores_v2").select("hcp_id", { count: "exact", head: true }).eq("therapeutic_area_id", taId),
      supabase
        .from("hcp_community_scores_v2").select("hcp_id", { count: "exact", head: true }).eq("therapeutic_area_id", taId),
    ]);

    if (risingPoolResult.error) {
      return { data: null, error: `Rising star pool count failed: ${risingPoolResult.error.message}` };
    }
    if (establishedResult.error) {
      return { data: null, error: `Established count failed: ${establishedResult.error.message}` };
    }
    if (communityResult.error) {
      return { data: null, error: `Community count failed: ${communityResult.error.message}` };
    }

    const risingPool = risingPoolResult.count ?? 0;
    const risingSelected = risingStarCountResult.count ?? 0;
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
        const hcpIds = Array.from(new Set(hcpIdRows.map((r: any) => String(r.hcp_id))));
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
    // Hepatology and Rare Disease retired 2026-07-11 (no v3 rank rows → frozen feeds);
    // stop computing their parent-level counts. See docs/VERSION_CONSISTENCY_AUDIT.md.
    const slugs = ["nsclc", "immunology"] as const;
    const results = await Promise.all(
      slugs.map((slug) => getTACounts({ therapeuticArea: slug, scope: "global" })),
    );
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
      .select("id, first_name, last_name, institution_normalized, country, total_career_pubs")
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
          institution: hcp.institution_normalized ?? null,
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
  filters: FilterState,
): Promise<ApiResult<HCPDetailResponse>> {
  try {
    // 1) TA is required. Reject if missing or unknown.
    if (!filters?.therapeuticArea) {
      return { data: null, error: "Therapeutic area is required for HCP detail." };
    }
    const taSlug = filters.therapeuticArea.toLowerCase().trim();
    const taId = filters.taId ?? TA_ID_MAP[taSlug];
    if (!taId) {
      return { data: null, error: `Unknown therapeutic area: ${taSlug}` };
    }

    // Narratives are keyed by the TA's own slug (e.g. 'atopic-dermatitis'),
    // not the display/api label the caller passes (AD is surfaced under the
    // 'immunology' label). Resolve the narrative slug from the resolved taId
    // so sub-indication TAs read their own narratives.
    const narrativeTaSlug = apiSlugForTaId(taId) ?? taSlug;

    // 2) Fetch core HCP profile (TA-independent fields only).
    const { data: hcpData, error: hcpError } = await supabase
      .from("hcps_v2")
      .select(
        `
          id,
          first_name,
          last_name,
          institution_normalized,
          institution_raw,
          country,
          cohort_classification,
          cohort_score,
          career_first_pub_year,
          total_career_pubs,
          npi_number,
          npi_specialty,
          nppes_career_stage_years,
          nppes_practice_city,
          nppes_practice_state,
          nppes_practice_zip,
          nppes_practice_setting,
          is_verified_dol
        `,
      )
      .eq("id", hcpId)
      .maybeSingle();

    if (hcpError) {
      return { data: null, error: `HCP fetch failed: ${hcpError.message}` };
    }
    if (!hcpData) {
      return { data: null, error: `HCP not found: ${hcpId}` };
    }

    // 3) Resolve scope from FilterState (or default to US region).
    const scope = resolveFilterScope(filters);

    // 4) Fetch TA-scoped data in parallel.
    const scorePromise = supabase
      .from("hcp_scores_v2")
      .select(
        `
          composite_score,
          normalized_score,
          tier,
          pub_velocity_score,
          citation_trajectory_score,
          trial_investigator_score
        `,
      )
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .maybeSingle();

    const rankPromise = (() => {
      let q = supabase
        .from("hcp_score_ranks_v2")
        .select("rank, percentile, scope_size, score_at_rank, cohort, scope_type, scope_value")
        .eq("hcp_id", hcpId)
        .eq("therapeutic_area_id", taId)
        .eq("scope_type", scope.scopeType);
      if (scope.scopeValue === null) {
        q = q.is("scope_value", null);
      } else {
        q = q.eq("scope_value", scope.scopeValue);
      }
      return q.maybeSingle();
    })();

    // Narrative is TA-strict: NO fallback to other TAs. If the HCP has no
    // narrative for this TA, narrative is null.
    const narrativePromise = supabase
      .from("hcp_narratives_v2")
      .select("narrative_text, why_now, engagement_angle, caution_flags, signal_strength, generated_at, therapeutic_area_slug")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_slug", narrativeTaSlug)
      .maybeSingle();

    const medicarePromise = supabase
      .from("hcp_medicare_summary_v2")
      .select(
        "total_beneficiaries_3yr_unique_est, beneficiaries_2021, beneficiaries_2022, beneficiaries_2023",
      )
      .eq("hcp_id", hcpId)
      .maybeSingle();

    const openPaymentsPromise = supabase
      .from("hcp_open_payments_summary_v2")
      .select(
        `
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
        `,
      )
      .eq("hcp_id", hcpId)
      .maybeSingle();

    // Publications: join publication_therapeutic_areas_v2 (filter to TA) ? publications_v2.
    const publicationsPromise = supabase
      .from("publication_therapeutic_areas_v2")
      .select(
        `
          publications_v2!inner(
            id,
            pmid,
            title,
            journal,
            pub_year,
            pub_date,
            citation_count,
            doi
          )
        `,
      )
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .order("publications_v2(pub_date)", { ascending: false })
      .limit(50);

    // Trials: filter to source_therapeutic_area_id = taId.
    const trialsPromise = supabase
      .from("trial_investigators_v2")
      .select(
        `
          role,
          clinical_trials_v2!inner(
            id,
            nct_id,
            title,
            phase,
            status,
            sponsor_name,
            start_date,
            completion_date,
            source_therapeutic_area_id
          )
        `,
      )
      .eq("hcp_id", hcpId)
      .eq("clinical_trials_v2.source_therapeutic_area_id", taId)
      .limit(50);

    const metricsPromise = supabase
      .from("hcp_author_metrics_latest_v2")
      .select("cited_by_count, h_index, works_count, i10_index, two_yr_mean_citedness, counts_by_year")
      .eq("hcp_id", hcpId)
      .maybeSingle();

    const [
      scoreResult,
      rankResult,
      narrativeResult,
      medicareResult,
      opResult,
      pubsResult,
      trialsResult,
      metricsResult,
    ] = await Promise.all([
      scorePromise,
      rankPromise,
      narrativePromise,
      medicarePromise,
      openPaymentsPromise,
      publicationsPromise,
      trialsPromise,
      metricsPromise,
    ]);

    // 5) Compose response.
    const publicationsRows = (pubsResult as { data?: Array<{ publications_v2?: unknown }> | null }).data ?? [];
    const publications = publicationsRows
      .map((row) => {
        const p = (row as { publications_v2?: unknown }).publications_v2;
        return Array.isArray(p) ? p[0] : p;
      })
      .filter(Boolean);

    const trialsRows = (trialsResult as { data?: Array<{ role?: string; clinical_trials_v2?: unknown }> | null }).data ?? [];
    const trials = trialsRows
      .map((row) => {
        const t = (row as { clinical_trials_v2?: unknown }).clinical_trials_v2;
        const trial = Array.isArray(t) ? t[0] : t;
        return trial ? { ...trial, role: row.role ?? null } : null;
      })
      .filter(Boolean);

    const narrativeData = (narrativeResult as {
      data?: {
        narrative_text: string | null;
        why_now: string | null;
        engagement_angle: string | null;
        caution_flags: string | null;
        signal_strength: string | null;
        generated_at: string | null;
      } | null;
    }).data ?? null;

    // When an explicit indication ta_id is supplied, cohort membership is
    // TA-scoped and lives in the ranks tables — not the global hcps_v2 column
    // (which is null for HCPs classified only within a sub-indication TA like AD).
    let cohortClassification = hcpData.cohort_classification ?? null;
    if (filters.taId) {
      const { data: estRows } = await supabase
        .from("hcp_established_ranks_v3")
        .select("hcp_id")
        .eq("hcp_id", hcpId)
        .eq("therapeutic_area_id", taId)
        .limit(1);
      if (estRows && estRows.length > 0) cohortClassification = "established";
    }

    const response: HCPDetailResponse = {
      hcp: { ...hcpData, cohort_classification: cohortClassification },
      score: (scoreResult as { data?: unknown }).data ?? null,
      rank: (rankResult as { data?: unknown }).data ?? null,
      narrative: narrativeData,
      medicare: (medicareResult as { data?: unknown }).data ?? null,
      openPayments: (opResult as { data?: unknown }).data ?? null,
      publications,
      trials,
      therapeuticArea: taSlug,
      scope: { type: scope.scopeType, value: scope.scopeValue },
      authorMetrics: (metricsResult as { data?: unknown }).data ?? null,
    };

    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error occurred",
    };
  }
}

export async function getRisingStarScoreBreakdown(
  hcpId: string,
  taSlug: string,
): Promise<RisingStarScoreBreakdown | null> {
  if (!hcpId || !taSlug) return null;

  const taId = TA_ID_MAP[taSlug.toLowerCase().trim()];
  if (!taId) return null;

  const { data, error } = await supabase
    .from("hcp_rising_star_ranks_v3")
    .select(
      "hcp_id, rank, us_rank, rising_star_percentile, " +
        "momentum_component, visibility_component, " +
        "scientific_momentum_percentile, network_momentum_percentile, " +
        "scientific_visibility_percentile, network_visibility_percentile, " +
        "archetype",
    )
    .eq("hcp_id", hcpId)
    .eq("therapeutic_area_id", taId)
    .maybeSingle();

  if (error) {
    console.error("[getRisingStarScoreBreakdown]", error);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;

  const { data: networkMomentumRow } = await supabase
    .from("hcp_network_momentum_v1")
    .select("early_collaborator_count, recent_collaborator_count")
    .eq("hcp_id", hcpId)
    .eq("therapeutic_area_id", taId)
    .maybeSingle();

  const networkMomentum = networkMomentumRow as
    | { early_collaborator_count: number | null; recent_collaborator_count: number | null }
    | null;

  const [{ data: sourceHcp }, { data: collaboratorsRaw }] = await Promise.all([
    supabase
      .from("hcps_v2")
      .select("institution_canonical")
      .eq("id", hcpId)
      .maybeSingle(),
    supabase
      .from("hcp_top_collaborators_v2")
      .select("rank, collaborator_hcp_id, shared_publications")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .order("rank", { ascending: true })
      .limit(10),
  ]);

  const sourceInstitution = sourceHcp?.institution_canonical ?? null;

  let topCollaborators: TopCollaborator[] = [];
  let externalCollaborators: TopCollaborator[] = [];
  if (collaboratorsRaw && collaboratorsRaw.length > 0) {
    const collabIds = collaboratorsRaw.map((r) => r.collaborator_hcp_id);
    const { data: collabHcps } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_canonical")
      .in("id", collabIds);
    const nameMap = new Map<string, { name: string; institution: string | null }>();
    (collabHcps || []).forEach((h) => {
      nameMap.set(String(h.id), {
        name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim(),
        institution: h.institution_canonical,
      });
    });

    const [establishedRanks, risingStarRanks] = await Promise.all([
      supabase
        .from("hcp_established_ranks_v3")
        .select("hcp_id, cohort_score")
        .in("hcp_id", collabIds)
        .eq("therapeutic_area_id", taId)
        .eq("scope_type", "region")
        .eq("scope_value", "US"),
      supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id, rising_star_percentile")
        .in("hcp_id", collabIds)
        .eq("therapeutic_area_id", taId),
    ]);

    const establishedScoreMap = new Map<string, number>();
    (establishedRanks.data || []).forEach((r) => {
      if (r.cohort_score != null) {
        establishedScoreMap.set(String(r.hcp_id), Number(r.cohort_score));
      }
    });

    const risingStarScoreMap = new Map<string, number>();
    (risingStarRanks.data || []).forEach((r) => {
      const row = r as { hcp_id: string; rising_star_percentile: number | null };
      if (row.rising_star_percentile != null) {
        risingStarScoreMap.set(String(row.hcp_id), Number(row.rising_star_percentile));
      }
    });

    const allCollaborators: TopCollaborator[] = collaboratorsRaw.map((r) => {
      const id = String(r.collaborator_hcp_id);
      const risingScore = risingStarScoreMap.get(id);
      const establishedScore = establishedScoreMap.get(id);

      let cohort_kind: "rising_star" | "established" | null = null;
      let cohort_score: number | null = null;
      if (risingScore != null) {
        cohort_kind = "rising_star";
        cohort_score = risingScore;
      } else if (establishedScore != null) {
        cohort_kind = "established";
        cohort_score = establishedScore;
      }

      return {
        hcp_id: id,
        rank: Number(r.rank),
        name: nameMap.get(id)?.name ?? "Unknown",
        institution: nameMap.get(id)?.institution ?? null,
        shared_publications: Number(r.shared_publications ?? 0),
        cohort_score,
        cohort_kind,
      };
    });

    topCollaborators = allCollaborators.filter(
      (c) => sourceInstitution && c.institution === sourceInstitution,
    );
    externalCollaborators = allCollaborators.filter(
      (c) => !sourceInstitution || c.institution !== sourceInstitution,
    );
  }

  return {
    hcp_id: String(row.hcp_id),
    rising_star_percentile: Number(row.rising_star_percentile ?? 0),
    momentum_component: Number(row.momentum_component ?? 0),
    visibility_component: Number(row.visibility_component ?? 0),
    scientific_momentum_percentile: Number(row.scientific_momentum_percentile ?? 0),
    network_momentum_percentile: Number(row.network_momentum_percentile ?? 0),
    scientific_visibility_percentile: Number(row.scientific_visibility_percentile ?? 0),
    network_visibility_percentile: Number(row.network_visibility_percentile ?? 0),
    archetype: String(row.archetype ?? "Emerging Leader"),
    rank: Number(row.rank ?? 0),
    us_rank: row.us_rank == null ? null : Number(row.us_rank),
    top_collaborators: topCollaborators,
    external_collaborators: externalCollaborators,
    early_collaborator_count:
      networkMomentum?.early_collaborator_count == null
        ? null
        : Number(networkMomentum.early_collaborator_count),
    recent_collaborator_count:
      networkMomentum?.recent_collaborator_count == null
        ? null
        : Number(networkMomentum.recent_collaborator_count),
  };
}

export async function getHcpWebSignals(
  hcpId: string,
  phase: "identification" | "rising_star_signals" = "identification",
): Promise<WebSignal[]> {
  const { data, error } = await supabase
    .from("hcp_web_signals_v1")
    .select("signal_type, signal_value, source_url, source_title, confidence")
    .eq("hcp_id", hcpId)
    .eq("phase", phase);
  if (error) {
    console.error("[getHcpWebSignals]", error);
    return [];
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    signal_type: String(row.signal_type),
    signal_value: String(row.signal_value),
    source_url: row.source_url == null ? null : String(row.source_url),
    source_title: row.source_title == null ? null : String(row.source_title),
    confidence: row.confidence as "high" | "medium" | "low",
  }));
}

export async function getEstablishedScoreBreakdown(
  hcpId: string,
  taSlug: string,
): Promise<EstablishedScoreBreakdown | null> {
  if (!hcpId || !taSlug) return null;

  const { data: taRow } = await supabase
    .from("therapeutic_areas")
    .select("id")
    .eq("slug", taSlug)
    .single();

  if (!taRow?.id) return null;
  const taId = taRow.id;

  console.log("[getEstablishedScoreBreakdown] called with hcpId=", hcpId, "taSlug=", taSlug, "taId=", taId);

  const [
    ranksV3,
    globalRankRow,
    scientific,
    network,
    pharma,
    collaboratorsRaw,
  ] = await Promise.all([
    supabase
      .from("hcp_established_ranks_v3")
      .select("cohort_score, rank")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .eq("scope_type", "region")
      .eq("scope_value", "US")
      .maybeSingle(),
    supabase
      .from("hcp_established_ranks_v3")
      .select("rank")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .eq("scope_type", "global")
      .maybeSingle(),
    supabase
      .from("hcp_publication_leadership_v2")
      .select(
        "percentile_rank, senior_pub_count, senior_pub_total_citations, guideline_pub_count, senior_pub_recent_5yr",
      )
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .maybeSingle(),
    supabase
      .from("hcp_network_centrality_v2")
      .select(
        "network_influence_score, collaborator_count, degree_percentile, eigenvector_percentile, betweenness_percentile",
      )
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .eq("window_type", "10yr")
      .maybeSingle(),
    supabase
      .from("hcp_pharma_engagement_v2")
      .select(
        "percentile_rank, total_payments_3yr, distinct_companies_3yr, distinct_drugs_3yr, payment_count_3yr",
      )
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .maybeSingle(),
    supabase
      .from("hcp_top_collaborators_v2")
      .select("rank, collaborator_hcp_id, shared_publications")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .eq("window_type", "10yr")
      .order("rank", { ascending: true })
      .limit(5),
  ]);

  console.log("[getEstablishedScoreBreakdown] raw responses:", {
    ranksV3: ranksV3,
    scientific: scientific,
    network: network,
    pharma: pharma,
    collaboratorsRaw: collaboratorsRaw,
  });

  let topCollaborators: TopCollaborator[] = [];
  if (collaboratorsRaw.data && collaboratorsRaw.data.length > 0) {
    const collabIds = collaboratorsRaw.data.map((r) => r.collaborator_hcp_id);
    const { data: collabHcps } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_normalized")
      .in("id", collabIds);

    const nameMap = new Map<string, { name: string; institution: string | null }>();
    (collabHcps || []).forEach((h) => {
      nameMap.set(String(h.id), {
        name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim(),
        institution: h.institution_normalized,
      });
    });

    const collabScoreMap = new Map<string, number>();
    if (collabIds.length > 0) {
      const { data: collabRanks } = await supabase
        .from("hcp_established_ranks_v3")
        .select("hcp_id, cohort_score")
        .in("hcp_id", collabIds)
        .eq("therapeutic_area_id", taId)
        .eq("scope_type", "region")
        .eq("scope_value", "US");

      (collabRanks || []).forEach((r) => {
        if (r.cohort_score != null) {
          collabScoreMap.set(String(r.hcp_id), Number(r.cohort_score));
        }
      });
    }

    topCollaborators = collaboratorsRaw.data.map((r) => {
      const id = String(r.collaborator_hcp_id);
      const cohort_score = collabScoreMap.get(id) ?? null;
      return {
        hcp_id: r.collaborator_hcp_id,
        rank: r.rank,
        name: nameMap.get(id)?.name ?? "Unknown",
        institution: nameMap.get(id)?.institution ?? null,
        shared_publications: r.shared_publications,
        cohort_score,
        cohort_kind: cohort_score != null ? ("established" as const) : null,
      };
    });
  }

  const result: EstablishedScoreBreakdown = {
    cohort_score: ranksV3.data?.cohort_score ? Number(ranksV3.data.cohort_score) : 0,
    us_rank: ranksV3.data?.rank != null ? Number(ranksV3.data.rank) : null,
    global_rank: globalRankRow.data?.rank != null ? Number(globalRankRow.data.rank) : null,
    scientific: scientific.data
      ? {
          percentile: Number(scientific.data.percentile_rank),
          senior_pub_count: scientific.data.senior_pub_count ?? 0,
          senior_pub_total_citations: scientific.data.senior_pub_total_citations ?? 0,
          guideline_pub_count: scientific.data.guideline_pub_count ?? 0,
          senior_pub_recent_5yr: scientific.data.senior_pub_recent_5yr ?? 0,
        }
      : null,
    network: network.data
      ? {
          score: Number(network.data.network_influence_score),
          collaborator_count: network.data.collaborator_count ?? 0,
          degree_percentile: network.data.degree_percentile ?? 0,
          eigenvector_percentile: network.data.eigenvector_percentile ?? 0,
          betweenness_percentile: network.data.betweenness_percentile ?? 0,
        }
      : null,
    industry: pharma.data
      ? {
          percentile: Number(pharma.data.percentile_rank),
          total_payments_3yr: Number(pharma.data.total_payments_3yr ?? 0),
          distinct_companies_3yr: pharma.data.distinct_companies_3yr ?? 0,
          distinct_drugs_3yr: pharma.data.distinct_drugs_3yr ?? 0,
          payment_count_3yr: pharma.data.payment_count_3yr ?? 0,
        }
      : null,
    top_collaborators: topCollaborators,
  };

  console.log("[getEstablishedScoreBreakdown] returning:", result);
  return result;
}

export async function getCommunityScoreBreakdown(
  hcpId: string,
  taSlug: string,
): Promise<CommunityScoreBreakdown | null> {
  if (!hcpId || !taSlug) return null;

  const { data: taRow } = await supabase
    .from("therapeutic_areas")
    .select("id")
    .eq("slug", taSlug)
    .single();

  if (!taRow?.id) return null;
  const taId = taRow.id;

  const [ranksRow, opRow, medRow, drugCountResp] = await Promise.all([
    supabase
      .from("hcp_community_ranks_v2")
      .select("composite_score, rank")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_id", taId)
      .eq("scope_type", "global")
      .maybeSingle(),
    supabase
      .from("hcp_open_payments_summary_v2")
      .select("total_payments_lifetime, distinct_companies_lifetime")
      .eq("hcp_id", hcpId)
      .maybeSingle(),
    supabase
      .from("hcp_medicare_summary_v2")
      .select("total_beneficiaries_3yr")
      .eq("hcp_id", hcpId)
      .maybeSingle(),
    supabase
      .from("hcp_open_payments_by_drug_v2")
      .select("drug_name", { count: "exact", head: true })
      .eq("hcp_id", hcpId)
      .not("drug_name", "is", null),
  ]);

  if (!ranksRow.data) return null;

  return {
    hcp_id: hcpId,
    composite_score: Number(ranksRow.data.composite_score ?? 0),
    rank: ranksRow.data.rank != null ? Number(ranksRow.data.rank) : null,
    patient_volume_3yr: medRow.data?.total_beneficiaries_3yr ?? null,
    lifetime_payments:
      opRow.data?.total_payments_lifetime != null
        ? Number(opRow.data.total_payments_lifetime)
        : null,
    distinct_companies: opRow.data?.distinct_companies_lifetime ?? null,
    distinct_drugs: drugCountResp.count ?? null,
  };
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
  "9e4139d2-e062-4a58-8728-cdabb2d7dca1": "Atopic Dermatitis",
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
      institution_normalized,
      cohort_classification,
      cohort_score,
      hcp_therapeutic_areas_v2 (
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

    const { ids: therapeuticAreaIds } = parseTherapeuticAreaLinks(row.hcp_therapeutic_areas_v2);

    if (!byHcpId.has(id)) {
      byHcpId.set(id, {
        id,
        firstName: String(row.first_name ?? ""),
        lastName: String(row.last_name ?? ""),
        institution: row.institution_normalized != null ? String(row.institution_normalized) : null,
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

export interface PublicationTimelinePoint {
  year: number;
  pubCount: number;
  avgCitations: number;
}

export async function getPublicationTimeline(
  hcpId: string,
): Promise<PublicationTimelinePoint[]> {
  if (!hcpId) return [];
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 9;
  const { data, error } = await supabase
    .from("publication_authors_v2")
    .select(
      `
      publication_id,
      publications_v2!inner (
        pub_year,
        citation_count
      )
      `,
    )
    .eq("hcp_id", hcpId)
    .gte("publications_v2.pub_year", startYear)
    .lte("publications_v2.pub_year", currentYear);
  if (error || !data) return [];
  const byYear = new Map<number, { count: number; citationSum: number; citationN: number }>();
  for (let y = startYear; y <= currentYear; y++) {
    byYear.set(y, { count: 0, citationSum: 0, citationN: 0 });
  }
  for (const row of data as unknown as Array<{
    publications_v2: { pub_year: number | null; citation_count: number | null } | null;
  }>) {
    const pub = row.publications_v2;
    if (!pub || pub.pub_year == null) continue;
    const bucket = byYear.get(pub.pub_year);
    if (!bucket) continue;
    bucket.count += 1;
    if (pub.citation_count != null) {
      bucket.citationSum += pub.citation_count;
      bucket.citationN += 1;
    }
  }
  const result: PublicationTimelinePoint[] = [];
  for (let y = startYear; y <= currentYear; y++) {
    const bucket = byYear.get(y)!;
    result.push({
      year: y,
      pubCount: bucket.count,
      avgCitations: bucket.citationN > 0 ? bucket.citationSum / bucket.citationN : 0,
    });
  }
  return result;
}

export interface BibliographyPaper {
  id: string;
  pmid: string | null;
  title: string;
  journal: string | null;
  citations: number | null;
  isFirstAuthor: boolean;
  coAuthors: string;
}

interface PubmedAuthorshipEntry {
  position?: number | null;
  fore_name?: string | null;
  last_name?: string | null;
  initials?: string | null;
}

function formatCoAuthors(
  pubmedAuthorships: unknown,
  currentHcpAuthorPosition: number | null,
): string {
  if (!Array.isArray(pubmedAuthorships)) return "";
  const others: string[] = [];
  for (const entry of pubmedAuthorships as PubmedAuthorshipEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    if (
      currentHcpAuthorPosition != null &&
      entry.position === currentHcpAuthorPosition
    ) {
      continue;
    }
    const last = (entry.last_name ?? "").trim();
    const initials = (entry.initials ?? "").trim();
    if (!last) continue;
    others.push(initials ? `${last} ${initials}` : last);
  }
  if (others.length === 0) return "";
  const shown = others.slice(0, 3).join(", ");
  const remaining = others.length - 3;
  return remaining > 0 ? `${shown}, + ${remaining} more` : shown;
}

export async function getPublicationsByYearForHcp(
  hcpId: string,
  year: number,
): Promise<BibliographyPaper[]> {
  if (!hcpId || !Number.isFinite(year)) return [];
  const { data, error } = await supabase
    .from("publication_authors_v2")
    .select(
      `
      author_position,
      is_first_author,
      publications_v2!inner (
        id,
        pubmed_id,
        title,
        journal,
        citation_count,
        pub_year,
        pubmed_authorships
      )
      `,
    )
    .eq("hcp_id", hcpId)
    .eq("publications_v2.pub_year", year);
  if (error || !data) return [];
  const rows = data as unknown as Array<{
    author_position: number | null;
    is_first_author: boolean | null;
    publications_v2: {
      id: string;
      pubmed_id: string | null;
      title: string | null;
      journal: string | null;
      citation_count: number | null;
      pub_year: number | null;
      pubmed_authorships: unknown;
    } | null;
  }>;
  const papers: BibliographyPaper[] = [];
  for (const row of rows) {
    const pub = row.publications_v2;
    if (!pub || !pub.id) continue;
    papers.push({
      id: pub.id,
      pmid: pub.pubmed_id,
      title: pub.title ?? "(Untitled)",
      journal: pub.journal,
      citations: pub.citation_count,
      isFirstAuthor: row.is_first_author === true,
      coAuthors: formatCoAuthors(pub.pubmed_authorships, row.author_position),
    });
  }
  papers.sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0));
  return papers;
}

export type CompanyStatus = "active" | "dormant" | "lapsed";

export interface TopCompanyEntry {
  manufacturer_name: string;
  manufacturer_clean: string;
  total_amount_usd: number;
  payment_count: number;
  most_recent_payment_date: string | null;
  status: CompanyStatus;
  rank_by_amount: number;
}

function cleanManufacturerName(raw: string): string {
  if (!raw) return "";
  let name = raw.trim();
  name = name.replace(/,?\s+INC\.?$/i, "");
  name = name.replace(/,?\s+LLC\.?$/i, "");
  name = name.replace(/,?\s+LP\.?$/i, "");
  name = name.replace(/\s+PHARMACEUTICALS$/i, "");
  name = name.replace(/\s+PHARMACEUTICALS,?$/i, "");
  const lower = name.toLowerCase();
  const titled = lower.replace(/\b([a-z])([a-z]*)/g, (_m, first, rest) => first.toUpperCase() + rest);
  return titled.trim();
}

function computeCompanyStatus(mostRecentDate: string | null): CompanyStatus {
  if (!mostRecentDate) return "lapsed";
  const parsed = new Date(mostRecentDate);
  if (Number.isNaN(parsed.getTime())) return "lapsed";
  const now = new Date();
  const monthsAgo =
    (now.getFullYear() - parsed.getFullYear()) * 12 + (now.getMonth() - parsed.getMonth());
  if (monthsAgo <= 24) return "active";
  if (monthsAgo <= 48) return "dormant";
  return "lapsed";
}

export async function getTopCompaniesForHcp(hcpId: string): Promise<TopCompanyEntry[]> {
  if (!hcpId) return [];
  const { data, error } = await supabase
    .from("hcp_open_payments_top_companies_v2")
    .select(
      `
      manufacturer_name,
      total_amount_usd,
      payment_count,
      most_recent_payment_date,
      rank_by_amount
    `,
    )
    .eq("hcp_id", hcpId)
    .order("rank_by_amount", { ascending: true })
    .limit(5);
  if (error || !data) return [];
  return (
    data as Array<{
      manufacturer_name: string | null;
      total_amount_usd: number | null;
      payment_count: number | null;
      most_recent_payment_date: string | null;
      rank_by_amount: number | null;
    }>
  )
    .filter((row) => row.manufacturer_name != null)
    .map((row) => ({
      manufacturer_name: row.manufacturer_name as string,
      manufacturer_clean: cleanManufacturerName(row.manufacturer_name as string),
      total_amount_usd: Number(row.total_amount_usd ?? 0),
      payment_count: Number(row.payment_count ?? 0),
      most_recent_payment_date: row.most_recent_payment_date,
      status: computeCompanyStatus(row.most_recent_payment_date),
      rank_by_amount: Number(row.rank_by_amount ?? 0),
    }));
}

export type TrendCategory = "growing" | "stable" | "declining";

export interface DrugConstellationPoint {
  drug_name: string;
  manufacturer_name: string;
  manufacturer_clean: string;
  total_amount_usd: number;
  payment_count: number;
  most_recent_payment_date: string;
  year_over_year_trend_pct: number | null;
  trend_category: TrendCategory;
  payments_by_quarter?: Record<string, number> | null;
}

function computeTrendCategory(yoyPct: number | null): TrendCategory {
  if (yoyPct == null) return "stable";
  if (yoyPct > 5) return "growing";
  if (yoyPct >= -5) return "stable";
  return "declining";
}

export async function getTopDrugsForHcp(hcpId: string): Promise<DrugConstellationPoint[]> {
  if (!hcpId) return [];
  const { data, error } = await supabase
    .from("hcp_open_payments_by_drug_v2")
    .select(
      `
      drug_name,
      manufacturer_name,
      total_amount_usd,
      payment_count,
      most_recent_payment_date,
      year_over_year_trend_pct,
      payments_by_quarter
    `,
    )
    .eq("hcp_id", hcpId)
    .order("total_amount_usd", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return (
    data as Array<{
      drug_name: string | null;
      manufacturer_name: string | null;
      total_amount_usd: number | null;
      payment_count: number | null;
      most_recent_payment_date: string | null;
      year_over_year_trend_pct: number | null;
      payments_by_quarter: Record<string, number> | null;
    }>
  )
    .filter(
      (row) =>
        row.drug_name != null &&
        row.most_recent_payment_date != null &&
        row.total_amount_usd != null,
    )
    .map((row) => ({
      drug_name: row.drug_name as string,
      manufacturer_name: row.manufacturer_name as string,
      manufacturer_clean: cleanManufacturerName(row.manufacturer_name as string),
      total_amount_usd: Number(row.total_amount_usd),
      payment_count: Number(row.payment_count ?? 0),
      most_recent_payment_date: row.most_recent_payment_date as string,
      year_over_year_trend_pct: row.year_over_year_trend_pct,
      trend_category: computeTrendCategory(row.year_over_year_trend_pct),
      payments_by_quarter: row.payments_by_quarter ?? null,
    }));
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

export interface RisingVoiceRow {
  handle: string;
  display_name: string | null;
  follower_count: number;
  post_count: number;
  total_engagement: number;
  engagement_per_follower: number | null;
  bio: string | null;
  platform: string | null;
  hcp_matched: boolean;
}

export async function getRisingVoices(
  taSlug: string
): Promise<{ data: RisingVoiceRow[] | null; error: any }> {
  // Map UI-friendly TA names to the slug used in the materialized view.
  const slugMap: Record<string, string> = {
    Oncology: "oncology",
    Hepatology: "hepatology",
    "Rare Disease": "rare-disease",
  };
  const mvSlug = slugMap[taSlug] ?? taSlug.toLowerCase();

  const { data, error } = await supabase
    .from("mv_social_voice_emergence_by_ta")
    .select(
      "handle, display_name, follower_count, post_count, total_engagement, engagement_per_follower, bio, platform, hcp_matched"
    )
    .eq("ta_slug", mvSlug)
    .not("engagement_per_follower", "is", null)
    .gte("post_count", 4)
    .gte("follower_count", 100)
    .gte("total_engagement", 20)
    .order("engagement_per_follower", { ascending: false })
    .limit(200);

  if (error) {
    return { data: null, error };
  }
  return { data: data as RisingVoiceRow[], error: null };
}

export interface ShareOfVoiceRow {
  handle: string;
  display_name: string | null;
  total_engagement: number;
  engagement_pct: number;
  rank_within_ta: number;
}

export interface HotTopicRow {
  hashtag: string;
  post_count: number;
  total_engagement: number;
  engagement_pct: number;
  rank_within_ta: number;
}

export interface TrendingTopicRow {
  hashtag: string;
  current_engagement: number;
  prior_engagement: number;
  trend: "new" | "gone" | "rising" | "falling" | "flat";
  pct_change: number | null;
}

export interface SocialAnalyticsBundle {
  shareOfVoice: ShareOfVoiceRow[];
  hotTopics: HotTopicRow[];
  trending: TrendingTopicRow[];
}

export async function getSocialAnalytics(
  taSlug: string
): Promise<{ data: SocialAnalyticsBundle | null; error: any }> {
  const slugMap: Record<string, string> = {
    Oncology: "oncology",
    Hepatology: "hepatology",
    "Rare Disease": "rare-disease",
  };
  const mvSlug = slugMap[taSlug] ?? taSlug.toLowerCase();

  const [sovResult, topicsResult, trendingResult] = await Promise.all([
    supabase
      .from("mv_social_share_of_voice_by_ta")
      .select("handle, display_name, total_engagement, engagement_pct, rank_within_ta")
      .eq("ta_slug", mvSlug)
      .order("rank_within_ta", { ascending: true })
      .limit(50),
    supabase
      .from("mv_social_hot_topics_by_ta")
      .select("hashtag, post_count, total_engagement, engagement_pct, rank_within_ta")
      .eq("ta_slug", mvSlug)
      .order("rank_within_ta", { ascending: true })
      .limit(6),
    supabase
      .from("mv_social_trending_topics_by_ta")
      .select("hashtag, current_engagement, prior_engagement, trend, pct_change")
      .eq("ta_slug", mvSlug)
      .gte("prior_engagement", 50)
      .order("current_engagement", { ascending: false })
      .limit(6),
  ]);

  if (sovResult.error || topicsResult.error || trendingResult.error) {
    return {
      data: null,
      error: sovResult.error || topicsResult.error || trendingResult.error,
    };
  }

  return {
    data: {
      shareOfVoice: (sovResult.data as ShareOfVoiceRow[]) || [],
      hotTopics: (topicsResult.data as HotTopicRow[]) || [],
      trending: (trendingResult.data as TrendingTopicRow[]) || [],
    },
    error: null,
  };
}

export type SocialCandidateRow = SocialCandidate;

function deriveConfidenceTier(bio: string | null): SocialConfidenceTier {
  if (!bio) return "unverified";
  const b = bio.toLowerCase();

  // Strong HCP signals: clinical credentials + role
  const strongPatterns = [
    /\bm\.?d\.?\b/,
    /\bph\.?d\.?\b/,
    /\bd\.?o\.?\b/,
    /\bpharm\.?d\.?\b/,
    /\boncologist\b/,
    /\bhepatologist\b/,
    /\bcardiologist\b/,
    /\bpathologist\b/,
    /\bsurgeon\b/,
    /\bradiologist\b/,
    /\bnephrologist\b/,
    /\bgastroenterologist\b/,
    /\bendocrinologist\b/,
    /\bprofessor\b/,
    /\bfellow\b/,
    /\battending\b/,
    /\bphysician\b/,
    /\bchief\b.*\b(oncology|medicine|cancer|surgery|cardiology)\b/,
  ];
  if (strongPatterns.some((p) => p.test(b))) return "likely_hcp";

  // Weak HCP signals: clinical/research context without explicit credential
  const weakPatterns = [
    /\boncology\b/,
    /\bcancer\b/,
    /\bresearch\b/,
    /\bclinical\b/,
    /\bhepatology\b/,
    /\bliver\b/,
    /\bhematology\b/,
    /\bmedicine\b/,
    /\bhospital\b/,
    /\buniversity\b/,
    /\bcenter\b.*\b(cancer|medical)\b/,
  ];
  if (weakPatterns.some((p) => p.test(b))) return "possibly_hcp";

  return "unverified";
}

const TA_TO_DISCOVERY_SOURCE: Record<string, string[]> = {
  oncology: ["asco_2026", "esmo_2026", "eha_2026"],
  hepatology: ["easl_2026", "aasld_2026"],
  "rare-disease": [],
};

const REPLY_SOURCE_LABELS: Record<string, string> = {
  asco_2026: "ASCO 2026 · reply",
  esmo_2026: "ESMO 2026 · reply",
  easl_2026: "EASL 2026 · reply",
  aasld_2026: "AASLD 2026 · reply",
  eha_2026: "EHA 2026 · reply",
};

function formatReplySourceLabel(discoverySource: string): string {
  const key = discoverySource.toLowerCase().trim();
  if (REPLY_SOURCE_LABELS[key]) {
    return REPLY_SOURCE_LABELS[key];
  }
  return `${discoverySource.replace(/_/g, " ").toUpperCase()} · reply`;
}

function buildReplyNarrative(row: {
  handle: string;
  displayName: string | null;
  followerCount: number;
  sourceLabel: string;
  confidenceTier: string;
}): string {
  const name = row.displayName || row.handle;
  const followers = row.followerCount.toLocaleString();
  let bioFraming = " Bio is sparse or non-clinical — verify before engaging.";
  if (row.confidenceTier === "likely_hcp") {
    bioFraming = " Bio shows clinical credentials.";
  } else if (row.confidenceTier === "possibly_hcp") {
    bioFraming = " Bio shows clinical context but no explicit credential.";
  }
  return `${name} was surfaced through ${row.sourceLabel}. Follower count: ${followers}.${bioFraming}`;
}

function buildNarrative(row: {
  handle: string;
  displayName: string | null;
  postsLast90Days: number;
  engagementCount: number;
  followerCount: number;
  sourceHashtag: string;
  sourceLabel: string;
  discoveryMethod: "hashtag" | "reply";
  discoverySource: string | null;
  confidenceTier: string;
}): string {
  if (row.discoveryMethod === "reply") {
    return buildReplyNarrative({
      handle: row.handle,
      displayName: row.displayName,
      followerCount: row.followerCount,
      sourceLabel: row.sourceLabel,
      confidenceTier: row.confidenceTier,
    });
  }

  const engagementRate = row.followerCount > 0 ? row.engagementCount / row.followerCount : 0;
  const name = row.displayName || row.handle;

  const parts: string[] = [];

  // Lead with posting cadence
  if (row.postsLast90Days >= 20) {
    parts.push(`${name} posts at a high cadence (${row.postsLast90Days} posts in 90 days)`);
  } else if (row.postsLast90Days >= 5) {
    parts.push(`${name} posts at a measured cadence (${row.postsLast90Days} posts in 90 days)`);
  } else {
    parts.push(`${name} has limited recent posting volume (${row.postsLast90Days} posts in 90 days)`);
  }

  // Engagement context
  if (engagementRate >= 0.05) {
    parts.push("with notably high engagement-per-follower, suggesting an actively engaged audience");
  } else if (engagementRate >= 0.02) {
    parts.push("with healthy engagement relative to follower count");
  } else {
    parts.push("with modest engagement relative to follower count");
  }

  // Source signal
  parts.push(`. Captured via ${row.sourceHashtag}.`);

  // Confidence framing
  if (row.confidenceTier === "likely_hcp") {
    parts.push(" Bio shows clinical credentials.");
  } else if (row.confidenceTier === "possibly_hcp") {
    parts.push(" Bio shows clinical context but no explicit credential.");
  } else {
    parts.push(" Bio is sparse or non-clinical — verify before engaging.");
  }

  return parts.join(" ").replace(/ \./g, ".");
}

export async function getSocialCandidates(
  taSlug: string
): Promise<{ data: SocialCandidateRow[] | null; error: any }> {
  const slugMap: Record<string, string> = {
    Oncology: "oncology",
    Hepatology: "hepatology",
    "Rare Disease": "rare-disease",
  };
  const mvSlug = slugMap[taSlug] ?? taSlug.toLowerCase();

  // Step 1: Get social_users who have posts in this TA via the voice emergence view
  // (uses the same filter we use for the chart: >=100 followers, >=20 engagement, >=4 posts)
  const { data: voiceData, error: voiceErr } = await supabase
    .from("mv_social_voice_emergence_by_ta")
    .select("handle, display_name, follower_count, post_count, total_engagement, engagement_per_follower, bio, platform, dominant_source_hashtag")
    .eq("ta_slug", mvSlug)
    .not("engagement_per_follower", "is", null)
    .gte("follower_count", 100)
    .gte("total_engagement", 20)
    .gte("post_count", 4)
    .order("total_engagement", { ascending: false })
    .limit(50);

  if (voiceErr) {
    return { data: null, error: voiceErr };
  }

  // Step 3: Build SocialCandidateRow objects
  const candidates: SocialCandidateRow[] = (voiceData || []).map((v: any) => {
    const handle: string = v.handle;
    const bio: string = v.bio || "";
    const confidenceTier = deriveConfidenceTier(bio);
    const sourceHashtag = v.dominant_source_hashtag || "—";
    const followerCount: number = v.follower_count || 0;
    const totalEngagement: number = v.total_engagement || 0;
    const postCount: number = v.post_count || 0;
    const engagementRate = followerCount > 0 ? totalEngagement / followerCount : 0;
    const platform = (v.platform === "bluesky" ? "bluesky" : "twitter") as "twitter" | "bluesky";

    const displayName: string = v.display_name || handle;

    const narrative = buildNarrative({
      handle,
      displayName: v.display_name,
      postsLast90Days: postCount,
      engagementCount: totalEngagement,
      followerCount,
      sourceHashtag,
      sourceLabel: sourceHashtag,
      discoveryMethod: "hashtag",
      discoverySource: null,
      confidenceTier,
    });

    return {
      id: `soc_${handle}`,
      handle,
      displayName,
      affiliation: "—",
      specialty: "—",
      bio,
      confidenceTier,
      platform,
      followerCount,
      postsLast90Days: postCount,
      sourceHashtag,
      sourceLabel: sourceHashtag,
      discoveryMethod: "hashtag" as const,
      discoverySource: null,
      engagementCount: totalEngagement,
      engagementRate,
      narrative,
    };
  });

  return { data: candidates, error: null };
}

export interface LandscapePoint {
  hcp_id: string;
  name: string;
  institution: string | null;
  us_rank: number;
  rising_star_percentile: number;
  momentum_composite: number;
  visibility_composite: number;
  momentum_display: number;
  visibility_display: number;
  archetype:
    | "Balanced Rising Star"
    | "Scientific Accelerator"
    | "Network Accelerator"
    | "Emerging Leader"
    | null;
}

export interface LeaderboardEntry {
  hcp_id: string;
  name: string;
  institution: string | null;
  rank: number;
  primary_value: number;
  primary_label: string;
}

export interface LandscapeLeaderboards {
  top_rising_stars: LeaderboardEntry[];
  fastest_scientific_momentum: LeaderboardEntry[];
  fastest_network_momentum: LeaderboardEntry[];
  most_balanced: LeaderboardEntry[];
  momentum_forward: LeaderboardEntry[];
}

function landscapeTaSlugToName(taSlug: string): string {
  const map: Record<string, string> = {
    nsclc: "NSCLC",
    oncology: "Oncology",
    hepatology: "Hepatology",
    immunology: "Immunology",
    "rare-disease": "Rare Disease",
  };
  return map[taSlug.toLowerCase().trim()] ?? taSlug.toUpperCase();
}

async function resolveLandscapeTaId(taSlug: string): Promise<string | null> {
  const mapped = TA_ID_MAP[taSlug.toLowerCase().trim()];
  if (mapped) return mapped;

  const { data: taRow } = await supabase
    .from("therapeutic_areas")
    .select("id")
    .eq("name", landscapeTaSlugToName(taSlug))
    .maybeSingle();

  return taRow?.id ?? null;
}

type HcpNameRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  institution_normalized: string | null;
};

async function fetchHcpNameMap(hcpIds: string[]): Promise<Map<string, { name: string; institution: string | null }>> {
  const hcpMap = new Map<string, { name: string; institution: string | null }>();
  if (hcpIds.length === 0) return hcpMap;

  const { data: hcps } = await supabase
    .from("hcps_v2")
    .select("id, first_name, last_name, institution_normalized")
    .in("id", hcpIds);

  (hcps ?? []).forEach((h: HcpNameRow) => {
    hcpMap.set(String(h.id), {
      name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown",
      institution: h.institution_normalized,
    });
  });

  return hcpMap;
}

function rescaleToPercentile(
  points: LandscapePoint[],
  field: "momentum_composite" | "visibility_composite",
): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [50];

  const sorted = [...points]
    .map((p, i) => ({ idx: i, val: p[field] }))
    .sort((a, b) => a.val - b.val);
  const result = new Array<number>(points.length);
  sorted.forEach((entry, sortedIdx) => {
    result[entry.idx] = (sortedIdx / (sorted.length - 1)) * 100;
  });
  return result;
}

function toLandscapeArchetype(
  value: unknown,
): LandscapePoint["archetype"] {
  const archetype = String(value ?? "");
  if (archetype === "Balanced Rising Star") return "Balanced Rising Star";
  if (archetype === "Scientific Accelerator") return "Scientific Accelerator";
  if (archetype === "Network Accelerator") return "Network Accelerator";
  if (archetype === "Emerging Leader") return "Emerging Leader";
  return null;
}

export async function getLandscapePoints(
  taSlug: string,
  limit: number = 100,
): Promise<LandscapePoint[]> {
  const taId = await resolveLandscapeTaId(taSlug);
  if (!taId) return [];

  const { data, error } = await supabase
    .from("hcp_rising_star_ranks_v3")
    .select(
      "hcp_id, us_rank, rising_star_percentile, " +
        "scientific_momentum_percentile, network_momentum_percentile, " +
        "scientific_visibility_percentile, network_visibility_percentile, archetype",
    )
    .eq("therapeutic_area_id", taId)
    .not("us_rank", "is", null)
    .order("us_rank", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  const rows = data as unknown as Array<Record<string, unknown>>;
  const hcpIds = rows.map((r) => String(r.hcp_id));
  const hcpMap = await fetchHcpNameMap(hcpIds);

  const points: LandscapePoint[] = rows.map((r) => {
    const hcpId = String(r.hcp_id);
    const sciMom = Number(r.scientific_momentum_percentile ?? 0);
    const netMom = Number(r.network_momentum_percentile ?? 0);
    const sciVis = Number(r.scientific_visibility_percentile ?? 0);
    const netVis = Number(r.network_visibility_percentile ?? 0);

    return {
      hcp_id: hcpId,
      name: hcpMap.get(hcpId)?.name ?? "Unknown",
      institution: hcpMap.get(hcpId)?.institution ?? null,
      us_rank: Number(r.us_rank),
      rising_star_percentile: Number(r.rising_star_percentile ?? 0),
      momentum_composite: (sciMom + netMom) / 2,
      visibility_composite: (sciVis + netVis) / 2,
      momentum_display: 0,
      visibility_display: 0,
      archetype: toLandscapeArchetype(r.archetype),
    };
  });

  const momentumDisplay = rescaleToPercentile(points, "momentum_composite");
  const visibilityDisplay = rescaleToPercentile(points, "visibility_composite");

  points.forEach((p, i) => {
    p.momentum_display = momentumDisplay[i];
    p.visibility_display = visibilityDisplay[i];
  });

  return points;
}

function buildLeaderboardEntries(
  rows: Array<Record<string, unknown>>,
  hcpMap: Map<string, { name: string; institution: string | null }>,
  options: {
    rankKey: string;
    valueKey: string;
    labelFn: (row: Record<string, unknown>) => string;
  },
): LeaderboardEntry[] {
  return rows.map((row) => {
    const hcpId = String(row.hcp_id);
    return {
      hcp_id: hcpId,
      name: hcpMap.get(hcpId)?.name ?? "Unknown",
      institution: hcpMap.get(hcpId)?.institution ?? null,
      rank: Number(row[options.rankKey] ?? 0),
      primary_value: Number(row[options.valueKey] ?? 0),
      primary_label: options.labelFn(row),
    };
  });
}

export async function getLandscapeLeaderboards(
  taSlug: string,
  limit: number = 5,
): Promise<LandscapeLeaderboards> {
  const empty: LandscapeLeaderboards = {
    top_rising_stars: [],
    fastest_scientific_momentum: [],
    fastest_network_momentum: [],
    most_balanced: [],
    momentum_forward: [],
  };

  const taId = await resolveLandscapeTaId(taSlug);
  if (!taId) return empty;

  const [
    risingStarsResult,
    sciMomResult,
    netMomResult,
    balancedResult,
    momForwardResult,
  ] = await Promise.all([
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, us_rank, rising_star_percentile")
      .eq("therapeutic_area_id", taId)
      .not("us_rank", "is", null)
      .order("us_rank", { ascending: true })
      .limit(limit),
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, us_rank, scientific_momentum_percentile")
      .eq("therapeutic_area_id", taId)
      .not("us_rank", "is", null)
      .order("scientific_momentum_percentile", { ascending: false })
      .limit(limit),
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, us_rank, network_momentum_percentile")
      .eq("therapeutic_area_id", taId)
      .not("us_rank", "is", null)
      .order("network_momentum_percentile", { ascending: false })
      .limit(limit),
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select(
        "hcp_id, us_rank, rising_star_percentile, scientific_momentum_percentile, network_momentum_percentile",
      )
      .eq("therapeutic_area_id", taId)
      .not("us_rank", "is", null)
      .limit(100),
    supabase
      .from("hcp_rising_star_ranks_v3")
      .select(
        "hcp_id, us_rank, rising_star_percentile, " +
          "scientific_momentum_percentile, network_momentum_percentile, " +
          "scientific_visibility_percentile, network_visibility_percentile",
      )
      .eq("therapeutic_area_id", taId)
      .not("us_rank", "is", null)
      .limit(200),
  ]);

  const momForwardFiltered = ((momForwardResult.data ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => {
      const mom =
        (Number(r.scientific_momentum_percentile ?? 0) +
          Number(r.network_momentum_percentile ?? 0)) /
        2;
      const vis =
        (Number(r.scientific_visibility_percentile ?? 0) +
          Number(r.network_visibility_percentile ?? 0)) /
        2;
      return { row: r, momentum: mom, visibility: vis };
    })
    .filter((x) => x.momentum >= 85 && x.visibility >= 50 && x.visibility <= 80)
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, limit);

  const balancedRows = [
    ...((balancedResult.data ?? []) as unknown as Array<Record<string, unknown>>),
  ]
    .sort((a, b) => {
      const deltaA = Math.abs(
        Number(a.scientific_momentum_percentile ?? 0) - Number(a.network_momentum_percentile ?? 0),
      );
      const deltaB = Math.abs(
        Number(b.scientific_momentum_percentile ?? 0) - Number(b.network_momentum_percentile ?? 0),
      );
      if (deltaA !== deltaB) return deltaA - deltaB;
      return Number(b.rising_star_percentile ?? 0) - Number(a.rising_star_percentile ?? 0);
    })
    .slice(0, limit);

  const allIds = new Set<string>();
  for (const row of [
    ...(risingStarsResult.data ?? []),
    ...(sciMomResult.data ?? []),
    ...(netMomResult.data ?? []),
    ...balancedRows,
    ...momForwardFiltered.map((x) => x.row),
  ]) {
    allIds.add(String(row.hcp_id));
  }

  const hcpMap = await fetchHcpNameMap([...allIds]);

  return {
    top_rising_stars: buildLeaderboardEntries(risingStarsResult.data ?? [], hcpMap, {
      rankKey: "us_rank",
      valueKey: "rising_star_percentile",
      labelFn: (row) => String(Math.round(Number(row.rising_star_percentile ?? 0))),
    }),
    fastest_scientific_momentum: buildLeaderboardEntries(sciMomResult.data ?? [], hcpMap, {
      rankKey: "us_rank",
      valueKey: "scientific_momentum_percentile",
      labelFn: (row) => String(Math.round(Number(row.scientific_momentum_percentile ?? 0))),
    }),
    fastest_network_momentum: buildLeaderboardEntries(netMomResult.data ?? [], hcpMap, {
      rankKey: "us_rank",
      valueKey: "network_momentum_percentile",
      labelFn: (row) => String(Math.round(Number(row.network_momentum_percentile ?? 0))),
    }),
    most_balanced: balancedRows.map((row) => {
      const hcpId = String(row.hcp_id);
      return {
        hcp_id: hcpId,
        name: hcpMap.get(hcpId)?.name ?? "Unknown",
        institution: hcpMap.get(hcpId)?.institution ?? null,
        rank: Number(row.us_rank ?? 0),
        primary_value: Number(row.rising_star_percentile ?? 0),
        primary_label: String(Math.round(Number(row.rising_star_percentile ?? 0))),
      };
    }),
    momentum_forward: momForwardFiltered.map((entry) => {
      const row = entry.row;
      const hcpId = String(row.hcp_id);
      return {
        hcp_id: hcpId,
        name: hcpMap.get(hcpId)?.name ?? "Unknown",
        institution: hcpMap.get(hcpId)?.institution ?? null,
        rank: Number(row.us_rank ?? 0),
        primary_value: Number(row.rising_star_percentile ?? 0),
        primary_label: String(Math.round(Number(row.rising_star_percentile ?? 0))),
      };
    }),
  };
}

export interface InstitutionSummary {
  institution_name: string;
  slug: string;
  total_investigators: number;
  rising_star_count: number;
  established_count: number;
  rising_star_pipeline: {
    elite: number;
    strong: number;
    developing: number;
    early: number;
  };
  top_investigator: {
    hcp_id: string;
    name: string;
    cohort: "rising_star" | "established";
    rank: number;
    score: number;
  } | null;
}

export interface InstitutionLeaderboardEntry {
  hcp_id: string;
  name: string;
  rank: number;
  primary_value: number;
  primary_label: string;
}

export interface InstitutionLeaderboards {
  top_rising_stars: InstitutionLeaderboardEntry[];
  top_established: InstitutionLeaderboardEntry[];
  most_connected: InstitutionLeaderboardEntry[];
  highest_network_momentum: InstitutionLeaderboardEntry[];
}

export interface InstitutionCollaboration {
  hcp1_id: string;
  hcp1_name: string;
  hcp2_id: string;
  hcp2_name: string;
  shared_publications: number;
}

export interface ExternalPartnerInstitution {
  institution_name: string;
  slug: string;
  total_shared_publications: number;
  source_investigators_count: number;
  partner_investigators_count: number;
  top_connection: {
    source_hcp_id: string;
    source_name: string;
    partner_hcp_id: string;
    partner_name: string;
    shared_publications: number;
  } | null;
}

type InstitutionHcpRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

const INSTITUTION_HCP_CHUNK_SIZE = 100;

function chunkInstitutionHcpIds(hcpIds: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < hcpIds.length; i += INSTITUTION_HCP_CHUNK_SIZE) {
    chunks.push(hcpIds.slice(i, i + INSTITUTION_HCP_CHUNK_SIZE));
  }
  return chunks;
}

async function fetchInstitutionRowsInChunks<T>(
  hcpIds: string[],
  fetchChunk: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (hcpIds.length <= INSTITUTION_HCP_CHUNK_SIZE) {
    return fetchChunk(hcpIds);
  }

  const allRows: T[] = [];
  for (const chunk of chunkInstitutionHcpIds(hcpIds)) {
    const rows = await fetchChunk(chunk);
    allRows.push(...rows);
  }
  return allRows;
}

function buildInstitutionLeaderboardEntries(
  rows: Array<Record<string, unknown>>,
  nameMap: Map<string, string>,
  options: {
    rankKey: string;
    valueKey: string;
    labelFn: (row: Record<string, unknown>) => string;
    fallbackRank?: (index: number) => number;
  },
): InstitutionLeaderboardEntry[] {
  return rows.map((row, index) => {
    const hcpId = String(row.hcp_id);
    return {
      hcp_id: hcpId,
      name: nameMap.get(hcpId) ?? "Unknown",
      rank: row[options.rankKey] != null
        ? Number(row[options.rankKey])
        : (options.fallbackRank?.(index) ?? index + 1),
      primary_value: Number(row[options.valueKey] ?? 0),
      primary_label: options.labelFn(row),
    };
  });
}

export async function getInstitutionSummary(
  institutionName: string,
  taSlug: string = "nsclc",
): Promise<InstitutionSummary | null> {
  const taId = await resolveLandscapeTaId(taSlug);
  if (!taId) return null;

  const { data: hcps } = await fetchAllPaginated<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    country: string | null;
  }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcps_v2")
        .select("id, first_name, last_name, country")
        .eq("institution_canonical", institutionName)
        .range(offset, offset + pageSize - 1),
  );
  if (!hcps) return null;

  const hcpIds = (hcps as InstitutionHcpRow[]).map((h) => String(h.id));
  if (hcpIds.length === 0) {
    return {
      institution_name: institutionName,
      slug: institutionToSlug(institutionName),
      total_investigators: 0,
      rising_star_count: 0,
      established_count: 0,
      rising_star_pipeline: {
        elite: 0,
        strong: 0,
        developing: 0,
        early: 0,
      },
      top_investigator: null,
    };
  }

  const [rsRows, estRows] = await Promise.all([
    fetchInstitutionRowsInChunks(
      hcpIds,
      async (chunk) => {
        const { data, error } = await supabase
          .from("hcp_rising_star_ranks_v3")
          .select("hcp_id, us_rank, rising_star_percentile")
          .eq("therapeutic_area_id", taId)
          .in("hcp_id", chunk)
          .not("us_rank", "is", null);
        if (error) {
          console.error("[getInstitutionSummary] rs chunk error:", error);
          return [];
        }
        return data ?? [];
      },
    ),
    fetchInstitutionRowsInChunks(
      hcpIds,
      async (chunk) => {
        const { data, error } = await supabase
          .from("hcp_established_ranks_v3")
          .select("hcp_id, rank, cohort_score")
          .eq("therapeutic_area_id", taId)
          .eq("scope_type", "region")
          .eq("scope_value", "US")
          .in("hcp_id", chunk);
        if (error) {
          console.error("[getInstitutionSummary] est chunk error:", error);
          return [];
        }
        return data ?? [];
      },
    ),
  ]);

  let top_investigator: InstitutionSummary["top_investigator"] = null;
  const topRisingStar = [...(rsRows ?? [])].sort(
    (a, b) => Number(a.us_rank ?? 9999) - Number(b.us_rank ?? 9999),
  )[0];
  const topEstablished = [...(estRows ?? [])].sort(
    (a, b) => Number(a.rank ?? 9999) - Number(b.rank ?? 9999),
  )[0];

  if (topRisingStar) {
    const hcp = (hcps as InstitutionHcpRow[]).find(
      (h) => String(h.id) === String(topRisingStar.hcp_id),
    );
    if (hcp) {
      top_investigator = {
        hcp_id: String(hcp.id),
        name: `${hcp.first_name ?? ""} ${hcp.last_name ?? ""}`.trim(),
        cohort: "rising_star",
        rank: Number(topRisingStar.us_rank),
        score: Math.round(Number(topRisingStar.rising_star_percentile ?? 0)),
      };
    }
  } else if (topEstablished) {
    const hcp = (hcps as InstitutionHcpRow[]).find(
      (h) => String(h.id) === String(topEstablished.hcp_id),
    );
    if (hcp) {
      top_investigator = {
        hcp_id: String(hcp.id),
        name: `${hcp.first_name ?? ""} ${hcp.last_name ?? ""}`.trim(),
        cohort: "established",
        rank: Number(topEstablished.rank),
        score: Math.round(Number(topEstablished.cohort_score ?? 0)),
      };
    }
  }

  const rising_star_pipeline = {
    elite: 0,
    strong: 0,
    developing: 0,
    early: 0,
  };

  (rsRows ?? []).forEach((r) => {
    const pct = Number(r.rising_star_percentile ?? 0);
    if (pct >= 90) rising_star_pipeline.elite++;
    else if (pct >= 80) rising_star_pipeline.strong++;
    else if (pct >= 70) rising_star_pipeline.developing++;
    else rising_star_pipeline.early++;
  });

  return {
    institution_name: institutionName,
    slug: institutionToSlug(institutionName),
    total_investigators: hcpIds.length,
    rising_star_count: (rsRows ?? []).length,
    established_count: (estRows ?? []).length,
    rising_star_pipeline,
    top_investigator,
  };
}

export async function getInstitutionLeaderboards(
  institutionName: string,
  taSlug: string = "nsclc",
  limit: number = 5,
): Promise<InstitutionLeaderboards> {
  const empty: InstitutionLeaderboards = {
    top_rising_stars: [],
    top_established: [],
    most_connected: [],
    highest_network_momentum: [],
  };

  const taId = await resolveLandscapeTaId(taSlug);
  if (!taId) return empty;

  const { data: hcps } = await fetchAllPaginated<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcps_v2")
        .select("id, first_name, last_name")
        .eq("institution_canonical", institutionName)
        .range(offset, offset + pageSize - 1),
  );
  if (!hcps || hcps.length === 0) return empty;

  const hcpIds = (hcps as InstitutionHcpRow[]).map((h) => String(h.id));
  const nameMap = new Map(
    (hcps as InstitutionHcpRow[]).map((h) => [
      String(h.id),
      `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown",
    ]),
  );

  const [
    risingStarsRows,
    establishedRows,
    centralityRows,
    networkMomentumRows,
  ] = await Promise.all([
    fetchInstitutionRowsInChunks(
      hcpIds,
      async (chunk) => {
        const { data, error } = await supabase
          .from("hcp_rising_star_ranks_v3")
          .select("hcp_id, us_rank, rising_star_percentile")
          .eq("therapeutic_area_id", taId)
          .in("hcp_id", chunk)
          .not("us_rank", "is", null);
        if (error) {
          console.error("[getInstitutionLeaderboards] rising stars chunk error:", error);
          return [];
        }
        return data ?? [];
      },
    ),
    fetchInstitutionRowsInChunks(
      hcpIds,
      async (chunk) => {
        const { data, error } = await supabase
          .from("hcp_established_ranks_v3")
          .select("hcp_id, rank, cohort_score")
          .eq("therapeutic_area_id", taId)
          .eq("scope_type", "region")
          .eq("scope_value", "US")
          .in("hcp_id", chunk);
        if (error) {
          console.error("[getInstitutionLeaderboards] established chunk error:", error);
          return [];
        }
        return data ?? [];
      },
    ),
    fetchInstitutionRowsInChunks(
      hcpIds,
      async (chunk) => {
        const { data, error } = await supabase
          .from("hcp_network_centrality_v2")
          .select("hcp_id, degree_percentile, network_influence_score")
          .eq("therapeutic_area_id", taId)
          .eq("window_type", "10yr")
          .in("hcp_id", chunk);
        if (error) {
          console.error("[getInstitutionLeaderboards] centrality chunk error:", error);
          return [];
        }
        return data ?? [];
      },
    ),
    fetchInstitutionRowsInChunks(
      hcpIds,
      async (chunk) => {
        const { data, error } = await supabase
          .from("hcp_rising_star_ranks_v3")
          .select("hcp_id, us_rank, network_momentum_percentile")
          .eq("therapeutic_area_id", taId)
          .in("hcp_id", chunk)
          .not("us_rank", "is", null);
        if (error) {
          console.error("[getInstitutionLeaderboards] network momentum chunk error:", error);
          return [];
        }
        return data ?? [];
      },
    ),
  ]);

  const risingStarsResult = [...risingStarsRows]
    .sort((a, b) => Number(a.us_rank ?? 9999) - Number(b.us_rank ?? 9999))
    .slice(0, limit);
  const establishedResult = [...establishedRows]
    .sort((a, b) => Number(a.rank ?? 9999) - Number(b.rank ?? 9999))
    .slice(0, limit);
  let mostConnectedRows = [...centralityRows]
    .sort((a, b) => Number(b.degree_percentile ?? 0) - Number(a.degree_percentile ?? 0))
    .slice(0, limit) as Array<Record<string, unknown>>;

  if (mostConnectedRows.length === 0) {
    const visibilityFallback = await fetchInstitutionRowsInChunks(
      hcpIds,
      async (chunk) => {
        const { data, error } = await supabase
          .from("hcp_rising_star_ranks_v3")
          .select("hcp_id, us_rank, network_visibility_percentile")
          .eq("therapeutic_area_id", taId)
          .in("hcp_id", chunk)
          .not("us_rank", "is", null);
        if (error) {
          console.error("[getInstitutionLeaderboards] visibility fallback chunk error:", error);
          return [];
        }
        return data ?? [];
      },
    );
    mostConnectedRows = [...visibilityFallback]
      .sort(
        (a, b) =>
          Number(b.network_visibility_percentile ?? 0) -
          Number(a.network_visibility_percentile ?? 0),
      )
      .slice(0, limit) as Array<Record<string, unknown>>;
  }

  const networkMomentumResult = [...networkMomentumRows]
    .sort(
      (a, b) =>
        Number(b.network_momentum_percentile ?? 0) - Number(a.network_momentum_percentile ?? 0),
    )
    .slice(0, limit);

  const mostConnectedValueKey =
    mostConnectedRows.length > 0 && mostConnectedRows[0].degree_percentile != null
      ? "degree_percentile"
      : "network_visibility_percentile";

  return {
    top_rising_stars: buildInstitutionLeaderboardEntries(
      risingStarsResult as Array<Record<string, unknown>>,
      nameMap,
      {
        rankKey: "us_rank",
        valueKey: "rising_star_percentile",
        labelFn: (row) => String(Math.round(Number(row.rising_star_percentile ?? 0))),
      },
    ),
    top_established: buildInstitutionLeaderboardEntries(
      establishedResult as Array<Record<string, unknown>>,
      nameMap,
      {
        rankKey: "rank",
        valueKey: "cohort_score",
        labelFn: (row) => String(Math.round(Number(row.cohort_score ?? 0))),
      },
    ),
    most_connected: mostConnectedRows.map((row, index) => {
      const hcpId = String(row.hcp_id);
      return {
        hcp_id: hcpId,
        name: nameMap.get(hcpId) ?? "Unknown",
        rank: index + 1,
        primary_value: Number(row[mostConnectedValueKey] ?? 0),
        primary_label: String(Math.round(Number(row[mostConnectedValueKey] ?? 0))),
      };
    }),
    highest_network_momentum: buildInstitutionLeaderboardEntries(
      networkMomentumResult as Array<Record<string, unknown>>,
      nameMap,
      {
        rankKey: "us_rank",
        valueKey: "network_momentum_percentile",
        labelFn: (row) => String(Math.round(Number(row.network_momentum_percentile ?? 0))),
      },
    ),
  };
}

export async function getInstitutionCollaborations(
  institutionName: string,
  limit: number = 8,
): Promise<InstitutionCollaboration[]> {
  const { data: hcps } = await fetchAllPaginated<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcps_v2")
        .select("id, first_name, last_name")
        .eq("institution_canonical", institutionName)
        .range(offset, offset + pageSize - 1),
  );
  if (!hcps || hcps.length === 0) return [];

  const hcpIdSet = new Set((hcps as InstitutionHcpRow[]).map((h) => String(h.id)));
  const nameMap = new Map(
    (hcps as InstitutionHcpRow[]).map((h) => [
      String(h.id),
      `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown",
    ]),
  );

  const hcpIds = Array.from(hcpIdSet);
  const allCollabRows: Array<{
    hcp_id: string;
    collaborator_hcp_id: string;
    shared_publications: number;
  }> = [];

  for (const chunk of chunkInstitutionHcpIds(hcpIds)) {
    const { data: collabs, error } = await fetchAllPaginated<{
      hcp_id: string;
      collaborator_hcp_id: string;
      shared_publications: number;
    }>(
      async (offset, pageSize) =>
        await supabase
          .from("hcp_top_collaborators_v2")
          .select("hcp_id, collaborator_hcp_id, shared_publications")
          .in("hcp_id", chunk)
          .order("shared_publications", { ascending: false })
          .range(offset, offset + pageSize - 1),
    );

    if (error) {
      console.error("[getInstitutionCollaborations] chunk error:", error);
      continue;
    }
    if (collabs) allCollabRows.push(...collabs);
  }

  const sameInstitutionPairs = allCollabRows.filter((c) =>
    hcpIdSet.has(String(c.collaborator_hcp_id)),
  );

  const seenPairs = new Set<string>();
  const result: InstitutionCollaboration[] = [];

  sameInstitutionPairs.sort(
    (a, b) => Number(b.shared_publications) - Number(a.shared_publications),
  );

  for (const c of sameInstitutionPairs) {
    const id1 = String(c.hcp_id);
    const id2 = String(c.collaborator_hcp_id);
    const canonicalKey = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
    if (seenPairs.has(canonicalKey)) continue;
    seenPairs.add(canonicalKey);

    result.push({
      hcp1_id: id1,
      hcp1_name: nameMap.get(id1) ?? "Unknown",
      hcp2_id: id2,
      hcp2_name: nameMap.get(id2) ?? "Unknown",
      shared_publications: Number(c.shared_publications),
    });

    if (result.length >= limit) break;
  }

  return result;
}

export async function getInstitutionExternalPartners(
  sourceInstitutionName: string,
  limit: number = 8,
): Promise<ExternalPartnerInstitution[]> {
  const { data: sourceHcps } = await fetchAllPaginated<{ id: string }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcps_v2")
        .select("id")
        .eq("institution_canonical", sourceInstitutionName)
        .range(offset, offset + pageSize - 1),
  );
  if (!sourceHcps || sourceHcps.length === 0) return [];

  const sourceHcpIds = (sourceHcps as InstitutionHcpRow[]).map((h) => String(h.id));
  const sourceNameMap = new Map<string, string>();

  for (const chunk of chunkInstitutionHcpIds(sourceHcpIds)) {
    const { data: hcps } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name")
      .in("id", chunk);
    (hcps ?? []).forEach((h) => {
      sourceNameMap.set(
        String(h.id),
        `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown",
      );
    });
  }

  const allCollabRows: Array<{
    hcp_id: string;
    collaborator_hcp_id: string;
    shared_publications: number;
  }> = [];

  for (const chunk of chunkInstitutionHcpIds(sourceHcpIds)) {
    const { data: collabs } = await fetchAllPaginated<{
      hcp_id: string;
      collaborator_hcp_id: string;
      shared_publications: number;
    }>(
      async (offset, pageSize) =>
        await supabase
          .from("hcp_top_collaborators_v2")
          .select("hcp_id, collaborator_hcp_id, shared_publications")
          .in("hcp_id", chunk)
          .range(offset, offset + pageSize - 1),
    );
    if (collabs) allCollabRows.push(...collabs);
  }

  if (allCollabRows.length === 0) return [];

  const collaboratorIds = Array.from(
    new Set(allCollabRows.map((r) => String(r.collaborator_hcp_id))),
  );
  const institutionMap = new Map<string, string | null>();
  const nameMap = new Map<string, string>();

  for (const chunk of chunkInstitutionHcpIds(collaboratorIds)) {
    const { data: hcps } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_canonical")
      .in("id", chunk);
    (hcps ?? []).forEach((h) => {
      institutionMap.set(String(h.id), h.institution_canonical);
      nameMap.set(
        String(h.id),
        `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown",
      );
    });
  }

  const sourceHcpSet = new Set(sourceHcpIds);
  type PartnerAggregate = {
    institution: string;
    total_publications: number;
    source_hcps: Set<string>;
    partner_hcps: Set<string>;
    top_pair: {
      source_id: string;
      partner_id: string;
      shared: number;
    } | null;
  };
  const aggregates = new Map<string, PartnerAggregate>();

  for (const row of allCollabRows) {
    const sourceId = String(row.hcp_id);
    const partnerId = String(row.collaborator_hcp_id);
    const partnerInstitution = institutionMap.get(partnerId);

    if (!partnerInstitution) continue;
    if (partnerInstitution === sourceInstitutionName) continue;
    if (sourceHcpSet.has(partnerId)) continue;

    let agg = aggregates.get(partnerInstitution);
    if (!agg) {
      agg = {
        institution: partnerInstitution,
        total_publications: 0,
        source_hcps: new Set(),
        partner_hcps: new Set(),
        top_pair: null,
      };
      aggregates.set(partnerInstitution, agg);
    }
    const sharedNum = Number(row.shared_publications);
    agg.total_publications += sharedNum;
    agg.source_hcps.add(sourceId);
    agg.partner_hcps.add(partnerId);
    if (!agg.top_pair || sharedNum > agg.top_pair.shared) {
      agg.top_pair = {
        source_id: sourceId,
        partner_id: partnerId,
        shared: sharedNum,
      };
    }
  }

  return Array.from(aggregates.values())
    .sort((a, b) => b.total_publications - a.total_publications)
    .slice(0, limit)
    .map((agg) => ({
      institution_name: agg.institution,
      slug: institutionToSlug(agg.institution),
      total_shared_publications: agg.total_publications,
      source_investigators_count: agg.source_hcps.size,
      partner_investigators_count: agg.partner_hcps.size,
      top_connection: agg.top_pair
        ? {
            source_hcp_id: agg.top_pair.source_id,
            source_name: sourceNameMap.get(agg.top_pair.source_id) ?? "Unknown",
            partner_hcp_id: agg.top_pair.partner_id,
            partner_name: nameMap.get(agg.top_pair.partner_id) ?? "Unknown",
            shared_publications: agg.top_pair.shared,
          }
        : null,
    }));
}

export interface InstitutionIndexEntry {
  institution_name: string;
  slug: string;
  investigator_count: number;
  rising_star_count: number;
  established_count: number;
  talent_density_pct: number | null;
  yield_ratio: number | null;
  top_rising_star_name: string | null;
  top_rising_star_rank: number | null;
  states_present: string[];
}

const institutionsIndexCache = new Map<string, Promise<InstitutionIndexEntry[]>>();

export async function getInstitutionsIndex(
  taSlug: string,
): Promise<InstitutionIndexEntry[]> {
  const existing = institutionsIndexCache.get(taSlug);
  if (existing) return existing;

  const promise = getInstitutionsIndexUncached(taSlug);
  institutionsIndexCache.set(taSlug, promise);

  promise.catch(() => {
    institutionsIndexCache.delete(taSlug);
  });

  return promise;
}

export function clearInstitutionsIndexCache(taSlug?: string) {
  if (taSlug) {
    institutionsIndexCache.delete(taSlug);
  } else {
    institutionsIndexCache.clear();
  }
}

async function getInstitutionsIndexUncached(
  taSlug: string,
): Promise<InstitutionIndexEntry[]> {
  const taId = await resolveLandscapeTaId(taSlug);
  if (!taId) return [];

  const [{ data: rsRows }, { data: estRows }] = await Promise.all([
    ( async () => fetchAllPaginated<{ hcp_id: string; us_rank: number }>(
      async (offset, pageSize) =>
        await supabase
          .from("hcp_rising_star_ranks_v3")
          .select("hcp_id, us_rank")
          .eq("therapeutic_area_id", taId)
          .not("us_rank", "is", null)
          .range(offset, offset + pageSize - 1),
    ) )(),
    ( async () => fetchAllPaginated<{ hcp_id: string }>(
      async (offset, pageSize) =>
        await supabase
          .from("hcp_established_ranks_v3")
          .select("hcp_id")
          .eq("therapeutic_area_id", taId)
          .eq("scope_type", "region")
          .eq("scope_value", "US")
          .range(offset, offset + pageSize - 1),
    ) )(),
  ]);

  const rsRankMap = new Map<string, number>();
  (rsRows ?? []).forEach((r) => {
    rsRankMap.set(String(r.hcp_id), Number(r.us_rank));
  });
  const rsHcpIds = new Set(rsRankMap.keys());
  const estHcpIds = new Set((estRows ?? []).map((r) => String(r.hcp_id)));

  const cohortHcpIds = Array.from(new Set([...rsHcpIds, ...estHcpIds]));
  if (cohortHcpIds.length === 0) return [];

  type CohortHcpRow = {
    id: string;
    institution_canonical: string | null;
    first_name: string | null;
    last_name: string | null;
    nppes_practice_state: string | null;
  };

  const cohortHcps: CohortHcpRow[] = [];
  for (const chunk of chunkInstitutionHcpIds(cohortHcpIds)) {
    const { data: hcps } = await supabase
      .from("hcps_v2")
      .select("id, institution_canonical, first_name, last_name, nppes_practice_state")
      .in("id", chunk);
    if (hcps) cohortHcps.push(...(hcps as CohortHcpRow[]));
  }

  const cohortInstitutions = new Set<string>();
  for (const h of cohortHcps) {
    if (h.institution_canonical) cohortInstitutions.add(h.institution_canonical);
  }

  const institutionNames = Array.from(cohortInstitutions);
  const totalInvestigatorCounts = new Map<string, number>();

  if (institutionNames.length > 0) {
    const { data: countRows } = await fetchAllPaginated<{
      institution_canonical: string;
      investigator_count: number;
    }>(
      async (offset, pageSize) =>
        await supabase
          .from("institution_investigator_counts")
          .select("institution_canonical, investigator_count")
          .in("institution_canonical", institutionNames)
          .range(offset, offset + pageSize - 1),
    );
    (countRows ?? []).forEach((row) => {
      if (row.institution_canonical && row.investigator_count != null) {
        totalInvestigatorCounts.set(
          row.institution_canonical,
          Number(row.investigator_count),
        );
      }
    });
  }

  type InstitutionIndexAggregate = {
    institution: string;
    rs_count: number;
    est_count: number;
    best_rs_rank: number;
    best_rs_name: string | null;
    states: Set<string>;
  };
  const aggregates = new Map<string, InstitutionIndexAggregate>();

  for (const h of cohortHcps) {
    const inst = h.institution_canonical;
    if (!inst) continue;

    let agg = aggregates.get(inst);
    if (!agg) {
      agg = {
        institution: inst,
        rs_count: 0,
        est_count: 0,
        best_rs_rank: Infinity,
        best_rs_name: null,
        states: new Set<string>(),
      };
      aggregates.set(inst, agg);
    }

    const hcpId = String(h.id);
    const fullName = `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim();

    if (h.nppes_practice_state) {
      agg.states.add(h.nppes_practice_state.toUpperCase());
    }

    if (rsHcpIds.has(hcpId)) {
      agg.rs_count++;
      const rank = rsRankMap.get(hcpId);
      if (rank != null && rank < agg.best_rs_rank) {
        agg.best_rs_rank = rank;
        agg.best_rs_name = fullName;
      }
    }
    if (estHcpIds.has(hcpId)) agg.est_count++;
  }

  const entries: InstitutionIndexEntry[] = [];
  for (const agg of aggregates.values()) {
    const investigatorCount = totalInvestigatorCounts.get(agg.institution) ?? 0;
    const talentDensity =
      investigatorCount >= 30 && agg.rs_count > 0
        ? (agg.rs_count / investigatorCount) * 100
        : null;
    const totalCohort = agg.rs_count + agg.est_count;
    const yieldRatio =
      investigatorCount >= 30 &&
      agg.est_count > 0 &&
      totalCohort >= 3
        ? agg.rs_count / agg.est_count
        : null;

    entries.push({
      institution_name: agg.institution,
      slug: institutionToSlug(agg.institution),
      investigator_count: investigatorCount,
      rising_star_count: agg.rs_count,
      established_count: agg.est_count,
      talent_density_pct: talentDensity,
      yield_ratio: yieldRatio,
      top_rising_star_name: agg.best_rs_name,
      top_rising_star_rank: agg.best_rs_rank === Infinity ? null : agg.best_rs_rank,
      states_present: Array.from(agg.states),
    });
  }

  entries.sort(
    (a, b) =>
      b.rising_star_count - a.rising_star_count ||
      b.investigator_count - a.investigator_count,
  );

  return entries;
}

export interface TerritoryInstitution {
  institution_name: string;
  slug: string;
  rising_star_count: number;
  established_count: number;
  top_rising_star_name: string | null;
  top_rising_star_rank: number | null;
}

export async function getTopInstitutionsInTerritory(
  taSlug: string,
  states: string[],
  limit: number = 8,
  taIdOverride?: string,
): Promise<TerritoryInstitution[]> {
  const taId = taIdOverride ?? (await resolveLandscapeTaId(taSlug));
  if (!taId) return [];

  const { data: rsRows } = await fetchAllPaginated<{ hcp_id: string; us_rank: number }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id, us_rank")
        .eq("therapeutic_area_id", taId)
        .not("us_rank", "is", null)
        .range(offset, offset + pageSize - 1),
  );

  const { data: estRows } = await fetchAllPaginated<{ hcp_id: string }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcp_established_ranks_v3")
        .select("hcp_id")
        .eq("therapeutic_area_id", taId)
        .eq("scope_type", "region")
        .eq("scope_value", "US")
        .range(offset, offset + pageSize - 1),
  );

  const rsRankMap = new Map<string, number>();
  (rsRows ?? []).forEach((r) => {
    rsRankMap.set(String(r.hcp_id), Number(r.us_rank));
  });
  const estSet = new Set<string>((estRows ?? []).map((r) => String(r.hcp_id)));

  const allCohortIds = Array.from(new Set([...rsRankMap.keys(), ...estSet]));
  if (allCohortIds.length === 0) return [];

  const CHUNK_SIZE = 100;
  const upperStates =
    states.length > 0 ? new Set(states.map((s) => s.toUpperCase())) : null;

  type HcpInfo = {
    id: string;
    name: string;
    institution: string | null;
    state: string | null;
  };
  const hcpInfo: HcpInfo[] = [];

  for (let i = 0; i < allCohortIds.length; i += CHUNK_SIZE) {
    const chunk = allCohortIds.slice(i, i + CHUNK_SIZE);
    const { data: hcps } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_canonical, nppes_practice_state")
      .in("id", chunk);
    (hcps ?? []).forEach((h) => {
      const state = h.nppes_practice_state
        ? String(h.nppes_practice_state).toUpperCase()
        : null;
      if (upperStates) {
        if (!state || !upperStates.has(state)) return;
      }
      hcpInfo.push({
        id: String(h.id),
        name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim(),
        institution: h.institution_canonical,
        state,
      });
    });
  }

  type Agg = {
    institution: string;
    rs_count: number;
    est_count: number;
    best_rs_rank: number;
    best_rs_name: string | null;
  };
  const aggregates = new Map<string, Agg>();

  for (const h of hcpInfo) {
    if (!h.institution) continue;
    let agg = aggregates.get(h.institution);
    if (!agg) {
      agg = {
        institution: h.institution,
        rs_count: 0,
        est_count: 0,
        best_rs_rank: Infinity,
        best_rs_name: null,
      };
      aggregates.set(h.institution, agg);
    }
    if (rsRankMap.has(h.id)) {
      agg.rs_count++;
      const rank = rsRankMap.get(h.id)!;
      if (rank < agg.best_rs_rank) {
        agg.best_rs_rank = rank;
        agg.best_rs_name = h.name;
      }
    }
    if (estSet.has(h.id)) agg.est_count++;
  }

  return Array.from(aggregates.values())
    .sort(
      (a, b) =>
        b.rs_count - a.rs_count ||
        b.est_count - a.est_count,
    )
    .slice(0, limit)
    .map((agg) => ({
      institution_name: agg.institution,
      slug: institutionToSlug(agg.institution),
      rising_star_count: agg.rs_count,
      established_count: agg.est_count,
      top_rising_star_name: agg.best_rs_name,
      top_rising_star_rank: agg.best_rs_rank === Infinity ? null : agg.best_rs_rank,
    }));
}

export type { HCP, HCPScore, LatestPost };
