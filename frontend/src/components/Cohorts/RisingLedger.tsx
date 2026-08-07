// Rising ledger — one board, two modes (register / quadrant). Layout authority:
// docs/design/Rising Surface.dc.html (ledger tab). Data: rising_board() RPC —
// the full board with components, so the quadrant plots REAL
// coordinates (this folds the Landscape quadrant's job into the rising
// surface, per the 2026-08-05 decision). Absence discipline: the 22 US rows
// without a registry state filter to an explicit absence panel, never to an
// empty cell; rows render the state cell as a named absence, never blank.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getRisingBoard, getRisingFlags, type RisingBoard, type RisingFlags } from "../../lib/risingProfile";
import AppLayout from "../AppLayout";
import PageHero from "../PageHero";
import { FONT, GROUND, LINE, COOL, GOLD } from "../../lib/designTokens";

// Register tokens (2026-08-05): fresh surface, consumes the register — see the
// palette note in Profile/RisingHcpProfile.tsx. Cohort greens + archetype
// vocabulary stay local as semantics with no token counterpart.
const CARD = GROUND.g1; // g1 well inside the g2 board (Commit C)
const CARD_EDGE = LINE.l1;
const RULE = LINE.l0;
const RULE_SOFT = LINE.l0;
// Warm-INK / mid-grey / gold-state tokens retired 2026-08-05 (Two Ramps);
// values FROZEN as locals pending a Design pass on the rising surface —
// see RisingHcpProfile.tsx for the full note.
const INK0 = "#e9e6df"; // was INK.ink (warm)
const INK1 = COOL.prose;
const INK2 = "#a9a396"; // was INK.inkMuted (warm)
const SERIF_INK = "#c5bfb2"; // was INK.inkProse (warm)
const MUT = "#8d939c"; // was GREY.grey2
const MUT3 = "#7b8189"; // was GREY.grey3
const MUT2 = "#5f6670"; // was GREY.grey5 — below the COOL text floor; flagged
const DIM = COOL.floor;
const DIM2 = COOL.floor;
const FAINT = COOL.floor;
// Gold convergence 2026-08-05: deep and muted both fold into GOLD.dim.
const GOLD_MUTED = GOLD.dim;
const GREEN = "#8fb8a6"; // rising cohort marker — semantic, no token counterpart
const GREEN_DK = "#7fb3a4";
const MONO = FONT.mono;
const SERIF = FONT.serif;

const mono = (size: number, color: string, ls = 0.11, weight = 400): CSSProperties => ({
  font: `${weight} ${size}px/1.5 ${MONO}`, letterSpacing: `${ls}em`, color,
});
const serif = (size: number, color: string, lh = 1.65): CSSProperties => ({
  font: `400 ${size}px/${lh} ${SERIF}`, color,
});

type Region = "US" | "EU" | "BOTH" | "ALL";
type Mode = "table" | "quadrant";

// Archetype taxonomy retired 2026-08-05 — rows carry the RECENT SENIOR
// AUTHORSHIP event badge and the open-trial flag instead (rising_board_flags).

function chip(active: boolean): CSSProperties {
  return active
    ? { border: "1px solid #3f5f54", background: "#16201c", color: "#a2cbbf" }
    : { border: `1px solid ${LINE.l2}`, background: "transparent", color: MUT3 };
}

function SectionHead({ title, sub, right }: { title: string; sub: string; right: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "30px 0 10px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 2, height: 11, background: GREEN_DK }} />
        <div style={mono(10, INK0, 0.14, 600)}>{title}</div>
      </div>
      <div style={mono(9, MUT2, 0.1)}>{sub}</div>
      <div style={{ flex: 1 }} />
      <div style={{ ...mono(8, DIM2, 0.11), textAlign: "right" }}>{right}</div>
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ border: `1px solid ${CARD_EDGE}`, background: CARD, ...style }}>{children}</div>;
}

