// Cohort Ledger — Design "Cohort Ledger Build Reference". Stage 2: one surface
// (/cohorts/ledger), one component, THREE cohort configurations behind a tab toggle
// (Established / Rising Stars / Community). Switching a tab re-renders this same
// ledger with that cohort's columns, scoring and marker — it is a toggle between
// three single-cohort views, never a mixed all-cohorts list. Desktop, WIDE (1440).
//
// The frame is the source of form, so this uses the frame's own palette and type
// (mono + Source Serif, amber rank #E0A75E, per-cohort left edge) rather than the app
// tokens, per the build instruction. All values are live (cohortLedger.ts / the three
// *_ledger RPCs); suppression, bands, the drawer "why" and the trace are computed
// there. Not in stage 2: tags, relationship-state column, per-row controls
// (track/attachments), mobile — stages 3–4.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import AppLayout from "../AppLayout";
import PeopleNavStrip from "../PeopleNavStrip";
import SearchBar from "../SearchBar";
import { FONT, GROUND, GOLD, COOL } from "../../lib/designTokens";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { useFilterContext } from "../../lib/filter-context";
import { useTrack, type Track } from "../../lib/TrackContext";
import { resolveFeedRoute, trackToDashboardSlug } from "../../lib/routeSlugs";
import { taIdForApiSlug } from "../../lib/api";
import type { RelationshipStatus } from "../../lib/relationships";
import {
  COHORTS,
  floorFixed,
  loadLedgerPage,
  loadLedgerMeta,
  thresholds,
  cellDisplay,
  mobileCells,
  layout,
  why,
  trace,
  evidenceChip,
  LEDGER_PAGE_SIZE,
  COM_TIER_FILTERS,
  COM_ALL_TIERS,
  COM_DEFAULT_TIERS,
  type CohortConfig,
  type LedgerMeta,
  type LedgerRow,
  type Band,
} from "../../lib/cohortLedger";

// ≤767px is the mobile treatment (stage 4). Reactive to viewport changes / rotation.
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

// Frame palette (self-contained; the ledger's visual system per the Build Reference).
// Register tokens substituted 2026-08-05 for exact value matches only; every
// remaining literal is a near-twin of a token (one digit off) or a cohort
// semantic — converging those is a visible change, deferred on purpose.
const P = {
  page: "#08090A", // near-twin of GROUND.g0 #0a0a0a — NOT converged
  card: GROUND.g2, // #0e1013, exact
  head: "#0B0D10", // near-twin of GROUND.g1 — NOT converged
  rowHover: "#131619", // near-twin of LINE.l0's value — NOT converged
  drawer: "#0A0C0F", // near-twin of GROUND.g1 (one digit from P.band) — NOT converged
  band: GROUND.g1, // #0a0c0e, exact
  line: "rgba(255,255,255,.06)", // alpha hairlines; register rules are opaque — NOT converged
  lineMed: "rgba(255,255,255,.09)",
  lineStrong: "rgba(255,255,255,.14)",
  amber: GOLD.rank, // #e0a75e — this file is the token's source
  ink0: COOL.ui, // cool ramp — this family fed the COOL ink steps
  ink1: COOL.ui, // was INK_COOL.ink1 #e7e8e9 — retired into ui (Δ1.02, invisible)
  ink2: COOL.prose,
  ink3: COOL.muted,
  ink4: "#8F959A", // near-twin of retired grey2 — NOT converged
  ink5: "#7C8288", // near-twin of COOL.label (not equal) — NOT converged
  ink6: "#63696E", // near-twin of COOL.faint — NOT converged
  dash: "#71787E", // between COOL.label and retired grey4 — NOT converged
} as const;

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px ${FONT.mono}` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px ${FONT.serif}` } as const);

// The in-page cohort tab toggle (CohortTabs) was removed 2026-07-31 when the ledger
// became the PEOPLE destination: the PeopleNavStrip's cohort row is the single cohort
// control, driving the addressable /cohorts/ledger/:cohort routes via onPickCohort —
// URL-addressable where the in-page state was not, and one control system across all
// people surfaces.
const COHORT_SLUG_TO_TAG: Record<string, string> = {
  established: "EST",
  "rising-stars": "RS",
  community: "COM",
};
const TAG_TO_TRACK: Record<string, Track> = {
  EST: "established",
  RS: "rising-stars",
  COM: "community",
};

// ── Our-side controls (stage 3) — INSIGHT · TRACK · STATE, columned right ──────
// Widths shared by the header and the rows so the columns line up.
const OURS = { insight: 62, track: 44, state: 108 } as const;

