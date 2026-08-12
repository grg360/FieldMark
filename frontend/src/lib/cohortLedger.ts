// Cohort Ledger — pure logic + data layer. Design "Cohort Ledger Build Reference".
//
// ONE config-driven component across three cohorts. Stage 1 wired Established; stage 2
// adds Rising Star and Community as sibling configs. The computed rules Design flagged
// as MUST-NOT-BE-SIMPLIFIED live here as pure functions and are cohort-agnostic:
//   • ceiling-saturation machinery (ledger_meta ceilings → thresholds()) survives, but
//     CELLS NO LONGER DASH ON IT (2026-07-31): the absolute 3-point window on a
//     percentile distribution that compresses at the top by construction dashed the
//     whole first screen of large cohorts. Scores print as stored; the tied-head bands
//     carry the "spread is inside resolution" honesty, as INDEX always did. thresholds()
//     still feeds why() — the drawer's ceiling-saturation narrative.
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
  // Display-only header override (2026-08-06 label pass): the two lines the column
  // head renders (e.g. SCIENTIFIC over MOMENTUM). label/sub keep feeding trace()
  // and why(), where the short forms stay unambiguous in running text.
  head?: string;
  headSub?: string;
  w: number;
  kind: ColKind;
  noRank?: boolean; // informational, never ranks, never suppresses (Pharma, Engagement)
  absent?: string; // text shown when the value is absent (NO OP DATA / NONE RECORDED)
  unit?: string; // trace noun for count columns (e.g. "distinct companies")
  prov?: string; // trace provenance (e.g. "Open Payments", "NPPES")
  // pct display precision: decimals set → floorFixed(v, decimals); absent → integer round.
  // Established sets 1 (2026-07-31): at integer precision every top-20 SCI reads "99" and
  // the column carries nothing; at one decimal the 60/40 decomposition is legible.
  decimals?: number;
  // Single-source horizontal alignment (2026-08-12): when set, BOTH the column
  // head (ColumnHeads) and the value cell (Row) read this one value, so they
  // cannot drift apart. Absent = legacy split: head centered, value right —
  // which is EST/RS's shipped look (their large numerals nearly fill their
  // cells, so right ≈ center) and must not change. COM's short facts in
  // header-sized cells set "center" to sit plumb under their two-line heads.
  align?: "center" | "right";
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
  // 2A numeric ramp (Ledger Numeric Typography frame): serif stepped-decimal
  // INDEX cell + serif score cells + minor insights tint. The RANKED cohorts'
  // shared row class (EST + RS, 2026-08-11); COM is explicitly off — its idx
  // is NULL post-freeze and the ramp must never render on a roster row.
  numericRamp?: boolean;
  // Fact finish (2026-08-12): the ramp's (b) POLISH — serif face, size/weight
  // step, tint hierarchy — without the stepped-decimal. Uses the ramp's own
  // inks (same hex as EST's score cells) so the strips are uniform; the
  // Medicare presence checkmarks take P.amber (the anchoring-rule token).
  // COM only; never combine with numericRamp.
  factFinish?: boolean;
  sortLabel?: string; // COM roster: visible default-order label (no rank exists)
  rpc: string; // source RPC
  notes: string[];
  traceFoot: string;
  // Mobile (≤767): Design pairs score columns rather than dropping them. When present,
  // each entry is one metric group shown as "a / b"; absent → columns show one-per-cell.
  mobilePairs?: { label: string; keys: string[] }[];
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
    { key: "sci", label: "SCI", sub: "CEILING", w: 66, kind: "pct", decimals: 1 },
    { key: "net", label: "NET", sub: "CEILING", w: 66, kind: "pct", decimals: 1 },
    { key: "ph", label: "PHARMA", sub: "NOT RANKED", w: 120, kind: "pct", noRank: true, absent: "NO OP DATA", decimals: 1 },
  ],
  bandResolution: 0.3,
  idxDecimals: 1,
  numericRamp: true,
  rpc: "established_ledger",
  notes: [
    "SCI AND NET PRINT AS STORED · THE COHORT COMPRESSES AT THE TOP BY CONSTRUCTION, SO NEAR-IDENTICAL HEAD VALUES ARE THE DATA, NOT A DISPLAY ARTIFACT — THE TIED BANDS ABOVE CARRY THAT.",
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
    { key: "scimom", label: "SCI MOM", sub: "PCTILE", head: "SCIENTIFIC", headSub: "MOMENTUM", w: 78, kind: "pct" },
    { key: "netmom", label: "NET MOM", sub: "PCTILE", head: "NETWORK", headSub: "MOMENTUM", w: 78, kind: "pct" },
    { key: "scivis", label: "SCI VIS", sub: "PCTILE", head: "SCIENTIFIC", headSub: "VISIBILITY", w: 78, kind: "pct" },
    { key: "netvis", label: "NET VIS", sub: "PCTILE", head: "NETWORK", headSub: "VISIBILITY", w: 78, kind: "pct" },
  ],
  // four columns don't fit 390, so they pair by family rather than drop
  mobilePairs: [
    { label: "MOM", keys: ["scimom", "netmom"] },
    { label: "VIS", keys: ["scivis", "netvis"] },
  ],
  bandResolution: 2.1,
  idxDecimals: 1,
  numericRamp: true,
  rpc: "rising_ledger",
  notes: [
    "NO SUPPRESSION HERE: MOMENTUM AND VISIBILITY RUN WIDE ACROSS THIS COHORT, SO EVERY VALUE CARRIES INFORMATION AND EVERY VALUE PRINTS. THE SAME COMPUTED RULE THAT COLLAPSES ESTABLISHED'S TWO COLUMNS LEAVES ALL FOUR OF THESE STANDING.",
    "MOMENTUM IS MEASURED AGAINST THIS HCP'S OWN FIVE-YEAR BASELINE; VISIBILITY IS A PERCENTILE WITHIN THE RISING STAR COHORT.",
    "SCORES ARE PERCENTILES WITHIN THE RISING STAR COHORT AND ARE NOT COMPARABLE WITH ESTABLISHED FIGURES.",
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
  meta: "{total} HCP · CMS-DERIVED · TIER-GROUPED, NOT RANKED · SORTED BY EVIDENCE TIER, THEN MEDICARE REACH",
  cols: [
    // Head relabel 2026-08-12: the dollars column reads PHARMA / PAYMENTS and
    // the count column COMPANIES / ENGAGED — the pair now names its facts
    // instead of splitting "engagement" across both. "CMS · NOT RANKED"
    // dropped from the head: the cohort meta line already states the roster
    // isn't ranked. label/sub still feed trace() unchanged.
    { key: "eng", label: "ENGAGEMENT", sub: "CMS · NOT RANKED", head: "PHARMA", headSub: "PAYMENTS", w: 122, kind: "money", noRank: true, absent: "NONE RECORDED", prov: "Open Payments", align: "center" },
    { key: "companies", label: "COMPANIES", sub: "DISTINCT", head: "COMPANIES", headSub: "ENGAGED", w: 126, kind: "count", unit: "distinct companies", prov: "Open Payments", align: "center" },
    { key: "years", label: "YEARS", sub: "IN PRACTICE", w: 74, kind: "count", unit: "years", prov: "NPPES", align: "center" },
  ],
  bandResolution: 1.0,
  idxDecimals: 0,
  numericRamp: false,
  factFinish: true,
  // Roster default order (Phase 3): the visible, swappable view-state label.
  sortLabel: "BY EVIDENCE TIER, THEN MEDICARE REACH",
  rpc: "community_ledger",
  notes: [
    "COMMUNITY IS NOT RANKED. TIER IS THE ONLY ASSERTED EVIDENCE CLAIM; EVERY FIGURE ON A ROW IS A DISPLAYED FACT, AND THE DEFAULT ORDER (TIER, THEN MEDICARE REACH) IS A VIEW-STATE, NOT A JUDGMENT.",
    "ENGAGEMENT IS A CMS PAYMENT TOTAL, NOT A SCORE — THE LEDGER CANNOT BE READ AS A LEADERBOARD OF PHARMA MONEY.",
    "“NONE RECORDED” MEANS CMS HOLDS NO PAYMENT RECORD. NO RELATIONSHIP AND NO RECORD ARE INDISTINGUISHABLE IN THE SOURCE, SO THE ROW SAYS WHAT IS KNOWN AND NOTHING MORE. MISSING MODALITY = UNKNOWN, NEVER ZERO.",
  ],
  traceFoot:
    "COMMUNITY ROWS CARRY CLAIMS-DERIVED FACTS (EVIDENCE TIER, PART B REACH, PART D PRESENCE); MANY HCP IN THIS COHORT HAVE NO PUBLICATIONS AT ALL, WHICH IS EXPECTED AND NOT A GAP.",
};

