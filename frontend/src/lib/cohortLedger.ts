// Cohort Ledger — pure logic + data layer. Design "Cohort Ledger Build Reference".
//
// One config-driven component across cohorts; stage 1 wires Established only. The
// two rules Design flagged as COMPUTED live here as pure functions:
//   • suppression() — a score column collapses to "—" only where the visible
//     cohort's own spread cannot discriminate (spread ≤ 3 percentile points);
//     values below the derived ceiling always print. Generalises: stage-2 cohorts
//     whose columns spread wider keep all columns.
//   • why() — the drawer's "what placed this row here" line is derived from the
//     suppression state + the row's scores, never written per row.
// Bands are grouped by index spread within the cohort's resolution window; trace is
// built per column. Source of fact is the DB (established_ledger RPC).

import { supabase } from "./supabase";

export interface ScoreCol {
  key: "sci" | "net" | "ph";
  label: string; // SCI / NET / PHARMA
  sub: string; // CEILING / NOT RANKED
  w: number;
  pct: boolean; // a percentile score (eligible for suppression)
  noRank?: boolean; // informational, never ranks, never suppresses (Pharma)
  absent?: string; // text shown when the value is absent (Pharma → "NO OP DATA")
}

export interface CohortConfig {
  tag: string; // EST
  title: string;
  markerColor: string; // deep sage left edge
  label: string; // Established
  nameSub: string;
  cols: ScoreCol[];
  bandResolution: number; // index spread that still counts as "tied" (Design: 0.3)
  notes: string[];
  traceFoot: string;
}

// Established config. Marker is deep sage — the Build Reference palette states
// #6E8F76 · DEEP SAGE (the task text's "#6E5F76" is a one-digit slip and is not a
// sage; using the frame's value, flagged in the report).
export const EST_CONFIG: CohortConfig = {
  tag: "EST",
  title: "ESTABLISHED / NSCLC",
  markerColor: "#6E8F76",
  label: "Established",
  nameSub: "INSTITUTION · GENERATED SUMMARY",
  cols: [
    { key: "sci", label: "SCI", sub: "CEILING", w: 66, pct: true },
    { key: "net", label: "NET", sub: "CEILING", w: 66, pct: true },
    { key: "ph", label: "PHARMA", sub: "NOT RANKED", w: 120, pct: true, noRank: true, absent: "NO OP DATA" },
  ],
  bandResolution: 0.3,
  notes: [
    "SCI AND NET COLLAPSE TO “—” WHERE THE VISIBLE SPREAD SITS INSIDE THIS COHORT'S RESOLUTION; A NUMERAL PRINTS ONLY BELOW THE CEILING. THE THRESHOLD IS COMPUTED PER COHORT, NEVER HARD-CODED.",
    "INDEX = SCI + NET COMPOSITE · RANK IS THE ONLY FIGURE ON THIS ROW THAT SEPARATES ANYONE.",
    "PHARMA IS EXCLUDED FROM THE RANKING · OPEN PAYMENTS EXISTS FOR A MINORITY OF US ESTABLISHED HCP · “NO OP DATA” IS ABSENCE OF A RECORD, NOT ABSENCE OF PAYMENT.",
    "QUARTER-OVER-QUARTER RANK HISTORY IS NOT COLLECTED YET, SO NO TRAJECTORY COLUMN IS DRAWN.",
  ],
  traceFoot:
    "FULL PUBLICATION, GUIDELINE, TRIAL AND PAYMENT RECORDS LIVE ON THE PROFILE — THIS SURFACE CARRIES ONLY RANK AND SCORE.",
};

export interface LedgerRow {
  rank: number;
  globalRank: number | null;
  hcpId: string;
  name: string;
  institution: string | null;
  state: string | null;
  sci: number | null;
  net: number | null;
  ph: number | null;
  idx: number; // composite index
  summary: string | null; // generated narrative headline (plain prose)
}

export interface LedgerData {
  cohortTotal: number;
  rows: LedgerRow[];
}

// ── Suppression (computed, never a constant) ─────────────────────────────────
export const SUPPRESSION_WINDOW = 3; // percentile points; a column within this cannot discriminate

/** Per column: the ceiling at/above which the value collapses to "—", or null if
 *  the column discriminates (spread exceeds the window) and every value prints. */
export function suppression(cfg: CohortConfig, rows: LedgerRow[]): Record<string, number | null> {
  const res: Record<string, number | null> = {};
  for (const col of cfg.cols) {
    if (!col.pct || col.noRank) {
      res[col.key] = null;
      continue;
    }
    const vals = rows.map((r) => r[col.key]).filter((v): v is number => typeof v === "number" && v > 0);
    if (vals.length === 0) {
      res[col.key] = null;
      continue;
    }
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    res[col.key] = hi - lo <= SUPPRESSION_WINDOW ? hi - 1 : null;
  }
  return res;
}

export interface CellDisplay {
  text: string; // number (rounded) or "—" or absent text
  kind: "num" | "dash" | "absent";
}

/** Pharma 0 / null both read as "NO OP DATA": Open Payments exists for a minority,
 *  and a 0 percentile in this column is an absent record, not a measured low.
 *  (Flagged — the source can't distinguish a true 0 from no-record.) */