// The six-state relationship ladder Design designed: read by FILL COUNT, not hue (no new
// colour enters the row — amber stays with rank). Not Engaged 0 · Targeted 1 · Contacted
// 2 · Engaged 3 · Active Relationship 4; Paused is off-ladder (four segments outlined
// with a strike rule). Same values as the profile's STATUS dropdown.
const STATUS_ORDER: RelationshipStatus[] = [
  "not_engaged",
  "targeted",
  "contacted",
  "engaged",
  "active_relationship",
  "paused",
];
const STATUS_LABEL: Record<RelationshipStatus, string> = {
  not_engaged: "Not Engaged",
  targeted: "Targeted",
  contacted: "Contacted",
  engaged: "Engaged",
  active_relationship: "Active Relationship",
  paused: "Paused",
};
const STATUS_FILL: Record<RelationshipStatus, number> = {
  not_engaged: 0,
  targeted: 1,
  contacted: 2,
  engaged: 3,
  active_relationship: 4,
  paused: -1, // off-ladder
};
const LADDER_SEGMENTS = 4;

// Four-segment fill ladder. Filled segments read the state; Paused shows all outlined
// with a diagonal strike. Ink only — no hue.
function StateLadder({ status }: { status: RelationshipStatus }) {
  const fill = STATUS_FILL[status];
  const paused = fill < 0;
  return (
    <div style={{ position: "relative", display: "flex", gap: 3, alignItems: "center" }}>
      {Array.from({ length: LADDER_SEGMENTS }).map((_, i) => {
        const on = !paused && i < fill;
        return (
          <span
            key={i}
            style={{
              width: 6,
              height: 12,
              background: on ? P.ink1 : "transparent",
              border: `1px solid ${on ? P.ink1 : P.lineStrong}`,
              borderRadius: 1,
            }}
          />
        );
      })}
      {paused ? (
        <span style={{ position: "absolute", left: -2, right: -2, top: "50%", height: 1, background: P.ink4, transform: "rotate(-16deg)" }} />
      ) : null}
    </div>
  );
}

// Bookmark glyph — filled when tracked, outlined when not. Legible down a long list.
function Bookmark({ on }: { on: boolean }) {
  return (
    <svg width="12" height="15" viewBox="0 0 12 15" aria-hidden>
      <path
        d="M1 1.5h10v12l-5-3.2-5 3.2z"
        fill={on ? P.ink0 : "none"}
        stroke={on ? P.ink0 : P.ink5}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Evidence chip (COM) — frame 1a/2a. Tier word first (same vocabulary as the filter
// chips, so filter↔row is stated), then the evidence segments: anchored = LUNG-ONLY
// ORAL · drug · years; supported = the view's verbatim string (group 5 stays
// "cross-indication targeted therapy observed"). Other tiers carry the tier word alone,
// dashed. LUNG-WEIGHTED ORAL MIX marker below when flagged. No percentage in v1.
function EvidenceChipView({ row, mobile = false }: { row: LedgerRow; mobile?: boolean }) {
  const chip = evidenceChip(row);
  if (!chip) return null;
  const dashed = chip.strength === "other";
  const border = chip.strength === "anchored" ? "#4A3618" : chip.strength === "supported" ? P.lineStrong : P.lineMed;
  const bg = chip.strength === "anchored" ? "rgba(224,167,94,.05)" : "transparent";
  const tierColor = chip.strength === "anchored" ? P.amber : chip.strength === "supported" ? "#B99A68" : P.ink4;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 3 }}>
      <span style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", flexWrap: "wrap", gap: 8, border: `1px ${dashed ? "dashed" : "solid"} ${border}`, background: bg, padding: mobile ? "3px 8px" : "4px 9px", ...mono(mobile ? 9 : 9.5), letterSpacing: ".09em" }}>
        <span style={{ color: tierColor }}>{chip.tierWord}</span>
        {chip.segments.map((seg, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#7A5520" }}>·</span>
            <span style={{ color: chip.strength === "anchored" && i === 1 ? GOLD.gold : P.ink4 }}>{seg}</span>
          </span>
        ))}
      </span>
      {chip.lungWeighted ? (
        <span style={{ ...mono(mobile ? 8.5 : 9), letterSpacing: ".1em", color: P.ink5 }}>LUNG-WEIGHTED ORAL MIX</span>
      ) : null}
    </div>
  );
}