// Ordered cohorts for the tab toggle. One ranked ledger displays at a time.
export const COHORTS: CohortConfig[] = [EST_CONFIG, RS_CONFIG, COM_CONFIG];

export interface LedgerRow {
  // EST/RS: the real cohort rank. COM (Phase 3 roster): null — community is
  // not ranked; ordinal (array position, stamped by the component) carries
  // keys/neighbor lookups without ever displaying as a position.
  rank: number | null;
  ordinal?: number;
  globalRank: number | null;
  // COM roster facts (Phase 3): the leading reach fact + keyset cursor fields.
  tierPriority?: number | null;
  patientVolume?: number | null;
  partDPresent?: boolean | null;
  hcpId: string;
  name: string;
  chips: string[]; // small mono chips after the name (state·institution, or specialty·location)
  archetype: string | null; // Rising Star only — physician attribute chip inline with the name
  scores: Record<string, number | null>; // keyed by col.key
  idx: number | null; // composite index (EST/RS only; COM roster has none)
  summary: string | null; // generated narrative headline (plain prose)
  // Community evidence-tier fields (COM only; from hcp_nsclc_evidence_tier_v1 via the RPC).
  // Absent on EST/RS rows. Never composed client-side — the RPC returns the strings.
  tier?: string | null;
  recurrenceBand?: string | null;
  anchorStem?: string | null; // representative lung-only oral for the chip
  anchorStems?: string[] | null; // every distinct strict stem, for the profile
  anchorYears?: number[] | null;
  supportedEvidence?: string | null; // verbatim from the view (group 5 stays "cross-indication targeted therapy observed")
  supportedEvidenceRank?: number | null;
  lungWeighted?: boolean;
}

