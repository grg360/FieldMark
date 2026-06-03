import type { ThemeQuestion } from "../types/researchTheme";

export const THEME_QUESTIONS: ThemeQuestion[] = [
  {
    id: "field_read",
    prompt: "What's your field read on this theme?",
    options: [
      { value: "accelerating", label: "Accelerating" },
      { value: "holding", label: "Holding steady" },
      { value: "fading", label: "Fading" },
      { value: "not_encountered", label: "Not encountered" },
    ],
  },
  {
    id: "resonance",
    prompt: "Where is this resonating?",
    options: [
      { value: "academic", label: "Primarily academic centers" },
      { value: "community", label: "Reaching community oncology" },
      { value: "both", label: "Both" },
      { value: "neither", label: "Neither" },
    ],
  },
  {
    id: "behavior_change",
    prompt: "What behavior change opportunity does this theme present?",
    options: [
      { value: "building_awareness", label: "Building awareness (pre-adoption phase)" },
      { value: "driving_adoption", label: "Driving adoption (evidence exists, uptake lagging)" },
      { value: "reinforcing_practice", label: "Reinforcing practice (established, maintenance phase)" },
      { value: "limited", label: "Limited opportunity (too narrow or too early)" },
    ],
  },
];
