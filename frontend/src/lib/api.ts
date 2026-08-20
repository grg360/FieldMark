import { firstEmbedded } from "./cohort-metrics";
import { TA_DISPLAY_NAME_BY_SLUG } from "./taLabels";
import { formatBibliographyByline } from "./authorByline";
import { dedupeHCPs } from "./hcp-dedupe";
import {
  countriesForRegion,
  excludedCountriesForRegion,
  isExclusionRegion,
  type RegionKey,
} from "./regions";
// Aggregate (non-country) scope values — see the "Other" region query below.
import { aggregateScopeValues } from "./ledgerRegions";
import { resolveFilterScope } from "./rank-filters";
import { institutionToSlug } from "./institutionUtils";
import { supabase } from "./supabase";
import { classifyVoice } from "./voiceClassification";
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
  /**
   * Countries to EXCLUDE rather than include. Non-empty only for the "Other" region,
   * which is the complement of every defined region and cannot be expressed as an
   * `IN (...)` list. Callers MUST apply this as a negated predicate; ignoring it is
   * the bug that made "Other" return every region's rows.
   */
  excludeScopeValues: string[];
}

function resolveRpcScopeParams(filters: FilterState): RpcScopeParams {
  const scope = resolveFilterScope(filters);
  const scopeLabel = scopeDisplayLabel(scope);
  const requestedRegion = filters.region as RegionKey | undefined;

  let scopeType = "region";
  let scopeValues: string[] = [];
  let excludeScopeValues: string[] = [];

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
    } else if (isExclusionRegion(requestedRegion)) {
      // "Other" = every country NOT in a defined region. Expressed as an exclusion,
      // never as an empty include-list (which silently matched everything).
      scopeValues = [];
      excludeScopeValues = excludedCountriesForRegion(requestedRegion);
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

  return { scopeType, scopeValues, states, scopeLabel, scopeIncludesUs, excludeScopeValues };
}

type CohortKind = "rising_star" | "rising_composite" | "established" | "community";

async function enrichAndMapCohortRows(
  rankRows: any[],
  filters: FilterState,
  taSlug: string,
  taId: string,
  scopeLabel: string,
  rankTable: string | null,
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
    } else if (scopeParams.excludeScopeValues.length > 0) {
      // "Other": everything NOT in a defined region. PostgREST wants the negated `in`
      // list as a parenthesised, quoted tuple.
      //
      // AGGREGATE SCOPES MUST BE EXCLUDED TOO (2026-08-18, generalised same day). This
      // is the one query in the sweep that selects scope rows by NEGATION, so it is the
      // one that a new non-country scope_value silently joins: an aggregate bucket is
      // not in ALL_REGION_COUNTRIES, so without this every European HCP — and now every
      // APAC one — would surface on the "Other" board carrying their aggregate rank, on
      // top of the country row they already have.
      //
      // The list is READ FROM regions.aggregate_scope rather than hardcoded, so a region
      // flagged later is excluded here without an edit. A negation cannot be
      // additive-safe on its own; this is what makes it so.
      const aggregates = await aggregateScopeValues();
      v3Query = v3Query.not(
        "scope_value",
        "in",
        `(${[...scopeParams.excludeScopeValues, ...aggregates].map((c) => `"${c}"`).join(",")})`,
      );
    }
    const { data: v3Rows, error: v3Err } = await v3Query;
    if (v3Err) {
      return { rows: [], error: `Established v3 ranks query failed: ${v3Err.message}` };
    }
    for (const row of v3Rows ?? []) {
      v3ByHcp.set(String(row.hcp_id), row as Record<string, unknown>);
    }
  }

  // rankTable null = the cohort has no rank source (community, post-freeze:
  // hcp_community_ranks_v2 retired; the roster is not ranked, so global_rank
  // stays null and HCPCard renders no #N).
  const { data: globalRankRows } =
    cohort === "rising_star" || cohort === "rising_composite" || rankTable == null
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
          current_country,
          affiliation_confidence,
          affiliation_as_of,
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
    if (cohort === "rising_composite") {
      // AD new-model rising KEEPS industry-affiliated HCPs (badged on the card),
      // matching the narrative-layer decision. The industry drop is intentionally
      // NOT applied here; only the missing-hcp guard remains.
      return !!hcp;
    }
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

  // Cohort-keyed narratives (2026-08-06): a dual-board member holds one row per
  // cohort, so the card feed reads the row for the cohort it is rendering.
  // "rising_composite" is the AD rising model — its narratives are rising rows.
  const narrativeCohort = cohort === "rising_composite" ? "rising_star" : cohort;

  if (narrativeIds.length > 0) {
    const { data: taNarratives, error: taNarrError } = await supabase
      .from("hcp_narratives_v2")
      .select("hcp_id, narrative_text, why_now, engagement_angle, caution_flags, signal_strength, therapeutic_area_slug")
      .in("hcp_id", narrativeIds)
      .eq("therapeutic_area_slug", taSlug)
      .eq("cohort", narrativeCohort);

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
      // This fallback kept the cohort filter but dropped therapeutic_area_slug, so a
      // narrative written for a DIFFERENT therapeutic area could fill the gap — the
      // path by which hepatology community narratives could surface on an NSCLC
      // card. A narrative is about an HCP's standing WITHIN a TA and does not
      // transfer; the TA filter is restored and absence stays absence.
      const { data: fallbackNarratives, error: fbError } = await supabase
        .from("hcp_narratives_v2")
        .select("hcp_id, narrative_text, why_now, engagement_angle, caution_flags, signal_strength, generated_at")
        .in("hcp_id", missingIds)
        .eq("cohort", narrativeCohort)
        .eq("therapeutic_area_slug", taSlug)
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

    if (cohort === "rising_composite") {
      // AD 2-axis composite model. Reads the real Emergence / Network Influence
      // axes from get_rising_composite_filtered; emits NO momentum/visibility/
      // archetype/us_rank/scope_rank. cohort_classification stays "rising_star" so
      // the existing rising card/detail gates still recognize it; the rising_model
      // flag is what the card/detail branch on to render the 2-tile composite view.
      const compositeScore = parseOptionalNumber(rr.rising_composite_score) ?? 0;
      const emergencePctile = parseOptionalNumber(rr.emergence_pctile);
      const networkInfluencePctile = parseOptionalNumber(rr.network_influence_pctile);
      const scopeRank = parseOptionalNumber(rr.rank) ?? 0;
      // Precompute the industry-affiliation flag (same institution source + regex
      // the drop used) so the card can badge it without re-running the regex.
      const industryInst = String(
        hcp?.institution_normalized ?? hcp?.institution_raw ?? "",
      ).toLowerCase();
      const isIndustryAffiliated = industryInst
        ? INDUSTRY_REGEX.test(industryInst)
        : false;

      const enrichedRow = {
        composite_score: compositeScore,
        normalized_score: compositeScore,
        cohort_score: compositeScore,
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
        },
      };

      const mapped = mapRisingStarRow(enrichedRow, filters.therapeuticArea);
      return [
        {
          ...mapped,
          normalized_score: compositeScore,
          cohort_score: compositeScore,
          composite_score: compositeScore,
          rising_composite_score: compositeScore,
          emergence_pctile: emergencePctile,
          network_influence_pctile: networkInfluencePctile,
          rising_model: "composite",
          is_industry_affiliated: isIndustryAffiliated,
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
          percentile: compositeScore,
          scope_size: undefined,
          scope: scopeLabel,
          tier: "rising_star",
          cohort_classification: "rising_star",
          citedByCount: metricsData?.cited_by_count ?? null,
          hIndex: metricsData?.h_index ?? null,
          worksCount: metricsData?.works_count ?? null,
          total_citations: metricsData?.cited_by_count ?? null,
          h_index: metricsData?.h_index ?? null,
          works_count: metricsData?.works_count ?? null,
        } as RisingStar,
      ];
    }

    // Community (Phase 3 roster): the RPC emits no rank/score/scope_size — tier
    // and reach facts replace them. EST rows keep the real rank/score fields.
    const isCommunityRow = cohort === "community";
    const normalizedScore = isCommunityRow ? 0 : Number(rr.normalized_score ?? 0);
    const rank = isCommunityRow ? null : Number(rr.rank);
    const scopeSize = isCommunityRow ? 0 : Number(rr.scope_size);
    const percentile =
      rank != null && scopeSize > 0 ? 100 - (rank / scopeSize) * 100 : null;

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
        // Phase 3 roster facts: tier chip + Medicare reach, never a score.
        evidence_tier: (rr.evidence_tier as string | null) ?? null,
        patient_volume: rr.patient_volume != null ? Number(rr.patient_volume) : null,
        part_d_present: rr.part_d_present != null ? Boolean(rr.part_d_present) : null,
      } as RisingStar,
    ];
  });

  return { rows, error: null };
}

