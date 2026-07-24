// Scientific Pulse — hardcoded NSCLC payload for the prototype.
//
// This stands in for the output of sql/04_pulse_payload.sql. The persisted
// snapshot table does not exist yet and the query shape may still change, so we
// do NOT build API plumbing — this typed constant is the single source of data.
//
// It is a fixture (a plausible query result), NOT fabricated UI content: the
// components must never render anything not present here. Where a real query
// would return null (e.g. a theme with no prior baseline), this fixture returns
// null too, so the null-handling paths are exercised.
//
// Numbers are representative of the real corpus: themes range from ~175 pubs
// (EGFR) down to <10 (ADC, KRAS G12C). Four themes sit below the 20-count gate
// and between them cover all four qualitative labels. `events` is empty — the
// realistic default (≈80 guidelines exist across the entire 30-year corpus).

import type { PulsePayload } from "./pulse";

export const NSCLC_PULSE: PulsePayload = {
  therapeutic_area: "Non-Small Cell Lung Cancer",
  generated_at: "2026-07-24T13:00:00Z",
  window: {
    current_start: "2026-03-10",
    current_end: "2026-06-08",
    prior_start: "2025-12-10",
    prior_end: "2026-03-09",
    lag_days: 45,
    window_days: 90,
  },
  totals: {
    // Primary-theme publications in each window (the snapshot denominator).
    current_pubs: 519,
    prior_pubs: 490,
  },
  themes: [
    {
      name: "EGFR-mutant treatment",
      description:
        "Osimertinib and next-generation EGFR TKIs across lines of therapy, including resistance mechanisms and combination strategies in EGFR-mutant advanced disease.",
      cur_pubs: 175,
      prior_pubs: 168,
      lifetime_pubs: 4200,
      cur_share: 33.7,
      prior_share: 34.3,
      reviews: 22,
      trials: 41,
      commentary: 9,
      guidance: 2,
    },
    {
      name: "Immune checkpoint inhibition",
      description:
        "PD-1/PD-L1 monotherapy and combinations, biomarker selection, and immune-related toxicity management across metastatic and consolidation settings.",
      cur_pubs: 142,
      prior_pubs: 151,
      lifetime_pubs: 5100,
      cur_share: 27.4,
      prior_share: 30.8,
      reviews: 25,
      trials: 33,
      commentary: 12,
      guidance: 3,
    },
    {
      name: "ALK / ROS1 rearrangement",
      description:
        "Second- and third-generation ALK/ROS1 inhibitors, CNS activity, and sequencing after resistance in fusion-positive disease.",
      cur_pubs: 58,
      prior_pubs: 54,
      lifetime_pubs: 1620,
      cur_share: 11.2,
      prior_share: 11.0,
      reviews: 8,
      trials: 15,
      commentary: 3,
      guidance: 0,
    },
    {
      name: "Perioperative & neoadjuvant therapy",
      description:
        "Neoadjuvant and perioperative chemo-immunotherapy in resectable disease, pathologic response endpoints, and surgical outcome data.",
      cur_pubs: 47,
      prior_pubs: 34,
      lifetime_pubs: 690,
      cur_share: 9.1,
      prior_share: 6.9,
      reviews: 5,
      trials: 19,
      commentary: 2,
      guidance: 1,
    },
    {
      name: "Brain metastases (CNS) management",
      description:
        "CNS-penetrant systemic therapy, stereotactic radiosurgery integration, and leptomeningeal disease in NSCLC.",
      cur_pubs: 34,
      prior_pubs: 31,
      lifetime_pubs: 980,
      cur_share: 6.6,
      prior_share: 6.3,
      reviews: 9,
      trials: 6,
      commentary: 4,
      guidance: 1,
    },
    {
      name: "Liquid biopsy & ctDNA MRD",
      description:
        "Circulating tumor DNA for minimal residual disease detection, treatment monitoring, and early relapse prediction.",
      cur_pubs: 28,
      prior_pubs: 21,
      lifetime_pubs: 540,
      cur_share: 5.4,
      // No comparable prior-window composition — reported as unavailable.
      prior_share: null,
      reviews: 6,
      trials: 8,
      commentary: 2,
      guidance: 0,
    },
    // ── Below the 20-count gate: no percentages, qualitative labels only ────
    {
      // Decreasing attention: cur < prior.
      name: "KRAS G12C inhibition",
      description:
        "Sotorasib, adagrasib, and emerging KRAS G12C inhibitors, combination approaches, and adaptive resistance.",
      cur_pubs: 11,
      prior_pubs: 13,
      lifetime_pubs: 450,
      cur_share: null,
      prior_share: null,
      reviews: 1,
      trials: 4,
      commentary: 1,
      guidance: 0,
    },
    {
      // Emerging: young theme (lifetime < 600) that is growing.
      name: "Antibody-drug conjugates",
      description:
        "HER2-, TROP2-, and MET-directed ADCs in NSCLC, payload biology, and interstitial lung disease as a class toxicity.",
      cur_pubs: 10,
      prior_pubs: 7,
      lifetime_pubs: 190,
      cur_share: null,
      prior_share: null,
      reviews: 1,
      trials: 5,
      commentary: 0,
      guidance: 0,
    },
    {
      // Increasing attention: growing, but established (lifetime >= 600) so not "Emerging".
      name: "SCLC transformation & rare histology",
      description:
        "Histologic transformation to small-cell as a resistance mechanism, and management of rare NSCLC histologies.",
      cur_pubs: 8,
      prior_pubs: 5,
      lifetime_pubs: 1100,
      cur_share: null,
      prior_share: null,
      reviews: 2,
      trials: 1,
      commentary: 1,
      guidance: 0,
    },
    {
      // Steady: cur == prior.
      name: "Oligometastatic & local ablative therapy",
      description:
        "Local consolidative and ablative therapy in oligometastatic and oligoprogressive NSCLC alongside systemic treatment.",
      cur_pubs: 6,
      prior_pubs: 6,
      lifetime_pubs: 640,
      cur_share: null,
      prior_share: null,
      reviews: 2,
      trials: 1,
      commentary: 0,
      guidance: 0,
    },
  ],
  // Empty by design — the realistic default. Guidelines, consensus statements,
  // and retractions are rare; the Events component must render an honest empty
  // state, not a placeholder row.
  events: [],
};
