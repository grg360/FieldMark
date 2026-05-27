export interface HCP {
  id: string;
  first_name: string;
  last_name: string;
  institution: string;
  institution_short?: string | null;
  nppes_practice_city?: string | null;
  nppes_practice_state?: string | null;
  nppes_practice_setting?: string | null;
  nppes_practice_address?: string | null;
  nppes_practice_zip?: string | null;
  institution_full?: string | null;
  npi_number?: string | null;
  npi_specialty?: string | null;
  country: string;
  /** TODO: load via hcp_therapeutic_areas join; not stored on hcps. */
  therapeutic_area: string | null;
  narrative?: string | null;
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
  institution_short: string | null;
  country: string | null;
  nppes_practice_state: string | null;
  nppes_practice_city: string | null;
  total_career_pubs: number | null;
  career_first_pub_year: number | null;
}
