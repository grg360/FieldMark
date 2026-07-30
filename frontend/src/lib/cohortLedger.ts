// Cohort Ledger — pure logic + data layer. Design "Cohort Ledger Build Reference".
//
// ONE config-driven component across three cohorts. Stage 1 wired Established; stage 2
// adds Rising Star and Community as sibling configs. The computed rules Design flagged
// as MUST-NOT-BE-SIMPLIFIED live here as pure functions and are cohort-agnostic:
//   • suppression is CEILING-SATURATION, not a column/page property (the correctness
//     fix). A score cell dashes iff its value sits within the window of that column's
//     WHOLE-COHORT ceiling (its max) — a cohort-level fact fetched once via ledger_meta
//     (a cheap max() aggregate), never recomputed from the loaded rows. So the dash
//     decision is identical whether 60 rows or the full 3,178 are loaded: leaders
//     pinned at the ceiling dash, tail HCP with real separation print their numerals.
//     Established's smoothly-declining scores collapse only at the head; Rising's
//     genuine ceiling cells dash and the rest print; Community's money/count columns
//     have no ceiling and never suppress. thresholds() turns ceilings into per-column
//     dash thresholds.
//   • bands are a HEAD-ONLY "treat as tied" device — the same ceiling-proximity logic
//     on the INDEX column. Rows whose index is within the cohort's resolution of the
//     index ceiling form the tied bands; below that boundary the ledger is a plain
//     ranked list. layout() splits the loaded rows into head bands + tail.
//   • why() — the drawer's "what placed this row here" is derived from the threshold
//     state + the row's scores, per cohort, never written per row.
// Source of fact is the DB (ledger_meta for ceilings; *_ledger RPCs for rows).

import { supabase } from "./supabase";

export type ColKind = "pct" | "money" | "count";

export interface ScoreCol {
  key: string;
  label: string; // SCI / SCI MOM / ENGAGEMENT
  sub: string; // CEILING / PCTILE / CMS · NOT RANKED
  w: number;
  kind: ColKind;
  noRank?: boolean; // informational, never ranks, never suppresses (Pharma, Engagement)
  absent?: string; // text shown when the value is absent (NO OP DATA / NONE RECORDED)
  unit?: string; // trace noun for count columns (e.g. "distinct companies")
  prov?: string; // trace provenance (e.g. "Open Payments", "NPPES")
}

export interface CohortConfig {
  tag: string; // EST / RS / COM
  title: string; // ESTABLISHED / NSCLC
  markerColor: string; // cohort left-edge hue
  label: string; // Established / Rising Star / Community
  nameSub: string; // second header line under PHYSICIAN
  meta: string; // header right line; {total} is filled with the live cohort count
  cols: ScoreCol[];
  bandResolution: number; // index spread that still counts as "tied"
  idxDecimals: number; // decimals on the INDEX figure (EST/RS 1, COM 0)
  rpc: string; // source RPC
  notes: string[];
  traceFoot: string;
}

// ── Cohort configurations (form from the Build Reference; hues confirmed against the
//    frame's own COH map: EST #6E8F76 DEEP SAGE, RS #9A8CC8 PURPLE, COM #B0848F ROSE) ──
export const EST_CONFIG: CohortConfig = {
  tag: "EST",
  title: "ESTABLISHED / NSCLC",
  markerColor: "#6E8F76",
  label: "Established",
  nameSub: "INSTITUTION · GENERATED SUMMARY",
  meta: "{total} HCP · SCIENTIFIC + NETWORK RANK THE COHORT · PHARMA EXCLUDED",
  cols: [
    { key: "sci", label: "SCI", sub: "CEILING", w: 66, kind: "pct" },
    { key: "net", label: "NET", sub: "CEILING", w: 66, kind: "pct" },
    { key: "ph", label: "PHARMA", sub: "NOT RANKED", w: 120, kind: "pct", noRank: true, absent: "NO OP DATA" },
  ],
  bandResolution: 0.3,
  idxDecimals: 1,
  rpc: "established_ledger",
  notes: [
    "SCI AND NET COLLAPSE TO “—” WHERE THE VISIBLE SPREAD SITS INSIDE THIS COHORT'S RESOLUTION; A NUMERAL PRINTS ONLY BELOW THE CEILING. THE THRESHOLD IS COMPUTED PER COHORT, NEVER HARD-CODED.",
    "INDEX = SCI + NET COMPOSITE · RANK IS THE ONLY FIGURE ON THIS ROW THAT SEPARATES ANYONE.",
    "PHARMA IS EXCLUDED FROM THE RANKING · OPEN PAYMENTS EXISTS FOR A MINORITY OF US ESTABLISHED HCP · “NO OP DATA” IS ABSENCE OF A RECORD, NOT ABSENCE OF PAYMENT.",
    "QUARTER-OVER-QUARTER RANK HISTORY IS NOT COLLECTED YET, SO NO TRAJECTORY COLUMN IS DRAWN.",
  ],
  traceFoot:
    "FULL PUBLICATION, GUIDELINE, TRIAL AND PAYMENT RECORDS LIVE ON THE PROFILE — THIS SURFACE CARRIES ONLY RANK AND SCORE.",
};

