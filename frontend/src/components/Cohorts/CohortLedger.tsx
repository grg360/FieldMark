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

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NavBar from "../NavBar";
import { CONTENT_WIDTH } from "../../lib/designTokens";
import {
  COHORTS,
  loadLedger,
  loadLedgerMeta,
  thresholds,
  cellDisplay,
  layout,
  why,
  trace,
  type CohortConfig,
  type LedgerData,
  type LedgerMeta,
  type LedgerRow,
  type Band,
} from "../../lib/cohortLedger";

// Frame palette (self-contained; the ledger's visual system per the Build Reference)
const P = {
  page: "#08090A",
  card: "#0E1013",
  head: "#0B0D10",
  rowHover: "#131619",
  drawer: "#0A0C0F",
  band: "#0A0C0E",
  line: "rgba(255,255,255,.06)",
  lineMed: "rgba(255,255,255,.09)",
  lineStrong: "rgba(255,255,255,.14)",
  amber: "#E0A75E", // rank, platform-wide
  ink0: "#EDEEEF",
  ink1: "#E7E8E9",
  ink2: "#C6CACD",
  ink3: "#A8AEB3",
  ink4: "#8F959A",
  ink5: "#7C8288",
  ink6: "#63696E",
  dash: "#71787E",
} as const;

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px 'IBM Plex Mono',ui-monospace,monospace` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px 'Source Serif 4',Georgia,serif` } as const);

