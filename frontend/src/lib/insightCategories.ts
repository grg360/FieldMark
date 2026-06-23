export type InsightCategory =
  | "evidence_gap"
  | "message_challenge"
  | "message_reinforcement"
  | "competitor_signal"
  | "clinical_practice_trend"
  | "access_reimbursement"
  | "patient_selection"
  | "safety_observation"
  | "other";

export type InsightStrength = "high" | "medium" | "observation";

export const INSIGHT_CATEGORIES: InsightCategory[] = [
  "evidence_gap",
  "message_challenge",
  "message_reinforcement",
  "competitor_signal",
  "clinical_practice_trend",
  "access_reimbursement",
  "patient_selection",
  "safety_observation",
  "other",
];

export const CATEGORY_LABELS: Record<InsightCategory, string> = {
  evidence_gap: "Evidence Gap",
  message_challenge: "Message Challenge",
  message_reinforcement: "Message Reinforcement",
  competitor_signal: "Competitor Signal",
  clinical_practice_trend: "Clinical Practice Trend",
  access_reimbursement: "Access / Reimbursement",
  patient_selection: "Patient Selection",
  safety_observation: "Safety Observation",
  other: "Other",
};

export const CATEGORY_COLORS: Record<InsightCategory, { bg: string; border: string; fg: string }> = {
  evidence_gap: {
    bg: "rgba(232, 160, 32, 0.10)",
    border: "rgba(232, 160, 32, 0.30)",
    fg: "#E8A020",
  },
  message_challenge: {
    bg: "rgba(232, 112, 78, 0.10)",
    border: "rgba(232, 112, 78, 0.30)",
    fg: "#E8704E",
  },
  message_reinforcement: {
    bg: "rgba(29, 158, 117, 0.10)",
    border: "rgba(29, 158, 117, 0.30)",
    fg: "#1D9E75",
  },
  competitor_signal: {
    bg: "rgba(120, 200, 255, 0.10)",
    border: "rgba(120, 200, 255, 0.30)",
    fg: "#78C8FF",
  },
  clinical_practice_trend: {
    bg: "rgba(155, 109, 255, 0.10)",
    border: "rgba(155, 109, 255, 0.30)",
    fg: "#9B6DFF",
  },
  access_reimbursement: {
    bg: "rgba(208, 175, 110, 0.10)",
    border: "rgba(208, 175, 110, 0.30)",
    fg: "#D0AF6E",
  },
  patient_selection: {
    bg: "rgba(123, 158, 189, 0.10)",
    border: "rgba(123, 158, 189, 0.30)",
    fg: "#7B9EBD",
  },
  safety_observation: {
    bg: "rgba(224, 85, 85, 0.10)",
    border: "rgba(224, 85, 85, 0.30)",
    fg: "#E05555",
  },
  other: {
    bg: "rgba(155, 152, 146, 0.10)",
    border: "rgba(155, 152, 146, 0.30)",
    fg: "#9B9892",
  },
};

export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Uncategorized";
  if (category in CATEGORY_LABELS) return CATEGORY_LABELS[category as InsightCategory];
  return category;
}

export function getCategoryColors(
  category: string | null | undefined,
): { bg: string; border: string; fg: string } {
  if (category && category in CATEGORY_COLORS) {
    return CATEGORY_COLORS[category as InsightCategory];
  }
  return {
    bg: "rgba(107, 106, 101, 0.10)",
    border: "rgba(107, 106, 101, 0.30)",
    fg: "#6B6A65",
  };
}

export function isValidInsightCategory(value: string | null | undefined): value is InsightCategory {
  if (!value) return false;
  return value in CATEGORY_LABELS;
}