export const RS_CONFIG: CohortConfig = {
  tag: "RS",
  title: "RISING STARS / NSCLC",
  markerColor: "#9A8CC8",
  label: "Rising Star",
  nameSub: "INSTITUTION · GENERATED SUMMARY",
  meta: "{total} HCP · FOUR METRICS · ALL FOUR DISCRIMINATE, SO ALL FOUR PRINT",
  cols: [
    { key: "scimom", label: "SCI MOM", sub: "PCTILE", w: 74, kind: "pct" },
    { key: "netmom", label: "NET MOM", sub: "PCTILE", w: 74, kind: "pct" },
    { key: "scivis", label: "SCI VIS", sub: "PCTILE", w: 74, kind: "pct" },
    { key: "netvis", label: "NET VIS", sub: "PCTILE", w: 74, kind: "pct" },
  ],
  bandResolution: 2.1,
  idxDecimals: 1,
  rpc: "rising_ledger",
  notes: [
    "NO SUPPRESSION HERE: MOMENTUM AND VISIBILITY RUN WIDE ACROSS THIS COHORT, SO EVERY VALUE CARRIES INFORMATION AND EVERY VALUE PRINTS. THE SAME COMPUTED RULE THAT COLLAPSES ESTABLISHED'S TWO COLUMNS LEAVES ALL FOUR OF THESE STANDING.",
    "MOMENTUM IS MEASURED AGAINST THIS HCP'S OWN FIVE-YEAR BASELINE; VISIBILITY IS A PERCENTILE WITHIN THE RISING STAR COHORT.",
    "SCORES ARE PERCENTILES WITHIN THE RISING STAR COHORT AND ARE NOT COMPARABLE WITH ESTABLISHED OR COMMUNITY FIGURES.",
  ],
  traceFoot:
    "MOMENTUM IS MEASURED AGAINST THIS HCP'S OWN FIVE-YEAR BASELINE; VISIBILITY IS A PERCENTILE WITHIN THE RISING STAR COHORT.",
};

export const COM_CONFIG: CohortConfig = {
  tag: "COM",
  title: "COMMUNITY / NSCLC",
  markerColor: "#B0848F",
  label: "Community",
  nameSub: "SPECIALTY · LOCATION · GENERATED SUMMARY",
  meta: "{total} HCP · CMS-DERIVED · VOLUME 40% · ENGAGEMENT 30% · SETTING 15% · CAREER 10% · PUBLICATION 5%",
  cols: [
    { key: "eng", label: "ENGAGEMENT", sub: "CMS · NOT RANKED", w: 122, kind: "money", noRank: true, absent: "NONE RECORDED", prov: "Open Payments" },
    { key: "companies", label: "COMPANIES", sub: "DISTINCT", w: 86, kind: "count", unit: "distinct companies", prov: "Open Payments" },
    { key: "years", label: "YEARS", sub: "IN PRACTICE", w: 74, kind: "count", unit: "years", prov: "NPPES" },
  ],
  bandResolution: 1.0,
  idxDecimals: 0,
  rpc: "community_ledger",
  notes: [
    "ENGAGEMENT IS A CMS PAYMENT TOTAL, NOT A SCORE, AND NOTHING SORTS ON IT — IT SITS AT THE SAME TERTIARY TIER AS EVERY OTHER FIGURE SO THE LEDGER CANNOT BE READ AS A LEADERBOARD OF PHARMA MONEY.",
    "“NONE RECORDED” MEANS CMS HOLDS NO PAYMENT RECORD. NO RELATIONSHIP AND NO RECORD ARE INDISTINGUISHABLE IN THE SOURCE, SO THE ROW SAYS WHAT IS KNOWN AND NOTHING MORE — RANK IS UNAFFECTED, SINCE ENGAGEMENT IS 30% OF A SCORE LED BY PRACTICE VOLUME AND SETTING (55%).",
    "SCORES ARE PERCENTILES WITHIN THE COMMUNITY COHORT · A COMMUNITY 94 AND AN ESTABLISHED 94 ARE DIFFERENT MEASUREMENTS.",
  ],
  traceFoot:
    "COMMUNITY SCORES ARE CMS-DERIVED AND LED BY PRACTICE VOLUME; MANY HCP IN THIS COHORT HAVE NO PUBLICATIONS AT ALL, WHICH IS EXPECTED AND NOT A GAP.",
};

