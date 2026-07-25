/** First row when Supabase returns embedded one-to-one as object or single-element array. */
export function firstEmbedded<T>(v: T | T[] | null | undefined): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Medicare-style volume: K suffix only when strictly > 1000. */
export function formatVolumeK(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Math.round(n);
  if (v > 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(v);
}

export function formatIntDisplay(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

/** Lifetime engagement dollars with K/M suffixes. */
export function formatEngagementDollar(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "$0";
  const v = Math.round(n);
  if (v < 1000) return `$${v.toLocaleString()}`;
  if (v < 1000000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${(v / 1000000).toFixed(1)}M`;
}

/** hcps.cohort_score percentile (0–100); two decimals for display. */
export function formatCohortScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number(n).toFixed(2);
}

/**
 * Score numeral display: FLOOR to one decimal. A scope that tops out at 99.82 shows 99.8, not an
 * invented 100 — integer rounding manufactured a ceiling no HCP earned and collapsed the top-cluster
 * spread. 100.0 shows only where a scope genuinely reaches it. Display layer only: the stored
 * cohort_score / rising_star_percentile keep full precision.
 * Use for Established (cohort_score) and Rising Star (rising_star_percentile) ONLY — never for the
 * three sub-scores (Scientific/Network/Pharma stay integers), community, or any raw momentum score.
 */
export function formatScoreFloor1(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return (Math.floor(Number(n) * 10) / 10).toFixed(1);
}

/**
 * Assumes normalized_score is a 0–100 percentile where higher = stronger;
 * maps to a "Top X%" label (e.g. 93 → Top 7%).
 */
export function formatTopPercentileLabel(normalized: number): string | null {
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  const pct = normalized <= 1 ? normalized * 100 : normalized;
  const top = Math.max(1, Math.min(99, Math.round(100 - pct)));
  return `Top ${top}%`;
}
