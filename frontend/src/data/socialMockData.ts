export type SocialConfidenceTier = "likely_hcp" | "possibly_hcp" | "unverified";
export type SocialPlatform = "twitter" | "bluesky";

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
  // Engagement (likes + replies + reposts) summed across recent posts
  engagementCount: number;
  // Pre-computed engagement rate as decimal (0.042 = 4.2%)
  engagementRate: number;
  // Pre-written narrative paragraph (Claude-API-generated in v1.1;
  // hardcoded here for v1.0 demo)
  narrative: string;
  matchedHcpName?: string;
  matchedHcpCohort?: "rising_stars" | "community" | "established";
  matchedHcpScore?: number;
}

const oncologyCandidates: SocialCandidate[] = [
  {
    id: "soc_onc_1",
    handle: "drchoueiri",
    displayName: "Toni K. Choueiri",
    affiliation: "Dana-Farber Cancer Institute",
    specialty: "GU Cancers",
    bio: "Chief GU Cancers @DanaFarber · Prof Medicine @HarvardMed · ⚽ lover · @PanMass 🚲rider.",
    confidenceTier: "likely_hcp",
    platform: "twitter",
    followerCount: 44500,
    postsLast90Days: 42,
    sourceHashtag: "#ASCO26",
    engagementCount: 78400,
    engagementRate: 0.042,
    narrative: "Choueiri's posts attract notably high engagement relative to his follower count, suggesting an actively engaged audience rather than passive followers. Active in #ASCO26 conference conversation and across GU oncology generally. His Twitter activity correlates with his Established cohort presence — recognized in both research and public dialogue.",
    matchedHcpName: "Toni K. Choueiri",
    matchedHcpCohort: "established",
    matchedHcpScore: 91.2,
  },
  {
    id: "soc_onc_2",
    handle: "gimedonc",
    displayName: "Nicholas Hornstein",
    affiliation: "Memorial Sloan Kettering",
    specialty: "GI Oncology",
    bio: "GI medical oncologist. Posting top abstracts, engaging with junior faculty. Active on #ASCO26 and #GIcancer.",
    confidenceTier: "likely_hcp",
    platform: "twitter",
    followerCount: 12400,
    postsLast90Days: 18,
    sourceHashtag: "#ASCO26",
    engagementCount: 9300,
    engagementRate: 0.042,
    narrative: "Hornstein posts at a measured cadence focused on GI oncology developments, with engagement rates indicating a genuinely interested audience. Active in #ASCO26 and #GIcancer conversations. Bio analysis suggests practicing GI medical oncologist.",
  },
  {
    id: "soc_onc_3",
    handle: "drlungonc",
    displayName: "J. Park",
    affiliation: "Institution not specified",
    specialty: "Oncology fellow",
    bio: "Oncology fellow. Lung cancer focus. Sharing learning moments and journal clubs. Active on #LCSM.",
    confidenceTier: "possibly_hcp",
    platform: "twitter",
    followerCount: 3200,
    postsLast90Days: 7,
    sourceHashtag: "#LCSM",
    engagementCount: 1100,
    engagementRate: 0.049,
    narrative: "Park's bio is light on credentialing details but engagement patterns and topic focus suggest a clinical fellow learning publicly. Active on #LCSM. Worth investigating further before engaging — the institutional context isn't visible in public bio.",
  },
  {
    id: "soc_onc_4",
    handle: "mshadman",
    displayName: "Mazyar Shadman",
    affiliation: "Fred Hutchinson Cancer Center",
    specialty: "CLL/Lymphoma",
    bio: "Professor, CLL/Lymphoma. Targeted therapy, CAR-T & BsAbs. Deputy CMO, Medical Director, Cellular Immunotherapy.",
    confidenceTier: "likely_hcp",
    platform: "twitter",
    followerCount: 2990,
    postsLast90Days: 31,
    sourceHashtag: "#hemonc",
    engagementCount: 7800,
    engagementRate: 0.084,
    narrative: "Shadman's engagement rate is exceptionally high — his audience demonstrably listens. Posts focus on CLL/lymphoma with frequent engagement on targeted therapies and CAR-T. Strong overlap with his Established cohort presence. Active across #hemonc.",
    matchedHcpName: "Mazyar Shadman",
    matchedHcpCohort: "established",
    matchedHcpScore: 87.4,
  },
  {
    id: "soc_onc_5",
    handle: "oncoresearcher",
    displayName: "S. Kumar",
    affiliation: "Bio sparse",
    specialty: "Unclear",
    bio: "Cancer research. Sharing thoughts on the field. RTs not endorsements.",
    confidenceTier: "unverified",
    platform: "twitter",
    followerCount: 890,
    postsLast90Days: 4,
    sourceHashtag: "#OncoTwitter",
    engagementCount: 60,
    engagementRate: 0.017,
    narrative: "Bio is sparse and non-specific. Low engagement relative to followers. Insufficient signal to confirm clinical role. Not recommended for engagement until verified.",
  },
  {
    id: "soc_onc_6",
    handle: "drprelajbsky",
    displayName: "Arsela Prelaj",
    affiliation: "Istituto Nazionale dei Tumori",
    specialty: "Medical Oncology",
    bio: "Head of AI-ON-Lab. Medical Oncologist · Bioengineering and AI · Posting on AI in oncology.",
    confidenceTier: "likely_hcp",
    platform: "bluesky",
    followerCount: 1306,
    postsLast90Days: 12,
    sourceHashtag: "#ASCO26",
    engagementCount: 1900,
    engagementRate: 0.121,
    narrative: "Prelaj's engagement rate is striking — over 12% — indicating an audience that actively responds to her content. AI-in-oncology focus is a niche but rapidly emerging topic. Her Bluesky presence is unusual; she's an early-mover on the platform. Crosses with her Rising Stars cohort placement.",
    matchedHcpName: "Arsela Prelaj",
    matchedHcpCohort: "rising_stars",
    matchedHcpScore: 79.3,
  },
];