export function cellDisplay(row: LedgerRow, col: ScoreCol, sup: Record<string, number | null>): CellDisplay {
  const v = row[col.key];
  if (v === null || v === undefined || (col.noRank && v <= 0)) {
    return col.absent ? { text: col.absent, kind: "absent" } : { text: "—", kind: "dash" };
  }
  const ceiling = sup[col.key];
  if (ceiling !== null && v >= ceiling) return { text: "—", kind: "dash" };
  return { text: String(Math.round(v)), kind: "num" };
}

// ── Resolution bands (grouped by index spread within cohort resolution) ──────
export interface Band {
  label: string; // BAND A · RANK 1–8
  note: string;
  rows: LedgerRow[];
}

export function bands(cfg: CohortConfig, rows: LedgerRow[]): Band[] {
  const out: Band[] = [];
  let i = 0;
  let letter = 65; // 'A'
  while (i < rows.length) {
    const start = i;
    const hi = rows[i].idx;
    i++;
    while (i < rows.length && hi - rows[i].idx <= cfg.bandResolution) i++;
    const group = rows.slice(start, i);
    const lo = group[group.length - 1].idx;
    const spread = +(hi - lo).toFixed(2);
    const r0 = group[0].rank;
    const r1 = group[group.length - 1].rank;
    out.push({
      label: `BAND ${String.fromCharCode(letter)} · RANK ${r0}${r1 > r0 ? `–${r1}` : ""}`,
      note:
        spread <= cfg.bandResolution && group.length > 1
          ? `INDEX ${hi.toFixed(2)} → ${lo.toFixed(2)} · SPREAD ${spread} · INSIDE COHORT RESOLUTION — TREAT AS TIED`
          : `INDEX ${hi.toFixed(2)} → ${lo.toFixed(2)} · SPREAD ${spread} · SEPARATION BEGINS HERE`,
      rows: group,
    });
    letter++;
  }
  return out;
}

// ── Drawer "why" (derived from suppression state + scores) ───────────────────
function scoreLabel(col: ScoreCol, v: number): string {
  return `${col.label} ${Math.round(v)}`;
}

export function why(cfg: CohortConfig, row: LedgerRow, sup: Record<string, number | null>): string {
  const rankCols = cfg.cols.filter((c) => c.pct && !c.noRank);
  const collapsed = rankCols.filter(
    (c) => sup[c.key] !== null && typeof row[c.key] === "number" && (row[c.key] as number) >= (sup[c.key] as number),
  );
  if (collapsed.length >= 2) {
    return `Both ranking scores sit at this cohort's ceiling (${collapsed
      .map((c) => scoreLabel(c, row[c.key] as number))
      .join(", ")}), so neither contributes separation here — position #${row.rank} rests on fractions of a percentile against everyone else at the ceiling.`;
  }
  if (collapsed.length === 1) {
    const other = rankCols.find((c) => !collapsed.includes(c) && typeof row[c.key] === "number");
    return other
      ? `${scoreLabel(other, row[other.key] as number)} is the only ranking score with room to move, and it is what holds this row at #${row.rank}.`
      : `One ranking score sits at the ceiling; the other holds this row at #${row.rank}.`;
  }
  const spread = rankCols
    .filter((c) => typeof row[c.key] === "number")
    .map((c) => scoreLabel(c, row[c.key] as number))
    .join(" · ");
  return spread
    ? `All ranking scores discriminate in this cohort (${spread}), so #${row.rank} is a real position rather than a tie-break — the band note states how much of the ordering is meaningful.`
    : `Position #${row.rank} rests on the composite index; no single score separates this row from its band.`;
}

// ── Trace ────────────────────────────────────────────────────────────────────
export interface TraceRow {
  label: string;
  value: string;
}

export function trace(cfg: CohortConfig, row: LedgerRow, cohortTotal: number): TraceRow[] {
  const t: TraceRow[] = cfg.cols.map((col) => {
    const v = row[col.key];
    const label = `${col.label} ${col.sub}`.replace(" NOT RANKED", "").toUpperCase();
    if (v === null || v === undefined || (col.noRank && v <= 0)) {
      return { label, value: "no record held" };
    }
    return { label, value: `percentile ${v.toFixed(1)} within ${cfg.label} · methodology v4.2` };
  });
  t.push({
    label: "COHORT RANK",
    value: `#${row.rank} of ${cohortTotal.toLocaleString()} ${cfg.label}${row.globalRank ? ` · #${row.globalRank} global` : ""}`,
  });
  return t;
}

// ── Data ─────────────────────────────────────────────────────────────────────
export async function loadEstablishedLedger(limit = 60): Promise<LedgerData> {
  const { data, error } = await supabase.rpc("established_ledger", { p_limit: limit });
  if (error) {
    console.error("established_ledger failed:", error.message);
    return { cohortTotal: 0, rows: [] };
  }
  const d = (data as { cohort_total?: number; rows?: unknown[] }) ?? {};
  const rows: LedgerRow[] = ((d.rows ?? []) as Record<string, unknown>[]).map((r) => ({
    rank: Number(r.rank),
    globalRank: r.global_rank == null ? null : Number(r.global_rank),
    hcpId: String(r.hcp_id),
    name: `${(r.first_name as string) ?? ""} ${(r.last_name as string) ?? ""}`.trim(),
    institution: (r.institution as string) ?? null,
    state: (r.state as string) ?? null,
    sci: r.sci == null ? null : Number(r.sci),
    net: r.net == null ? null : Number(r.net),
    ph: r.ph == null ? null : Number(r.ph),
    idx: Number(r.idx),
    summary: (r.summary as string) ?? null,
  }));
  return { cohortTotal: Number(d.cohort_total) || rows.length, rows };
}