export interface LedgerData {
  cohortTotal: number; // full cohort (pre-filter)
  filteredTotal: number; // rows under the active tier filter (== cohortTotal for EST/RS)
  tierCounts: Record<string, number> | null; // COM: full-cohort count per tier (for the filter chips); null for EST/RS
  rows: LedgerRow[];
}

// ── Community evidence tiers (COM only) ──────────────────────────────────────
// Tier vocabulary is shared between the filter chips and the row chip so filter↔row
// is stated, not inferred. Default ledger = anchored + supported (the frame's 1,068).
export const COM_TIER_LABEL: Record<string, string> = {
  anchored: "ANCHORED",
  supported: "SUPPORTED",
  candidate: "CANDIDATE",
  heme_dominant: "HEME-DOMINANT",
  unresolved: "NO MEDICARE EVIDENCE",
};
export const COM_TIER_FILTERS: { key: string; label: string }[] = [
  { key: "anchored", label: "ANCHORED" },
  { key: "supported", label: "SUPPORTED" },
  { key: "candidate", label: "CANDIDATES" },
  { key: "unresolved", label: "NO MEDICARE EVIDENCE" },
  { key: "heme_dominant", label: "HEME-DOMINANT" },
];
export const COM_ALL_TIERS: string[] = COM_TIER_FILTERS.map((t) => t.key);
export const COM_DEFAULT_TIERS: string[] = ["anchored", "supported"];

export interface EvidenceChip {
  tierWord: string; // ANCHORED / SUPPORTED / …
  strength: "anchored" | "supported" | "other";
  segments: string[]; // e.g. ["LUNG-ONLY ORAL", "osimertinib", "2022 2023 2024"] or ["pemetrexed (Part B)"]
  lungWeighted: boolean;
}

/** The row evidence chip content (COM). Anchored names the representative drug and the
 *  actual years; supported uses the view's verbatim evidence string; other tiers carry
 *  the tier word alone. Returns null for non-COM rows. */