// Filter chip (COM tier chips + ALL) — selected reads amber, unselected dim.
function chipStyle(on: boolean): CSSProperties {
  return {
    ...mono(9.5),
    letterSpacing: ".1em",
    color: on ? "#E0A94A" : P.ink6,
    background: on ? "rgba(224,167,94,.08)" : "transparent",
    border: `1px solid ${on ? "rgba(224,167,94,.5)" : P.lineMed}`,
    padding: "5px 9px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function ColumnHeads({ cfg }: { cfg: CohortConfig }) {
  const head = (label: string, sub: string, w: number, align: "left" | "right" | "center" = "right") => (
    <div style={{ width: w, textAlign: align, ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
      {label}<br /><span style={{ color: P.ink5 }}>{sub}</span>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "flex-end", padding: "10px 20px 8px 23px", borderBottom: `1px solid ${P.lineStrong}`, background: P.head }}>
      <div style={{ width: 104, paddingRight: 12, ...mono(9, 500), letterSpacing: ".14em", color: P.amber }}>
        RANK<br /><span style={{ color: P.ink5 }}>US · GLOBAL</span>
      </div>
      <div style={{ flex: 1, minWidth: 300, ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
        PHYSICIAN<br /><span style={{ color: P.ink5 }}>{cfg.nameSub}</span>
      </div>
      <div style={{ width: 88, textAlign: "right", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
        INDEX<br /><span style={{ color: P.ink5 }}>IN COHORT</span>
      </div>
      {cfg.cols.map((c) => (
        <div key={c.key} style={{ width: c.w, textAlign: "right", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
          {c.label}<br /><span style={{ color: P.ink5 }}>{c.sub}</span>
        </div>
      ))}
      {/* our-side controls — universal across cohorts */}
      <div style={{ width: 14 }} />
      {head("INSIGHT", "CAPTURED", OURS.insight)}
      {head("TRK", "MINE", OURS.track, "center")}
      {head("STATE", "OUR CONTACT", OURS.state, "left")}
    </div>
  );
}

function Row({
  cfg,
  row,
  cohortTotal,
  th,
  open,
  onToggle,
}: {
  cfg: CohortConfig;
  row: LedgerRow;
  cohortTotal: number;
  th: Record<string, number | null>;
  open: boolean;
  onToggle: () => void;
}) {
  const { isTracked, toggleSave, getStatus, setStatus, getInsightCount } = useRelationships();
  const [menuOpen, setMenuOpen] = useState(false);
  const tracked = isTracked(row.hcpId);
  const status = getStatus(row.hcpId);
  const insight = getInsightCount(row.hcpId);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div style={{ position: "relative", borderBottom: `1px solid ${P.line}` }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: cfg.markerColor }} />
      {open ? <div style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 2, background: P.amber }} /> : null}
      {/* right track edge lights up when this row is tracked — legible down the list */}
      {tracked ? <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 3, background: P.ink2 }} /> : null}
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "flex-start", padding: "13px 20px 13px 23px", cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = P.rowHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {/* rank */}
        <div style={{ width: 104, paddingRight: 12, display: "flex", flexDirection: "column", gap: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ font: `600 40px 'IBM Plex Sans Condensed','IBM Plex Mono',monospace`, color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 0.86, letterSpacing: "-.015em" }}>
              {row.rank}
            </span>
            <span style={{ ...mono(9.5, 500), color: "#A07B45", letterSpacing: ".12em" }}>US</span>
          </div>
          <span style={{ ...mono(9.5), color: P.ink5, letterSpacing: ".06em" }}>#{row.globalRank ?? "—"} GLOBAL</span>
        </div>
        {/* name + chips + summary */}
        <div style={{ flex: 1, minWidth: 300, paddingRight: 24, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <span style={{ ...serif(17, 500), color: P.ink0, letterSpacing: "-.005em" }}>{row.name}</span>
            {/* archetype chip — Rising Star only, a physician attribute inline with the name */}
            {row.archetype ? (
              <span style={{ ...mono(9, 500), color: P.ink3, letterSpacing: ".1em", padding: "1px 6px", border: `1px solid ${P.lineStrong}`, borderRadius: 2, alignSelf: "center" }}>
                {row.archetype.toUpperCase()}
              </span>
            ) : null}
            {row.chips.map((chip, i) => (
              <span key={i} style={{ ...mono(i === 0 ? 10 : 10.5), color: i === 0 ? P.ink4 : P.ink5, letterSpacing: i === 0 ? ".08em" : ".02em" }}>
                {chip}
              </span>
            ))}
          </div>
          {row.tier ? <EvidenceChipView row={row} /> : null}
          {row.summary ? (
            <div style={{ ...serif(13.5), lineHeight: 1.55, color: P.ink4, maxWidth: "104ch", textWrap: "pretty" }}>{row.summary}</div>
          ) : null}
        </div>
        {/* index */}
        <div style={{ width: 88, textAlign: "right", paddingTop: 5, ...mono(18, 500), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>
          {floorFixed(row.idx, cfg.idxDecimals)}
        </div>
        {/* score cells */}
        {cfg.cols.map((col) => {
          const d = cellDisplay(row, col, th);
          if (d.kind === "absent") {
            return (
              <div key={col.key} style={{ width: col.w, textAlign: "right", paddingTop: 10 }}>
                <span style={{ ...mono(9.5), color: P.dash, letterSpacing: ".1em" }}>{d.text}</span>
              </div>
            );
          }
          const color = d.kind === "dash" ? P.dash : col.noRank ? P.ink4 : P.ink0;
          return (
            <div key={col.key} style={{ width: col.w, textAlign: "right", paddingTop: 10 }}>
              <span style={{ ...mono(13), color, fontVariantNumeric: "tabular-nums" }}>{d.text}</span>
            </div>
          );
        })}

        {/* ── our-side controls (stage 3) ─────────────────────────────────── */}
        <div style={{ width: 14 }} />
        {/* INSIGHT — count of captured field insights; blank where none */}
        <div style={{ width: OURS.insight, textAlign: "right", paddingTop: 10 }}>
          {insight > 0 ? (
            <span style={{ ...mono(13), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{insight}</span>
          ) : null}
        </div>
        {/* TRACK — bookmark toggle (does not open the drawer) */}
        <div style={{ width: OURS.track, display: "flex", justifyContent: "center", paddingTop: 8 }}>
          <button
            onClick={(e) => { stop(e); void toggleSave(row.hcpId, "cohort_ledger"); }}
            title={tracked ? "Tracked — click to untrack" : "Track this HCP"}
            style={{ background: "none", border: "none", padding: 4, cursor: "pointer", lineHeight: 0, minHeight: 0 }}
          >
            <Bookmark on={tracked} />
          </button>
        </div>
        {/* STATE — six-state fill ladder + menu */}
        <div style={{ width: OURS.state, paddingTop: 8, position: "relative" }}>
          <button
            onClick={(e) => { stop(e); setMenuOpen((o) => !o); }}
            title={STATUS_LABEL[status]}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "3px 2px", cursor: "pointer", minHeight: 0 }}
          >
            <StateLadder status={status} />
            <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".06em", whiteSpace: "nowrap" }}>
              {STATUS_LABEL[status].toUpperCase()}
            </span>
          </button>
          {menuOpen ? (
            <>
              <div onClick={(e) => { stop(e); setMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div onClick={stop} style={{ position: "absolute", top: 26, left: 0, zIndex: 41, background: "#0C0E11", border: `1px solid ${P.lineStrong}`, boxShadow: "0 8px 24px rgba(0,0,0,.5)", minWidth: 176 }}>
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => { stop(e); setMenuOpen(false); if (s !== status) void setStatus(row.hcpId, s, "cohort_ledger"); }}
                    style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px", background: s === status ? P.rowHover : "transparent", border: "none", borderBottom: `1px solid ${P.line}`, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = P.rowHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = s === status ? P.rowHover : "transparent")}
                  >
                    <StateLadder status={s} />
                    <span style={{ ...mono(10), color: s === status ? P.ink1 : P.ink4, letterSpacing: ".04em" }}>{STATUS_LABEL[s]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {open ? (
        <div style={{ display: "flex", gap: 48, padding: "6px 20px 22px 127px", background: P.drawer, borderTop: `1px solid ${P.line}` }}>
          <div style={{ flex: 1, maxWidth: 540, display: "flex", flexDirection: "column", gap: 9, paddingTop: 14 }}>
            <div style={{ ...mono(9, 500), letterSpacing: ".18em", color: P.ink5 }}>WHAT PLACED THIS ROW HERE</div>
            <div style={{ ...serif(13.5), lineHeight: 1.6, color: COOL.prose, textWrap: "pretty" }}>{why(cfg, row, th)}</div>
            <div style={{ ...mono(10), lineHeight: 1.6, color: "#767C81", letterSpacing: ".04em", paddingTop: 2 }}>
              THE SUMMARY LINE ABOVE IS MODEL SYNTHESIS OVER THE SOURCES AT RIGHT · REVIEW BEFORE USE · NO CLINICAL CLAIM
            </div>
          </div>
          <div style={{ width: 620, display: "flex", flexDirection: "column", paddingTop: 14 }}>
            <div style={{ ...mono(9, 500), letterSpacing: ".18em", color: P.ink5, paddingBottom: 9 }}>TRACE</div>
            {trace(cfg, row, cohortTotal).map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "7px 0", borderTop: `1px solid ${P.line}` }}>
                <span style={{ width: 176, flexShrink: 0, ...mono(10), letterSpacing: ".1em", color: P.ink5 }}>{s.label}</span>
                <span style={{ flex: 1, ...mono(11.5), color: P.ink2 }}>{s.value}</span>
                <Link to={`/hcp/${row.hcpId}`} style={{ ...mono(10), letterSpacing: ".08em", flexShrink: 0, color: "#7FB3BB", textDecoration: "none", borderBottom: "1px solid rgba(127,179,187,.35)" }}>
                  OPEN ↗
                </Link>
              </div>
            ))}
            <div style={{ ...mono(10), lineHeight: 1.6, color: "#767C81", letterSpacing: ".06em", paddingTop: 10, borderTop: `1px solid ${P.line}`, marginTop: 2 }}>
              {cfg.traceFoot}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Mobile row (≤767) — a stacked card. Rank leads, cohort marker on the left edge,
// name + archetype, meta, summary, the score columns paired by family (suppression
// preserved), and the four stage-3 controls inline and reachable: bookmark top-right,
// state ladder + insight in a controls row, archetype chip by the name. The drawer
// stacks why over trace. Nothing here recomputes suppression/bands — same th/layout.
function MobileRow({
  cfg,
  row,
  cohortTotal,
  th,
  open,
  onToggle,
}: {
  cfg: CohortConfig;
  row: LedgerRow;
  cohortTotal: number;
  th: Record<string, number | null>;
  open: boolean;
  onToggle: () => void;
}) {
  const { isTracked, toggleSave, getStatus, setStatus, getInsightCount } = useRelationships();
  const [menuOpen, setMenuOpen] = useState(false);
  const tracked = isTracked(row.hcpId);
  const status = getStatus(row.hcpId);
  const insight = getInsightCount(row.hcpId);
  const cells = mobileCells(cfg, row, th);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <div style={{ position: "relative", borderBottom: `1px solid ${P.line}` }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: cfg.markerColor }} />
      {open ? <div style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 2, background: P.amber }} /> : null}
      {tracked ? <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 3, background: P.ink2 }} /> : null}

      <div onClick={onToggle} style={{ padding: "13px 16px 14px 19px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 7 }}>
        {/* rank + track/index */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ font: `600 34px 'IBM Plex Sans Condensed','IBM Plex Mono',monospace`, color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 0.85, letterSpacing: "-.015em" }}>{row.rank}</span>
            <span style={{ ...mono(8.5, 500), color: "#A07B45", letterSpacing: ".12em" }}>US</span>
            <span style={{ ...mono(8.5), color: P.ink5, letterSpacing: ".06em" }}>#{row.globalRank ?? "—"} GLB</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={(e) => { stop(e); void toggleSave(row.hcpId, "cohort_ledger"); }} title={tracked ? "Tracked — tap to untrack" : "Track"} style={{ background: "none", border: "none", padding: 4, cursor: "pointer", lineHeight: 0, minHeight: 0 }}>
              <Bookmark on={tracked} />
            </button>
            <span style={{ ...mono(17, 500), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{floorFixed(row.idx, cfg.idxDecimals)}</span>
          </div>
        </div>

        {/* name + archetype + meta */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...serif(16, 500), color: P.ink0 }}>{row.name}</span>
          {row.archetype ? (
            <span style={{ ...mono(8.5, 500), color: P.ink3, letterSpacing: ".08em", padding: "1px 5px", border: `1px solid ${P.lineStrong}`, borderRadius: 2 }}>{row.archetype.toUpperCase()}</span>
          ) : null}
        </div>
        {row.chips.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {row.chips.map((chip, i) => (
              <span key={i} style={{ ...mono(9.5), color: i === 0 ? P.ink4 : P.ink5, letterSpacing: ".02em" }}>{chip}</span>
            ))}
          </div>
        ) : null}

        {/* evidence chip (COM) */}
        {row.tier ? <EvidenceChipView row={row} mobile /> : null}

        {/* summary */}
        {row.summary ? <div style={{ ...serif(13), lineHeight: 1.5, color: P.ink4, textWrap: "pretty" }}>{row.summary}</div> : null}

        {/* score columns — paired by family, suppression preserved */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 16px", paddingTop: 1 }}>
          {cells.map((c) => (
            <span key={c.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ ...mono(8.5, 500), color: P.ink6, letterSpacing: ".12em" }}>{c.label}</span>
              <span style={{ ...mono(12), color: c.value === "—" ? P.dash : P.ink1, fontVariantNumeric: "tabular-nums" }}>{c.value}</span>
            </span>
          ))}
        </div>

        {/* stage-3 controls row: state ladder (tap → menu) + insight */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 2, position: "relative" }}>
          <button onClick={(e) => { stop(e); setMenuOpen((o) => !o); }} title={STATUS_LABEL[status]} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "2px 0", cursor: "pointer", minHeight: 0 }}>
            <StateLadder status={status} />
            <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".06em" }}>{STATUS_LABEL[status].toUpperCase()}</span>
          </button>
          {insight > 0 ? (
            <span style={{ ...mono(9), color: P.ink4, letterSpacing: ".08em" }}>
              INSIGHT <span style={{ color: P.ink2 }}>{insight}</span>
            </span>
          ) : null}
          {menuOpen ? (
            <>
              <div onClick={(e) => { stop(e); setMenuOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div onClick={stop} style={{ position: "absolute", top: 26, left: 0, zIndex: 41, background: "#0C0E11", border: `1px solid ${P.lineStrong}`, boxShadow: "0 8px 24px rgba(0,0,0,.5)", minWidth: 190 }}>
                {STATUS_ORDER.map((s) => (
                  <button key={s} onClick={(e) => { stop(e); setMenuOpen(false); if (s !== status) void setStatus(row.hcpId, s, "cohort_ledger"); }} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px", background: s === status ? P.rowHover : "transparent", border: "none", borderBottom: `1px solid ${P.line}`, cursor: "pointer", textAlign: "left" }}>
                    <StateLadder status={s} />
                    <span style={{ ...mono(10.5), color: s === status ? P.ink1 : P.ink4, letterSpacing: ".04em" }}>{STATUS_LABEL[s]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* drawer — why over trace, stacked */}
      {open ? (
        <div style={{ padding: "4px 16px 18px 19px", background: P.drawer, borderTop: `1px solid ${P.line}`, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 10 }}>
            <div style={{ ...mono(8.5, 500), letterSpacing: ".18em", color: P.ink5 }}>WHAT PLACED THIS ROW HERE</div>
            <div style={{ ...serif(13), lineHeight: 1.55, color: COOL.prose, textWrap: "pretty" }}>{why(cfg, row, th)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ ...mono(8.5, 500), letterSpacing: ".18em", color: P.ink5, paddingBottom: 7 }}>TRACE</div>
            {trace(cfg, row, cohortTotal).map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: `1px solid ${P.line}` }}>
                <span style={{ flexShrink: 0, ...mono(9), letterSpacing: ".08em", color: P.ink5, width: 118 }}>{s.label}</span>
                <span style={{ flex: 1, ...mono(10.5), color: P.ink2 }}>{s.value}</span>
                <Link to={`/hcp/${row.hcpId}`} style={{ ...mono(9), letterSpacing: ".08em", flexShrink: 0, color: "#7FB3BB", textDecoration: "none", borderBottom: "1px solid rgba(127,179,187,.35)" }}>OPEN ↗</Link>
              </div>
            ))}
            <div style={{ ...mono(9), lineHeight: 1.55, color: "#767C81", letterSpacing: ".04em", paddingTop: 9, borderTop: `1px solid ${P.line}`, marginTop: 2 }}>{cfg.traceFoot}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BandHeader({ band }: { band: Band }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 20px 7px 23px", background: P.band, borderBottom: `1px solid ${P.line}` }}>
      <span style={{ ...mono(9.5, 500), letterSpacing: ".16em", color: P.ink4 }}>{band.label}</span>
      <span style={{ flex: 1, height: 1, background: P.lineMed }} />
      <span style={{ ...mono(9.5), letterSpacing: ".1em", color: "#767C81" }}>{band.note}</span>
    </div>
  );
}

// The tail (everyone below the tied head) is the heavy part — up to ~6,470 rows, each
// with a drawer. It is window-virtualised: only the rows near the viewport mount, and
// nearing the end triggers the next rank-keyed page. Heights are dynamic (summary wrap,
// and the single open drawer), measured per row via measureElement's ResizeObserver.
function VirtualTail({
  cfg,
  rows,
  th,
  cohortTotal,
  open,
  onToggle,
  onNearEnd,
  isMobile,
}: {
  cfg: CohortConfig;
  rows: LedgerRow[];
  th: Record<string, number | null>;
  cohortTotal: number;
  open: string | null;
  onToggle: (id: string) => void;
  onNearEnd: () => void;
  isMobile: boolean;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const RowComp = isMobile ? MobileRow : Row; // identical props; mobile cards are taller

  // distance from the document top to the top of the list, so the window virtualiser
  // places rows correctly beneath the (non-virtualised) head. Re-measured on resize.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => (isMobile ? 210 : 108),
    overscan: 8,
    scrollMargin,
  });
  const items = virtualizer.getVirtualItems();

  // re-measure when the layout mode flips (row heights change wholesale)
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [isMobile, virtualizer]);

  // load the next page when the last mounted row is within 8 of the end
  const last = items[items.length - 1];
  useEffect(() => {
    if (last && last.index >= rows.length - 8) onNearEnd();
  }, [last, rows.length, onNearEnd]);

  return (
    <div ref={listRef} style={{ position: "relative", height: virtualizer.getTotalSize(), width: "100%" }}>
      {items.map((vi) => {
        const row = rows[vi.index];
        const id = `${cfg.tag}-${row.rank}`;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start - scrollMargin}px)` }}
          >
            <RowComp cfg={cfg} row={row} cohortTotal={cohortTotal} th={th} open={open === id} onToggle={() => onToggle(id)} />
          </div>
        );
      })}
    </div>
  );
}

export default function CohortLedger() {
  // Cohort from the URL (/cohorts/ledger/:cohort); bare /cohorts/ledger = Established.
  const params = useParams<{ cohort?: string }>();
  const navigate = useNavigate();
  const { setTrack } = useTrack();
  const { userTerritory } = useFilterContext();
  const tag = COHORT_SLUG_TO_TAG[(params.cohort ?? "").toLowerCase()] ?? "EST";
  const cfg = COHORTS.find((c) => c.tag === tag) ?? COHORTS[0];
  const cohortTrack: Track = TAG_TO_TRACK[cfg.tag] ?? "established";

  // Keep TrackContext in sync so the strip's cohort row marks the active cohort here
  // exactly as it does on the feed.
  useEffect(() => {
    setTrack(cohortTrack);
  }, [cohortTrack, setTrack]);

  // Synthetic feed route for the strip: the ledger RPCs are NSCLC-locked, so the strip's
  // subject scope is pinned to Oncology/NSCLC until the RPCs take a TA parameter. TA and
  // indication controls navigate to the (unlinked but routed) card feed as shipped.
  const stripRoute = resolveFeedRoute({
    ta: "oncology",
    dashboard: trackToDashboardSlug(cohortTrack),
    indication: "nsclc",
    isHomePath: false,
  });
  const nsclcTaId = taIdForApiSlug("nsclc");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [meta, setMeta] = useState<LedgerMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const loadingMore = useRef(false); // guards concurrent page fetches
  // Community evidence-tier filter (COM only). Default = anchored + supported.
  const [selectedTiers, setSelectedTiers] = useState<string[]>(COM_DEFAULT_TIERS);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [rpcCohortTotal, setRpcCohortTotal] = useState(0);
  const [tierCounts, setTierCounts] = useState<Record<string, number> | null>(null);

  // cohort change → reset and load meta + the first rank page in parallel
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setRows([]);
    setMeta(null);
    setHasMore(false);
    setOpen(null);
    loadingMore.current = true;
    // COM re-loads page 0 when the tier filter changes (a different population → a fresh
    // contiguous ranking); EST/RS ignore selectedTiers.
    const tiersArg = cfg.tag === "COM" ? selectedTiers : undefined;
    Promise.all([loadLedgerMeta(cfg), loadLedgerPage(cfg, 0, LEDGER_PAGE_SIZE, tiersArg)])
      .then(([m, page]) => {
        if (!alive) return;
        setMeta(m);
        setRows(page.rows);
        setFilteredTotal(page.filteredTotal);
        setRpcCohortTotal(page.cohortTotal);
        setTierCounts(page.tierCounts);
        setHasMore(page.hasMore);
        setFailed(page.rows.length === 0);
        setLoading(false);
        loadingMore.current = false;
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
        loadingMore.current = false;
      });
    return () => {
      alive = false;
    };
  }, [cfg, selectedTiers]);

  const loadMore = useCallback(() => {
    if (loadingMore.current || !hasMore) return;
    loadingMore.current = true;
    const afterRank = rows.length ? rows[rows.length - 1].rank : 0;
    const tiersArg = cfg.tag === "COM" ? selectedTiers : undefined;
    loadLedgerPage(cfg, afterRank, LEDGER_PAGE_SIZE, tiersArg)
      .then((page) => {
        setRows((prev) => [...prev, ...page.rows]);
        setHasMore(page.hasMore);
        loadingMore.current = false;
      })
      .catch(() => {
        loadingMore.current = false;
      });
  }, [cfg, hasMore, rows, selectedTiers]);

  const th = meta ? thresholds(cfg, meta.ceilings) : {};
  const isCom = cfg.tag === "COM";
  // COM is tier-sorted, not index-sorted, so the ceiling-saturation "treat as tied"
  // bands do not apply — render one flat ranked list. EST/RS keep the band device.
  const { headBands, tailRows } = isCom ? { headBands: [] as Band[], tailRows: rows } : layout(cfg, rows);
  const cohortTotal = isCom ? rpcCohortTotal : (meta?.cohortTotal ?? rows.length);
  const metaLine = isCom
    ? `${filteredTotal.toLocaleString()} OF ${cohortTotal.toLocaleString()} HCP · PART D + PART B DERIVED · EVIDENCE TIERS`
    : (meta ? cfg.meta.replace("{total}", cohortTotal.toLocaleString()) : "");

  const toggle = useCallback((id: string) => setOpen((o) => (o === id ? null : id)), []);
  const isMobile = useIsMobile();
  const RowComp = isMobile ? MobileRow : Row;

  const renderRow = (row: LedgerRow) => {
    const id = `${cfg.tag}-${row.rank}`;
    return <RowComp key={id} cfg={cfg} row={row} cohortTotal={cohortTotal} th={th} open={open === id} onToggle={() => toggle(id)} />;
  };

  return (
    <AppLayout width="wide">
      <div style={{ width: "100%", boxSizing: "border-box" }}>
        {/* search — parity with the feed header (the strip carries no search). NSCLC TA id
            because the ledger RPCs are NSCLC-locked. */}
        {nsclcTaId ? (
          <div style={{ padding: "8px 16px 0" }}>
            <SearchBar variant="inline" currentTaId={nsclcTaId} onSelect={(hcpId) => navigate(`/hcp/${hcpId}`)} />
          </div>
        ) : null}
        {/* PeopleNavStrip (2026-07-31): the ledger is the PEOPLE destination, so it carries
            the shipped strip. Cohort row drives /cohorts/ledger/:cohort (one cohort control —
            the old in-page CohortTabs toggle is gone). Filters/territory chips are suppressed:
            the ledger RPCs read no filter state. Telescope/Landscape/TA/indication controls
            navigate to their existing surfaces. */}
        <PeopleNavStrip
          route={stripRoute}
          onOpenFilters={() => {}}
          userTerritory={userTerritory}
          showSubjectLine={false}
          showScopeChips={false}
          onPickCohort={(key) => navigate(`/cohorts/ledger/${key}`)}
        />
        <div style={{ padding: "24px 20px 96px", fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>

            {/* header — title + meta stack on mobile so the long meta line doesn't crush */}
            <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 6 : 0, justifyContent: "space-between", padding: isMobile ? "12px 16px" : "14px 20px", borderBottom: `1px solid ${P.lineMed}` }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 3, height: 14, background: cfg.markerColor }} />
                <span style={{ ...mono(9.5, 600), color: cfg.markerColor, letterSpacing: ".14em" }}>{cfg.tag}</span>
                <span style={{ ...mono(13, 500), color: P.ink1, letterSpacing: ".02em" }}>{cfg.title}</span>
              </span>
              <span style={{ ...mono(10.5), color: P.ink5, letterSpacing: ".1em", textWrap: "pretty" }}>{metaLine}</span>
            </div>

            {/* COM evidence-tier filter chips (default anchored + supported). Counts are
                read from the RPC (tier_counts), never hardcoded. Selecting narrows/widens
                the ranked population; the header states filtered-of-cohort above. */}
            {isCom ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "11px 20px", borderBottom: `1px solid ${P.lineMed}` }}>
                {(() => {
                  const allOn = COM_ALL_TIERS.every((t) => selectedTiers.includes(t));
                  return (
                    <button onClick={() => setSelectedTiers(allOn ? COM_DEFAULT_TIERS : COM_ALL_TIERS)} style={chipStyle(allOn)}>
                      ALL{rpcCohortTotal ? ` ${rpcCohortTotal.toLocaleString()}` : ""}
                    </button>
                  );
                })()}
                {COM_TIER_FILTERS.map((t) => {
                  const on = selectedTiers.includes(t.key);
                  const n = tierCounts?.[t.key];
                  return (
                    <button
                      key={t.key}
                      onClick={() =>
                        setSelectedTiers((prev) => {
                          const next = prev.includes(t.key) ? prev.filter((x) => x !== t.key) : [...prev, t.key];
                          return next.length ? next : COM_DEFAULT_TIERS; // never empty
                        })
                      }
                      style={chipStyle(on)}
                    >
                      {t.label}{n != null ? ` ${n.toLocaleString()}` : ""}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* column heads are a desktop device; on mobile each card carries its own labels */}
            {isMobile ? null : <ColumnHeads cfg={cfg} />}

            {loading ? (
              <div style={{ padding: "28px 23px", ...mono(11), color: P.ink5 }}>Loading ledger…</div>
            ) : failed || rows.length === 0 ? (
              <div style={{ padding: "28px 23px", ...mono(11), color: P.ink5 }}>The {cfg.label} ledger could not be loaded.</div>
            ) : (
              <>
                {/* saturated head — the "treat as tied" bands (never virtualised; ≤ a handful of rows) */}
                {headBands.map((band) => (
                  <div key={band.label}>
                    <BandHeader band={band} />
                    {band.rows.map(renderRow)}
                  </div>
                ))}
                {/* below the head the index separates people — a plain, virtualised ranked list */}
                {tailRows.length > 0 ? (
                  <>
                    {!isCom ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 20px 7px 23px", background: P.band, borderBottom: `1px solid ${P.line}` }}>
                        <span style={{ ...mono(9.5, 500), letterSpacing: ".16em", color: P.ink4 }}>RANKED</span>
                        <span style={{ flex: 1, height: 1, background: P.lineMed }} />
                        <span style={{ ...mono(9.5), letterSpacing: ".1em", color: "#767C81" }}>
                          BELOW THE TIED HEAD · THE INDEX SEPARATES EACH ROW
                        </span>
                      </div>
                    ) : null}
                    <VirtualTail
                      cfg={cfg}
                      rows={tailRows}
                      th={th}
                      cohortTotal={cohortTotal}
                      open={open}
                      onToggle={toggle}
                      onNearEnd={loadMore}
                      isMobile={isMobile}
                    />
                    {hasMore ? (
                      <div style={{ padding: "12px 23px", ...mono(10), color: P.ink5, letterSpacing: ".08em", borderTop: `1px solid ${P.line}` }}>
                        Loading more of the cohort… {rows.length.toLocaleString()} of {(isCom ? filteredTotal : cohortTotal).toLocaleString()}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            )}

            {/* footer caveats */}
            <div style={{ padding: "14px 20px 16px 23px", display: "flex", flexDirection: "column", gap: 5, maxWidth: 1180 }}>
              {cfg.notes.map((n, i) => (
                <div key={i} style={{ ...mono(10), lineHeight: 1.75, color: "#767C81", letterSpacing: ".04em" }}>{n}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