// Ordered cohorts for the tab toggle. One ranked ledger displays at a time.
export const COHORTS: CohortConfig[] = [EST_CONFIG, RS_CONFIG, COM_CONFIG];

export interface LedgerRow {
  rank: number;
  globalRank: number | null;
  hcpId: string;
  name: string;
  chips: string[]; // small mono chips after the name (state·institution, or specialty·location)
  scores: Record<string, number | null>; // keyed by col.key
  idx: number; // composite index
  summary: string | null; // generated narrative headline (plain prose)
}

export interface LedgerData {
  cohortTotal: number;
  rows: LedgerRow[];
}

/** Cohort-level facts, fetched once via ledger_meta (a cheap max() aggregate over the
 *  whole cohort) — independent of which rows are paged in. `ceilings` holds each
 *  percentile ranking column's whole-cohort max; money/count/not-ranked columns are
 *  absent (they never suppress). */
export interface LedgerMeta {
  cohortTotal: number;
  ceilings: Record<string, number>;
}

// ── Suppression = ceiling saturation (computed once per cohort, not per page) ─────
export const SUPPRESSION_WINDOW = 3; // a cell dashes when it sits within this of the ceiling

/** Per column: the threshold at/above which a value dashes ("—"), i.e. ceiling − window,
 *  or null for columns that never suppress (money, count, or a not-ranked percentile,
 *  and any column with no ceiling in meta). The threshold is a cohort constant derived
 *  from the whole-cohort ceiling — it does NOT depend on the loaded rows, so the dash
 *  decision is stable across all scrolling and paging. */
export function thresholds(cfg: CohortConfig, ceilings: Record<string, number>): Record<string, number | null> {
  const res: Record<string, number | null> = {};
  for (const col of cfg.cols) {
    const ceil = ceilings[col.key];
    res[col.key] = col.kind === "pct" && !col.noRank && typeof ceil === "number" ? ceil - SUPPRESSION_WINDOW : null;
  }
  return res;
}

export interface CellDisplay {
  text: string; // number / money / "—" / absent text
  kind: "num" | "dash" | "absent";
}