export function evidenceChip(row: LedgerRow): EvidenceChip | null {
  if (!row.tier) return null;
  const tierWord = COM_TIER_LABEL[row.tier] ?? row.tier.toUpperCase();
  const lungWeighted = !!row.lungWeighted;
  if (row.tier === "anchored") {
    // Lead with the representative stem (anchor_stem), then the remaining stems in the
    // view's alphabetical order — so the significant drug shows and never hides in "+N".
    // Then up to two shown, "+N" for the rest.
    const all = row.anchorStems ?? (row.anchorStem ? [row.anchorStem] : []);
    const lead = row.anchorStem;
    const ordered = lead ? [lead, ...all.filter((s) => s !== lead)] : all;
    const drug = ordered.length <= 2 ? ordered.join(", ") : `${ordered.slice(0, 2).join(", ")} +${ordered.length - 2}`;
    const years = (row.anchorYears ?? []).join(" ");
    return { tierWord, strength: "anchored", lungWeighted, segments: ["LUNG-ONLY ORAL", drug, years].filter(Boolean) };
  }
  if (row.tier === "supported") {
    return { tierWord, strength: "supported", lungWeighted, segments: [row.supportedEvidence ?? ""].filter(Boolean) };
  }
  return { tierWord, strength: "other", lungWeighted, segments: [] };
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

export function money(v: number): string {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`;
}

/** Absent handling per kind:
 *   pct+noRank (Pharma): null or ≤0 → "NO OP DATA" (a 0 is an absent record, not a measured low).
 *   money (Engagement): null → "NONE RECORDED" (CMS holds no record — Buroker case).
 *   count (Companies): null → em-dash, never 0.
 *   pct: null → dash; else prints AS STORED.
 *  CEILING SUPPRESSION REMOVED FROM CELLS (2026-07-31): an absolute 3-point window on a
 *  percentile distribution that compresses at the top by construction dashed the entire
 *  first screen of every large cohort — the ranking columns showed nothing while the
 *  not-ranked Pharma column printed. The tied-head band headers carry the honesty
 *  structurally (TREAT AS TIED), exactly as INDEX always did. The `_th` param is kept so
 *  call sites and why() (which still narrates ceiling saturation in the drawer) share one
 *  thresholds() source; it no longer affects cell rendering. */
export function cellDisplay(row: LedgerRow, col: ScoreCol, _th: Record<string, number | null>): CellDisplay {
  const v = row.scores[col.key];
  if (v === null || v === undefined || (col.noRank && col.kind === "pct" && v <= 0)) {
    return col.absent ? { text: col.absent, kind: "absent" } : { text: "—", kind: "dash" };
  }
  if (col.kind === "money") return { text: money(v), kind: "num" };
  if (col.kind === "count") return { text: String(Math.round(v)), kind: "num" };
  return { text: col.decimals != null ? floorFixed(v, col.decimals) : String(Math.round(v)), kind: "num" };
}

/** FLOOR to d decimals — the one display convention for composite index figures
 *  (2026-07-31): rounding can manufacture a ceiling that does not exist in the data
 *  (99.95 → "100.0"); floor cannot. Same rule as cohort-metrics.formatScoreFloor1
 *  (which is floorFixed at d=1, used by the card feed). Display layer only. */
export function floorFixed(n: number, d: number): string {
  const f = Math.pow(10, d);
  return (Math.floor(n * f) / f).toFixed(d);
}

export interface MobileCell {
  label: string;
  value: string;
}

/** Mobile score cells (≤767). Uses the SAME cellDisplay (so suppression em-dashes and
 *  absent text carry over unchanged); columns pair by family where cfg.mobilePairs is
 *  set (Rising Star: MOM = sci/net momentum, VIS = sci/net visibility) rather than being
 *  dropped, else one cell per column. Nothing here is viewport-derived. */
export function mobileCells(cfg: CohortConfig, row: LedgerRow, th: Record<string, number | null>): MobileCell[] {
  if (cfg.mobilePairs) {
    return cfg.mobilePairs.map((p) => ({
      label: p.label,
      value: p.keys
        .map((k) => {
          const col = cfg.cols.find((c) => c.key === k);
          return col ? cellDisplay(row, col, th).text : "—";
        })
        .join(" / "),
    }));
  }
  return cfg.cols.map((col) => ({ label: col.label, value: cellDisplay(row, col, th).text }));
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
  // COM roster (Phase 3): no index, no tied-head banding — tier grouping is the
  // only structure; every row is a tail row.
  if (rows[0].idx == null) return { headBands: [], tailRows: rows, headMaxRank: 0 };
  const idxCeiling = rows[0].idx ?? 0; // ranked by index, so the top row carries the ceiling
  const boundary = idxCeiling - cfg.bandResolution;

  // prefix of rows still within resolution of the ceiling = the tied head
  let headEnd = 0;
  while (headEnd < rows.length && (rows[headEnd].idx ?? -Infinity) >= boundary) headEnd++;
  const head = rows.slice(0, headEnd);
  const tailRows = rows.slice(headEnd);

  const headBands: Band[] = [];
  let i = 0;
  let letter = 65; // 'A'
  const d = cfg.idxDecimals;
  while (i < head.length) {
    const start = i;
    const hi = head[i].idx ?? 0;
    i++;
    while (i < head.length && hi - (head[i].idx ?? -Infinity) <= cfg.bandResolution) i++;
    const group = head.slice(start, i);
    const lo = group[group.length - 1].idx ?? 0;
    const spread = +(hi - lo).toFixed(2);
    const r0 = group[0].rank ?? 0;
    const r1 = group[group.length - 1].rank ?? 0;
    headBands.push({
      label: `BAND ${String.fromCharCode(letter)} · RANK ${r0}${r1 > r0 ? `–${r1}` : ""}`,
      note:
        group.length > 1
          ? `INDEX ${floorFixed(hi, d)} → ${floorFixed(lo, d)} · SPREAD ${spread} · WITHIN COHORT RESOLUTION — TREAT AS TIED`
          : `INDEX ${floorFixed(hi, d)} · TIED AT THE COHORT CEILING`,
      rows: group,
    });
    letter++;
  }
  return { headBands, tailRows, headMaxRank: head.length ? (head[head.length - 1].rank ?? 0) : 0 };
}

// ── Drawer "why" (derived from suppression state + scores) ───────────────────
function scoreLabel(col: ScoreCol, v: number): string {
  return `${col.label} ${col.decimals != null ? floorFixed(v, col.decimals) : Math.round(v)}`;
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
    return { label, value: `percentile ${floorFixed(v, 1)} within ${cfg.label} · methodology v4.2` };
  });
  if (cfg.tag === "COM") {
    // Phase 3 roster: community is not ranked — the trace states the standing
    // facts (tier + reach), never a position. cohortTotal stays a plain count.
    t.push({
      label: "EVIDENCE TIER",
      value: `${row.tier ?? "unresolved"}${row.recurrenceBand === "recurs" ? " · recurs across years" : ""} · ${cohortTotal.toLocaleString()} qualifying ${cfg.label}`,
    });
    t.push({
      label: "MEDICARE REACH",
      value:
        row.patientVolume != null && row.patientVolume > 0
          ? `${Math.round(row.patientVolume).toLocaleString()} beneficiaries · 3yr Part B`
          : "no Part B beneficiary record",
    });
    t.push({ label: "PART D ONCOLOGY", value: row.partDPresent ? "present" : "not observed" });
  } else {
    t.push({
      label: "COHORT RANK",
      value: `#${row.rank} of ${cohortTotal.toLocaleString()} ${cfg.label}${row.globalRank ? ` · #${row.globalRank} global` : ""}`,
    });
  }
  return t;
}

