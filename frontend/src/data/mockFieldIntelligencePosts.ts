export type FIChannel = "NSCLC" | "RareDisease" | "Hepatology" | "Immunology";

export interface FIReply {
  id: string;
  handle: string;
  body: string;
  timestamp: string;
}

export interface FIPost {
  id: string;
  channel: FIChannel;
  handle: string;
  title: string;
  body: string;
  timestamp: string;
  replyCount: number;
  replies: FIReply[];
  indication?: string;
}

export const CHANNEL_LABELS: Record<FIChannel, string> = {
  NSCLC: "NSCLC",
  RareDisease: "Rare Disease",
  Hepatology: "Hepatology",
  Immunology: "Immunology",
};

export const CHANNEL_TILES: {
  channel: FIChannel;
  description: string;
  activeThreads: number;
  lastActivity: string;
}[] = [
  {
    channel: "NSCLC",
    description: "Discussion among MSLs covering non-small cell lung cancer",
    activeThreads: 12,
    lastActivity: "Last post: 2 hours ago",
  },
  {
    channel: "RareDisease",
    description: "Discussion among MSLs covering rare and orphan conditions",
    activeThreads: 9,
    lastActivity: "Last post: 5 hours ago",
  },
  {
    channel: "Hepatology",
    description: "Discussion among MSLs covering liver disease and metabolic hepatology",
    activeThreads: 11,
    lastActivity: "Last post: yesterday",
  },
  {
    channel: "Immunology",
    description: "Discussion among MSLs covering immunology and inflammatory disease",
    activeThreads: 8,
    lastActivity: "Last post: 3 days ago",
  },
];

