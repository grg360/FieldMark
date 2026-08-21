// Ledger score definitions — the copy behind the column-head tooltips on the
// Established and Rising ledgers.
//
// DERIVED FROM THE SCORERS, NOT THE SOURCE OF TRUTH. Every string below is a
// reading of scripts/score/*.py (recompute_established_ranks_v3.py,
// publication_leadership_scoring.py, network_centrality_scoring.py,
// pharma_engagement_scoring.py, rising_star_scoring.py and the two momentum
// scorers). The scorers decide what the numbers ARE; this file only says so in
// prose, and it can fall out of date without anything failing.
//
// pages/MethodologyPage.tsx IS LOCKED VERBATIM FROM COMMIT 4808893 and is NOT
// wired to this module — it carries its own inline copy for the same metrics.
// The two are independent transcriptions of one set of scorers.
//
// THEREFORE: any scoring change must update BOTH this file and
// MethodologyPage.tsx. Changing one alone puts the ledger and the methodology
// page into disagreement about the same column, which is worse than either
// being stale on its own.

export interface MetricDef {
  title: string;
  body: string;
}

/** Keyed `<cohort>_<col.key>` — `est_*` for EST_CONFIG, `rs_*` for RS_CONFIG,
 *  plus `est_idx` / `rs_idx` for the COHORT SCORE head. Community is
 *  deliberately absent: its roster is not ranked and its heads carry no
 *  tooltip. An unknown key is a no-op at the call site, never a throw. */
export const METRIC_DEFS: Record<string, MetricDef> = {
  est_idx: {
    title: "Cohort Score · 0–100",
    body: "0.60 x Scientific Influence + 0.40 x Network Influence, each a percentile within the selected territory. Pharma engagement is shown but carries zero weight.",
  },
  est_sencit: {
    title: "Citations · Senior-Author",
    body: "Citations on Lung Cancer papers where this person is senior author, all years. This is the displayed count; the ranking uses its logarithm, so the column will not descend in perfect step with the rank.",
  },
  est_collab: {
    title: "Collaborators · 10-Year",
    body: "Distinct co-authors on Lung Cancer papers in the last ten years, taken as degree in the co-authorship graph.",
  },
  est_ph: {
    title: "Pharma · Not Ranked",
    body: "CMS Open Payments percentile over three program years: payment volume, distinct companies, distinct drugs, transaction count. Evidence beside the ranking, weight zero.",
  },
  rs_idx: {
    title: "Cohort Score · 0–100",
    body: "0.70 x momentum plus 0.30 x visibility, percentiled across the board. All four components must clear the 50th percentile to qualify.",
  },
  rs_scimom: {
    title: "Scientific Momentum",
    body: "Change in output between two five-year windows: publication velocity, citation volume, authorship progression.",
  },
  rs_netmom: {
    title: "Network Momentum",
    body: "Change in co-authorship centrality between the same two windows - eigenvector, degree and betweenness deltas. Eigenvector is normalised within country before percentiling.",
  },
  rs_scivis: {
    title: "Scientific Visibility",
    body: "Current footprint in the recent window: total publications and citation volume, weighted evenly.",
  },
  rs_netvis: {
    title: "Network Visibility",
    body: "Current co-authorship centrality in the recent rolling window.",
  },
  // ── Community evidence tiers ───────────────────────────────────────────
  // These describe the FILTER CHIPS, not columns. Community's column heads
  // stay untooltipped: the roster is not ranked and its columns are displayed
  // facts that say what they are. The tier is the one asserted evidence claim
  // on a community row, and it is the one thing a reader cannot infer from the
  // word alone — hence definitions here and nowhere else on the cohort.
  com_anchored: {
    title: "Anchored",
    body: "At least one Medicare Part D claim for a drug used only in lung cancer. The strongest evidence tier - the prescription itself identifies the practice.",
  },
  com_supported: {
    title: "Supported",
    body: "Part B administration of a lung-cancer regimen, or Part D claims for drugs used predominantly but not exclusively in lung cancer. Strong evidence, one step below a lung-only prescription.",
  },
  com_candidates: {
    title: "Candidates",
    body: "An oncology claim on record, but nothing yet that ties the practice to lung cancer specifically.",
  },
  com_no_medicare: {
    title: "No Medicare Evidence",
    body: "No Part D or Part B oncology claims found. Absence of Medicare evidence is not absence of practice - it reflects what the claims data can see.",
  },
  com_heme_dominant: {
    title: "Heme-Dominant",
    body: "Claims concentrated in blood cancers rather than solid tumours - a year with heavy oncology volume, over 70% haematology, and no lung claims. Shown so the practice is not mistaken for a lung-cancer one.",
  },
};

/** COM tier key (cohortLedger COM_TIER_FILTERS) -> METRIC_DEFS key.
 *
 *  AN EXPLICIT MAP, NOT A PREFIX. Two of the five do not transliterate:
 *  `candidate` -> `com_candidates` (the chip label is plural) and
 *  `unresolved` -> `com_no_medicare` (the chip is worded for the reader, the
 *  tier is worded for the data). A `com_${key}` prefix would silently resolve
 *  those two to nothing and drop their tooltips with no error. */
const COM_TIER_METRIC_KEY: Record<string, string> = {
  anchored: "com_anchored",
  supported: "com_supported",
  candidate: "com_candidates",
  unresolved: "com_no_medicare",
  heme_dominant: "com_heme_dominant",
};

/** The tooltip key for a ledger column head or a COM tier filter chip, or null
 *  where none exists.
 *
 *  COM resolves TIER KEYS ONLY. Its column keys (eng, companies, years) are not
 *  in COM_TIER_METRIC_KEY, so they return null and the community column heads
 *  keep their pass-through — unchanged from the EST/RS head pass. */
export function metricKeyFor(cohortTag: string, colKey: string): string | null {
  if (cohortTag === "COM") {
    const key = COM_TIER_METRIC_KEY[colKey];
    return key && key in METRIC_DEFS ? key : null;
  }
  const prefix = cohortTag === "EST" ? "est_" : cohortTag === "RS" ? "rs_" : null;
  if (!prefix) return null;
  const key = `${prefix}${colKey}`;
  return key in METRIC_DEFS ? key : null;
}
