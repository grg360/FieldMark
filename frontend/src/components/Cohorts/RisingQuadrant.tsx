import { useMediaQuery } from "../../lib/useMediaQuery";
// Rising QUADRANT — momentum × visibility, plotted from REAL components
// (rising_board() RPC). Layout authority: docs/design/Rising Surface.dc.html.
// This folds the old Landscape quadrant's job into the rising surface, per the
// 2026-08-05 decision.
//
// RETIRED 2026-08-14: this file used to carry a second "register" mode — a rank
// table that duplicated the main cohort ledger's Rising view with fewer features
// (no relationship tracking, no drawers, no trials popup, no virtualization). Every
// thing it showed — SENIOR SINCE, OPEN TRIAL, band grouping — is on
// /cohorts/ledger/rising-stars via the SAME RPCs, and the country/region slicing it
// uniquely had now lives on that ledger's territory axis. The register is gone; the
// quadrant is the one thing this surface uniquely provides, so it stays, standalone.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getRisingBoard, type RisingBoard } from "../../lib/risingProfile";
import AppLayout from "../AppLayout";
import PageHero from "../PageHero";
import { CANON, DEPTH, FACE } from "../../lib/canonicalTokens";
import { taLabelForSlug } from "../../lib/taLabels";

// This ledger is pinned to one TA. The SLUG is the pin; the label is derived.
const TA_SLUG = "nsclc";

// Register tokens (2026-08-05): fresh surface, consumes the register — see the
// palette note in Profile/RisingHcpProfile.tsx. Cohort greens + archetype
// vocabulary stay local as semantics with no token counterpart.
const CARD = CANON.GROUND.RAISE; // flat card inside the PANEL board (child steps down)
const CARD_EDGE = CANON.LINE.HAIR;
const RULE = CANON.LINE.HAIR;
// Warm-INK / mid-grey / gold-state tokens retired 2026-08-05 (Two Ramps);
// values FROZEN as locals pending a Design pass on the rising surface —
// see RisingHcpProfile.tsx for the full note.
const INK0 = CANON.INK.PRIME;
const INK1 = CANON.INK.BODY;
const INK2 = CANON.INK.LABEL;
const MUT3 = CANON.INK.MUTE;
const MUT2 = CANON.INK.MUTE; // was below the text floor — raised to MUTE (rule 4)
const DIM = CANON.INK.GHOST;
const DIM2 = CANON.INK.GHOST;
const FAINT = CANON.INK.GHOST;
// Gold convergence 2026-08-05: deep and muted both fold into GOLD.dim.
const GOLD_MUTED = CANON.GOLD.EDGE;
const GREEN = "#8fb8a6"; // rising cohort marker — semantic, no token counterpart
const GREEN_DK = "#7fb3a4";
const MONO = FACE.data;
const SERIF = FACE.value;

const mono = (size: number, color: string, ls = 0.11, weight = 400): CSSProperties => ({
  font: `${weight} ${size}px/1.5 ${MONO}`, letterSpacing: `${ls}em`, color,
});
const serif = (size: number, color: string, lh = 1.65): CSSProperties => ({
  font: `400 ${size}px/${lh} ${SERIF}`, color,
});

type Region = "US" | "EU" | "BOTH" | "ALL";

// Archetype taxonomy retired 2026-08-05 — rows carry the RECENT SENIOR
// AUTHORSHIP event badge and the open-trial flag instead (rising_board_flags).

function chip(active: boolean): CSSProperties {
  return active
    ? { border: "1px solid #3f5f54", background: "#16201c", color: "#a2cbbf" }
    : { border: `1px solid ${CANON.LINE.EDGE}`, background: "transparent", color: MUT3 };
}

function SectionHead({ title, sub, right }: { title: string; sub: string; right: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "30px 0 10px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 2, height: 11, background: GREEN_DK }} />
        <div style={mono(11, INK0, 0.14, 600)}>{title}</div>
      </div>
      <div style={mono(9, MUT2, 0.1)}>{sub}</div>
      <div style={{ flex: 1 }} />
      <div style={{ ...mono(9, DIM2, 0.11), textAlign: "right" }}>{right}</div>
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ border: `1px solid ${CARD_EDGE}`, background: CARD, ...style }}>{children}</div>;
}