export const MOCK_FIELD_INTELLIGENCE_POSTS: FIPost[] = [
  {
    id: "fi-1",
    channel: "NSCLC",
    handle: "thoracic_msl_47",
    title: "ASCO 2026 takeaway — combination regimen subgroup in squamous disease",
    body: "The squamous-arm signal in the latest combination readout looked stronger than I expected, especially in the biomarker-negative subset. Curious whether others read that as a real shift in practice patterns or trial-selection artifact. Anyone seeing community sites move earlier on IO-chemo sequencing?",
    timestamp: "2 hours ago",
    replyCount: 6,
    replies: [
      {
        id: "fi-1-r1",
        handle: "lung_data_22",
        body: "We heard similar from two large community groups — more willingness to treat squamous upfront with combo, but uptake still uneven outside academic hubs.",
        timestamp: "1 hour ago",
      },
      {
        id: "fi-1-r2",
        handle: "thoracic_msl_47",
        body: "That matches my field read. The biomarker story still feels like the dividing line in prescriber confidence.",
        timestamp: "45 min ago",
      },
      {
        id: "fi-1-r3",
        handle: "io_pathways_09",
        body: "Any sense whether pathology turnaround times are still the bottleneck for biomarker-directed decisions in community?",
        timestamp: "30 min ago",
      },
    ],
  },
  {
    id: "fi-2",
    channel: "NSCLC",
    handle: "kras_watch",
    title: "KRAS G12C resistance patterns post-progression",
    body: "Trying to make sense of emerging resistance mechanisms in the post-progression cohort — off-target bypass vs secondary mutations. What's the field's read on whether re-biopsy is becoming standard before second-line switches?",
    timestamp: "5 hours ago",
    replyCount: 4,
    replies: [
      {
        id: "fi-2-r1",
        handle: "precision_onc_18",
        body: "Re-biopsy still inconsistent in community, but academic centers are pushing harder when liquid options are available.",
        timestamp: "4 hours ago",
      },
      {
        id: "fi-2-r2",
        handle: "kras_watch",
        body: "Helpful — we're seeing the same split. Education on liquid timing might matter more than new data at this point.",
        timestamp: "3 hours ago",
      },
    ],
  },
  {
    id: "fi-3",
    channel: "NSCLC",
    handle: "stage_iv_flow",
    title: "First-line sequencing in PD-L1 low expressors",
    body: "Debate in our region on chemo-IO vs IO maintenance strategies when PD-L1 is 1–49%. Prescribers want simpler pathways; payers want biomarker clarity. How are others framing the tradeoff in MSL conversations?",
    timestamp: "yesterday",
    replyCount: 3,
    replies: [
      {
        id: "fi-3-r1",
        handle: "access_msl_31",
        body: "We lean on trial design differences and toxicity profiles rather than head-to-head claims — keeps the discussion observational.",
        timestamp: "yesterday",
      },
    ],
  },
  {
    id: "fi-4",
    channel: "RareDisease",
    handle: "orphan_nav_12",
    title: "Newborn screening expansion — engagement with pediatric non-academic sites",
    body: "With expanded screening for a lysosomal storage condition, pediatric specialists at non-academic centers are getting more referrals than capacity allows. How is your team thinking about engagement strategy without over-promising support resources?",
    timestamp: "3 hours ago",
    replyCount: 5,
    replies: [
      {
        id: "fi-4-r1",
        handle: "ped_rare_03",
        body: "We're prioritizing nurse educator pathways and referral logistics playbooks — less science-heavy, more operational.",
        timestamp: "2 hours ago",
      },
      {
        id: "fi-4-r2",
        handle: "orphan_nav_12",
        body: "Same here. MSL time is going to coordination calls more than KOL science this quarter.",
        timestamp: "90 min ago",
      },
    ],
  },
  {
    id: "fi-5",
    channel: "RareDisease",
    handle: "gene_tx_observer",
    title: "Gene therapy delivery at community sites — comfort level",
    body: "Anyone tracking whether community hospitals are getting comfortable with in-house administration vs hub-and-spoke models? Hearing mixed signals on nursing competency requirements.",
    timestamp: "yesterday",
    replyCount: 4,
    replies: [
      {
        id: "fi-5-r1",
        handle: "site_readiness_07",
        body: "Hub-and-spoke still dominant in our territory. Two sites paused onboarding citing pharmacy workflow gaps.",
        timestamp: "yesterday",
      },
    ],
  },
  {
    id: "fi-6",
    channel: "RareDisease",
    handle: "fabry_flow_21",
    title: "Transition clinics for adolescent rare disease patients",
    body: "Pediatric-to-adult handoff remains messy for metabolic conditions. Are MSLs in your org involved in transition protocol discussions, or is that strictly medical affairs?",
    timestamp: "2 days ago",
    replyCount: 2,
    replies: [
      {
        id: "fi-6-r1",
        handle: "transition_msl",
        body: "We're invited to transition summits but stay in a scientific support role — no care-path ownership.",
        timestamp: "2 days ago",
      },
    ],
  },
  {
    id: "fi-7",
    channel: "Hepatology",
    handle: "masld_signal",
    title: "AASLD preview — MASH biomarker validation",
    body: "The biomarker validation work looked promising on stage, but clinical implications still feel uncertain to me. Are others planning to lead with non-invasive testing narratives or wait for harder outcomes data?",
    timestamp: "4 hours ago",
    replyCount: 5,
    replies: [
      {
        id: "fi-7-r1",
        handle: "liver_outcomes_14",
        body: "Cautious approach — hepatologists want outcome linkage before changing surveillance intervals.",
        timestamp: "3 hours ago",
      },
      {
        id: "fi-7-r2",
        handle: "masld_signal",
        body: "Aligned. We're emphasizing what the biomarker does and doesn't predict.",
        timestamp: "2 hours ago",
      },
    ],
  },
  {
    id: "fi-8",
    channel: "Hepatology",
    handle: "pbc_landscape",
    title: "PBC second-line — patient flow vs prescriber adoption",
    body: "Second-line landscape getting interesting. Where is everyone seeing patient flow vs actual prescriber adoption? Referral bottlenecks vs comfort with new mechanisms?",
    timestamp: "yesterday",
    replyCount: 3,
    replies: [
      {
        id: "fi-8-r1",
        handle: "cholestasis_msl",
        body: "Adoption lagging in community GI — hepatology centers moving faster.",
        timestamp: "yesterday",
      },
    ],
  },
  {
    id: "fi-9",
    channel: "Hepatology",
    handle: "nash_access_05",
    title: "NASH patient identification in primary care networks",
    body: "Primary care is identifying more at-risk patients, but hepatology capacity hasn't scaled. How are MSL teams supporting identification without crossing into treatment recommendations?",
    timestamp: "3 days ago",
    replyCount: 2,
    replies: [],
  },
  {
    id: "fi-10",
    channel: "Immunology",
    handle: "jak_safety_msl",
    title: "JAK inhibitor cardiovascular conversations with prescribers",
    body: "Safety signal discussions are resurfacing in our immunology accounts. How is your TA team handling the cardiovascular risk framing with rheumatology vs derm prescribers?",
    timestamp: "6 hours ago",
    replyCount: 6,
    replies: [
      {
        id: "fi-10-r1",
        handle: "rheum_field_33",
        body: "Rheum wants class-wide context; derm wants molecule-specific differentiation. Same data, different framing.",
        timestamp: "5 hours ago",
      },
      {
        id: "fi-10-r2",
        handle: "jak_safety_msl",
        body: "Exactly our challenge. We built separate leave-behind structures per specialty.",
        timestamp: "4 hours ago",
      },
    ],
  },
  {
    id: "fi-11",
    channel: "Immunology",
    handle: "lupus_path_08",
    title: "SLE treat-to-target adoption in community rheumatology",
    body: "Academic centers talk treat-to-target consistently; community adoption still patchy. Are you measuring engagement success by protocol awareness or by actual ordering shifts?",
    timestamp: "yesterday",
    replyCount: 3,
    replies: [
      {
        id: "fi-11-r1",
        handle: "outcomes_msl_19",
        body: "We track awareness first — ordering shifts are too noisy quarter-to-quarter.",
        timestamp: "yesterday",
      },
    ],
  },
  {
    id: "fi-12",
    channel: "NSCLC",
    handle: "ctdna_practice",
    title: "ctDNA monitoring — utility vs workflow burden",
    body: "Oncology groups are experimenting with ctDNA monitoring post-adjuvant therapy. Field sentiment seems split on whether it changes decisions or just adds anxiety. What's your read?",
    timestamp: "3 days ago",
    replyCount: 2,
    replies: [
      {
        id: "fi-12-r1",
        handle: "monitoring_msl",
        body: "Early adopters are academic; community wants clearer action thresholds.",
        timestamp: "3 days ago",
      },
    ],
  },
  {
    id: "fi-13",
    channel: "Immunology",
    handle: "ibd_bridge_16",
    title: "IBD–rheum overlap practices and MSL routing",
    body: "Several accounts have combined IBD–rheum practices with unclear MSL ownership. How are you handling scientific exchange without duplicating visits?",
    timestamp: "2 days ago",
    replyCount: 4,
    replies: [
      {
        id: "fi-13-r1",
        handle: "coordination_lead",
        body: "Joint visit calendar with a single scientific narrative — works if both TAs agree on boundaries.",
        timestamp: "2 days ago",
      },
    ],
  },
  {
    id: "fi-14",
    channel: "RareDisease",
    handle: "carrier_screen_02",
    title: "Carrier screening expansion — genetic counselor capacity",
    body: "Expanded carrier programs are stressing genetic counselor bandwidth. MSLs getting pulled into basic education requests. Anyone formalizing handoff to medical information?",
    timestamp: "4 days ago",
    replyCount: 1,
    replies: [],
  },
  {
    id: "fi-15",
    channel: "Hepatology",
    handle: "hcc_systems_11",
    title: "HCC multidisciplinary tumor board — MSL role boundaries",
    body: "Tumor boards are requesting more data on sequencing in advanced HCC. Where do you draw the line between scientific exchange and treatment pathway influence?",
    timestamp: "5 days ago",
    replyCount: 3,
    replies: [
      {
        id: "fi-15-r1",
        handle: "hep_onc_bridge",
        body: "We stick to trial evidence and safety — no pathway algorithms in the room.",
        timestamp: "5 days ago",
      },
    ],
  },
];

export function getPostById(id: string): FIPost | undefined {
  return MOCK_FIELD_INTELLIGENCE_POSTS.find((p) => p.id === id);
}

export function therapeuticAreaToChannel(ta: string): FIChannel | null {
  switch (ta) {
    case "Oncology":
      return "NSCLC";
    case "Rare Disease":
      return "RareDisease";
    case "Hepatology":
      return "Hepatology";
    case "Immunology":
      return "Immunology";
    default:
      return null;
  }
}

export function channelDisplayName(channel: FIChannel): string {
  if (channel === "RareDisease") return "Rare Disease";
  return channel;
}

export function getRecentPosts(limit = 7, channel?: FIChannel): FIPost[] {
  const list = channel
    ? MOCK_FIELD_INTELLIGENCE_POSTS.filter((p) => p.channel === channel)
    : [...MOCK_FIELD_INTELLIGENCE_POSTS];
  return list.slice(0, limit);
}
