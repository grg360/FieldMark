export interface HCP {
  id: string;
  first_name: string;
  last_name: string;
  institution: string;
  institution_normalized?: string | null;
  nppes_practice_city?: string | null;
  nppes_practice_state?: string | null;
  nppes_practice_setting?: string | null;
  nppes_practice_zip?: string | null;
  institution_full?: string | null;
  npi_number?: string | null;
  npi_specialty?: string | null;
  country: string;
  /** TODO: load via hcp_therapeutic_areas join; not stored on hcps. */
  therapeutic_area: string | null;
  narrative?: string | null;
  /** From hcp_narratives_v2.why_now — single-sentence timing insight for the card insight band. */
  why_now?: string | null;
  engagement_angle?: string | null;
  caution_flags?: string | null;
  signal_strength?: string | null;
  tier?: string | null;
  cohort_classification?: string | null;
  /** hcps.cohort_score — community / workhorse percentile (0–100). */
  cohort_score?: number | null;
  /** From hcp_medicare_summary.total_beneficiaries_3yr_unique_est when loaded. */
  medicare_volume?: number | null;
  /** From hcp_open_payments_summary.distinct_companies_lifetime when loaded. */
  distinct_companies?: number | null;
  /** From hcps.nppes_career_stage_years when loaded. */
  career_years?: number | null;
  /** From hcp_open_payments_summary.total_payments_lifetime when loaded. */
  open_payments_lifetime?: number | null;
  /** From hcps.total_career_pubs when loaded (e.g. Established PUBS pill). */
  total_career_pubs?: number | null;
  /** Established v3 subscore percentiles (0–100). */
  scientific_influence_pctile?: number | null;
  network_influence_pctile?: number | null;
  pharma_engagement_pctile?: number | null;
  /** Lifetime citations from OpenAlex (most recent snapshot). */
  total_citations?: number | null;
  /** h-index from OpenAlex (most recent snapshot). */
  h_index?: number | null;
  /** Lifetime works count from OpenAlex. */
  works_count?: number | null;
  paymentsByYear?: {
    py2022?: number | null;
    py2023?: number | null;
    py2024?: number | null;
  } | null;
  beneficiariesByYear?: {
    y2021?: number | null;
    y2022?: number | null;
    y2023?: number | null;
  } | null;
  engagementMix?: {
    speakerBureau?: number | null;
    consulting?: number | null;
    honoraria?: number | null;
    education?: number | null;
    royalty?: number | null;
    foodBeverage?: number | null;
    travelLodging?: number | null;
  } | null;
}

export interface HCPScore {
  hcp_id: string;
  composite_score: number;
  normalized_score: number;
  pub_velocity: number;
  citation_trajectory: number;
  pubVel?: string | null;
  firstPubYear?: number | null;
  trial_score: number;
  citTraj: number | null;
  trialScore: number | null;
  career_multiplier: number;
  first_pub_year: number;
  stored_pubs: number;
  tier?: string | null;
  cohort_classification?: string | null;
}

export interface RisingStar extends HCP, HCPScore {
  /** Precomputed rank within scope. Set by rank-aware queries. */
  rank?: number;
  /** Percentile within scope (0-100). */
  percentile?: number;
  /** Total HCPs in scope (denominator for "rank #X of Y"). */
  scope_size?: number;
  /** Display label for rank stack (e.g. US, GLOBAL). */
  scope?: string;
  global_rank?: number | null;
  /** Lifetime citations from OpenAlex (card display). */
  citedByCount?: number | null;
  /** h-index from OpenAlex (detail page; not shown on cards). */
  hIndex?: number | null;
  /** Lifetime works count from OpenAlex (detail page; not shown on cards). */
  worksCount?: number | null;
  rising_star_percentile?: number | null;
  momentum_component?: number | null;
  visibility_component?: number | null;
  scientific_momentum_percentile?: number | null;
  network_momentum_percentile?: number | null;
  scientific_visibility_percentile?: number | null;
  network_visibility_percentile?: number | null;
  archetype?: string | null;
  us_rank?: number | null;
  scope_rank?: number | null;
  // AD rising 2-axis composite model (rising_model === "composite").
  emergence_pctile?: number | null;
  rising_composite_score?: number | null;
  rising_model?: "composite" | "legacy";
  /** AD rising_composite only: institution matched the pharma-industry pattern
   *  (kept, not filtered — surfaced as an "Industry" badge on the card). */
  is_industry_affiliated?: boolean;
}

/** Result payload from cohort feed API functions (getEstablished, getCommunity, getRisingStars). */
export interface CohortFeedResult {
  rows: RisingStar[];
  total: number;
  emptyReason?: string;
}