export default function RisingQuadrant() {
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint — 2026-08-10 mobile stack pass
  const navigate = useNavigate();
  const [board, setBoard] = useState<RisingBoard | null>(null);
  const [region, setRegion] = useState<Region>("US");
  const [geo, setGeo] = useState<string>("ALL");

  useEffect(() => {
    let alive = true;
    getRisingBoard().then((b) => {
      if (!alive) return;
      setBoard(b);
    }).catch(() => alive && setBoard({ rows: [], band_mix: [] }));
    return () => { alive = false; };
  }, []);

  const scoped = useMemo(() => {
    if (!board) return [];
    const rows = board.rows;
    if (region === "US") return rows.filter((r) => r.us_rank != null).map((r) => ({ ...r, drank: r.us_rank! }));
    if (region === "EU") return rows.filter((r) => r.eu_rank != null).map((r) => ({ ...r, drank: r.eu_rank! }));
    if (region === "BOTH") return rows.filter((r) => r.us_rank != null || r.eu_rank != null).map((r) => ({ ...r, drank: r.rank }));
    return rows.map((r) => ({ ...r, drank: r.rank }));
  }, [board, region]);

  const usCount = board ? board.rows.filter((r) => r.us_rank != null).length : 0;
  const euCount = board ? board.rows.filter((r) => r.eu_rank != null).length : 0;
  const total = board ? board.rows.length : 0;

  const geoValues = useMemo(() => {
    const vals: string[] = [];
    for (const r of scoped) {
      const g = region === "EU" ? (r.effective_country ?? r.country) : r.state;
      if (g && !vals.includes(g)) vals.push(g);
    }
    return vals.sort();
  }, [scoped, region]);

  const noStateCount = useMemo(
    () => (region === "EU" ? 0 : scoped.filter((r) => !r.state).length),
    [scoped, region],
  );

  const absenceMode = geo === "__ABSENT";
  const filtered = useMemo(() => {
    if (absenceMode) return [];
    if (geo === "ALL") return scoped;
    return scoped.filter(
      (r) => (region === "EU" ? (r.effective_country ?? r.country) : r.state) === geo,
    );
  }, [scoped, geo, region, absenceMode]);

  const sorted = useMemo(() => filtered.slice().sort((a, b) => a.drank - b.drank), [filtered]);



  // quadrant: top 100 of the current scope, plotted from REAL components
  const quadPoints = useMemo(() => {
    const top = sorted.slice(0, 100).filter((r) => r.mom != null && r.vis != null);
    const AX_MIN = 40, AX_SPAN = 60;
    return top.map((r) => ({
      row: r,
      left: Math.max(0, Math.min(100, ((r.vis! - AX_MIN) / AX_SPAN) * 100)),
      bottom: Math.max(0, Math.min(100, ((r.mom! - AX_MIN) / AX_SPAN) * 100)),
      color: GREEN,
    }));
  }, [sorted]);
  const SPLIT_PCT = ((80 - 40) / 60) * 100;

  const quadCount = (right: boolean, top: boolean) => {
    let n = 0;
    for (const pt of quadPoints) {
      if (((pt.row.vis ?? 0) >= 80) !== right) continue;
      if (((pt.row.mom ?? 0) >= 80) !== top) continue;
      n += 1;
    }
    return n ? `${n} PLOTTED` : "NO PLOTTED POINTS";
  };

  const quadrants = [
    { name: "Emerging Specialist", pos: "HIGH MOMENTUM · LOW VISIBILITY", thesis: "Moving fast, not yet read. The cohort a field team reaches before anyone else does.", clusters: quadCount(false, true), color: "#d8a24a" },
    { name: "Future KOL", pos: "HIGH MOMENTUM · HIGH VISIBILITY", thesis: "Both engines live and already received. The top of the board sits in this corner.", clusters: quadCount(true, true), color: "#8fb8a6" },
    { name: "EARLY DEVELOPMENT", pos: "LOW MOMENTUM · LOW VISIBILITY", thesis: "On the board because the footprint exists, not because it is moving yet. Watch, do not work.", clusters: quadCount(false, false), color: "#9a9a9e" },
    { name: "ESTABLISHED VISIBILITY", pos: "LOW MOMENTUM · HIGH VISIBILITY", thesis: "Read widely, growth flattening. The exit lane toward the established cohort.", clusters: quadCount(true, false), color: "#8aa2c4" },
  ];

  const scopeLabel = region === "EU" ? "EU" : region === "BOTH" ? "US + EU" : region === "ALL" ? "GLOBAL" : "US";

  if (!board) {
    return (
      <AppLayout width="wide"><div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", ...mono(11, CANON.INK.MUTE, 0.06) }}>
        Loading rising ledger…
      </div></AppLayout>
    );
  }

  return (
    <AppLayout width="wide">
      <div style={{ fontFamily: MONO, color: INK1, margin: "8px 0 24px", padding: "28px 36px 40px", ...DEPTH.PANEL, border: `1px solid ${CANON.LINE.HAIR}` }}>

        <div style={{ padding: "14px 0 18px" }}>
          <PageHero
            // narrow was never passed (found at the 2026-08-15 migration): the
            // surface computes isMobile for its own grid but the hero never saw
            // it, so at 387px the title rendered at 52 over two lines and the
            // eyebrow and meta each took three. Wiring it is the whole fix.
            narrow={isMobile}
            // Same contract as the cohort ledger: the H1 names the surface, the
            // TA is scope. Retires the " / " join — the fourth of the four join
            // conventions the convergence collapses.
            eyebrow={`RIS · ${taLabelForSlug(TA_SLUG)} · Oncology`}
            meta="ONE BOARD · TWO MODES · WEEKLY BUILD"
            title="Rising Ledger"
            stats={{ variant: "cluster", items: [
              { value: scoped.length.toLocaleString("en-US"), label: "IN VIEW" },
              { value: String(usCount), label: "US" },
              { value: String(euCount), label: "EU" },
              { value: total.toLocaleString("en-US"), label: "TOTAL BOARD", gold: true },
            ] }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0 14px", flexWrap: "wrap" }}>
          {/* Same cohort identity mark as the ledger (2026-08-15). Was a filled
              #1c2a26 chip at mono 8 — smaller again than the ledger's 9. The tick
              form is rule + word, not a filled box, so the mark reads the same on
              both surfaces of the same board. */}
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ width: 4, height: 22, background: GREEN }} />
            <div style={{ font: `600 13px/1.4 ${MONO}`, letterSpacing: ".11em", color: GREEN }}>RISING STARS</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2 }}>
          </div>
        </div>

        <Card style={{ padding: "18px 20px" }}>
          {/* counts moved to the PageHero cluster (Commit B); the card keeps the
              scope note + region controls */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 26, flexWrap: "wrap" }}>
            <div style={{ ...mono(9, MUT2, 0.13) }}>IN VIEW · {scopeLabel}</div>
            <div style={{ flex: 1, minWidth: 160 }} />
            <div style={{ maxWidth: 480, ...serif(11, MUT3) }}>
              The remaining {(total - usCount - euCount).toLocaleString("en-US")} are real and stay reachable. The default
              is what a field team can act on this quarter.
            </div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${RULE}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ ...mono(9, DIM, 0.14), marginRight: 4 }}>REGION</div>
            {([["US", `US · ${usCount}`], ["EU", `EU · ${euCount}`], ["BOTH", `US + EU · ${usCount + euCount}`], ["ALL", `ALL ${total.toLocaleString("en-US")}`]] as [Region, string][]).map(([k, lbl]) => (
              <div key={k} onClick={() => { setRegion(k); setGeo("ALL"); }}
                style={{ cursor: "pointer", padding: "6px 11px", ...chip(region === k), font: `500 9px/1 ${MONO}`, letterSpacing: ".11em" }}>
                {lbl}
              </div>
            ))}
          </div>

          {(region === "US" || region === "EU") && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <div style={{ ...mono(9, DIM, 0.14), marginRight: 6 }}>{region === "EU" ? "COUNTRY" : "STATE"}</div>
              {[{ key: "ALL", label: region === "EU" ? "ALL COUNTRIES" : "ALL STATES" }]
                .concat(geoValues.map((v) => ({ key: v, label: v.toUpperCase() })))
                .concat(region === "US" && noStateCount > 0 ? [{ key: "__ABSENT", label: `STATE NOT IN REGISTRY · ${noStateCount}` }] : [])
                .map((g) => (
                  <div key={g.key} onClick={() => setGeo(g.key)}
                    style={{ cursor: "pointer", padding: "5px 9px", ...chip(geo === g.key), font: `500 8.5px/1.3 ${MONO}`, letterSpacing: ".1em" }}>
                    {g.label}
                  </div>
                ))}
            </div>
          )}
          <div style={{ marginTop: 10, ...mono(9, FAINT, 0.11) }}>
            {region === "EU"
              ? `COUNTRY COVERAGE COMPLETE · ${euCount} OF ${euCount}`
              : `STATE COVERAGE ${usCount - noStateCount} OF ${usCount} (${usCount ? Math.round(((usCount - noStateCount) / usCount) * 100) : 0}%) · THE ${noStateCount} WITHOUT ONE FILTER TO AN EXPLICIT ABSENCE STATE, NOT TO AN EMPTY CELL`}
          </div>
        </Card>

        <>
            <SectionHead title="MOMENTUM × VISIBILITY" sub={`TOP 100 · ${scopeLabel}`}
              right="A LOCATION ON THE TWO COMPONENTS · NOT A TYPE" />
            <Card style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px" }}>
              <div style={{ padding: "20px 20px 16px", borderRight: `1px solid ${RULE}` }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ transform: "rotate(180deg)", writingMode: "vertical-rl", font: `600 8.5px/1 ${MONO}`, letterSpacing: ".16em", color: DIM }}>MOMENTUM COMPOSITE →</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ position: "relative", height: 470, border: `1px solid ${RULE}`, background: CANON.GROUND.RAISE }}>
                      <div style={{ position: "absolute", left: 0, bottom: `${SPLIT_PCT}%`, top: 0, width: `${SPLIT_PCT}%`, background: "rgba(216,162,74,.028)" }} />
                      <div style={{ position: "absolute", right: 0, bottom: `${SPLIT_PCT}%`, top: 0, left: `${SPLIT_PCT}%`, background: "rgba(143,184,166,.045)" }} />
                      <div style={{ position: "absolute", right: 0, bottom: 0, height: `${SPLIT_PCT}%`, left: `${SPLIT_PCT}%`, background: "rgba(138,162,196,.035)" }} />
                      <div style={{ position: "absolute", left: `${SPLIT_PCT}%`, top: 0, bottom: 0, width: 1, background: CANON.LINE.EDGE }} />
                      <div style={{ position: "absolute", bottom: `${SPLIT_PCT}%`, left: 0, right: 0, height: 1, background: CANON.LINE.EDGE }} />
                      <div style={{ position: "absolute", left: 12, top: 10, font: `600 8.5px/1 ${MONO}`, letterSpacing: ".15em", color: GOLD_MUTED }}>Emerging Specialist</div>
                      <div style={{ position: "absolute", right: 12, top: 10, font: `600 8.5px/1 ${MONO}`, letterSpacing: ".15em", color: GREEN }}>Future KOL</div>
                      <div style={{ position: "absolute", left: 12, bottom: 10, font: `600 8.5px/1 ${MONO}`, letterSpacing: ".15em", color: DIM }}>EARLY DEVELOPMENT</div>
                      <div style={{ position: "absolute", right: 12, bottom: 10, font: `600 8.5px/1 ${MONO}`, letterSpacing: ".15em", color: "#7f93ad" }}>ESTABLISHED VISIBILITY</div>
                      {quadPoints.map((pt) => (
                        <div key={pt.row.hcp_id}
                          onClick={() => navigate(`/hcp/${pt.row.hcp_id}`)}
                          title={`${pt.row.name} · #${pt.row.drank} ${scopeLabel} · VIS ${pt.row.vis?.toFixed(2)} · MOM ${pt.row.mom?.toFixed(2)}`}
                          style={{ position: "absolute", left: `${pt.left}%`, bottom: `${pt.bottom}%`, width: 7, height: 7, marginLeft: -3, marginBottom: -3, borderRadius: "50%", background: pt.color, opacity: 0.72, cursor: "pointer" }} />
                      ))}
                    </div>
                    <div style={{ marginTop: 9, display: "flex", alignItems: "center" }}>
                      <div style={mono(9, DIM2, 0.11)}>40</div>
                      <div style={{ flex: 1, textAlign: "center", font: `600 8.5px/1 ${MONO}`, letterSpacing: ".16em", color: DIM }}>VISIBILITY COMPOSITE →</div>
                      <div style={mono(9, DIM2, 0.11)}>100</div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${RULE}`, ...mono(9, MUT3, 0.11), lineHeight: 1.7 }}>
                  ONE COHORT, ONE COLOR — POSITION CARRIES THE MEANING. REGION NAMES DESCRIBE LOCATIONS, NOT TYPES.
                </div>
                <div style={{ marginTop: 12, ...mono(9, MUT2, 0.11), lineHeight: 1.7, maxWidth: 760 }}>
                  EVERY POINT IS PLOTTED FROM ITS ACTUAL MOMENTUM AND VISIBILITY COMPONENTS · HOVER FOR NAME AND VALUES · CLICK TO OPEN THE PROFILE
                </div>
              </div>
              <div style={{ padding: 20 }}>
                <div style={mono(9, DIM2, 0.14)}>THE FOUR QUADRANTS</div>
                <div style={{ marginTop: 4, ...serif(11, MUT3) }}>The naming is the thesis. Position carries what a label cannot.</div>
                {quadrants.map((q) => (
                  <div key={q.name} style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${RULE}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: q.color }} />
                      <div style={mono(9, INK0, 0.12, 600)}>{q.name}</div>
                    </div>
                    <div style={{ marginTop: 6, ...mono(9, DIM, 0.11) }}>{q.pos}</div>
                    <div style={{ marginTop: 7, ...serif(11, INK2, 1.6) }}>{q.thesis}</div>
                    <div style={{ marginTop: 6, ...mono(9, FAINT, 0.11) }}>{q.clusters}</div>
                  </div>
                ))}
              </div>
            </Card>
          </>


      </div>
    </AppLayout>
  );
}
