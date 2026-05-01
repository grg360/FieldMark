export interface HCP {
  id: number;
  name: string;
  institution: string;
  specialty: string;
  score: number;
  normalizedScore?: number;
  firstPubYear?: number;
  explanation: string;
  pubVel: string;
  citTraj: number | string | null;
  trialScore?: number | null;
  trials?: string;
  country?: string | null;
  narrative?: string | null;
  tier?: string | null;
  hcp_id?: string;
}

export const hcpData: HCP[] = [
  {
    id: 1,
    name: "Dr. Priya Nair",
    institution: "Boston Children's Hospital",
    specialty: "Rare Disease",
    score: 87.4,
    explanation:
      "Publication velocity tripled in 18 months with 3 first-author papers in NEJM and Nature Medicine.",
    pubVel: "3.2x",
    citTraj: "+41%",
    trials: "4 active",
  },
  {
    id: 2,
    name: "Dr. Marcus Webb",
    institution: "Stanford Medicine",
    specialty: "Rare Disease",
    score: 82.1,
    explanation:
      "Emerging as primary investigator on 2 Phase III trials in lysosomal storage disorders with no prior trial history 3 years ago.",
    pubVel: "2.1x",
    citTraj: "+29%",
    trials: "2 active",
  },
  {
    id: 3,
    name: "Dr. Asha Delacroix",
    institution: "Mayo Clinic",
    specialty: "Rare Disease",
    score: 79.8,
    explanation:
      "Citation trajectory accelerating post-2022 with work concentrated in ultra-rare metabolic conditions underserved by existing KOL databases.",
    pubVel: "1.8x",
    citTraj: "+67%",
    trials: "1 active",
  },
  {
    id: 4,
    name: "Dr. Jin-Ho Park",
    institution: "UCSF",
    specialty: "Rare Disease",
    score: 76.3,
    explanation:
      "DOL signal detected: 4,200 followers on X with peer-level engagement on rare disease threads outpacing established KOLs in same specialty.",
    pubVel: "1.4x",
    citTraj: "+18%",
    trials: "3 active",
  },
  {
    id: 5,
    name: "Dr. Fatima Al-Rashid",
    institution: "Johns Hopkins",
    specialty: "Rare Disease",
    score: 71.9,
    explanation:
      "First-author on landmark case series that triggered 3 independent replication studies within 12 months of publication.",
    pubVel: "1.1x",
    citTraj: "+22%",
    trials: "1 active",
  },
];

export const oncologyData: HCP[] = [
  {
    id: 101,
    name: "Dr. Samuel Okonkwo",
    institution: "MD Anderson",
    specialty: "Oncology",
    score: 91.2,
    explanation:
      "First investigator to combine checkpoint inhibitor with CAR-T in a Phase II trial, generating 3x citation velocity in 14 months.",
    pubVel: "4.1x",
    citTraj: "+58%",
    trials: "6 active",
  },
  {
    id: 102,
    name: "Dr. Mei-Ling Chen",
    institution: "Dana-Farber",
    specialty: "Oncology",
    score: 85.7,
    explanation:
      "NSCLC publication output doubled post-2022 with breakthrough first-author paper cited 340 times within 18 months.",
    pubVel: "2.8x",
    citTraj: "+71%",
    trials: "3 active",
  },
  {
    id: 103,
    name: "Dr. Ravi Subramaniam",
    institution: "Memorial Sloan Kettering",
    specialty: "Oncology",
    score: 80.4,
    explanation:
      "Emerging DOL in CAR-T space — peer-level engagement on X outpacing established KOLs with 6,100 followers in specialty.",
    pubVel: "2.2x",
    citTraj: "+44%",
    trials: "4 active",
  },
  {
    id: 104,
    name: "Dr. Ingrid Larsson",
    institution: "Mayo Clinic",
    specialty: "Oncology",
    score: 74.8,
    explanation:
      "AML trial activity tripled in 18 months — now PI on 2 Phase III studies with no prior Phase III history.",
    pubVel: "1.6x",
    citTraj: "+29%",
    trials: "5 active",
  },
  {
    id: 105,
    name: "Dr. Omar Khalil",
    institution: "UCLA",
    specialty: "Oncology",
    score: 69.3,
    explanation:
      "Citation trajectory driven by single landmark paper in melanoma immunotherapy now referenced in 4 independent clinical guidelines.",
    pubVel: "1.3x",
    citTraj: "+37%",
    trials: "2 active",
  },
];