function money(v: number): string {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`;
}

/** Absent handling per kind:
 *   pct+noRank (Pharma): null or ≤0 → "NO OP DATA" (a 0 is an absent record, not a measured low).
 *   money (Engagement): null → "NONE RECORDED" (CMS holds no record — Buroker case).
 *   count (Companies): null → em-dash, never 0.
 *   pct: null → dash; at/above the cohort dash threshold (ceiling − window) → dash; else prints.
 *  `th` carries the per-column dash thresholds from thresholds() — cohort constants, so
 *  the same value dashes or prints regardless of which page it lands on. */
export function cellDisplay(row: LedgerRow, col: ScoreCol, th: Record<string, number | null>): CellDisplay {
  const v = row.scores[col.key];
  if (v === null || v === undefined || (col.noRank && col.kind === "pct" && v <= 0)) {
    return col.absent ? { text: col.absent, kind: "absent" } : { text: "—", kind: "dash" };
  }
  if (col.kind === "money") return { text: money(v), kind: "num" };
  if (col.kind === "count") return { text: String(Math.round(v)), kind: "num" };
  const threshold = th[col.key];
  if (threshold !== null && v >= threshold) return { text: "—", kind: "dash" };
  return { text: String(Math.round(v)), kind: "num" };
}

// ── Head-only "treat as tied" bands (ceiling-proximity on the INDEX column) ──────
// The saturated head is the prefix of rows whose index sits within the cohort's
// resolution of the index ceiling (= the top row's index). Those rows are grouped into
// tied bands; below the boundary the index separates people, so the ledger is a plain
// ranked list with no band headers. Like suppression, the boundary is anchored to a
// cohort-level ceiling, not to what is loaded — the head is always inside the first page.
export interface Band {
  label: string; // BAND A · RANK 1–7
  note: string;
  rows: LedgerRow[];
}

export interface LedgerLayout {
  headBands: Band[];
  tailRows: LedgerRow[];
  headMaxRank: number; // last rank inside the tied head (0 if no head)
}

export function layout(cfg: CohortConfig, rows: LedgerRow[]): LedgerLayout {
  if (rows.length === 0) return { headBands: [], tailRows: [], headMaxRank: 0 };
  const idxCeiling = rows[0].idx; // ranked by index, so the top row carries the ceiling
  const boundary = idxCeiling - cfg.bandResolution;

  // prefix of rows still within resolution of the ceiling = the tied head
  let headEnd = 0;
  while (headEnd < rows.length && rows[headEnd].idx >= boundary) headEnd++;
  const head = rows.slice(0, headEnd);
  const tailRows = rows.slice(headEnd);

  const headBands: Band[] = [];
  let i = 0;
  let letter = 65; // 'A'
  const d = cfg.idxDecimals;
  while (i < head.length) {
    const start = i;
    const hi = head[i].idx;
    i++;
    while (i < head.length && hi - head[i].idx <= cfg.bandResolution) i++;
    const group = head.slice(start, i);
    const lo = group[group.length - 1].idx;
    const spread = +(hi - lo).toFixed(2);
    const r0 = group[0].rank;
    const r1 = group[group.length - 1].rank;
    headBands.push({
      label: `BAND ${String.fromCharCode(letter)} · RANK ${r0}${r1 > r0 ? `–${r1}` : ""}`,
      note:
        group.length > 1
          ? `INDEX ${hi.toFixed(d)} → ${lo.toFixed(d)} · SPREAD ${spread} · WITHIN COHORT RESOLUTION — TREAT AS TIED`
          : `INDEX ${hi.toFixed(d)} · TIED AT THE COHORT CEILING`,
      rows: group,
    });
    letter++;
  }
  return { headBands, tailRows, headMaxRank: head.length ? head[head.length - 1].rank : 0 };
}

// ── Drawer "why" (derived from suppression state + scores) ───────────────────
function scoreLabel(col: ScoreCol, v: number): string {
  return `${col.label} ${Math.round(v)}`;
}

export function why(cfg: CohortConfig, row: LedgerRow, th: Record<string, number | null>): string {
  const rankCols = cfg.cols.filter((c) => c.kind === "pct" && !c.noRank);

  // Community (and any cohort with no percentile ranking columns): the ranking is
  // CMS-derived and led by practice volume + setting, so engagement's presence or
  // absence does not move the row.
  if (rankCols.length === 0) {
    const moneyCol = cfg.cols.find((c) => c.kind === "money");
    const eng = moneyCol ? row.scores[moneyCol.key] : null;
    return eng === null || eng === undefined
      ? `Ranked on practice volume, setting and career stage — no CMS payment record exists, and engagement is 30% of a score led by practice volume and setting (55%), so its absence does not move #${row.rank}.`
      : `Ranked on practice volume, setting and career stage — engagement of ${money(eng)} is informational (30% of the score, which is led by practice volume) and does not by itself place #${row.rank}.`;
  }

  const collapsed = rankCols.filter(
    (c) =>
      th[c.key] !== null &&
      typeof row.scores[c.key] === "number" &&
      (row.scores[c.key] as number) >= (th[c.key] as number),
  );
  if (collapsed.length >= 2) {
    return `Both ranking scores sit at this cohort's ceiling (${collapsed
      .map((c) => scoreLabel(c, row.scores[c.key] as number))
      .join(", ")}), so neither contributes separation here — position #${row.rank} rests on fractions of a percentile against everyone else at the ceiling.`;
  }
  if (collapsed.length === 1) {
    const other = rankCols.find((c) => !collapsed.includes(c) && typeof row.scores[c.key] === "number");
    return other
      ? `${scoreLabel(other, row.scores[other.key] as number)} is the only ranking score with room to move, and it is what holds this row at #${row.rank}.`
      : `One ranking score sits at the ceiling; the other holds this row at #${row.rank}.`;
  }
  const spread = rankCols
    .filter((c) => typeof row.scores[c.key] === "number")
    .map((c) => scoreLabel(c, row.scores[c.key] as number))
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
    const v = row.scores[col.key];
    const label = `${col.label} ${col.sub}`.replace(/\s*·?\s*NOT RANKED/, "").trim().toUpperCase();
    if (v === null || v === undefined || (col.noRank && col.kind === "pct" && v <= 0)) {
      return { label, value: "no record held" };
    }
    if (col.kind === "money") return { label, value: `${money(v)} · ${col.prov ?? "Open Payments"} (lifetime)` };
    if (col.kind === "count") return { label, value: `${Math.round(v)} ${col.unit ?? ""} · ${col.prov ?? ""}`.replace(/\s+·\s*$/, "").trim() };
    return { label, value: `percentile ${v.toFixed(1)} within ${cfg.label} · methodology v4.2` };
  });
  t.push({
    label: "COHORT RANK",
    value: `#${row.rank} of ${cohortTotal.toLocaleString()} ${cfg.label}${row.globalRank ? ` · #${row.globalRank} global` : ""}`,
  });
  return t;
}

