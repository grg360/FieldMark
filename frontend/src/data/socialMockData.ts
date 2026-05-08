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
  },
];

export function getMockSocialCandidates(selectedTA: string): SocialCandidate[] {
  if (selectedTA === "Hepatology") return hepatologyCandidates;
  if (selectedTA === "Rare Disease") return rareDiseaseCandidates;
  return oncologyCandidates;
}