export const immunologyData: HCP[] = [
  {
    id: 201,
    name: "Dr. Sofia Reinholt",
    institution: "Mayo Clinic",
    specialty: "Immunology",
    score: 88.6,
    explanation:
      "Lupus publication velocity accelerating with 4 first-author papers in Nature Immunology in 24 months — unprecedented for career stage.",
    pubVel: "3.7x",
    citTraj: "+62%",
    trials: "3 active",
  },
  {
    id: 202,
    name: "Dr. James Oduya",
    institution: "Johns Hopkins",
    specialty: "Immunology",
    score: 83.2,
    explanation:
      "Crohn's disease trial activity emerging — PI on first investigator-initiated Phase II trial at career year 6, 3 years ahead of peer cohort.",
    pubVel: "2.4x",
    citTraj: "+48%",
    trials: "2 active",
  },
  {
    id: 203,
    name: "Dr. Yuki Tanaka",
    institution: "Stanford Medicine",
    specialty: "Immunology",
    score: 77.9,
    explanation:
      "CIDP researcher with rapid citation growth following case series that reshaped diagnostic criteria in 3 international guidelines.",
    pubVel: "1.9x",
    citTraj: "+55%",
    trials: "1 active",
  },
  {
    id: 204,
    name: "Dr. Amara Diallo",
    institution: "UCSF",
    specialty: "Immunology",
    score: 72.1,
    explanation:
      "DOL signal strong — myasthenia gravis thread engagement on X averaging 4x peer benchmark with verified specialist audience.",
    pubVel: "1.5x",
    citTraj: "+31%",
    trials: "2 active",
  },
  {
    id: 205,
    name: "Dr. Lena Bergström",
    institution: "Mass General",
    specialty: "Immunology",
    score: 67.8,
    explanation:
      "Sjögren's syndrome early career researcher with citation trajectory suggesting field recognition ahead of publication volume.",
    pubVel: "1.2x",
    citTraj: "+26%",
    trials: "1 active",
  },
];

export const hepatologyData: HCP[] = [
  {
    id: 301,
    name: "Dr. Wei Zhang",
    institution: "UCSF",
    specialty: "Hepatology",
    score: 86.3,
    explanation:
      "PBC researcher with publication velocity tripling post-2023 — first-author on mechanism paper now driving 3 follow-on investigator-initiated trials.",
    pubVel: "3.4x",
    citTraj: "+53%",
    trials: "4 active",
  },
  {
    id: 302,
    name: "Dr. Chioma Obi",
    institution: "Cleveland Clinic",
    specialty: "Hepatology",
    score: 81.7,
    explanation:
      "NASH field recognizing rapidly — citation trajectory +67% in 18 months following landmark biopsy outcomes paper in NEJM.",
    pubVel: "2.6x",
    citTraj: "+67%",
    trials: "3 active",
  },
  {
    id: 303,
    name: "Dr. Anders Lindqvist",
    institution: "Mayo Clinic",
    specialty: "Hepatology",
    score: 76.2,
    explanation:
      "PSC investigator emerging as PI on Phase II trial — first trial leadership role at career year 5.",
    pubVel: "1.8x",
    citTraj: "+39%",
    trials: "2 active",
  },
  {
    id: 304,
    name: "Dr. Priya Mehta",
    institution: "Northwestern",
    specialty: "Hepatology",
    score: 70.9,
    explanation:
      "AIH publication output doubling year-over-year with strong peer nomination signal from 3 independent MSL contributions in FieldMark.",
    pubVel: "1.4x",
    citTraj: "+28%",
    trials: "1 active",
  },
  {
    id: 305,
    name: "Dr. Carlos Rivera",
    institution: "Baylor",
    specialty: "Hepatology",
    score: 65.4,
    explanation:
      "HCC early signal — DOL presence growing in hepatology community with citation growth outpacing publication volume, suggesting quality over quantity pattern.",
    pubVel: "1.1x",
    citTraj: "+22%",
    trials: "2 active",
  },
];

export const hcpDataByTA: Record<string, HCP[]> = {
  "Rare Disease": hcpData,
  Oncology: oncologyData,
  Immunology: immunologyData,
  Hepatology: hepatologyData,
};