/**
 * Distinct scope_values in a rank table that fall OUTSIDE every defined region —
 * i.e. the concrete membership of the "Other" bucket for this TA.
 *
 * Resolved from data rather than hardcoded: the set of countries appearing in the
 * corpus is open-ended, so a static "Other" list would silently go stale. Cached per
 * (table, TA) for the session; the rank tables only change on a rescore.
 */
const otherScopeValueCache = new Map<string, string[]>();

async function resolveOtherScopeValues(
  taId: string,
  rankTable: string,
  excluded: string[],
): Promise<string[]> {
  const key = `${rankTable}:${taId}`;
  const cached = otherScopeValueCache.get(key);
  if (cached) return cached;

  const { data, error } = await supabase
    .from(rankTable)
    .select("scope_value")
    .eq("therapeutic_area_id", taId)
    .eq("scope_type", "region")
    .not("scope_value", "is", null);

  if (error) return [];

  const excludedSet = new Set(excluded.map((c) => c.toUpperCase()));
  const values = Array.from(
    new Set(
      (data ?? [])
        .map((r) => String((r as { scope_value: string | null }).scope_value ?? "").toUpperCase())
        .filter((c) => c !== "" && !excludedSet.has(c)),
    ),
  ).sort();

  otherScopeValueCache.set(key, values);
  return values;
}

