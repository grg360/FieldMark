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
};

/** The tooltip key for a ledger column head, or null where none exists.
 *  COM returns null for every column — the roster is not ranked. */
export function metricKeyFor(cohortTag: string, colKey: string): string | null {
  const prefix = cohortTag === "EST" ? "est_" : cohortTag === "RS" ? "rs_" : null;
  if (!prefix) return null;
  const key = `${prefix}${colKey}`;
  return key in METRIC_DEFS ? key : null;
}
