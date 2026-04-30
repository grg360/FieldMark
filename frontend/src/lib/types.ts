export interface HCP {
  id: string;
  first_name: string;
  last_name: string;
  institution: string;
  country: string;
  therapeutic_area: string;
  narrative?: string | null;
  tier?: string | null;
}

export interface HCPScore {
  hcp_id: string;
  composite_score: number;
  pub_velocity: number;
  citation_trajectory: number;
  trial_score: number;
  career_multiplier: number;
  first_pub_year: number;
  stored_pubs: number;
  tier?: string | null;
}

export interface RisingStar extends HCP, HCPScore {}