export default function RisingLedger() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [board, setBoard] = useState<RisingBoard | null>(null);
  const [region, setRegion] = useState<Region>("US");
  const [geo, setGeo] = useState<string>("ALL");
  const [mode, setMode] = useState<Mode>(params.get("mode") === "quadrant" ? "quadrant" : "table");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [flags, setFlags] = useState<Map<string, RisingFlags>>(new Map());
  useEffect(() => {
    let alive = true;
    getRisingBoard().then((b) => {
      if (!alive) return;
      setBoard(b);
      getRisingFlags(b.rows.map((r) => r.hcp_id)).then((f) => alive && setFlags(f));
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
      const g = region === "EU" ? r.country : r.state;
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
    return scoped.filter((r) => (region === "EU" ? r.country : r.state) === geo);
  }, [scoped, geo, region, absenceMode]);

  const sorted = useMemo(() => filtered.slice().sort((a, b) => a.drank - b.drank), [filtered]);

  const bands = useMemo(() => {
    const defs = [
      { key: "1-100", label: "BAND 1–100", note: "TOP OF BOARD · DENSEST SIGNAL", lo: 1, hi: 100, open: true },
      { key: "101-300", label: "BAND 101–300", note: "STILL CLASSIFYING · EMERGING LEADER BEGINS TO ABSORB", lo: 101, hi: 300, open: true },
      { key: "301-600", label: "BAND 301–600", note: "CLASSIFIER THINNING", lo: 301, hi: 600, open: false },
      { key: "600+", label: "BAND 600+", note: "RESIDUAL BUCKET", lo: 601, hi: Infinity, open: false },
    ];
    return defs
      .map((d) => ({ ...d, rows: sorted.filter((r) => r.drank >= d.lo && r.drank <= d.hi) }))
      .filter((d) => d.rows.length > 0 || d.open);
  }, [sorted]);

  const bandMix = useMemo(() => {
    if (!board) return [];
    const byBand: Record<string, number> = {};
    for (const e of board.band_mix) byBand[e.band] = (byBand[e.band] ?? 0) + e.n;
    const totalAll = Object.values(byBand).reduce((a, b) => a + b, 0) || 1;
    return ["1-100", "101-300", "301-600", "600+"].map((band) => ({
      band: band === "1-100" ? "TOP 100" : band,
      live: band !== "600+",
      totalN: byBand[band] ?? 0,
      w: ((byBand[band] ?? 0) / totalAll) * 100,
    }));
  }, [board]);

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
  const geoColLabel = region === "EU" ? "COUNTRY" : region === "ALL" || region === "BOTH" ? "STATE / COUNTRY" : "STATE";

  if (!board) {
    return (
      <AppLayout width="wide"><div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", ...mono(11, COOL.muted, 0.06) }}>
        Loading rising ledger…
      </div></AppLayout>
    );
  }

  return (
    <AppLayout width="wide">
      <div style={{ fontFamily: MONO, color: INK1, margin: "8px 0 24px", padding: "28px 36px 40px", background: GROUND.g2, border: `1px solid ${LINE.l1}` }}>

        <div style={{ padding: "14px 0 18px" }}>
          <PageHero
            eyebrow="RIS · Rising ledger"
            meta="ONE BOARD · TWO MODES · WEEKLY BUILD"
            title="Rising Ledger / NSCLC"
            stats={[
              { value: scoped.length.toLocaleString("en-US"), label: "IN VIEW" },
              { value: String(usCount), label: "US" },
              { value: String(euCount), label: "EU" },
              { value: total.toLocaleString("en-US"), label: "TOTAL BOARD", gold: true },
            ]}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0 14px", flexWrap: "wrap" }}>
          <div style={{ padding: "2px 5px", background: "#1c2a26", font: `600 8px/1.4 ${MONO}`, letterSpacing: ".12em", color: GREEN }}>RIS</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 2 }}>
            <div onClick={() => setMode("table")} style={{ cursor: "pointer", padding: "5px 10px", ...chip(mode === "table"), font: `500 8.5px/1.3 ${MONO}`, letterSpacing: ".11em" }}>▤ REGISTER</div>
            <div onClick={() => setMode("quadrant")} style={{ cursor: "pointer", padding: "5px 10px", ...chip(mode === "quadrant"), font: `500 8.5px/1.3 ${MONO}`, letterSpacing: ".11em" }}>◱ QUADRANT</div>
          </div>
        </div>

        <Card style={{ padding: "18px 20px" }}>
          {/* counts moved to the PageHero cluster (Commit B); the card keeps the
              scope note + region controls */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 26, flexWrap: "wrap" }}>
            <div style={{ ...mono(8, MUT2, 0.13) }}>IN VIEW · {scopeLabel}</div>
            <div style={{ flex: 1, minWidth: 160 }} />
            <div style={{ maxWidth: 480, ...serif(11, MUT3) }}>
              The remaining {(total - usCount - euCount).toLocaleString("en-US")} are real and stay reachable. The default
              is what a field team can act on this quarter.
            </div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${RULE}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ ...mono(8, DIM, 0.14), marginRight: 4 }}>REGION</div>
            {([["US", `US · ${usCount}`], ["EU", `EU · ${euCount}`], ["BOTH", `US + EU · ${usCount + euCount}`], ["ALL", `ALL ${total.toLocaleString("en-US")}`]] as [Region, string][]).map(([k, lbl]) => (
              <div key={k} onClick={() => { setRegion(k); setGeo("ALL"); }}
                style={{ cursor: "pointer", padding: "6px 11px", ...chip(region === k), font: `500 9px/1 ${MONO}`, letterSpacing: ".11em" }}>
                {lbl}
              </div>
            ))}
          </div>

          {(region === "US" || region === "EU") && (
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <div style={{ ...mono(8, DIM, 0.14), marginRight: 6 }}>{region === "EU" ? "COUNTRY" : "STATE"}</div>
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
          <div style={{ marginTop: 10, ...mono(8, FAINT, 0.11) }}>
            {region === "EU"
              ? `COUNTRY COVERAGE COMPLETE · ${euCount} OF ${euCount}`
              : `STATE COVERAGE ${usCount - noStateCount} OF ${usCount} (${usCount ? Math.round(((usCount - noStateCount) / usCount) * 100) : 0}%) · THE ${noStateCount} WITHOUT ONE FILTER TO AN EXPLICIT ABSENCE STATE, NOT TO AN EMPTY CELL`}
          </div>
        </Card>

        {mode === "quadrant" && (
          <>
            <SectionHead title="MOMENTUM × VISIBILITY" sub={`TOP 100 · ${scopeLabel}`}
              right="A LOCATION ON THE TWO COMPONENTS · NOT A TYPE" />
            <Card style={{ display: "grid", gridTemplateColumns: "1fr 300px" }}>
              <div style={{ padding: "20px 20px 16px", borderRight: `1px solid ${RULE}` }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ transform: "rotate(180deg)", writingMode: "vertical-rl", font: `600 8.5px/1 ${MONO}`, letterSpacing: ".16em", color: DIM }}>MOMENTUM COMPOSITE →</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ position: "relative", height: 470, border: `1px solid ${RULE}`, background: GROUND.g1 }}>
                      <div style={{ position: "absolute", left: 0, bottom: `${SPLIT_PCT}%`, top: 0, width: `${SPLIT_PCT}%`, background: "rgba(216,162,74,.028)" }} />
                      <div style={{ position: "absolute", right: 0, bottom: `${SPLIT_PCT}%`, top: 0, left: `${SPLIT_PCT}%`, background: "rgba(143,184,166,.045)" }} />
                      <div style={{ position: "absolute", right: 0, bottom: 0, height: `${SPLIT_PCT}%`, left: `${SPLIT_PCT}%`, background: "rgba(138,162,196,.035)" }} />
                      <div style={{ position: "absolute", left: `${SPLIT_PCT}%`, top: 0, bottom: 0, width: 1, background: LINE.l2 }} />
                      <div style={{ position: "absolute", bottom: `${SPLIT_PCT}%`, left: 0, right: 0, height: 1, background: LINE.l2 }} />
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
                      <div style={mono(8, DIM2, 0.11)}>40</div>
                      <div style={{ flex: 1, textAlign: "center", font: `600 8.5px/1 ${MONO}`, letterSpacing: ".16em", color: DIM }}>VISIBILITY COMPOSITE →</div>
                      <div style={mono(8, DIM2, 0.11)}>100</div>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${RULE}`, ...mono(8, MUT3, 0.11), lineHeight: 1.7 }}>
                  ONE COHORT, ONE COLOR — POSITION CARRIES THE MEANING. REGION NAMES DESCRIBE LOCATIONS, NOT TYPES.
                </div>
                <div style={{ marginTop: 12, ...mono(8.5, MUT2, 0.11), lineHeight: 1.7, maxWidth: 760 }}>
                  EVERY POINT IS PLOTTED FROM ITS ACTUAL MOMENTUM AND VISIBILITY COMPONENTS · HOVER FOR NAME AND VALUES · CLICK TO OPEN THE PROFILE
                </div>
              </div>
              <div style={{ padding: 20 }}>
                <div style={mono(8, DIM2, 0.14)}>THE FOUR QUADRANTS</div>
                <div style={{ marginTop: 4, ...serif(11, MUT3) }}>The naming is the thesis. Position carries what a label cannot.</div>
                {quadrants.map((q) => (
                  <div key={q.name} style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${RULE}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: q.color }} />
                      <div style={mono(9, INK0, 0.12, 600)}>{q.name}</div>
                    </div>
                    <div style={{ marginTop: 6, ...mono(7.5, DIM, 0.11) }}>{q.pos}</div>
                    <div style={{ marginTop: 7, ...serif(11.5, INK2, 1.6) }}>{q.thesis}</div>
                    <div style={{ marginTop: 6, ...mono(7.5, FAINT, 0.11) }}>{q.clusters}</div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {mode === "table" && (
          <>
            <SectionHead title="BOARD BY RANK BAND" sub={`BOARD-WIDE · ${total.toLocaleString("en-US")}`}
              right="BAND SIZES ONLY · ARCHETYPES RETIRED 2026-08-05" />
            <Card style={{ padding: "18px 20px" }}>
              {bandMix.map((b) => (
                <div key={b.band} style={{ display: "flex", alignItems: "center", gap: 16, padding: "9px 0" }}>
                  <div style={{ minWidth: 82, font: `500 9.5px/1 ${MONO}`, letterSpacing: ".11em", color: b.live ? INK0 : MUT2 }}>{b.band}</div>
                  <div style={{ flex: 1, display: "flex", height: 9, background: LINE.l0 }}>
                    <div style={{ height: 9, background: b.live ? GREEN_DK : LINE.l2, width: `${b.w}%` }} />
                  </div>
                  <div style={{ minWidth: 330, textAlign: "right", ...mono(8.5, b.live ? MUT3 : DIM2, 0.08) }}>{b.totalN.toLocaleString("en-US")} MEMBERS</div>
                </div>
              ))}
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${RULE}` }}>
                <div style={{ maxWidth: 760, ...serif(11, MUT3) }}>
                  The band is the unit of this ledger, not the row. The four archetype labels were retired
                  2026-08-05 — the residual bucket held nine in ten members, and the one label that survived
                  testing (recent senior authorship) rides the rows as an event badge instead.
                </div>
              </div>
            </Card>

            <SectionHead title="BOARD" sub={`${scopeLabel} · SORTED BY ${region === "ALL" || region === "BOTH" ? "GLOBAL" : "REGIONAL"} RANK`}
              right="COMPOSITE PERCENTILE IS IN-COHORT" />
            <Card>
              <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 200px 96px 168px 132px 64px", padding: "11px 16px", borderBottom: `1px solid ${RULE}`, background: GROUND.g1 }}>
                {["RANK", "NAME", "INSTITUTION", geoColLabel, "BADGES", "COMPOSITE PCTL", "CAREER"].map((h, i) => (
                  <div key={h} style={{ ...mono(8, DIM, 0.13, 600), textAlign: i === 6 ? "right" : "left" }}>{h}</div>
                ))}
              </div>

              {absenceMode ? (
                <div style={{ padding: 22 }}>
                  <div style={mono(12, SERIF_INK, 0.14, 500)}>{noStateCount} US PROFILES HAVE NO STATE IN THE REGISTRY</div>
                  <div style={{ marginTop: 14, ...serif(13, SERIF_INK, 1.72), maxWidth: 1020 }}>
                    These are {noStateCount} of the {usCount} US rising HCPs whose NPI record carries no state. Rank,
                    composite percentile and all four components are covered for every one of them — the gap
                    is a registry field, not the signal. They are excluded from any state filter and included in every US
                    total, which is why the US count reads {usCount} rather than {usCount - noStateCount}.
                  </div>
                  <div style={{ marginTop: 16 }}>
                    {scoped.filter((r) => !r.state).map((r) => (
                      <div key={r.hcp_id} onClick={() => navigate(`/hcp/${r.hcp_id}`)}
                        style={{ display: "grid", gridTemplateColumns: "52px 1fr 200px 96px 168px 132px 64px", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${RULE_SOFT}`, cursor: "pointer" }}>
                        <div style={{ font: `500 11px/1 ${MONO}`, color: MUT }}>{r.drank}</div>
                        <div style={{ font: `400 12.5px/1.3 ${SERIF}`, color: INK0 }}>{r.name}</div>
                        <div style={{ font: `400 10.5px/1.35 ${SERIF}`, color: MUT3 }}>{r.institution ?? "INSTITUTION NOT ON RECORD"}</div>
                        <div style={mono(9, DIM, 0.08)}>NOT IN REGISTRY</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {flags.get(r.hcp_id)?.senior_transition ? (
                            <span title="Senior-authored years within the FieldMark corpus — we see only what is ingested." style={{ padding: "2px 6px", border: `1px solid ${GREEN_DK}`, font: `600 7.5px/1.3 ${MONO}`, letterSpacing: ".1em", color: GREEN }}>SENIOR SINCE {flags.get(r.hcp_id)?.first_senior_year ?? "—"}</span>
                          ) : null}
                          {flags.get(r.hcp_id)?.on_open_trial ? (
                            <span title="Named investigator on >= 1 rendered open trial (gated view; registry labels every site lead PI)" style={{ padding: "2px 6px", border: `1px solid ${LINE.l2}`, font: `600 7.5px/1.3 ${MONO}`, letterSpacing: ".1em", color: INK0 }}>OPEN TRIAL</span>
                          ) : null}
                          {!flags.get(r.hcp_id)?.senior_transition && !flags.get(r.hcp_id)?.on_open_trial ? (
                            <span style={mono(8, DIM2, 0.1)}>—</span>
                          ) : null}
                        </div>
                        <div style={{ font: `500 10.5px/1 ${MONO}`, color: INK1 }}>{r.pctl?.toFixed(2) ?? "NOT COMPUTED"}</div>
                        <div style={{ ...mono(9, MUT3, 0.06), textAlign: "right" }}>
                          {r.career_first_pub_year ? `${new Date().getFullYear() - r.career_first_pub_year} yr` : "NOT ON RECORD"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${RULE}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={mono(8, FAINT, 0.11)}>ROWS RENDER WITH THE STATE CELL AS A NAMED ABSENCE · NEVER BLANK</div>
                    <div style={{ flex: 1 }} />
                    <div onClick={() => setGeo("ALL")} style={{ cursor: "pointer", padding: "6px 11px", border: `1px solid ${LINE.l2}`, font: `500 8px/1.3 ${MONO}`, letterSpacing: ".11em", color: MUT }}>← BACK TO ALL STATES</div>
                  </div>
                </div>
              ) : (
                bands.map((b) => {
                  const open = b.open || expanded[b.key];
                  return (
                    <div key={b.key}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", background: GROUND.g1, borderBottom: `1px solid ${RULE_SOFT}` }}>
                        <div style={mono(8.5, GREEN, 0.13, 600)}>{b.label}</div>
                        <div style={mono(8, DIM, 0.11)}>{b.note}</div>
                        <div style={{ flex: 1 }} />
                        {!b.open && b.rows.length > 0 && (
                          <div onClick={() => setExpanded((e) => ({ ...e, [b.key]: !e[b.key] }))}
                            style={{ cursor: "pointer", padding: "4px 9px", border: `1px solid ${LINE.l2}`, font: `500 8px/1.3 ${MONO}`, letterSpacing: ".11em", color: MUT }}>
                            {open ? "COLLAPSE ↑" : `${b.rows.length.toLocaleString("en-US")} ROWS · CONTINUE ↓`}
                          </div>
                        )}
                      </div>
                      {open && b.rows.map((r) => (
                        <div key={r.hcp_id} onClick={() => navigate(`/hcp/${r.hcp_id}`)}
                          style={{ display: "grid", gridTemplateColumns: "52px 1fr 200px 96px 168px 132px 64px", alignItems: "center", padding: "13px 16px", borderBottom: `1px solid ${RULE_SOFT}`, cursor: "pointer" }}>
                          <div style={{ font: `500 11px/1 ${MONO}`, color: MUT }}>{r.drank}</div>
                          <div style={{ font: `400 12.5px/1.3 ${SERIF}`, color: INK0 }}>{r.name}</div>
                          <div style={{ font: `400 10.5px/1.35 ${SERIF}`, color: MUT3 }}>{r.institution ?? "INSTITUTION NOT ON RECORD"}</div>
                          <div style={mono(9, r.state || r.country ? MUT : DIM, 0.08)}>
                            {region === "EU" ? (r.country ?? "NOT IN REGISTRY") : (r.state ?? r.country ?? "NOT IN REGISTRY")}
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {flags.get(r.hcp_id)?.senior_transition ? (
                            <span title="Senior-authored years within the FieldMark corpus — we see only what is ingested." style={{ padding: "2px 6px", border: `1px solid ${GREEN_DK}`, font: `600 7.5px/1.3 ${MONO}`, letterSpacing: ".1em", color: GREEN }}>SENIOR SINCE {flags.get(r.hcp_id)?.first_senior_year ?? "—"}</span>
                          ) : null}
                          {flags.get(r.hcp_id)?.on_open_trial ? (
                            <span title="Named investigator on >= 1 rendered open trial (gated view; registry labels every site lead PI)" style={{ padding: "2px 6px", border: `1px solid ${LINE.l2}`, font: `600 7.5px/1.3 ${MONO}`, letterSpacing: ".1em", color: INK0 }}>OPEN TRIAL</span>
                          ) : null}
                          {!flags.get(r.hcp_id)?.senior_transition && !flags.get(r.hcp_id)?.on_open_trial ? (
                            <span style={mono(8, DIM2, 0.1)}>—</span>
                          ) : null}
                        </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{ width: 56, height: 3, background: LINE.l0 }}>
                              <div style={{ height: 3, background: GREEN, width: `${r.pctl ?? 0}%` }} />
                            </div>
                            <div style={{ font: `500 10.5px/1 ${MONO}`, color: INK1 }}>{r.pctl?.toFixed(2) ?? "NOT COMPUTED"}</div>
                          </div>
                          <div style={{ ...mono(9, MUT3, 0.06), textAlign: "right" }}>
                            {r.career_first_pub_year ? `${new Date().getFullYear() - r.career_first_pub_year} yr` : "NOT ON RECORD"}
                          </div>
                        </div>
                      ))}
                      {open && b.rows.length === 0 && (
                        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${RULE_SOFT}`, ...mono(9, FAINT, 0.1) }}>
                          NO ROWS IN THIS BAND UNDER THE CURRENT SCOPE
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </Card>

            <div style={{ marginTop: 14, display: "flex", gap: 22, flexWrap: "wrap", padding: "0 2px" }}>
              <div style={{ ...mono(8, FAINT, 0.11), lineHeight: 1.7, maxWidth: 400 }}>
                NARRATIVE IS PRESENT ON THE TOP 200 US — THE CUT FOLLOWS RANK, RE-EVALUATED EACH WEEKLY BUILD. NOT A COLUMN.
              </div>
              <div style={{ ...mono(8, FAINT, 0.11), lineHeight: 1.7, maxWidth: 400 }}>
                EXTRACTED POSITIONS COVER THE TOP 100 US ONLY — A WINDOW ON THE PIPELINE, NOT A PROPERTY OF THE PHYSICIAN. NOT A LEDGER COLUMN.
              </div>
              <div style={{ ...mono(8, FAINT, 0.11), lineHeight: 1.7, maxWidth: 400 }}>
                NETWORK CENTRALITY IS PRESENT ON 100% — IT IS THE ENTRY CONDITION FOR THE BOARD, SO IT SORTS NOTHING.
              </div>
            </div>
          </>
        )}

      </div>
    </AppLayout>
  );
}
