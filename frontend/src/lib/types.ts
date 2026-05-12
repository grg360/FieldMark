export interface HCP {
  id: string;
  first_name: string;
  last_name: string;
  institution: string;
  country: string;
  therapeutic_area: string;
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

export interface RisingStar extends HCP, HCPScore {}

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
}

export interface TACounts {
  rising_stars: number;
  dark_horses: number;
  verified_dols: number;
  /** HCPs with cohort_classification = community for this TA (discovery count). */
  community_pool?: number;
  /** HCPs with cohort_classification = workhorse for this TA (discovery count). */
  workhorses?: number;
}