/** Per-drug Open Payments row for Drug Engagement detail section. */
export interface DrugConstellationEntry {
  drug_name: string;
  manufacturer_name: string;
  total_amount_usd: number;
  payment_count: number;
  most_recent_payment_date: string;
  year_over_year_trend_pct: number | null;
  payments_by_quarter?: Record<string, number> | null;
}

export interface SocialUser {
  id: string;
  platform: "twitter" | "bluesky";
  handle: string;
  display_name: string | null;
  bio: string | null;
  follower_count: number | null;
  verified: boolean;
  profile_url: string | null;
}

export interface LatestPost {
  platform: string;
  handle: string;
  post_text: string | null;
  posted_at: string;
  engagement_likes: number;
  engagement_replies: number;
  engagement_reposts: number;
  engagement_quotes: number;
  hashtags: string[];
  captured_via_query: string | null;
}

export interface VerifiedDOL {
  hcp_id: string;
  first_name: string;
  last_name: string;
  institution: string | null;
  country: string | null;
  therapeutic_area: string;
  total_career_pubs: number | null;
  match_confidence: "high" | "medium" | "low";
  social_user: SocialUser;
  is_asco_active: boolean;
}

export interface TACounts {
  rising_stars: number;       // threshold-selected (tier='rising_star')
  rising_stars_pool?: number; // full candidate pool (all scored, regardless of tier)
  dark_horses: number;        // DEPRECATED — always 0
  verified_dols: number;
  community_pool: number;
  workhorses: number;         // DEPRECATED — always 0
  established: number;
  total_hcps: number;
}

/**
 * FilterState - the filter object passed into rank-aware API functions.
 *
 * Today only therapeuticArea (required) and region (optional, defaults to US)
 * are consumed. Future filter dimensions land here:
 *   - country: optional override of region (e.g., "DE" for Germany-only)
 *   - careerStage: 'early' | 'mid' | 'established'
 *   - pharmaEngagementBand: 'none' | 'light' | 'moderate' | 'heavy'
 *   - practiceSetting: 'academic' | 'hospital' | 'community' | 'solo'
 *   - specialty: NPPES taxonomy codes
 *   - trialActive: boolean
 *
 * The shape is intentionally permissive: callers populate what they have,
 * resolveFilterScope() decides what makes it into the actual query.
 */
export interface FilterState {
  therapeuticArea: string;
  region?: string;       // RegionKey from regions.ts; defaults to "US" if undefined
  country?: string;      // ISO 3166-1 alpha-2 country code; overrides region if both set
  scope?: "global" | "regional"; // When 'global', returns unfiltered counts. Defaults to 'regional'.
  states?: string[];     // US state codes ["NY", "NJ", ...], applied only when region includes "US"
  national?: boolean;    // true = no state filter (all US, incl null practice_state + DC). Default true.
  themeIds?: string[];   // uuid array of canonical_id values; empty = no theme filter
  taId?: string;         // Optional explicit ta_id from indication config. When set, the
                         // cohort fetchers use it directly; undefined => TA_ID_MAP[slug] fallback.
  // Future filters land here. Adding them does NOT require api.ts changes
  // until the resolver/query layer is taught to consume them.
}

/**
 * RankRow - a single row from hcp_score_ranks_v2 joined to HCP details.
 *
 * Returned by rank-aware list queries (getRisingStars, getEstablished, getCommunity).
 * The frontend uses rank + percentile + scope_size for rank-forward display:
 *   "Rank #3 of 142 (98th percentile)"
 */
export interface RankRow {
  hcp_id: string;
  therapeutic_area_id: string;
  cohort: "rising" | "established" | "community";
  scope_type: "country" | "region" | "global";
  scope_value: string | null;
  rank: number;
  percentile: number;
  scope_size: number;
  score_at_rank: number;
  // HCP detail fields, joined at query time
  first_name: string;
  last_name: string;
  institution: string | null;
  institution_normalized: string | null;
  country: string | null;
  nppes_practice_state: string | null;
  nppes_practice_city: string | null;
  total_career_pubs: number | null;
  career_first_pub_year: number | null;
}

export interface HCPDetailResponse {
  hcp: Record<string, any>;
  score: Record<string, any> | null;
  rank: Record<string, any> | null;
  narrative: {
    narrative_text: string | null;
    why_now: string | null;
    engagement_angle: string | null;
    caution_flags: string | null;
    signal_strength: string | null;
    generated_at: string | null;
  } | null;
  medicare: Record<string, any> | null;
  openPayments: Record<string, any> | null;
  publications: Array<Record<string, unknown>>;
  trials: Array<Record<string, unknown>>;
  therapeuticArea: string;
  scope: { type: "country" | "region" | "global"; value: string | null };
  authorMetrics: Record<string, any> | null;
}