// ── Data ─────────────────────────────────────────────────────────────────────
const S = (v: unknown): string => (v == null ? "" : String(v));
const N = (v: unknown): number | null => (v == null ? null : Number(v));
export const titleCase = (s: string): string =>
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

  const base: LedgerRow = {
    // COM (Phase 3 roster): the RPC emits no rank and no idx — community is
    // not ranked. EST/RS keep both.
    rank: cfg.tag === "COM" ? null : Number(r.rank),
    globalRank: r.global_rank == null ? null : Number(r.global_rank),
    hcpId: S(r.hcp_id),
    name,
    chips,
    archetype: cfg.tag === "RS" ? ((r.archetype as string) ?? null) : null,
    scores,
    idx: cfg.tag === "COM" ? null : Number(r.idx),
    summary: (r.summary as string) ?? null,
  };

  if (cfg.tag === "COM") {
    base.tierPriority = N(r.tier_priority);
    base.patientVolume = N(r.patient_volume);
    base.partDPresent = r.part_d_present == null ? null : Boolean(r.part_d_present);
  }

  if (cfg.tag === "COM") {
    base.tier = (r.tier as string) ?? null;
    base.recurrenceBand = (r.recurrence_band as string) ?? null;
    base.anchorStem = (r.anchor_stem as string) ?? null;
    base.anchorStems = (r.anchor_stems as string[] | null) ?? null;
    base.anchorYears = (r.anchor_years as number[] | null) ?? null;
    base.supportedEvidence = (r.supported_evidence as string) ?? null;
    base.supportedEvidenceRank = r.supported_evidence_rank == null ? null : Number(r.supported_evidence_rank);
    base.lungWeighted = !!r.lung_weighted;
  }
  return base;
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