// One tab per cohort. Selecting a tab swaps the whole config; the surface stays put.
function CohortTabs({ active, onPick }: { active: string; onPick: (tag: string) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, borderBottom: `1px solid ${P.lineMed}` }}>
      {COHORTS.map((c) => {
        const on = c.tag === active;
        return (
          <button
            key={c.tag}
            onClick={() => onPick(c.tag)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 18px",
              background: on ? P.card : "transparent",
              border: "none",
              borderRight: `1px solid ${P.line}`,
              borderBottom: on ? `2px solid ${c.markerColor}` : "2px solid transparent",
              cursor: "pointer",
              minHeight: 0,
            }}
          >
            <span style={{ width: 3, height: 12, background: c.markerColor, opacity: on ? 1 : 0.5 }} />
            <span style={{ ...mono(10.5, on ? 600 : 500), letterSpacing: ".12em", color: on ? P.ink1 : P.ink5 }}>
              {c.label.toUpperCase()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ColumnHeads({ cfg }: { cfg: CohortConfig }) {
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
  return (
    <div style={{ position: "relative", borderBottom: `1px solid ${P.line}` }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: cfg.markerColor }} />
      {open ? <div style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 2, background: P.amber }} /> : null}
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
            {row.chips.map((chip, i) => (
              <span key={i} style={{ ...mono(i === 0 ? 10 : 10.5), color: i === 0 ? P.ink4 : P.ink5, letterSpacing: i === 0 ? ".08em" : ".02em" }}>
                {chip}
              </span>
            ))}
          </div>
          {row.summary ? (
            <div style={{ ...serif(13.5), lineHeight: 1.55, color: P.ink4, maxWidth: "104ch", textWrap: "pretty" }}>{row.summary}</div>
          ) : null}
        </div>
        {/* index */}
        <div style={{ width: 88, textAlign: "right", paddingTop: 5, ...mono(18, 500), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>
          {row.idx.toFixed(cfg.idxDecimals)}
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
      </div>

      {open ? (
        <div style={{ display: "flex", gap: 48, padding: "6px 20px 22px 127px", background: P.drawer, borderTop: `1px solid ${P.line}` }}>
          <div style={{ flex: 1, maxWidth: 540, display: "flex", flexDirection: "column", gap: 9, paddingTop: 14 }}>
            <div style={{ ...mono(9, 500), letterSpacing: ".18em", color: P.ink5 }}>WHAT PLACED THIS ROW HERE</div>
            <div style={{ ...serif(13.5), lineHeight: 1.6, color: "#CDD1D4", textWrap: "pretty" }}>{why(cfg, row, th)}</div>
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

function BandHeader({ band }: { band: Band }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 20px 7px 23px", background: P.band, borderBottom: `1px solid ${P.line}` }}>
      <span style={{ ...mono(9.5, 500), letterSpacing: ".16em", color: P.ink4 }}>{band.label}</span>
      <span style={{ flex: 1, height: 1, background: P.lineMed }} />
      <span style={{ ...mono(9.5), letterSpacing: ".1em", color: "#767C81" }}>{band.note}</span>
    </div>
  );
}

export default function CohortLedger() {
  const [tag, setTag] = useState<string>("EST");
  const cfg = COHORTS.find((c) => c.tag === tag) ?? COHORTS[0];
  const [data, setData] = useState<LedgerData | null>(null);
  const [meta, setMeta] = useState<LedgerMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    setMeta(null);
    setOpen(null);
    // meta (cohort-level ceilings + total) and rows load in parallel; suppression is
    // driven by meta.ceilings, so the dash decision never depends on which rows arrive.
    Promise.all([loadLedgerMeta(cfg), loadLedger(cfg, 60)])
      .then(([m, d]) => alive && (setMeta(m), setData(d), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [cfg]);

  const th = meta ? thresholds(cfg, meta.ceilings) : {};
  const { headBands, tailRows } = data ? layout(cfg, data.rows) : { headBands: [], tailRows: [] };
  const cohortTotal = meta?.cohortTotal ?? data?.cohortTotal ?? 0;
  const metaLine = meta ? cfg.meta.replace("{total}", cohortTotal.toLocaleString()) : "";

  const renderRow = (row: LedgerRow) => {
    const id = `${cfg.tag}-${row.rank}`;
    return (
      <Row
        key={id}
        cfg={cfg}
        row={row}
        cohortTotal={cohortTotal}
        th={th}
        open={open === id}
        onToggle={() => setOpen((o) => (o === id ? null : id))}
      />
    );
  };

  return (
    <div style={{ background: P.page, minHeight: "100vh" }}>
      <div style={{ maxWidth: CONTENT_WIDTH.wide, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <NavBar />
        <div style={{ padding: "24px 20px 96px", fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
            {/* cohort toggle */}
            <CohortTabs active={tag} onPick={setTag} />

            {/* header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${P.lineMed}` }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 3, height: 14, background: cfg.markerColor }} />
                <span style={{ ...mono(9.5, 600), color: cfg.markerColor, letterSpacing: ".14em" }}>{cfg.tag}</span>
                <span style={{ ...mono(13, 500), color: P.ink1, letterSpacing: ".02em" }}>{cfg.title}</span>
              </span>
              <span style={{ ...mono(10.5), color: P.ink5, letterSpacing: ".1em" }}>{metaLine}</span>
            </div>

            <ColumnHeads cfg={cfg} />

            {loading ? (
              <div style={{ padding: "28px 23px", ...mono(11), color: P.ink5 }}>Loading ledger…</div>
            ) : !data || data.rows.length === 0 ? (
              <div style={{ padding: "28px 23px", ...mono(11), color: P.ink5 }}>The {cfg.label} ledger could not be loaded.</div>
            ) : (
              <>
                {/* saturated head — the "treat as tied" bands */}
                {headBands.map((band) => (
                  <div key={band.label}>
                    <BandHeader band={band} />
                    {band.rows.map(renderRow)}
                  </div>
                ))}
                {/* below the head the index separates people — a plain ranked list */}
                {tailRows.length > 0 ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 20px 7px 23px", background: P.band, borderBottom: `1px solid ${P.line}` }}>
                      <span style={{ ...mono(9.5, 500), letterSpacing: ".16em", color: P.ink4 }}>RANKED</span>
                      <span style={{ flex: 1, height: 1, background: P.lineMed }} />
                      <span style={{ ...mono(9.5), letterSpacing: ".1em", color: "#767C81" }}>BELOW THE TIED HEAD · THE INDEX SEPARATES EACH ROW</span>
                    </div>
                    {tailRows.map(renderRow)}
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
    </div>
  );
}