async function fetchCohortViaRpc(
  filters: FilterState,
  taId: string,
  taSlug: string,
  limit: number,
  offset: number,
  countRpc: string,
  rowsRpc: string,
  rankTable: string | null,
  cohort: CohortKind,
): Promise<{ rows: RisingStar[]; total: number; error: string | null }> {
  const rpcScope = resolveRpcScopeParams(filters);
  const scope = resolveFilterScope(filters);

  // "Other" is an exclusion region, but the RPCs only accept a positive
  // p_scope_values list. Resolve the complement against the actual rank table so the
  // bucket is reachable without changing the RPC signature. Without this the bail
  // below fired on the empty include-list and "Other" silently returned nothing.
  if (rpcScope.excludeScopeValues.length > 0 && rpcScope.scopeValues.length === 0) {
    rpcScope.scopeValues = await resolveOtherScopeValues(
      taId,
      rankTable,
      rpcScope.excludeScopeValues,
    );
  }

  // The rising_composite RPC handles global natively (scope_type='global',
  // scope_value=NULL). Every other cohort/RPC has no global rows path, so it
  // still bails to empty for global scope.
  if (
    (scope.scopeType === "global" || rpcScope.scopeValues.length === 0) &&
    cohort !== "rising_composite"
  ) {
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
  // AD 2-axis composite model. model === "composite" → render Emergence / Network
  // Influence tiles from these fields; legacy (NSCLC) leaves model unset and uses the
  // momentum/visibility/archetype fields above.
  model?: "composite" | "legacy";
  rising_composite_score?: number | null;
  emergence_pctile?: number | null;
  network_influence_pctile?: number | null;
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

export function taIdForApiSlug(slug: string): string | undefined {
  return TA_ID_MAP[slug.toLowerCase().trim()];
}

// TA_DISPLAY_NAME_BY_SLUG moved to lib/taLabels.ts 2026-08-15 and is imported
// back here, so the label strings have exactly one home. See that file for why.

export function taDisplayNameForId(taId: string): string {
  const slug = apiSlugForTaId(taId);
  return (slug && TA_DISPLAY_NAME_BY_SLUG[slug]) ?? "";
}

/**
 * Live therapeutic areas as PARENT slugs (e.g. ["oncology","immunology"]).
 *
 * Authoritative source: the live_therapeutic_areas view, which is
 * therapeutic_area_ingestion_config pre-filtered to is_visible_in_ui = true AND
 * is_active = true (the same gate the pipeline uses) and exposing ONLY
 * therapeutic_area_id — the config's scoring_weights / pubmed_query stay
 * server-side (core IP; the base table is RLS-blocked to authenticated). Each
 * live id is an indication-level TA (NSCLC, Atopic Dermatitis), mapped UP to its
 * broad-TA parent slug (oncology, immunology) via the therapeutic_areas hierarchy
 * (parent_ta_id). A broad-TA row (no parent) contributes its own slug. Hepatology
 * is parked (is_visible_in_ui = false) so it is excluded. Currently →
 * ["oncology","immunology"].
 *
 * This is the live-TA source of truth. It is intended to retire the hardcoded
 * TA_CHIPS = ["Oncology","Immunology"] in TAFilterChips.tsx — that migration is a
 * deliberate follow-up; this task only builds the resolver.
 *
 * NOTE: the live_therapeutic_areas view must be granted to the authenticated role
 * for this to return rows in-browser (see the migration accompanying this change).
 * Cached like getMslProfile: one settled promise, cleared on error.
 */
let liveTASlugsCache: Promise<string[]> | null = null;

export function clearLiveTASlugsCache(): void {
  liveTASlugsCache = null;
}

export async function getLiveTASlugs(): Promise<string[]> {
  if (liveTASlugsCache) return liveTASlugsCache;

  const promise = (async () => {
    const { data: cfgRows, error: cfgErr } = await supabase
      .from("live_therapeutic_areas")
      .select("therapeutic_area_id");
    if (cfgErr) throw cfgErr;

    const liveIds = (cfgRows ?? [])
      .map((r) => (r.therapeutic_area_id ? String(r.therapeutic_area_id) : ""))
      .filter(Boolean);
    if (liveIds.length === 0) return [];

    const { data: taRows, error: taErr } = await supabase
      .from("therapeutic_areas")
      .select("id, slug, parent_ta_id");
    if (taErr) throw taErr;

    const byId = new Map<string, { slug: string | null; parentId: string | null }>();
    for (const row of taRows ?? []) {
      byId.set(String(row.id), {
        slug: row.slug ?? null,
        parentId: row.parent_ta_id ? String(row.parent_ta_id) : null,
      });
    }

    const parentSlugs = new Set<string>();
    for (const id of liveIds) {
      const node = byId.get(id);
      if (!node) continue;
      const parent = node.parentId ? byId.get(node.parentId) : null;
      const slug = parent?.slug ?? node.slug;
      if (slug) parentSlugs.add(slug);
    }
    return Array.from(parentSlugs);
  })();

  liveTASlugsCache = promise;
  promise.catch(() => {
    liveTASlugsCache = null;
  });
  return promise;
}

/**
 * Entitled TA slugs for a user = allowed_ta_slugs ∩ live TAs, as PARENT slugs.
 *
 * FAIL-OPEN grandfather: a missing/empty allowed_ta_slugs returns ALL live TAs,
 * so pre-entitlement users (and anyone onboarded before registration writes the
 * list) are never locked out. A populated list is intersected with the live set,
 * so a parked/removed TA left in a user's list (e.g. hepatology) never surfaces.
 *
 * Guard-reads the array like states_covered. Returns parent slugs.
 */
export async function entitledTASlugs(
  profile: { allowed_ta_slugs?: string[] | null },
): Promise<string[]> {
  const live = await getLiveTASlugs();
  const allowed = Array.isArray(profile.allowed_ta_slugs)
    ? profile.allowed_ta_slugs
    : [];
  if (allowed.length === 0) return live;
  const liveSet = new Set(live);
  return allowed.filter((slug) => liveSet.has(slug));
}

/**
 * Resolve an HCP's primary therapeutic area when the caller didn't carry one
 * (refresh, bookmark, deep-link, back-nav). Primary = the TA with the most
 * publications for this HCP (hcp_therapeutic_areas_v2.publication_count).
 *
 * NOTE: publication_count, NOT hcp_scores_v2.composite_score. hcp_scores_v2 is
 * the legacy v2 scoring table and contains no AD rows — an AD KOL has zero score
 * rows there, so a "highest-scored" pick returns nothing for non-NSCLC HCPs.
 * publication_count is populated for every TA membership. Deterministic tiebreak
 * on therapeutic_area_id.
 */
export async function resolvePrimaryTaId(hcpId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("hcp_therapeutic_areas_v2")
    .select("therapeutic_area_id, publication_count")
    .eq("hcp_id", hcpId)
    .order("publication_count", { ascending: false, nullsFirst: false })
    .order("therapeutic_area_id", { ascending: true })
    .limit(1);
  if (error) {
    console.warn("resolvePrimaryTaId: query error", error);
    return null;
  }
  const row = (data ?? [])[0] as { therapeutic_area_id?: string } | undefined;
  return row?.therapeutic_area_id ? String(row.therapeutic_area_id) : null;
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
    // Re-derived affiliation (2026-08-14). Carried alongside the preserved historical
    // `country` so the display layer can hedge — see lib/location.ts.
    current_country:
      hcp.current_country != null && String(hcp.current_country).trim() !== ""
        ? String(hcp.current_country)
        : null,
    affiliation_confidence:
      hcp.affiliation_confidence != null && String(hcp.affiliation_confidence).trim() !== ""
        ? String(hcp.affiliation_confidence)
        : null,
    affiliation_as_of: hcp.affiliation_as_of != null ? Number(hcp.affiliation_as_of) : null,
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
    // AD rising reads the new 2-axis composite model (scope-aware, global-capable);
    // every other TA stays on the frozen rising_star RPC/table byte-for-byte.
    const isAdRising = taId === TA_ID_MAP["atopic-dermatitis"];
    const { rows, total, error: fetchError } = await fetchCohortViaRpc(
      filters,
      taId,
      taSlug,
      limit,
      offset,
      isAdRising ? "get_rising_composite_filtered_count" : "get_rising_star_filtered_count",
      isAdRising ? "get_rising_composite_filtered" : "get_rising_star_filtered",
      isAdRising ? "hcp_rising_composite_v1" : "hcp_rising_star_ranks_v3",
      isAdRising ? "rising_composite" : "rising_star",
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
      null,
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

    // Gate rationale: all 151 high-confidence dol_matches_v2 rows were reviewed
    // by hand on 2026-07-31 against the physician records they claim. 7 were
    // confirmed misattributions (4.6%) and 4 more held as uncertain. The signal
    // that separated right from wrong was the institution token, not name
    // similarity: every misattribution matched on a GENERIC token (medical,
    // health, hospital, technology, cancer, national), while every
    // distinctive-token match (danafarber, anderson, juntendo, royal marsden)
    // was correct. display_name_similarity is a poor discriminator because
    // credential suffixes (", MD, FASCO") depress it — 0.65 correct vs 0.83
    // wrong in this dataset. 140 rows are now verified_by_human = true and
    // render; 11 remain held. The panel gates on human verification, not on
    // score.
    const { data: matchRows, error: matchError } = await supabase
      .from("dol_matches_v2")
      .select("hcp_id, social_user_id, match_confidence")
      .in("hcp_id", filteredHcpIds)
      .eq("match_confidence", "high")
      .eq("verified_by_human", true);

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

    // ESTABLISHED ranks read hcp_established_ranks_v3 — the same table the feed board
    // reads — so an HCP's detail rank matches their board rank. They previously came
    // from hcp_score_ranks_v2, whose established slice is established_scoring.py's
    // (HCP x TA) cartesian output and disagrees with the feed; it also has no row at
    // all for 14,303 of the current NSCLC cohort, so those detail pages showed no rank.
    // RISING/COMMUNITY are NOT repointed: their v2 slices are properly TA-scoped
    // (counts differ per TA, unlike established). v3 is established-only, so a
    // non-established HCP simply finds no row and falls through to v2 — this read
    // serves all three cohorts, so the fallback is what keeps them working.
    // taId is the caller's RESOLVED entity TA (never hardcoded), so both reads stay
    // scoped to the TA the detail page resolved. Scope matches the feed's.
    // v3 has no percentile/scope_size, but neither survives mapRisingStarToHCP —
    // only `rank` reaches the UI — so the narrower row shape is not a loss.
    const rankPromise = (async () => {
      const withScopeValue = <T extends { is: any; eq: any }>(q: T) =>
        scope.scopeValue === null
          ? q.is("scope_value", null)
          : q.eq("scope_value", scope.scopeValue);

      const establishedRank = await withScopeValue(
        supabase
          .from("hcp_established_ranks_v3")
          .select("rank, cohort_score, scope_type, scope_value")
          .eq("hcp_id", hcpId)
          .eq("therapeutic_area_id", taId)
          .eq("scope_type", scope.scopeType),
      ).maybeSingle();

      if (establishedRank.data) {
        const row = establishedRank.data as Record<string, unknown>;
        return {
          data: {
            rank: row.rank,
            percentile: null,
            scope_size: null,
            score_at_rank: row.cohort_score,
            cohort: "established",
            scope_type: row.scope_type,
            scope_value: row.scope_value,
          },
          error: null,
        };
      }

      return withScopeValue(
        supabase
          .from("hcp_score_ranks_v2")
          .select("rank, percentile, scope_size, score_at_rank, cohort, scope_type, scope_value")
          .eq("hcp_id", hcpId)
          .eq("therapeutic_area_id", taId)
          .eq("scope_type", scope.scopeType),
      ).maybeSingle();
    })();

    // Narrative is TA-strict AND cohort-strict. Taking "newest row for this TA"
    // silently rendered the WRONG COHORT's narrative: Martin Reck (DE Established
    // #1) showed a community-cohort v1.0 narrative, because community was simply
    // the most recent row he had. The rows are fetched for every cohort here and
    // the one matching the cohort this profile actually resolved is selected after
    // the rank promise settles (below) — no extra round trip, and a cohort with no
    // narrative yields none rather than borrowing another cohort's.
    const narrativePromise = supabase
      .from("hcp_narratives_v2")
      .select("narrative_text, why_now, engagement_angle, caution_flags, signal_strength, generated_at, therapeutic_area_slug, cohort")
      .eq("hcp_id", hcpId)
      .eq("therapeutic_area_slug", narrativeTaSlug)
      .order("generated_at", { ascending: false });

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

    // Cohort-strict selection (see the narrativePromise note above). The rank promise
    // resolves which cohort THIS profile is, and only that cohort's narrative is used.
    // The rank tables say "rising"; the narrative table says "rising_star" — the same
    // mapping the card feed already applies.
    type NarrativeRow = {
      narrative_text: string | null;
      why_now: string | null;
      engagement_angle: string | null;
      caution_flags: string | null;
      signal_strength: string | null;
      generated_at: string | null;
      cohort: string | null;
    };
    const narrativeRows =
      ((narrativeResult as { data?: NarrativeRow[] | null }).data ?? []) as NarrativeRow[];
    const rankCohort = (rankResult as { data?: { cohort?: string | null } | null }).data?.cohort ?? null;
    const narrativeCohortWanted =
      rankCohort === "rising" || rankCohort === "rising_composite" ? "rising_star" : rankCohort;
    const narrativeData: NarrativeRow | null = narrativeCohortWanted
      ? (narrativeRows.find((r) => r.cohort === narrativeCohortWanted) ?? null)
      : null;

    // Cohort classification AND score are per-TA — they live in the cohort rank tables
    // keyed by therapeutic_area_id, NOT in the global hcps_v2.cohort_classification /
    // cohort_score columns (which are null for HCPs classified only within a sub-indication
    // TA like AD, and TA-independent for everyone else). Resolve BOTH from the entity's
    // resolved taId across all three cohorts (an HCP is in at most one cohort per TA, so
    // first hit by precedence wins). Rising is TA-conditional — AD reads the 2-axis
    // composite, every other TA the legacy rising table — mirroring the feed's isAdRising
    // split; the score column per cohort matches exactly what enrichAndMapCohortRows writes
    // for the board, so detail agrees with the feed. No per-TA row -> null; NEVER the global
    // hcps_v2 column (that was the leak). Only the filters.taId-set path (the real detail
    // route, entity TA resolved) re-resolves; the legacy no-taId path is left untouched.
    let cohortClassification: string | null = hcpData.cohort_classification ?? null;
    let cohortScore: number | null = parseOptionalNumber(hcpData.cohort_score);
    if (filters.taId) {
      const isAdRising = taId === TA_ID_MAP["atopic-dermatitis"];
      const scopedScore = (
        rows: Array<Record<string, unknown>> | null | undefined,
        scoreCol: string,
        scoped: boolean,
      ): number | null => {
        const list = rows ?? [];
        if (list.length === 0) return null;
        const row = scoped
          ? list.find(
              (r) =>
                r.scope_type === scope.scopeType &&
                (scope.scopeValue === null
                  ? r.scope_value === null
                  : r.scope_value === scope.scopeValue),
            )
          : list[0];
        return row?.[scoreCol] == null ? null : Number(row[scoreCol]);
      };

      const [estCohort, risingCohort, communityCohort, communityGate] = await Promise.all([
        supabase
          .from("hcp_established_ranks_v3")
          .select("cohort_score, scope_type, scope_value")
          .eq("hcp_id", hcpId)
          .eq("therapeutic_area_id", taId),
        isAdRising
          ? supabase
              .from("hcp_rising_composite_v1")
              .select("rising_composite_score, scope_type, scope_value")
              .eq("hcp_id", hcpId)
              .eq("therapeutic_area_id", taId)
          : supabase
              .from("hcp_rising_star_ranks_v3")
              .select("rising_star_percentile")
              .eq("hcp_id", hcpId)
              .eq("therapeutic_area_id", taId),
        // Membership-only read (the length is all that's consumed below;
        // cohortScore is forced null for community). Post view-retirement this
        // reads the scores base table — same per-(hcp, TA) membership set.
        supabase
          .from("hcp_community_scores_v2")
          .select("hcp_id")
          .eq("hcp_id", hcpId)
          .eq("therapeutic_area_id", taId),
        // Community membership (G2 cutover): for NSCLC, membership truth is
        // community_board_nsclc_v1.qualifies — a rank row alone is not
        // membership. Other TAs stay ungated (resolved truthy below).
        taId === TA_ID_MAP.nsclc
          ? supabase
              .from("community_board_nsclc_v1")
              .select("hcp_id")
              .eq("hcp_id", hcpId)
              .eq("qualifies", true)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const estData = (estCohort as { data?: Array<Record<string, unknown>> | null }).data ?? [];
      const risingData = (risingCohort as { data?: Array<Record<string, unknown>> | null }).data ?? [];
      const communityData = (communityCohort as { data?: Array<Record<string, unknown>> | null }).data ?? [];

      if (estData.length > 0) {
        cohortClassification = "established";
        cohortScore = scopedScore(estData, "cohort_score", true);
      } else if (risingData.length > 0) {
        cohortClassification = "rising_star";
        cohortScore = scopedScore(
          risingData,
          isAdRising ? "rising_composite_score" : "rising_star_percentile",
          isAdRising,
        );
      } else if (
        communityData.length > 0 &&
        (taId !== TA_ID_MAP.nsclc || Boolean((communityGate as { data?: unknown }).data))
      ) {
        cohortClassification = "community";
        // Phase 3: community has no cohortScore — membership is the board view,
        // and the frozen normalized_score must never resurface as a number.
        cohortScore = null;
      } else {
        // Not in any per-TA cohort for this TA -> honestly null, NOT the global column.
        cohortClassification = null;
        cohortScore = null;
      }
    }

    const response: HCPDetailResponse = {
      hcp: { ...hcpData, cohort_classification: cohortClassification, cohort_score: cohortScore },
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

async function getRisingCompositeScoreBreakdown(
  hcpId: string,
  taId: string,
): Promise<RisingStarScoreBreakdown | null> {
  // AD 2-axis composite detail. Reads real Emergence / Network Influence from
  // hcp_rising_composite_v1 (global scope = the AD rising feed default). Drops the
  // hcp_network_momentum_v1 read (0% AD coverage); keeps hcp_top_collaborators_v2.
  const { data, error } = await supabase
    .from("hcp_rising_composite_v1")
    .select("hcp_id, rank, rising_composite_score, emergence_pctile, network_influence_pctile")
    .eq("hcp_id", hcpId)
    .eq("therapeutic_area_id", taId)
    .eq("scope_type", "global")
    .maybeSingle();

  if (error) {
    console.error("[getRisingCompositeScoreBreakdown]", error);
    return null;
  }
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;

  const [{ data: sourceHcp }, { data: collaboratorsRaw }] = await Promise.all([
    supabase.from("hcps_v2").select("institution_canonical").eq("id", hcpId).maybeSingle(),
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

    const [establishedRanks, risingCompositeRanks] = await Promise.all([
      supabase
        .from("hcp_established_ranks_v3")
        .select("hcp_id, cohort_score")
        .in("hcp_id", collabIds)
        .eq("therapeutic_area_id", taId)
        .eq("scope_type", "region")
        .eq("scope_value", "US"),
      supabase
        .from("hcp_rising_composite_v1")
        .select("hcp_id, rising_composite_score")
        .in("hcp_id", collabIds)
        .eq("therapeutic_area_id", taId)
        .eq("scope_type", "global"),
    ]);

    const establishedScoreMap = new Map<string, number>();
    (establishedRanks.data || []).forEach((r) => {
      if (r.cohort_score != null) {
        establishedScoreMap.set(String(r.hcp_id), Number(r.cohort_score));
      }
    });

    const risingScoreMap = new Map<string, number>();
    (risingCompositeRanks.data || []).forEach((r) => {
      const rr = r as { hcp_id: string; rising_composite_score: number | null };
      if (rr.rising_composite_score != null) {
        risingScoreMap.set(String(rr.hcp_id), Number(rr.rising_composite_score));
      }
    });

    const allCollaborators: TopCollaborator[] = collaboratorsRaw.map((r) => {
      const id = String(r.collaborator_hcp_id);
      const risingScore = risingScoreMap.get(id);
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

  const composite = Number(row.rising_composite_score ?? 0);
  return {
    hcp_id: String(row.hcp_id),
    model: "composite",
    rising_composite_score: composite,
    emergence_pctile: row.emergence_pctile == null ? null : Number(row.emergence_pctile),
    network_influence_pctile:
      row.network_influence_pctile == null ? null : Number(row.network_influence_pctile),
    rank: Number(row.rank ?? 0),
    // Legacy fields required by the type; unused by the composite render:
    rising_star_percentile: composite,
    momentum_component: 0,
    visibility_component: 0,
    scientific_momentum_percentile: 0,
    network_momentum_percentile: 0,
    scientific_visibility_percentile: 0,
    network_visibility_percentile: 0,
    archetype: "",
    us_rank: null,
    top_collaborators: topCollaborators,
    external_collaborators: externalCollaborators,
  };
}

export async function getRisingStarScoreBreakdown(
  hcpId: string,
  taSlug: string,
): Promise<RisingStarScoreBreakdown | null> {
  if (!hcpId || !taSlug) return null;

  const taId = TA_ID_MAP[taSlug.toLowerCase().trim()];
  if (!taId) return null;

  // AD rising uses the 2-axis composite model; every other TA stays on the legacy path.
  if (taSlug.toLowerCase().trim() === "atopic-dermatitis") {
    return getRisingCompositeScoreBreakdown(hcpId, taId);
  }

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

  // Tokenize on whitespace/commas so a full-name query matches ACROSS both name
  // fields. Each token must appear in first_name OR last_name, AND'd across tokens
  // (chained .or() groups combine with AND in PostgREST). This makes "John Heymach",
  // "Heymach John", "Heymach", and "John" all match {first_name:"John V.",
  // last_name:"Heymach"} — word order and a stored middle initial don't matter
  // because tokens are independent substrings. Previously the whole query was
  // matched per-field, so "John Heymach" matched neither field and returned 0.
  const tokens = sanitized
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 6);
  if (tokens.length === 0) {
    return { inCurrentTA: [], inOtherTAs: [] };
  }

  let queryBuilder = supabase
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
    );

  for (const token of tokens) {
    const pattern = `%${token.replace(/[%_]/g, "\\$&")}%`;
    queryBuilder = queryBuilder.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }

  // Order by cohort_score DESC so the highest-value matches survive the 50-row cap.
  // Previously an unordered .limit(50) returned an arbitrary subset — for a common
  // token like "John" (~1,660 matches) it silently dropped ranked KOLs (e.g. a
  // US-#7 with cohort_score 100). last_name is a deterministic tiebreaker.
  const { data, error } = await queryBuilder
    .order("cohort_score", { ascending: false, nullsFirst: false })
    .order("last_name", { ascending: true })
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

  // Community membership (read layer, G2 cutover): hcps_v2.
  // cohort_classification is denormalized, so a Community-classified match must
  // also hold real membership — community_board_nsclc_v1.qualifies for NSCLC,
  // or any non-NSCLC scores row (other TAs are ungated; hcp_community_scores_v2
  // is the membership base since the ranks view retired). Non-members
  // (misclassified academics, pharma-only qualifiers) are dropped from search
  // results entirely.
  const communityIds = [...byHcpId.values()]
    .filter((h) => h.cohortClassification === "community")
    .map((h) => h.id);
  if (communityIds.length > 0) {
    const [{ data: viewRows }, { data: otherTaRows }] = await Promise.all([
      supabase
        .from("community_board_nsclc_v1")
        .select("hcp_id")
        .in("hcp_id", communityIds)
        .eq("qualifies", true),
      supabase
        .from("hcp_community_scores_v2")
        .select("hcp_id")
        .in("hcp_id", communityIds)
        .neq("therapeutic_area_id", TA_ID_MAP.nsclc),
    ]);
    const qualified = new Set(
      [...(viewRows ?? []), ...(otherTaRows ?? [])].map((r) => String(r.hcp_id)),
    );
    for (const id of communityIds) {
      if (!qualified.has(id)) byHcpId.delete(id);
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
  pubDate: string | null;
  citations: number | null;
  isFirstAuthor: boolean;
  isSeniorAuthor: boolean;
  // Full citation-style byline in author order, including the subject HCP and
  // collective/consortium authors. See lib/authorByline.
  authors: string;
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
      is_senior_author,
      publications_v2!inner (
        id,
        pubmed_id,
        title,
        journal,
        citation_count,
        pub_year,
        pub_date,
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
    is_senior_author: boolean | null;
    publications_v2: {
      id: string;
      pubmed_id: string | null;
      title: string | null;
      journal: string | null;
      citation_count: number | null;
      pub_year: number | null;
      pub_date: string | null;
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
      pubDate: pub.pub_date,
      citations: pub.citation_count,
      isFirstAuthor: row.is_first_author === true,
      isSeniorAuthor: row.is_senior_author === true,
      authors: formatBibliographyByline(pub.pubmed_authorships, row.author_position),
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
    // Display gate (founder-picked from the measured distribution, 2026-07-28):
    // >=10 posts in the 90-day window. Median across plotted individuals was 13;
    // engagement-per-follower over a handful of posts is noise, and an account
    // posting less than ~weekly isn't emerging. Same reasoning as Pulse's
    // 20-count display gate. Leaves 111 of 181 individuals as of the decision.
    .gte("post_count", 10)
    .gte("follower_count", 100)
    .gte("total_engagement", 20)
    .order("engagement_per_follower", { ascending: false })
    .limit(200);

  if (error) {
    return { data: null, error };
  }

  // Individuals only: this is a digital-opinion-leader view — Moffitt and
  // OncLive aren't KOLs. A matched HCP is a person by definition; everything
  // else goes through the shared classifier (lib/voiceClassification.ts).
  const rows = (data as RisingVoiceRow[]).filter(
    (r) =>
      r.hcp_matched ||
      classifyVoice(r.handle, {
        display_name: r.display_name,
        bio: r.bio,
        follower_count: r.follower_count,
      }) === "individual",
  );
  return { data: rows, error: null };
}

export interface ShareOfVoiceRow {
  handle: string;
  display_name: string | null;
  post_count: number;
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
      // Ranked by post volume (rank_within_ta = post_count DESC in the MV), not
      // engagement — share of voice measures sustained presence, not virality.
      .select("handle, display_name, post_count, total_engagement, engagement_pct, rank_within_ta")
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

// Explicit post-nominal credentials — strongest when in the display NAME (a
// person asserting their own degree), also honored in the bio.
const DISPLAY_NAME_CRED = /\b(M\.?D\.?|Ph\.?D\.?|D\.?O\.?|MBBS|Pharm\.?D\.?|FASCO|FACP|FRCP|FRCPC|DPhil|MRCP)\b/i;
// Credential embedded in the handle (@marklewismd, @drrishabhonco) — a weaker
// signal than a display-name credential: it never reaches "likely", only lifts
// an otherwise-unverified account to "possibly".
const HANDLE_CRED = /(^dr[_a-z0-9]|_dr(_|$)|md$|_md$|phd$|_phd$|mbbs$)/i;

function deriveConfidenceTier(
  bio: string | null,
  displayName?: string | null,
  handle?: string | null,
): SocialConfidenceTier {
  // A credential in the display name is an explicit self-asserted credential —
  // "Mark Lewis, MD, FASCO" is a likely HCP regardless of bio wording. This runs
  // before the bio checks because deriveConfidenceTier previously read bio only,
  // grading credentialed clinicians "possibly" on bio vocabulary alone.
  if (displayName && DISPLAY_NAME_CRED.test(displayName)) return "likely_hcp";

  if (!bio) {
    // No bio, but a credential in the handle is a weak positive signal.
    return handle && HANDLE_CRED.test(handle) ? "possibly_hcp" : "unverified";
  }
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

  // Nothing in the bio, but a handle credential still lifts to possibly.
  if (handle && HANDLE_CRED.test(handle)) return "possibly_hcp";

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
  if (row.confidenceTier === "organization") {
    bioFraming = " Institutional account — HCP assessment does not apply.";
  } else if (row.confidenceTier === "likely_hcp") {
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

  // Confidence framing — never write a person-assessment about an institution.
  if (row.confidenceTier === "organization") {
    parts.push(" Institutional account — HCP assessment does not apply.");
  } else if (row.confidenceTier === "likely_hcp") {
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
    // classifyVoice runs FIRST: institutional bios are saturated with clinical
    // vocabulary, so grading them on it produced "POSSIBLY HCP" for Moffitt and
    // ASCO. Organizations never proceed to HCP confidence assessment.
    const isOrganization =
      classifyVoice(handle, {
        display_name: v.display_name ?? null,
        bio: v.bio ?? null,
        follower_count: v.follower_count ?? null,
      }) === "org";
    const confidenceTier: SocialConfidenceTier = isOrganization
      ? "organization"
      : deriveConfidenceTier(bio, v.display_name ?? null, handle);
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
  // Archetype retired 2026-08-05 (classifier deleted, column NULL) and stripped
  // from this path 2026-08-09. The one per-dot mark is the live windows-claim:
  senior_transition: boolean; // rising_board_flags — same badge as the ledgers
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
  momentum_forward: LeaderboardEntry[];
  // MOST BALANCED removed 2026-08-09 ON MERIT, not as a corpse: it was a live
  // calc (smallest |sciMom − netMom| delta) but percentile-DELTA is
  // magnitude-blind — equally-mediocre and equally-strong rank identically —
  // and "balanced" was the last conceptual residue of the retired archetype
  // bucket. (Ruling 2026-08-09; the "reads a dead field" premise was wrong.)
  // Live overlap between the two momentum boards' entries, so the surface can
  // state their separation from data instead of hardcoding it:
  momentum_overlap: number;
}

function landscapeTaSlugToName(taSlug: string): string {
  const map: Record<string, string> = {
    nsclc: "Lung Cancer",
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

  // Chunk the id filter (like the other .in() reads in this file) so a large landscape
  // union — up to thousands of ids — can't overflow the request URL and 400.
  for (const chunk of chunkInstitutionHcpIds(hcpIds)) {
    const { data: hcps } = await supabase
      .from("hcps_v2")
      .select("id, first_name, last_name, institution_normalized")
      .in("id", chunk);

    (hcps ?? []).forEach((h: HcpNameRow) => {
      hcpMap.set(String(h.id), {
        name: `${h.first_name ?? ""} ${h.last_name ?? ""}`.trim() || "Unknown",
        institution: h.institution_normalized,
      });
    });
  }

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
        "scientific_visibility_percentile, network_visibility_percentile",
    )
    .eq("therapeutic_area_id", taId)
    .not("us_rank", "is", null)
    .order("us_rank", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  const rows = data as unknown as Array<Record<string, unknown>>;
  const hcpIds = rows.map((r) => String(r.hcp_id));
  // Name map + the senior-authorship mark (rising_board_flags — the same
  // windows-claim badge the ledgers ship) in parallel; one RPC for ≤100 ids.
  const [hcpMap, flagRows] = await Promise.all([
    fetchHcpNameMap(hcpIds),
    supabase.rpc("rising_board_flags", { p_hcp_ids: hcpIds }),
  ]);
  const seniorById = new Set(
    ((flagRows.data ?? []) as Array<{ hcp_id: string; senior_transition: boolean }>)
      .filter((f) => f.senior_transition)
      .map((f) => f.hcp_id),
  );

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
      senior_transition: seniorById.has(hcpId),
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
    momentum_forward: [],
    momentum_overlap: 0,
  };

  const taId = await resolveLandscapeTaId(taSlug);
  if (!taId) return empty;

  const [
    risingStarsResult,
    sciMomResult,
    netMomResult,
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

  const allIds = new Set<string>();
  for (const row of [
    ...(risingStarsResult.data ?? []),
    ...(sciMomResult.data ?? []),
    ...(netMomResult.data ?? []),
    ...momForwardFiltered.map((x) => x.row),
  ]) {
    allIds.add(String(row.hcp_id));
  }

  // Live separation fact: how many names the two momentum boards share.
  // Computed, never hardcoded — the caption reads from this so it cannot rot.
  const netIds = new Set((netMomResult.data ?? []).map((r) => String(r.hcp_id)));
  const momentumOverlap = (sciMomResult.data ?? []).filter((r) => netIds.has(String(r.hcp_id))).length;

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
    momentum_overlap: momentumOverlap,
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

// ---------------------------------------------------------------------------
// Institutions rising cohort is TA-conditional. NSCLC (and any TA with rows)
// reads the FROZEN hcp_rising_star_ranks_v3 exactly as before. AD has 0 rows
// there and instead lives in hcp_rising_composite_v1 — same scope structure as
// hcp_established_ranks_v3 (scope_type='region'/scope_value='US' for US), with
// `rank` (not us_rank) and `rising_composite_score` (not rising_star_percentile).
// The helpers return rows in the OLD shape so every downstream sort/count/label
// is unchanged. Explicit AD-taId check keeps NSCLC untouched (mirrors how the
// cohort feeds / Telescope branch AD).
const AD_INSTITUTIONS_TA_ID = "9e4139d2-e062-4a58-8728-cdabb2d7dca1";

// Piece 3: which hcps_v2 column identifies an institution's members. AD HCPs
// carry the institution in institution_normalized (institution_canonical is
// ~unpopulated for AD: ~8/447 established, ~2/684 rising); NSCLC uses
// institution_canonical (100% populated) and stays FROZEN. canonical == normalized
// for 99.5% of HCPs that have both, so a single-column .eq is safe and avoids the
// comma-in-.or() PostgREST parsing pitfall for names like "University of
// California, San Francisco".
function institutionColumnForTa(
  taId: string | null,
): "institution_canonical" | "institution_normalized" {
  return taId === AD_INSTITUTIONS_TA_ID ? "institution_normalized" : "institution_canonical";
}

type InstitutionRisingRow = {
  hcp_id: string;
  us_rank: number | null;
  rising_star_percentile: number | null;
};

// Chunked-by-hcpId (institution-scoped) variant — used by summary + leaderboards.
async function fetchInstitutionRisingRowsForHcps(
  taId: string,
  hcpIds: string[],
): Promise<InstitutionRisingRow[]> {
  if (taId === AD_INSTITUTIONS_TA_ID) {
    return fetchInstitutionRowsInChunks<InstitutionRisingRow>(hcpIds, async (chunk) => {
      const { data, error } = await supabase
        .from("hcp_rising_composite_v1")
        .select("hcp_id, rank, rising_composite_score")
        .eq("therapeutic_area_id", taId)
        .eq("scope_type", "region")
        .eq("scope_value", "US")
        .in("hcp_id", chunk)
        .not("rank", "is", null);
      if (error) {
        console.error("[institution rising composite] chunk error:", error);
        return [];
      }
      return (data ?? []).map(
        (r: { hcp_id: string; rank: number | null; rising_composite_score: number | null }) => ({
          hcp_id: String(r.hcp_id),
          us_rank: r.rank != null ? Number(r.rank) : null,
          rising_star_percentile:
            r.rising_composite_score != null ? Number(r.rising_composite_score) : null,
        }),
      );
    });
  }
  return fetchInstitutionRowsInChunks<InstitutionRisingRow>(hcpIds, async (chunk) => {
    const { data, error } = await supabase
      .from("hcp_rising_star_ranks_v3")
      .select("hcp_id, us_rank, rising_star_percentile")
      .eq("therapeutic_area_id", taId)
      .in("hcp_id", chunk)
      .not("us_rank", "is", null);
    if (error) {
      console.error("[institution rising v3] chunk error:", error);
      return [];
    }
    return (data ?? []).map(
      (r: { hcp_id: string; us_rank: number | null; rising_star_percentile: number | null }) => ({
        hcp_id: String(r.hcp_id),
        us_rank: r.us_rank != null ? Number(r.us_rank) : null,
        rising_star_percentile:
          r.rising_star_percentile != null ? Number(r.rising_star_percentile) : null,
      }),
    );
  });
}

// Paginated all-TA variant (no institution pre-filter) — used by the index list
// and the territory panel to build the TA's rising cohort set.
async function fetchAllInstitutionRisingRanksForTa(
  taId: string,
): Promise<Array<{ hcp_id: string; us_rank: number }>> {
  if (taId === AD_INSTITUTIONS_TA_ID) {
    const { data } = await fetchAllPaginated<{ hcp_id: string; rank: number }>(
      async (offset, pageSize) =>
        await supabase
          .from("hcp_rising_composite_v1")
          .select("hcp_id, rank")
          .eq("therapeutic_area_id", taId)
          .eq("scope_type", "region")
          .eq("scope_value", "US")
          .not("rank", "is", null)
          .range(offset, offset + pageSize - 1),
    );
    return (data ?? []).map((r) => ({ hcp_id: String(r.hcp_id), us_rank: Number(r.rank) }));
  }
  const { data } = await fetchAllPaginated<{ hcp_id: string; us_rank: number }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcp_rising_star_ranks_v3")
        .select("hcp_id, us_rank")
        .eq("therapeutic_area_id", taId)
        .not("us_rank", "is", null)
        .range(offset, offset + pageSize - 1),
  );
  return (data ?? []).map((r) => ({ hcp_id: String(r.hcp_id), us_rank: Number(r.us_rank) }));
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

/**
 * Resolve an institution's primary therapeutic area when the caller didn't
 * carry one — the detail route /institution/:slug has NO :ta, so hard-refresh,
 * bookmark, back-nav, and deep-links arrive with no TA context. Mirrors
 * resolvePrimaryTaId (HCP detail): primary = the TA with the most publications
 * across the institution's HCPs (hcp_therapeutic_areas_v2.publication_count),
 * which is populated for every TA membership incl. AD. NEVER defaults to NSCLC
 * — an AD-dominant institution resolves to AD. Deterministic tiebreak on
 * therapeutic_area_id asc. Returns null only if the institution has no TA rows.
 */
export async function resolveInstitutionPrimaryTaId(
  institutionName: string,
): Promise<string | null> {
  // TA-agnostic (we're deriving the TA), so match the institution's HCPs by
  // canonical first (NSCLC path, unchanged), then fall back to normalized so
  // AD-only institutions — whose members carry only institution_normalized —
  // are still found.
  const fetchByColumn = async (column: string) =>
    (
      await fetchAllPaginated<{ id: string }>(
        async (offset, pageSize) =>
          await supabase
            .from("hcps_v2")
            .select("id")
            .eq(column, institutionName)
            .range(offset, offset + pageSize - 1),
      )
    ).data ?? [];

  let hcps = await fetchByColumn("institution_canonical");
  if (hcps.length === 0) hcps = await fetchByColumn("institution_normalized");
  const hcpIds = hcps.map((h) => String(h.id));
  if (hcpIds.length === 0) return null;

  const rows = await fetchInstitutionRowsInChunks<{
    therapeutic_area_id: string;
    publication_count: number | null;
  }>(hcpIds, async (chunk) => {
    const { data, error } = await supabase
      .from("hcp_therapeutic_areas_v2")
      .select("therapeutic_area_id, publication_count")
      .in("hcp_id", chunk);
    if (error) {
      console.warn("resolveInstitutionPrimaryTaId: chunk error", error);
      return [];
    }
    return data ?? [];
  });

  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.therapeutic_area_id) continue;
    const taId = String(r.therapeutic_area_id);
    totals.set(taId, (totals.get(taId) ?? 0) + Number(r.publication_count ?? 0));
  }
  if (totals.size === 0) return null;

  let bestTaId: string | null = null;
  let bestTotal = -Infinity;
  for (const [taId, total] of totals) {
    if (total > bestTotal || (total === bestTotal && bestTaId !== null && taId < bestTaId)) {
      bestTotal = total;
      bestTaId = taId;
    }
  }
  return bestTaId;
}

export async function getInstitutionSummary(
  institutionName: string,
  taSlug: string,
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
        .eq(institutionColumnForTa(taId), institutionName)
        // Stable unique order: unordered .range() pagination overlaps across pages
        // for institutions past one page, duplicating/skipping HCPs (see below).
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1),
  );
  if (!hcps) return null;

  // Dedupe defensively so total_investigators and the chunked rank counts can't
  // double-count a duplicated id; .order("id") above is the real fix.
  const hcpIds = Array.from(new Set((hcps as InstitutionHcpRow[]).map((h) => String(h.id))));
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
    fetchInstitutionRisingRowsForHcps(taId, hcpIds),
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
  taSlug: string,
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
        .eq(institutionColumnForTa(taId), institutionName)
        // Stable unique order so paginated .range() pages cannot overlap (dup HCPs).
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1),
  );
  if (!hcps || hcps.length === 0) return empty;

  // Dedupe defensively (matches getInstitutionCollaborations) so a duplicated id
  // can't fan out across .in() chunks; .order("id") above is the real fix.
  const hcpIds = Array.from(new Set((hcps as InstitutionHcpRow[]).map((h) => String(h.id))));
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
    fetchInstitutionRisingRowsForHcps(taId, hcpIds),
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
  taSlug: string,
): Promise<InstitutionCollaboration[]> {
  // Co-authorship data itself is TA-agnostic; taSlug only selects which column
  // identifies the institution's members (normalized for AD, canonical for NSCLC).
  const institutionColumn = institutionColumnForTa(taIdForApiSlug(taSlug) ?? null);
  const { data: hcps } = await fetchAllPaginated<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcps_v2")
        .select("id, first_name, last_name")
        .eq(institutionColumn, institutionName)
        // Stable unique order so paginated .range() pages cannot overlap (dup HCPs).
        .order("id", { ascending: true })
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
  taSlug: string,
): Promise<ExternalPartnerInstitution[]> {
  // Source-institution membership is TA-conditional (AD → institution_normalized,
  // NSCLC → institution_canonical, frozen), same as the other Institutions sites.
  const sourceColumn = institutionColumnForTa(taIdForApiSlug(taSlug) ?? null);
  const { data: sourceHcps } = await fetchAllPaginated<{ id: string }>(
    async (offset, pageSize) =>
      await supabase
        .from("hcps_v2")
        .select("id")
        .eq(sourceColumn, sourceInstitutionName)
        // Stable unique order so paginated .range() pages cannot overlap (dup HCPs).
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1),
  );
  if (!sourceHcps || sourceHcps.length === 0) return [];

  // Dedupe defensively so a duplicated source id can't double-count collaborations;
  // .order("id") above is the real fix.
  const sourceHcpIds = Array.from(new Set((sourceHcps as InstitutionHcpRow[]).map((h) => String(h.id))));
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
      .select("id, first_name, last_name, institution_canonical, institution_normalized")
      .in("id", chunk);
    (hcps ?? []).forEach((h) => {
      // Name partner institutions by canonical, falling back to normalized so
      // AD-only partner institutions (no canonical) still resolve. NSCLC is
      // unchanged (canonical is populated, so `??` never reaches normalized).
      institutionMap.set(String(h.id), h.institution_canonical ?? h.institution_normalized);
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

  // AD groups by institution_normalized (canonical is ~unpopulated for AD);
  // NSCLC stays on institution_canonical (frozen).
  const institutionColumn = institutionColumnForTa(taId);

  const [rsRows, { data: estRows }] = await Promise.all([
    fetchAllInstitutionRisingRanksForTa(taId),
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
  rsRows.forEach((r) => {
    rsRankMap.set(String(r.hcp_id), Number(r.us_rank));
  });
  const rsHcpIds = new Set(rsRankMap.keys());
  const estHcpIds = new Set((estRows ?? []).map((r) => String(r.hcp_id)));

  const cohortHcpIds = Array.from(new Set([...rsHcpIds, ...estHcpIds]));
  if (cohortHcpIds.length === 0) return [];

  type CohortHcpRow = {
    id: string;
    institution_canonical: string | null;
    institution_normalized: string | null;
    first_name: string | null;
    last_name: string | null;
    nppes_practice_state: string | null;
  };

  const cohortHcps: CohortHcpRow[] = [];
  for (const chunk of chunkInstitutionHcpIds(cohortHcpIds)) {
    const { data: hcps } = await supabase
      .from("hcps_v2")
      .select("id, institution_canonical, institution_normalized, first_name, last_name, nppes_practice_state")
      .in("id", chunk);
    if (hcps) cohortHcps.push(...(hcps as CohortHcpRow[]));
  }

  const cohortInstitutions = new Set<string>();
  for (const h of cohortHcps) {
    const inst = h[institutionColumn];
    if (inst) cohortInstitutions.add(inst);
  }

  const institutionNames = Array.from(cohortInstitutions);
  const totalInvestigatorCounts = new Map<string, number>();

  // Chunk the institution-name filter at 100 (fetchAllPaginated only bounds RESULT rows;
  // the .in() filter URL still carries every name, so a large cohort's institution set —
  // hundreds to 1,000+ — would overflow the request URL and 400). Each chunk is still
  // fully paginated for its result rows.
  const INSTITUTION_NAME_CHUNK_SIZE = 100;
  for (let i = 0; i < institutionNames.length; i += INSTITUTION_NAME_CHUNK_SIZE) {
    const nameChunk = institutionNames.slice(i, i + INSTITUTION_NAME_CHUNK_SIZE);
    const { data: countRows } = await fetchAllPaginated<{
      institution_canonical: string;
      investigator_count: number;
    }>(
      async (offset, pageSize) =>
        await supabase
          .from("institution_investigator_counts")
          .select("institution_canonical, investigator_count")
          .in("institution_canonical", nameChunk)
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
    const inst = h[institutionColumn];
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
    // institution_investigator_counts is keyed by name and covers the canonical
    // (NSCLC) set. AD-only institutions may be absent — fall back to the cohort
    // count so the card shows a real number instead of 0. NSCLC keeps `?? 0`.
    const investigatorCount =
      totalInvestigatorCounts.get(agg.institution) ??
      (institutionColumn === "institution_normalized" ? agg.rs_count + agg.est_count : 0);
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

  // AD identifies institution membership via institution_normalized; NSCLC via
  // institution_canonical (frozen).
  const institutionColumn = institutionColumnForTa(taId);

  const rsRows = await fetchAllInstitutionRisingRanksForTa(taId);

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
  rsRows.forEach((r) => {
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
      .select("id, first_name, last_name, institution_canonical, institution_normalized, nppes_practice_state")
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
        institution: h[institutionColumn],
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