// ── Data ─────────────────────────────────────────────────────────────────────
const S = (v: unknown): string => (v == null ? "" : String(v));
const N = (v: unknown): number | null => (v == null ? null : Number(v));
const titleCase = (s: string): string =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

function mapRow(cfg: CohortConfig, r: Record<string, unknown>): LedgerRow {
  const name = `${S(r.first_name)} ${S(r.last_name)}`.trim();
  const scores: Record<string, number | null> = {};
  for (const col of cfg.cols) scores[col.key] = N(r[col.key]);

  let chips: string[];
  if (cfg.tag === "COM") {
    const loc = [titleCase(S(r.city)), S(r.state)].filter(Boolean).join(", ");
    chips = [S(r.specialty), loc].filter(Boolean);
  } else {
    const inst = S(r.institution);
    chips = [S(r.state), inst].filter(Boolean);
  }

  return {
    rank: Number(r.rank),
    globalRank: r.global_rank == null ? null : Number(r.global_rank),
    hcpId: S(r.hcp_id),
    name,
    chips,
    scores,
    idx: Number(r.idx),
    summary: (r.summary as string) ?? null,
  };
}

/** Fetch the cohort-level ceilings + total once per cohort load. This is the cheap
 *  max() aggregate that makes suppression scope-independent — it must NOT be derived
 *  from the loaded rows. */
export async function loadLedgerMeta(cfg: CohortConfig): Promise<LedgerMeta> {
  const { data, error } = await supabase.rpc("ledger_meta", { p_cohort: cfg.tag });
  if (error || !data) {
    console.error("ledger_meta failed:", error?.message);
    return { cohortTotal: 0, ceilings: {} };
  }
  const d = data as { cohort_total?: number; ceilings?: Record<string, number> };
  return { cohortTotal: Number(d.cohort_total) || 0, ceilings: d.ceilings ?? {} };
}

export async function loadLedger(cfg: CohortConfig, limit = 60): Promise<LedgerData> {
  const { data, error } = await supabase.rpc(cfg.rpc, { p_limit: limit });
  if (error) {
    console.error(`${cfg.rpc} failed:`, error.message);
    return { cohortTotal: 0, rows: [] };
  }
  const d = (data as { cohort_total?: number; rows?: unknown[] }) ?? {};
  const rows: LedgerRow[] = ((d.rows ?? []) as Record<string, unknown>[]).map((r) => mapRow(cfg, r));
  return { cohortTotal: Number(d.cohort_total) || rows.length, rows };
}