const hepatologyCandidates: SocialCandidate[] = [
  {
    id: "soc_hep_1",
    handle: "livertx",
    displayName: "M. Patel",
    affiliation: "UPMC Liver Transplant",
    specialty: "Hepatology",
    bio: "Liver transplant hepatologist · MELD score commentary · #livertwitter regular.",
    confidenceTier: "likely_hcp",
    platform: "twitter",
    followerCount: 4800,
    postsLast90Days: 24,
    sourceHashtag: "#livertwitter",
    engagementCount: 5800,
    engagementRate: 0.050,
    narrative: "Patel's #livertwitter activity shows consistent engagement and clinical focus on transplant hepatology. Bio and posting pattern align with practicing transplant hepatologist. Worth tracking around AASLD.",
  },
  {
    id: "soc_hep_2",
    handle: "masldwatch",
    displayName: "R. Schwartz",
    affiliation: "Bio sparse",
    specialty: "Unclear",
    bio: "Following developments in MASLD/NAFLD therapy. Patient advocate adjacent.",
    confidenceTier: "possibly_hcp",
    platform: "twitter",
    followerCount: 1200,
    postsLast90Days: 9,
    sourceHashtag: "#MASLD",
    engagementCount: 750,
    engagementRate: 0.069,
    narrative: "Engagement rate is healthy but bio is ambiguous on clinical role — appears patient-advocate-adjacent. Could be HCP, could be highly informed non-clinical voice. Investigate before engaging.",
  },
  {
    id: "soc_hep_3",
    handle: "hepfellow22",
    displayName: "K. Nguyen",
    affiliation: "GI/Hepatology Fellowship",
    specialty: "Hepatology fellow",
    bio: "GI/Hepatology fellow. Sharing cases and learning points. Views my own.",
    confidenceTier: "likely_hcp",
    platform: "bluesky",
    followerCount: 720,
    postsLast90Days: 6,
    sourceHashtag: "#livertwitter",
    engagementCount: 320,
    engagementRate: 0.074,
    narrative: "Engagement rate is strong for a fellow-stage account. Sharing cases and learning publicly. Good candidate for early-relationship development as career progresses.",
  },
];

const rareDiseaseCandidates: SocialCandidate[] = [
  {
    id: "soc_rd_1",
    handle: "rarediseasedoc",
    displayName: "L. Andersen",
    affiliation: "Children's Hospital of Philadelphia",
    specialty: "Pediatric Genetics",
    bio: "Pediatric geneticist · Rare disease advocate · Sharing case learnings on #raredisease.",
    confidenceTier: "likely_hcp",
    platform: "twitter",
    followerCount: 2400,
    postsLast90Days: 14,
    sourceHashtag: "#raredisease",
    engagementCount: 1900,
    engagementRate: 0.057,
    narrative: "Andersen's posts on pediatric genetics attract engagement from a small but active rare disease community. Bio matches a known children's hospital affiliation. Productive voice in #raredisease.",
  },
  {
    id: "soc_rd_2",
    handle: "raresubspec",
    displayName: "T. Williams",
    affiliation: "Bio mentions clinical work",
    specialty: "Unclear",
    bio: "Working in rare disease research and treatment. Posts on #raredisease and #rarechat.",
    confidenceTier: "possibly_hcp",
    platform: "twitter",
    followerCount: 540,
    postsLast90Days: 3,
    sourceHashtag: "#raredisease",
    engagementCount: 110,
    engagementRate: 0.068,
    narrative: "Bio mentions clinical work without specifics. Engagement rate is healthy but volume is low. Not enough signal yet to confirm or rule out HCP status.",
  },
];

export function getMockSocialCandidates(selectedTA: string): SocialCandidate[] {
  if (selectedTA === "Hepatology") return hepatologyCandidates;
  if (selectedTA === "Rare Disease") return rareDiseaseCandidates;
  return oncologyCandidates;
}
