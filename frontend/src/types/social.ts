export type SocialConfidenceTier = "likely_hcp" | "possibly_hcp" | "unverified";
export type SocialPlatform = "twitter" | "bluesky";
export type DiscoveryMethod = "hashtag" | "reply";

export interface SocialCandidate {
  id: string;
  handle: string;
  displayName: string;
  affiliation: string;
  specialty: string;
  bio: string;
  confidenceTier: SocialConfidenceTier;
  platform: SocialPlatform;
  followerCount: number;
  postsLast90Days: number;
  sourceHashtag: string;
  sourceLabel: string;
  discoveryMethod: DiscoveryMethod;
  discoverySource: string | null;
  engagementCount: number;
  engagementRate: number;
  narrative: string;
  matchedHcpName?: string;
  matchedHcpCohort?: "rising_stars" | "community" | "established";
  matchedHcpScore?: number;
}