export const LEDGER_PAGE_SIZE = 1000; // PostgREST hard cap; also our page size

// ── Territory scope (Commit 2, 2026-08-12) ─────────────────────────────────
// One shared scope shape across all three cohort ledgers. Every ledger mount
// defaults to the user's territory (an override never outlives the current
// cohort view). key "mine" = the user's
// msl_profiles territory; region keys match TERRITORY_STATES (lowercase — the
// selector emits these canonical keys, so statesFromTerritory can never miss
// on casing); "national" = empty states = the RPCs' DEFAULT behavior.
export interface LedgerScope {
  key: string; // "mine" | "northeast" | ... | "national"
  label: string; // display word (territory_label for mine, region name otherwise)
  states: string[]; // [] = national
}
export const LEDGER_REGION_OPTIONS: { key: string; label: string }[] = [
  { key: "northeast", label: "Northeast" },
  { key: "southeast", label: "Southeast" },
  { key: "midwest", label: "Midwest" },
  { key: "southwest", label: "Southwest" },
  { key: "west", label: "West" },
  { key: "national", label: "National" },
];
/** COM roster keyset cursor (Phase 3): the last row's raw ordering tuple. The RPC
 *  negates volume internally so the composite (tier, -volume, hcp_id) compares as
 *  one ascending tuple. */
export interface RosterCursor {
  tierPriority: number;
  patientVolume: number;
  hcpId: string;
}

/** One keyset page. EST/RS pass afterCursor = the last rank already held (0 for the
 *  first page). COM passes the last row's RosterCursor (undefined for the first page)
 *  — community has no rank, so the cursor is the ordering tuple itself. No offset, so
 *  no dup/skip. hasMore is true when a full page came back. */
export async function loadLedgerPage(
  cfg: CohortConfig,
  afterCursor: number | RosterCursor | undefined = 0,
  limit = LEDGER_PAGE_SIZE,
  tiers?: string[],
  states?: string[],
): Promise<LedgerData & { hasMore: boolean }> {
  // COM's roster RPC takes the composite cursor + p_tiers (default anchored+supported
  // when omitted) and returns filtered_total alongside cohort_total. EST/RS RPCs take
  // p_after_rank only — an unknown named arg would make the RPC unresolvable.
  const args: Record<string, unknown> =
    cfg.tag === "COM"
      ? typeof afterCursor === "object" && afterCursor != null
        ? {
            p_limit: limit,
            p_after_tier_priority: afterCursor.tierPriority,
            p_after_patient_volume: afterCursor.patientVolume,
            p_after_hcp_id: afterCursor.hcpId,
          }
        : { p_limit: limit }
      : { p_limit: limit, p_after_rank: typeof afterCursor === "number" ? afterCursor : 0 };
  if (cfg.tag === "COM" && tiers && tiers.length) args.p_tiers = tiers;
  // Territory scope (all three RPCs accept p_states; omitted = DEFAULT '{}' = national).
  if (states && states.length) args.p_states = states;
  const { data, error } = await supabase.rpc(cfg.rpc, args);
  if (error) {
    console.error(`${cfg.rpc} failed:`, error.message);
    return { cohortTotal: 0, filteredTotal: 0, tierCounts: null, rows: [], hasMore: false };
  }
  const d = (data as { cohort_total?: number; filtered_total?: number; tier_counts?: Record<string, number> | null; rows?: unknown[] }) ?? {};
  const rows: LedgerRow[] = ((d.rows ?? []) as Record<string, unknown>[]).map((r) => mapRow(cfg, r));
  const cohortTotal = Number(d.cohort_total) || rows.length;
  const filteredTotal = d.filtered_total != null ? Number(d.filtered_total) : cohortTotal;
  return { cohortTotal, filteredTotal, tierCounts: d.tier_counts ?? null, rows, hasMore: rows.length === limit };
}
