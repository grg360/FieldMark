// Rising star profile — the third profile surface, keyed on rising board
// membership (ProfileDispatch: rising board → academic spine → community).
// Layout authority: docs/design/Rising Surface.dc.html (three profile states:
// covered top-of-board, deep-board absence case, dual-board). Data:
// hcp_rising_profile RPC, one call. The header renders rank/percentile/
// components LIVE from hcp_rising_star_ranks_v3 — the narrative (prompt
// rising_star_v4.0) is forbidden from citing them, so the two never compete.
// Absence vocabulary: never a bare em-dash, never a blank — every missing
// value renders as a named state with its mechanism.

import AppLayout from "../AppLayout";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProfileRelationshipControls, { profileHcp } from "./ProfileRelationshipControls";
import ProfileSecondaryControls from "./ProfileSecondaryControls";
import FieldInsights from "../FieldInsights/FieldInsights";
import { FiToast } from "../FieldIntelligenceShared";
import { loadFieldPresence, type FieldNote } from "../../lib/hcpProfile";
import {
  getRisingProfile, careerYears, collabStanding, fmtPctl, getRisingFlags, type RisingFlags,
  type RisingProfile,
} from "../../lib/risingProfile";
import { FONT, GROUND, LINE, GOLD, COOL } from "../../lib/designTokens";

// Register tokens (2026-08-05): this surface was written fresh, so unlike the
// migrated frames it CONSUMES the register rather than preserving frame bytes —
// FONT.serif (Source Serif 4, not the frame's Spectral), FONT.mono, and the
// SCALE/GOLD/INK/INK_COOL/GREY ramps, nearest-token where the frame value had
// no exact equal. Kept local as semantics with no token counterpart: the rising
// cohort greens (#8fb8a6/#7fb3a4 — cohort marker, same class as the profile
// family's sage/rose/teal), the visibility-axis blue, the archetype color
// vocabulary, and the window-warning tinted well (#141008/#2a2519).
const CARD = GROUND.g1; // g1 well inside the g2 board (Commit C)
const CARD_EDGE = LINE.l1;
const RULE = LINE.l0;
const RULE_SOFT = LINE.l0;
// Warm-INK and mid-grey tokens retired in the 2026-08-05 Two Ramps
// consolidation with no equal-value survivor. Values FROZEN as locals —
// this is a scanning surface, so its re-ink to COOL awaits a Design pass
// (the applied table does not cover the rising surface yet).
// Ink follows reading mode at the BLOCK level (2026-08-06): the rising profile's
// blocks — SIGNAL SUMMARY, Established Neighbourhood, positions rows — are scanned
// as units alongside cool mono labels, so they take the COOL ramp, matching the
// academic and community spines (already cool serif). These three were the last
// warm-neutral inks here; swapped to their luminance-matched cool steps so the
// temperature flips without moving the hierarchy. A warm ink adjacent to a cool
// one inside one block is what read blue.
const INK0 = COOL.ui; // was warm #e9e6df
const INK1 = COOL.prose;
const INK2 = COOL.muted; // was warm #a9a396
const SERIF_INK = COOL.prose; // was warm #c5bfb2
const MUT = "#8d939c"; // was GREY.grey2
const MUT3 = "#7b8189"; // was GREY.grey3
const MUT2 = "#5f6670"; // was GREY.grey5 — below the COOL text floor; flagged
const DIM = COOL.floor;
const DIM2 = COOL.floor;
const FAINT = COOL.floor;
// Gold states retired the same day (GOLD is now gold/bright/dim/rank); the
// deep/muted/soft trio freezes here pending the gold-convergence pass.
// Gold convergence 2026-08-05: deep and muted both fold into GOLD.dim (the
// two-step dark-gold distinction retires); soft folds into GOLD.bright.
const GOLD_DEEP = GOLD.dim;
const GOLD_MUTED = GOLD.dim;
const GOLD_SOFT = GOLD.bright;
const GREEN = "#8fb8a6"; // rising cohort marker — semantic, no token counterpart
const GREEN_DK = "#7fb3a4";
const BLUE = "#6f8fa8"; // visibility axis — semantic pair with momentum green
const RANK_GOLD = GOLD.rank;
const MONO = FONT.mono;
const SERIF = FONT.serif;

const mono = (size: number, color: string, ls = 0.12, weight = 400): CSSProperties => ({
  font: `${weight} ${size}px/1.5 ${MONO}`, letterSpacing: `${ls}em`, color,
});
const serif = (size: number, color: string, lh = 1.72): CSSProperties => ({
  font: `400 ${size}px/${lh} ${SERIF}`, color,
});

function SectionHead({ title, sub, right, tick = GREEN_DK }: {
  title: string; sub: string; right: string; tick?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "34px 0 10px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 2, height: 11, background: tick }} />
        <div style={{ ...mono(10, INK0, 0.14, 600), whiteSpace: "nowrap" }}>{title}</div>
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

function PctlCell({ value, bar, evidence }: { value: number | null; bar: string; evidence: string }) {
  return (
    <div style={{ padding: "18px 16px", borderLeft: `1px solid ${RULE}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ font: `500 26px/1 ${MONO}`, color: INK0 }}>
          {value != null ? value.toFixed(2) : "NOT COMPUTED"}
        </div>
        {value != null && <div style={mono(8, DIM)}>PCTL</div>}
      </div>
      <div style={{ marginTop: 9, height: 4, background: RULE }}>
        <div style={{ height: 4, background: bar, width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
      </div>
      <div style={{ marginTop: 10, ...serif(10.5, INK2, 1.6) }}>{evidence}</div>
    </div>
  );
}

function quadrantOf(mom: number | null, vis: number | null): { name: string; color: string } {
  if (mom == null || vis == null) return { name: "NOT PLACED", color: MUT3 };
  const hiM = mom >= 80, hiV = vis >= 80;
  if (hiM && hiV) return { name: "Future KOL", color: GREEN };
  if (hiM) return { name: "Emerging Specialist", color: RANK_GOLD };
  if (hiV) return { name: "ESTABLISHED VISIBILITY", color: "#7f93ad" };
  return { name: "EARLY DEVELOPMENT", color: MUT3 };
}

// Archetypes retired 2026-08-05: the panel states quadrant position — a
// location on the two components — never a type. The one label that survived
// testing is the RECENT SENIOR AUTHORSHIP event badge, rendered in the hero.
function quadrantProse(sci: string, net: string): string {
  return `Position, not a type: scientific momentum at ${sci}, network momentum at ${net}. The region name describes where this profile sits on the two engines this week.`;
}

// ── THE RECORD — Design frame "The Record.dc.html" option 1A, paired windows ─
// (2026-08-06, replaces the four-cell arrow deltas.) Every row is two stacked
// windows; the bar is the movement; bars scale within their own row ONLY
// (early fill = early/recent of the track, recent bar full). Frame bytes kept
// for the semantic bar colors — the citation copper is deliberately distinct
// from the count-row gold because accrual is not a window count, and the
// senior green marks filled squares. Above TICK_CAP recent-window papers the
// senior squares become proportion bars — BOTH windows switch together so the
// pair stays comparable.
const REC = {
  track: "#161618", // bar track
  earlyBar: "#3d3a35", // early-window fill — dim, the baseline
  countBar: "#c9762e", // recent-window fill on the two COUNT rows
  citeBar: "#8a5a2a", // citation accrual — distinct copper, never the count gold
  seniorFill: "#5aa07a", // senior-authored square / proportion fill
  hollow: "#2e2e31", // hollow square + proportion outline
  dash: "#2b2b2e", // NO STOCK dashed rule
} as const;
const REC_TICK_CAP = 60; // above this many recent-window papers, squares → proportion bars

function RecRow({ label, sub, children, right, last = false }: {
  label: string; sub: string; children: ReactNode; right: ReactNode; last?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 168px", gap: 28, padding: last ? "22px 22px 24px" : "22px 22px 20px", borderBottom: last ? "none" : `1px solid ${RULE}` }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={mono(11, INK0, 0.16)}>{label}</div>
        <div style={{ ...mono(10, MUT2, 0.1), lineHeight: 1.5, whiteSpace: "pre-line" }}>{sub}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-end", gap: 3 }}>{right}</div>
    </div>
  );
}

function RecWindow({ label, bar, value, recent = false }: {
  label: string; bar: ReactNode; value: ReactNode; recent?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "132px 1fr 74px", alignItems: "center", gap: 16 }}>
      <div style={mono(10, recent ? MUT : MUT2, 0.09)}>{label}</div>
      <div>{bar}</div>
      <div style={{ textAlign: "right" }}>{value}</div>
    </div>
  );
}

// ×(recent/early) — one decimal below 10, whole above; a zero or absent early
// window cannot be a ratio and says so instead of rendering ×Infinity.
function recMult(early: number | null | undefined, recent: number | null | undefined): string | null {
  if (early == null || recent == null || early <= 0) return null;
  const r = recent / early;
  return `×${r >= 10 ? r.toFixed(0) : r.toFixed(1)}`;
}

function RecCountRow({ label, sub, caption, early, recent, ew, rw, absent }: {
  label: string; sub: string; caption: string;
  early: number | null | undefined; recent: number | null | undefined;
  ew: string; rw: string; absent: string;
}) {
  if (early == null || recent == null) {
    return (
      <RecRow label={label} sub={sub} right={null}>
        <div style={{ ...serif(12.5, INK2, 1.6), maxWidth: 640 }}>{absent}</div>
      </RecRow>
    );
  }
  const mult = recMult(early, recent);
  const span = Math.max(recent, early, 1);
  return (
    <RecRow label={label} sub={sub}
      right={mult != null ? (
        <>
          <div style={{ font: `400 26px/1 ${SERIF}`, color: INK0 }}>{mult}</div>
          <div style={mono(10, MUT2, 0.1)}>{caption}</div>
        </>
      ) : (
        <div style={{ ...mono(10, MUT2, 0.1), textAlign: "right", lineHeight: 1.6 }}>FROM ZERO —<br />NOT A RATIO</div>
      )}>
      <RecWindow label={ew}
        bar={<div style={{ display: "flex", height: 9, background: REC.track }}>
          <div style={{ flex: early, background: REC.earlyBar, minWidth: early ? 3 : 0 }} />
          <div style={{ flex: span - early }} />
        </div>}
        value={<div style={{ font: `300 22px/1 ${SERIF}`, color: MUT3, fontVariantNumeric: "tabular-nums" }}>{early.toLocaleString("en-US")}</div>} />
      <RecWindow label={rw} recent
        bar={<div style={{ display: "flex", height: 16, background: REC.track }}><div style={{ flex: 1, background: REC.countBar }} /></div>}
        value={<div style={{ font: `400 40px/0.9 ${SERIF}`, color: INK0, fontVariantNumeric: "tabular-nums" }}>{recent.toLocaleString("en-US")}</div>} />
    </RecRow>
  );
}

// One square per paper, filled where senior-authored; above REC_TICK_CAP recent
// papers both windows switch to a proportion bar together.
function RecSeniorWindow({ seniorN, totalN, ticks, height }: {
  seniorN: number; totalN: number; ticks: boolean; height: number;
}) {
  if (ticks) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
        {Array.from({ length: totalN }, (_, i) => i < seniorN ? (
          <div key={i} style={{ width: 9, height: 9, background: REC.seniorFill }} />
        ) : (
          <div key={i} style={{ width: 9, height: 9, border: `1px solid ${REC.hollow}`, boxSizing: "border-box" }} />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", height, border: `1px solid ${REC.hollow}` }}>
      <div style={{ flex: seniorN, background: REC.seniorFill, minWidth: seniorN ? 3 : 0 }} />
      <div style={{ flex: Math.max(totalN - seniorN, 0) }} />
    </div>
  );
}

// ── FIELD INTELLIGENCE — ported from the community spine (2026-08-06) ────────
// Same three validation questions, same segmented inline options, same honest
// unwired submit (field_intel_* tables are SELECT-only — see KNOWN_ISSUES).
// Only the register changes: rising Card + mono ramp instead of the community P palette.
const FI_QUESTIONS = [
  { key: "confidence", label: "Signal record matches field reality", options: ["Confirms", "Partial", "Disputes"] },
  { key: "access", label: "Access in practice", options: ["Open", "Gated", "Closed"] },
  { key: "referral", label: "Referral influence in region", options: ["High", "Moderate", "Low"] },
] as const;

function FieldIntelligencePanel() {
  const [answers, setAnswers] = useState<Record<string, string | null>>({ confidence: null, access: null, referral: null });
  const [toast, setToast] = useState<string | null>(null);
  const complete = FI_QUESTIONS.every((q) => answers[q.key]);
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); };

  return (
    <Card style={{ padding: "18px 22px", maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
      <span style={mono(10, MUT2, 0.06)}>Validation pending — 0 MSLs have reviewed this profile.</span>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={mono(9, RANK_GOLD, 0.14, 600)}>COMMUNITY CONFIDENCE</span>
          <span style={mono(9, DIM2, 0.06)}>0 MSLs</span>
        </div>
        <div style={{ height: 3, background: RULE }} />
      </div>
      {FI_QUESTIONS.map((q) => (
        <div key={q.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono(10, MUT3, 0.04)}>{q.label}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {q.options.map((opt) => {
              const on = answers[q.key] === opt;
              return (
                <button key={opt} onClick={() => setAnswers((a) => ({ ...a, [q.key]: a[q.key] === opt ? null : opt }))}
                  style={{ flex: 1, textAlign: "center", padding: "7px 0", background: on ? "rgba(255,255,255,.07)" : "none", cursor: "pointer",
                    border: `1px solid ${on ? "rgba(255,255,255,.28)" : LINE.l2}`, borderRadius: 3, font: `${on ? 600 : 400} 10px/1.4 ${MONO}`, color: on ? INK0 : INK1, minHeight: 0 }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button disabled={!complete}
        onClick={() => { if (!complete) return; showToast("Field review recorded — the submission path (field-intel write) is not yet wired; stored locally only."); }}
        style={{ textAlign: "center", padding: "10px 0", background: "none", border: `1px solid ${LINE.l2}`, borderRadius: 3,
          font: `500 10.5px/1.4 ${MONO}`, color: complete ? INK1 : MUT2, cursor: complete ? "pointer" : "not-allowed", opacity: complete ? 1 : 0.6, minHeight: 0 }}>
        Submit validation
      </button>
      <span style={{ textAlign: "center", ...mono(8.5, DIM2, 0.04), marginTop: -6 }}>Your identity is never shared. Contributor UUID only.</span>
      <FiToast message={toast} />
    </Card>
  );
}

export default function RisingHcpProfile({ hcpId }: { hcpId: string }) {
  const navigate = useNavigate();
  const [p, setP] = useState<RisingProfile | null | undefined>(undefined);
  const [flags, setFlags] = useState<RisingFlags | null>(null);
  const [notes, setNotes] = useState<FieldNote[]>([]);

  useEffect(() => {
    let alive = true;
    getRisingProfile(hcpId).then((d) => alive && setP(d)).catch(() => alive && setP(null));
    return () => { alive = false; };
  }, [hcpId]);
  useEffect(() => {
    let alive = true;
    getRisingFlags([hcpId]).then((f) => alive && setFlags(f.get(hcpId) ?? null));
    loadFieldPresence(hcpId).then((fn) => alive && setNotes(fn)).catch(() => {});
    return () => { alive = false; };
  }, [hcpId]);

  if (p === undefined) {
    return (
      <AppLayout width="wide"><div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", ...mono(11, COOL.muted, 0.06) }}>
        Loading rising profile…
      </div></AppLayout>
    );
  }
  if (p === null) {
    return (
      <AppLayout width="wide"><div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", ...mono(11, COOL.muted, 0.06) }}>
        Not on the rising board — this route should not have dispatched here.
      </div></AppLayout>
    );
  }

  const name = p.hcp.preferred_display_name
    || [p.hcp.first_name, p.hcp.last_name].filter(Boolean).join(" ")
    || "Name not on record";
  const rank = p.rising.rank;
  const usRank = p.rising.us_rank;

  const composite = p.rising.rising_star_percentile;
  const career = careerYears(p.hcp.career_first_pub_year);
  const geo = p.hcp.nppes_practice_state || p.hcp.country || "GEOGRAPHY NOT ON RECORD";
  const m = p.momentum;
  const nw = p.network;
  const insideWindow = usRank != null && usRank <= 100;
  const dual = p.established_us != null;
  const residualBand = rank > 600;

  // Conditional neighbourhood header (2026-08-06): the section may only assert
  // "working inside an established neighbourhood" when at least one of the top
  // five carries an established standing (US or global row — the same two states
  // collabStanding renders as ESTABLISHED). Otherwise it is a collaborator list
  // and says so. Board-wide today the fallback fires for ~1 of 123 US members.
  const inEstNeighbourhood = p.collaborators.some((c) => c.est_us_rank != null || c.est_global_rank != null);

  // Rolling windows (2026-08-05): ranges come from the momentum row's
  // window_start/window_end date columns — never hardcoded. Month precision
  // when the pipeline ran in date mode; year fallback for legacy rows.
  const fmtWin = (start?: string | null, end?: string | null, ys?: number | null, ye?: number | null) => {
    if (start && end) {
      const f = (iso: string) => {
        const d = new Date(iso + "T00:00:00Z");
        return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
      };
      return `${f(start)}–${f(end)}`;
    }
    return ys != null && ye != null ? `${ys}–${ye}` : "WINDOW NOT ON RECORD";
  };
  const ew = fmtWin(m?.early_window_start, m?.early_window_end, m?.early_start_year, m?.early_end_year);
  const rw = fmtWin(m?.recent_window_start, m?.recent_window_end, m?.recent_start_year, m?.recent_end_year);
  const seniorParsed = p.leadership != null || (m?.recent_senior_author_pct != null && m?.early_senior_author_pct != null);
  const pctStr = (v: number | null | undefined) => (v == null ? null : `${(v * 100).toFixed(2)}%`);

  const quad = quadrantOf(p.rising.momentum_component, p.rising.visibility_component);

  const bandLabel = rank <= 100 ? "TOP 100" : rank <= 300 ? "101–300" : rank <= 600 ? "301–600" : "600+";
  const bandNote = residualBand
    ? "RESIDUAL BAND · 600+ · CLASSIFIER DEGENERATE · DE-EMPHASIZED BY DESIGN"
    : `CLASSIFYING BAND · ${bandLabel}`;

  const metaLine: string[] = [
    m?.recent_total_pubs != null ? `${m.recent_total_pubs} PUBLICATIONS ${rw}` : "PUBLICATION WINDOWS NOT COMPUTED",
    seniorParsed && m?.recent_senior_author_pct != null
      ? `${pctStr(m.recent_senior_author_pct)} SENIOR-AUTHOR SHARE`
      : "AUTHOR POSITION NOT PARSED",
    nw?.recent_collaborator_count != null ? `${nw.recent_collaborator_count} COLLABORATORS` : "COLLABORATOR COUNT NOT COMPUTED",
    (p.positions?.total ?? 0) > 0 ? `${p.positions!.total} EXTRACTED POSITIONS` : "OUTSIDE THE EXTRACTION WINDOW",
    "NETWORK CENTRALITY PRESENT",
  ];

  const posStates = [
    { n: "1", label: "OUTSIDE THE EXTRACTION WINDOW", mech: "Never eligible; the window covers the top 100 US only.", applies: !insideWindow },
    { n: "2", label: "ELIGIBLE, NO QUALIFYING PAPER", mech: "No recent first- or senior-authored paper with a full abstract.", applies: insideWindow && (p.positions?.total ?? 0) === 0 },
    { n: "3", label: "EXTRACTION RAN, YIELDED NOTHING", mech: "Papers qualified; no position cleared the confidence floor.", applies: insideWindow && (p.positions?.total ?? 0) === 0 },
  ];

  const label = (t: string) => <div style={mono(8, DIM, 0.14)}>{t}</div>;

  return (
    <AppLayout width="wide">
      <div style={{ fontFamily: MONO, color: INK1, margin: "8px 0 24px", padding: "28px 36px 40px", background: GROUND.g2, border: `1px solid ${LINE.l1}` }}>

        {/* breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0 14px", flexWrap: "wrap" }}>
          <div style={{ padding: "2px 5px", background: "#1c2a26", font: `600 8px/1.4 ${MONO}`, letterSpacing: ".12em", color: GREEN }}>RIS</div>
          <div style={mono(9, MUT2)}>RISING / NSCLC</div>
          <div style={{ color: LINE.l2, fontSize: 9 }}>›</div>
          <div style={mono(9, MUT2)}>
            {usRank != null ? `RANK #${usRank} US` : `RANK #${rank.toLocaleString("en-US")} GLOBAL`}
            {dual ? ` · EST #${p.established_us!.rank} US` : ""}
          </div>
          <div style={{ color: LINE.l2, fontSize: 9 }}>›</div>
          <div onClick={() => navigate("/cohorts/ledger/rising-stars")} style={{ cursor: "pointer", ...mono(9, GREEN_DK) }}>↑ BACK TO RISING LEDGER</div>
        </div>

        {/* hero */}
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px" }}>
            <div style={{ padding: "20px 22px 16px", borderRight: `1px solid ${RULE}`, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", columnGap: 24, rowGap: 18 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <div style={{ font: `600 40px/1 ${MONO}`, letterSpacing: "-.02em", color: RANK_GOLD }}>
                      #{(usRank ?? rank).toLocaleString("en-US")}
                    </div>
                    <div style={{ font: `500 13px/1 ${MONO}`, letterSpacing: ".06em", color: MUT }}>
                      {usRank != null ? "US" : "GLOBAL"}
                    </div>
                  </div>
                  <div style={{ marginTop: 7, ...mono(8, MUT2, 0.13) }}>
                    {usRank != null ? "RISING RANK · US BOARD" : "RISING RANK · GLOBAL BOARD"}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", borderLeft: `1px solid ${LINE.l2}`, paddingLeft: 24 }}>
                  {dual ? (
                    <>
                      <div style={{ font: `500 18px/1 ${MONO}`, color: INK1, whiteSpace: "nowrap" }}>EST #{p.established_us!.rank} US</div>
                      <div style={{ marginTop: 7, ...mono(8, MUT2, 0.13), whiteSpace: "nowrap" }}>ALSO ON THE ESTABLISHED BOARD</div>
                    </>
                  ) : usRank != null ? (
                    <>
                      <div style={{ font: `500 22px/1 ${MONO}`, color: INK1, whiteSpace: "nowrap" }}>#{rank.toLocaleString("en-US")}</div>
                      <div style={{ marginTop: 7, ...mono(8, MUT2, 0.13), whiteSpace: "nowrap" }}>GLOBAL RISING RANK</div>
                    </>
                  ) : (
                    <>
                      <div style={{ font: `500 13px/1 ${MONO}`, color: INK1, whiteSpace: "nowrap" }}>NO US RANK</div>
                      <div style={{ marginTop: 7, ...mono(8, MUT2, 0.13), whiteSpace: "nowrap" }}>OUTSIDE THE US BOARD</div>
                    </>
                  )}
                </div>
                <div style={{ flex: "0 1 auto", minWidth: 190, maxWidth: 230 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                    <div style={{ font: `500 22px/1 ${MONO}`, color: INK1 }}>{fmtPctl(composite)}</div>
                    {composite != null && <div style={mono(9, MUT2, 0.1)}>PCTL</div>}
                  </div>
                  <div style={{ marginTop: 6, height: 3, background: LINE.l0 }}>
                    <div style={{ height: 3, background: GREEN, width: `${composite ?? 0}%` }} />
                  </div>
                  <div style={{ marginTop: 6, ...mono(8, MUT2, 0.13) }}>COMPOSITE PERCENTILE · IN COHORT</div>
                </div>
              </div>

              <div style={{ marginTop: 22, font: `400 30px/1.12 ${SERIF}`, color: INK0, letterSpacing: "-.01em" }}>{name}</div>
              {/* Event badge + trial flag (2026-08-05). Selector is window-based
                  (rising_board_flags: zero early-window seniors, >= 3 recent,
                  active within 24 months); the DISPLAY is career-anchored so it
                  does not shift as the windows roll. */}
              {flags?.senior_transition || flags?.on_open_trial ? (
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {flags?.senior_transition ? (
                    <span title="Senior-authored years within the FieldMark corpus — we see only what is ingested." style={{ padding: "3px 8px", border: `1px solid ${GREEN_DK}`, font: `600 8px/1.4 ${MONO}`, letterSpacing: ".12em", color: GREEN }}>
                      SENIOR AUTHORSHIP SINCE {flags.first_senior_year ?? "—"} · {flags.recent_senior_pubs ?? "—"} PAPERS · LATEST {flags.latest_senior_year ?? "—"}
                    </span>
                  ) : null}
                  {flags?.on_open_trial ? (
                    <span title="Named investigator on at least one rendered open trial. Gated view; the registry labels every site lead PI, so no lead claim is made." style={{ padding: "3px 8px", border: `1px solid ${LINE.l2}`, font: `600 8px/1.4 ${MONO}`, letterSpacing: ".12em", color: INK1 }}>
                      OPEN-TRIAL INVESTIGATOR
                    </span>
                  ) : null}
                  {flags?.senior_transition ? (
                    <span style={{ ...serif(10.5, MUT3, 1.4) }}>Names why the momentum score is high — not a separate signal.</span>
                  ) : null}
                </div>
              ) : null}
              <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={serif(12, "#7fb3a4", 1.4)}>{p.hcp.institution_normalized ?? "INSTITUTION NOT ON RECORD"}</span>
                <span style={{ color: DIM2, fontSize: 10 }}>·</span>
                <span style={mono(10, MUT, 0.08)}>{geo}</span>
                <span style={{ color: DIM2, fontSize: 10 }}>·</span>
                <span style={mono(9, MUT2, 0.1)}>
                  {career != null ? `${career} YR CAREER AGE` : "CAREER AGE NOT ON RECORD"}
                </span>
              </div>
              <div style={{ marginTop: 5, ...mono(8, DIM2, 0.13) }}>
                · {p.hcp.npi_number ? "VERIFIED NPI REGISTRY" : "NPI NOT ON RECORD"}
              </div>

              <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link to={`/hcp/${hcpId}/brief`} style={{ textDecoration: "none", padding: "7px 11px", border: `1px solid ${GOLD_DEEP}`, color: RANK_GOLD, font: `500 9px/1 ${MONO}`, letterSpacing: ".12em" }}>+ GENERATE BRIEF</Link>
                <Link to={`/hcp/${hcpId}/publications`} style={{ textDecoration: "none", padding: "7px 11px", border: `1px solid ${LINE.l2}`, color: INK2, font: `500 9px/1 ${MONO}`, letterSpacing: ".12em" }}>ALL PUBLICATIONS ↗</Link>
                <Link to={`/hcp/${hcpId}/positions`} style={{ textDecoration: "none", padding: "7px 11px", border: `1px solid ${LINE.l2}`, color: INK2, font: `500 9px/1 ${MONO}`, letterSpacing: ".12em" }}>ALL POSITIONS ↗</Link>
              </div>
            </div>

            <div style={{ padding: "20px 20px 16px", display: "flex", flexDirection: "column" }}>
              {label("QUADRANT POSITION")}
              {/* Mini-quadrant glyph: the ledger's quadrant restated at profile
                  scale — four cells at the ledger's tints, one dot at this
                  profile's true coordinates. No new colors, no new vocabulary. */}
              <div style={{ marginTop: 9, display: "flex", gap: 12, alignItems: "flex-start" }}>
                {(() => {
                  const mom = p.rising.momentum_component ?? 40;
                  const vis = p.rising.visibility_component ?? 40;
                  const cx = Math.max(4, Math.min(96, ((vis - 40) / 60) * 100));
                  const cy = Math.max(4, Math.min(96, ((mom - 40) / 60) * 100));
                  const SPLIT = ((80 - 40) / 60) * 100;
                  return (
                    <div style={{ position: "relative", width: 56, height: 56, flex: "none", border: `1px solid ${RULE}`, background: GROUND.g1 }}>
                      <div style={{ position: "absolute", left: 0, bottom: `${SPLIT}%`, top: 0, width: `${SPLIT}%`, background: "rgba(216,162,74,.05)" }} />
                      <div style={{ position: "absolute", right: 0, bottom: `${SPLIT}%`, top: 0, left: `${SPLIT}%`, background: "rgba(143,184,166,.08)" }} />
                      <div style={{ position: "absolute", right: 0, bottom: 0, height: `${SPLIT}%`, left: `${SPLIT}%`, background: "rgba(138,162,196,.06)" }} />
                      <div style={{ position: "absolute", left: `${SPLIT}%`, top: 0, bottom: 0, width: 1, background: LINE.l2 }} />
                      <div style={{ position: "absolute", bottom: `${SPLIT}%`, left: 0, right: 0, height: 1, background: LINE.l2 }} />
                      <div style={{ position: "absolute", left: `${cx}%`, bottom: `${cy}%`, width: 5, height: 5, marginLeft: -2.5, marginBottom: -2.5, borderRadius: "50%", background: quad.color }} />
                    </div>
                  );
                })()}
                <div>
                  <div style={{ font: `500 15px/1.25 ${MONO}`, letterSpacing: ".02em", color: quad.color }}>
                    {quad.name}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 18 }}>
                    <div style={mono(9, INK1, 0.08)}>MOM {fmtPctl(p.rising.momentum_component)}</div>
                    <div style={mono(9, INK1, 0.08)}>VIS {fmtPctl(p.rising.visibility_component)}</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, height: 1, background: LINE.l0 }} />
              <div style={{ marginTop: 10, ...serif(11.5, SERIF_INK, 1.6) }}>
                {quadrantProse(fmtPctl(p.rising.scientific_momentum_percentile), fmtPctl(p.rising.network_momentum_percentile))}
              </div>
              <div style={{ flex: 1, minHeight: 14 }} />
              <div style={mono(8, DIM2, 0.11)}>{bandNote}</div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${RULE}`, padding: "10px 22px", display: "flex", gap: 14, flexWrap: "wrap" }}>
            {metaLine.map((t) => (
              <div key={t} style={mono(8, COOL.floor, 0.12)}>{t}</div>
            ))}
          </div>
        </Card>

        {/* momentum & visibility — full width again (2026-08-06): THE RECORD's
            Design frame (option 1A, paired windows) is a 1180px full-bleed
            composition whose fixed columns do not survive a half column, so the
            earlier M&V + RECORD pairing is dissolved; THE RECORD renders
            full-bleed below the relationship row. */}
        <SectionHead title="MOMENTUM & VISIBILITY" sub="FOUR COMPONENTS · TWO ENGINES"
          right="PERCENTILES WITHIN THE RISING COHORT · NEVER AGAINST ESTABLISHED" />
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "104px 1fr 1fr" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${RULE}` }} />
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${RULE}`, borderLeft: `1px solid ${RULE}`, ...mono(9, MUT, 0.14, 600) }}>SCIENTIFIC</div>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${RULE}`, borderLeft: `1px solid ${RULE}`, ...mono(9, MUT, 0.14, 600) }}>NETWORK</div>

            <div style={{ padding: "18px 14px", borderBottom: `1px solid ${RULE}` }}>
              <div style={mono(9, INK0, 0.14, 600)}>MOMENTUM</div>
            </div>
            <div style={{ borderBottom: `1px solid ${RULE}` }}>
              <PctlCell value={p.rising.scientific_momentum_percentile} bar={GREEN}
                evidence={m?.early_total_pubs != null && m?.recent_total_pubs != null
                  ? `${m.early_total_pubs} papers ${ew} → ${m.recent_total_pubs} papers ${rw}.`
                  : "Window counts not computed for this record."} />
            </div>
            <div style={{ borderBottom: `1px solid ${RULE}` }}>
              <PctlCell value={p.rising.network_momentum_percentile} bar={GREEN}
                evidence={nw?.early_collaborator_count != null && nw?.recent_collaborator_count != null
                  ? `${nw.early_collaborator_count} → ${nw.recent_collaborator_count} distinct collaborators across the two windows.`
                  : "Collaborator windows not computed for this record."} />
            </div>

            <div style={{ padding: "18px 14px" }}>
              <div style={mono(9, INK0, 0.14, 600)}>VISIBILITY</div>
            </div>
            <PctlCell value={p.rising.scientific_visibility_percentile} bar={BLUE}
              evidence={m?.citation_velocity_delta != null
                ? `Citation volume ${m.citation_velocity_delta >= 0 ? "grew" : "moved"} by ${m.citation_velocity_delta.toLocaleString("en-US")} over the same period — reception of the output, not its size.`
                : "Citation window not computed for this record."} />
            <PctlCell value={p.rising.network_visibility_percentile} bar={BLUE}
              evidence="Position in the co-authorship graph. Present for 100% of the rising board." />
          </div>

          <div style={{ borderTop: `1px solid ${RULE}`, background: GROUND.g1, padding: "14px 18px", display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={mono(8, DIM, 0.13)}>MOMENTUM COMPONENT</div>
              <div style={{ font: `500 14px/1 ${MONO}`, color: INK1 }}>{fmtPctl(p.rising.momentum_component)}</div>
            </div>
            <div style={{ width: 1, height: 16, background: LINE.l2 }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={mono(8, DIM, 0.13)}>VISIBILITY COMPONENT</div>
              <div style={{ font: `500 14px/1 ${MONO}`, color: INK1 }}>{fmtPctl(p.rising.visibility_component)}</div>
            </div>
            <div style={{ width: 1, height: 16, background: LINE.l2 }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={mono(8, DIM, 0.13)}>COMPOSITE</div>
              <div style={{ font: `500 14px/1 ${MONO}`, color: RANK_GOLD }}>{fmtPctl(composite)}</div>
            </div>
            <div style={{ width: 1, height: 16, background: LINE.l2 }} />
            <div onClick={() => navigate("/rising?mode=quadrant")} style={{ display: "flex", alignItems: "baseline", gap: 8, cursor: "pointer" }}>
              <div style={mono(8, DIM, 0.13)}>QUADRANT</div>
              <div style={{ font: `500 10px/1 ${MONO}`, letterSpacing: ".11em", color: quad.color }}>{quad.name}</div>
              <div style={mono(8, GREEN_DK, 0.11)}>SEE POSITION ↗</div>
            </div>
            <div style={{ flex: 1, minWidth: 120 }} />
            <div style={{ ...mono(8, DIM2, 0.1), maxWidth: 480, lineHeight: 1.7 }}>
              EACH COMPONENT IS THE MEAN OF ITS TWO PERCENTILES · COMPOSITE IS THE RANK-NORMALIZED BLEND · COVERAGE 100% ACROSS THE RISING BOARD
            </div>
          </div>
        </Card>

        {/* relationship + contact — directly under the score row, matching the
            established spine's sequence (signal block, then the workspace
            controls); contact must not sit at the bottom of the profile */}
        <SectionHead title="RELATIONSHIP" sub="TRACK · STATUS · FOLLOW-UPS" right="SYNCS WITH THE RISING LEDGER" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card style={{ padding: 18 }}>
            <ProfileRelationshipControls hcpId={hcpId} hcpName={name} specialty="NSCLC" />
          </Card>
          <Card style={{ padding: 18 }}>
            <ProfileSecondaryControls hcpId={hcpId} hcpName={name} specialty="NSCLC" />
          </Card>
        </div>

        {/* the record — frame 1A, paired windows (see the REC note above) */}
        <SectionHead title="THE RECORD" sub="TWO FIVE-YEAR WINDOWS · FOUR MEASURES"
          right="BARS SCALE WITHIN THEIR OWN ROW ONLY" />
        <Card>
          <RecCountRow label="PUBLICATIONS" sub={"COUNT OF PAPERS\nIN EACH WINDOW"} caption="AS MANY PAPERS"
            early={m?.early_total_pubs} recent={m?.recent_total_pubs} ew={ew} rw={rw}
            absent="Window counts are not computed for this record — the momentum table holds no row, so no bar is drawn and no movement is claimed." />
          <RecCountRow label="COLLABORATORS" sub={"DISTINCT CO-AUTHORS\nIN EACH WINDOW"} caption="AS MANY PEOPLE"
            early={nw?.early_collaborator_count} recent={nw?.recent_collaborator_count} ew={ew} rw={rw}
            absent="Collaborator windows are not computed for this record — no bar is drawn and no movement is claimed." />

          {/* CITATIONS — accrual, not a window count: no early stock exists to
              compare, so the early row is a dashed empty rule reading NO STOCK
              and the recent bar takes the distinct copper, never the count gold. */}
          <RecRow label="CITATIONS" sub={"VOLUME ACCRUED\nNOT A WINDOW COUNT"}
            right={<div style={{ ...mono(11, MUT, 0.1), textAlign: "right", lineHeight: 1.5 }}>ADDED ACROSS<br />THE WINDOW</div>}>
            <RecWindow label={ew}
              bar={<div style={{ height: 9, borderBottom: `1px dashed ${REC.dash}` }} />}
              value={<div style={mono(10, DIM, 0.08)}>NO STOCK</div>} />
            <RecWindow label={rw} recent
              bar={<div style={{ display: "flex", height: 16, background: REC.track }}><div style={{ flex: 1, background: REC.citeBar }} /></div>}
              value={m?.citation_velocity_delta != null ? (
                <div style={{ font: `400 40px/0.9 ${SERIF}`, color: INK0, fontVariantNumeric: "tabular-nums" }}>
                  {`${m.citation_velocity_delta >= 0 ? "+" : "−"}${Math.abs(m.citation_velocity_delta).toLocaleString("en-US")}`}
                </div>
              ) : (
                <div style={mono(10, DIM, 0.08)}>NOT COMPUTED</div>
              )} />
          </RecRow>

          {/* SENIOR AUTHORSHIP — one square per paper, filled for senior-authored;
              both windows switch to proportion bars together above REC_TICK_CAP. */}
          {seniorParsed && m?.early_senior_pubs != null && m?.recent_senior_pubs != null
            && m?.early_total_pubs != null && m?.recent_total_pubs != null ? (() => {
            const ticks = m.recent_total_pubs! <= REC_TICK_CAP;
            return (
              <RecRow label="SENIOR AUTHORSHIP" sub={"SHARE OF EACH\nWINDOW'S PAPERS"} last
                right={m.recent_senior_author_pct != null ? (
                  <>
                    <div style={{ font: `400 26px/1 ${SERIF}`, color: REC.seniorFill }}>{pctStr(m.recent_senior_author_pct)}</div>
                    <div style={mono(10, MUT2, 0.1)}>OF RECENT PAPERS</div>
                  </>
                ) : null}>
                <RecWindow label={ew}
                  bar={<RecSeniorWindow seniorN={m.early_senior_pubs!} totalN={m.early_total_pubs!} ticks={ticks} height={9} />}
                  value={<div style={{ ...mono(11, MUT3, 0.02), whiteSpace: "nowrap" }}>{m.early_senior_pubs} of {m.early_total_pubs}</div>} />
                <RecWindow label={rw} recent
                  bar={<RecSeniorWindow seniorN={m.recent_senior_pubs!} totalN={m.recent_total_pubs!} ticks={ticks} height={14} />}
                  value={<div style={{ ...mono(11, INK0, 0.02), whiteSpace: "nowrap" }}>{m.recent_senior_pubs} of {m.recent_total_pubs}</div>} />
              </RecRow>
            );
          })() : (
            <div style={{ padding: "20px 22px 24px" }}>
              <div style={mono(11, MUT, 0.14, 500)}>AUTHORSHIP POSITION NOT PARSED ON THIS RECORD</div>
              <div style={{ marginTop: 12, ...serif(12.5, INK2, 1.7), maxWidth: 980 }}>
                Publication leadership — first, senior and middle-author share — is parsed for 60% of the rising board.
                It is not parsed here, so this surface does not show an authorship split rather than showing a zero.
                Counts, collaborators and both momentum components are unaffected; they do not depend on author position.
              </div>
            </div>
          )}
        </Card>
        <div style={{ marginTop: 8, ...mono(10, DIM2, 0.1) }}>
          SOURCE TABLES · WINDOW COUNTS AND CITATION ACCRUAL ARE SEPARATE MEASURES AND ARE NOT COMPARED TO EACH OTHER
        </div>

        {/* established standing */}
        <SectionHead title="ESTABLISHED STANDING"
          sub="DUAL-BOARD MEMBERS CARRY AN ESTABLISHED RANK IN NSCLC"
          right="RISING WINS THE ROUTE · ESTABLISHED RANK IS A SECTION, NOT A COMPETING SURFACE" />
        {dual ? (
          <Card style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", columnGap: 26, rowGap: 18 }}>
              <div style={{ flex: "0 0 auto" }}>
                <div style={{ font: `600 30px/1 ${MONO}`, letterSpacing: "-.02em", color: RANK_GOLD, whiteSpace: "nowrap" }}>
                  #{(usRank ?? rank).toLocaleString("en-US")} {usRank != null ? "US" : "GLOBAL"}
                </div>
                <div style={{ marginTop: 7, ...mono(8, MUT2, 0.13), whiteSpace: "nowrap" }}>RISING RANK · TRAJECTORY MEASURED</div>
              </div>
              <div style={{ flex: "0 0 auto", paddingBottom: 10, ...mono(11, FAINT, 0.14) }}>ALREADY INSIDE →</div>
              <div style={{ flex: "0 0 auto", borderLeft: `1px solid ${LINE.l2}`, paddingLeft: 26 }}>
                <div style={{ font: `600 30px/1 ${MONO}`, letterSpacing: "-.02em", color: GREEN, whiteSpace: "nowrap" }}>
                  #{p.established_us!.rank.toLocaleString("en-US")} US
                </div>
                <div style={{ marginTop: 7, ...mono(8, MUT2, 0.13), whiteSpace: "nowrap" }}>ESTABLISHED RANK · DESTINATION REACHED IN PART</div>
              </div>
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${RULE}`, ...serif(13, SERIF_INK), maxWidth: 1040 }}>
              US established rank {p.established_us!.rank.toLocaleString("en-US")} says this physician is already inside the
              destination the rising board measures trajectory toward. That is a stronger claim than either number alone,
              and it is why rising wins the route: the established rank belongs on this surface as a section rather than
              as a competing profile.
            </div>
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={mono(8, MUT2, 0.11)}>
                US ESTABLISHED RANK IN NSCLC · SCORE {Number(p.established_us!.cohort_score).toFixed(2)}
                {p.established_global ? ` · GLOBAL ESTABLISHED RANK ${p.established_global.rank.toLocaleString("en-US")}` : ""}
              </div>
              <div style={{ flex: 1 }} />
              <Link to={`/hcp/${hcpId}/brief`} style={{ textDecoration: "none", padding: "6px 11px", border: `1px solid ${LINE.l2}`, font: `500 8px/1.3 ${MONO}`, letterSpacing: ".11em", color: MUT }}>ESTABLISHED BRIEF ↗</Link>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <div style={mono(12, MUT, 0.14, 500)}>NOT ON THE ESTABLISHED BOARD</div>
              <div style={{ padding: "3px 7px", border: `1px solid ${LINE.l2}`, ...mono(8, MUT, 0.11, 500) }}>RISING-ONLY · NO ESTABLISHED RANK</div>
            </div>
            <div style={{ marginTop: 14, ...serif(13, INK2), maxWidth: 1020 }}>
              {p.established_global
                ? `Ranked on the global established board (rank ${p.established_global.rank.toLocaleString("en-US")}) but not US-scoped. The rising surface is the primary record for this profile.`
                : "No established rank in NSCLC. For rising-only physicians this surface is the whole record — nothing is routed elsewhere and no established section renders."}
            </div>
          </Card>
        )}

        {/* signal summary */}
        <SectionHead title="SIGNAL SUMMARY" sub="WHO IS THIS, AND WHAT IS MOVING"
          right="GENERATED SYNTHESIS" />
        {/* Prose at the same 74ch measure as the established spine, provenance
            stamp as the right-field counterweight — the two spines now compose
            identically (a demo reads Marmarelis/Aditi beside an established HCP
            and sees one pattern). The stamp keeps the rising-only lines the
            footer carried: the freshness verdict and the no-rank-by-prompt note. */}
        {p.narrative?.narrative_text ? (
          <Card style={{ padding: "20px 22px", display: "flex", gap: 30, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ ...serif(13.5, SERIF_INK), textWrap: "pretty", maxWidth: "74ch", flex: 1, minWidth: 300 } as CSSProperties}>
              {p.narrative.narrative_text}
            </div>
            <div style={{ width: 216, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={mono(9, INK2, 0.16, 600)}>GENERATED SYNTHESIS</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={mono(9, FAINT, 0.1)}>DATA RUN {p.narrative.generated_at ? new Date(p.narrative.generated_at).toISOString().slice(0, 10) : "UNSTAMPED"}</span>
                <span style={mono(9, FAINT, 0.1)}>PROMPT {(p.narrative.prompt_version ?? "UNVERSIONED").toUpperCase()}</span>
                <span style={mono(9, FAINT, 0.1)}>{p.narrative_current === false ? "DATA HAS MOVED SINCE" : "CURRENT VS LATEST RUN"}</span>
              </div>
              <span style={{ ...mono(8.5, FAINT, 0.06), lineHeight: 1.55 }}>NO RANK OR PERCENTILE BY PROMPT — THE HEADER RENDERS THOSE LIVE · REVIEW BEFORE USE · NO CLINICAL CLAIM</span>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: "20px 22px" }}>
            <div style={mono(12, MUT, 0.14, 500)}>NO NARRATIVE GENERATED AT THIS RANK</div>
            <div style={{ marginTop: 14, ...serif(13, INK2), maxWidth: 980 }}>
              Narrative generation follows the weekly build's cut — the top 200 of the US board. This profile is outside
              that cut, so no narrative exists and no stale text is held for it. The four components above are the
              complete rising signal for this HCP, and they are fully covered. Nothing is being withheld.
            </div>
            <div style={{ marginTop: 16, ...mono(8, FAINT, 0.12), lineHeight: 1.6 }}>
              GENERATION CUT · TOP 200 US · RE-EVALUATED EACH WEEKLY BUILD · NO STALE TEXT IS HELD FOR THIS PROFILE
            </div>
          </Card>
        )}

        {/* established neighbourhood — header is conditional on the claim being true */}
        <SectionHead title={inEstNeighbourhood ? "THE ESTABLISHED NEIGHBORHOOD" : "TOP COLLABORATORS"}
          sub={inEstNeighbourhood
            ? `TOP COLLABORATORS · ${p.collaborators.length} OF ${nw?.recent_collaborator_count ?? p.collaborator_rows_10yr ?? "N"}`
            : `NO ESTABLISHED RANK IN THE TOP FIVE · ${p.collaborators.length} OF ${nw?.recent_collaborator_count ?? p.collaborator_rows_10yr ?? "N"}`}
          right={`TEN-YEAR TOTALS · NOT THE ${rw} DELTA WINDOW USED ABOVE`} tick={GOLD_MUTED} />
        <Card style={{ padding: "20px 22px" }}>
          {p.collaborators.length > 0 ? (
            <>
              <div style={{ padding: "10px 12px", border: "1px solid #2a2519", background: "#141008", ...mono(8.5, GOLD_SOFT, 0.11), lineHeight: 1.6, maxWidth: 1040 }}>
                WINDOW · TEN-YEAR COLLABORATION TOTALS. THE COLLABORATOR TABLE CARRIES A TEN-YEAR ROW ONLY — BOARD-WIDE,
                THERE IS NO RECENT-WINDOW VARIANT — SO THESE COUNTS DO NOT MATCH THE {rw} DELTAS ABOVE AND MUST NOT
                BE READ AGAINST THEM.
              </div>
              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "210px 1fr 180px 1fr 150px", padding: "0 0 9px", borderBottom: `1px solid ${RULE}` }}>
                <div style={mono(8, DIM, 0.13, 600)}>STANDING</div>
                <div style={mono(8, DIM, 0.13, 600)}>COLLABORATOR</div>
                <div style={mono(8, DIM, 0.13, 600)}>INSTITUTION</div>
                <div style={mono(8, DIM, 0.13, 600)}>SHARED PAPERS · 10 YR</div>
                <div style={{ ...mono(8, DIM, 0.13, 600), textAlign: "right" }}>SHARED RECORD</div>
              </div>
              {p.collaborators.map((c) => {
                const s = collabStanding(c);
                const maxShared = Math.max(...p.collaborators.map((x) => x.shared_publications));
                return (
                  <div key={c.hcp_id} style={{ display: "grid", gridTemplateColumns: "210px 1fr 180px 1fr 150px", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${RULE_SOFT}` }}>
                    <div>
                      <div style={{ font: `500 9.5px/1 ${MONO}`, letterSpacing: ".13em", color: s.color }}>{s.state}</div>
                      <div style={{ marginTop: 6, ...mono(9, MUT, 0.06), whiteSpace: "nowrap" }}>{s.detail}</div>
                    </div>
                    <div style={{ font: `400 12.5px/1.35 ${SERIF}`, color: INK0 }}>
                      <Link to={`/hcp/${c.hcp_id}`} style={{ color: "inherit", font: "inherit", textDecoration: "none", borderBottom: `1px solid ${RULE}` }}>{c.name}</Link>
                    </div>
                    <div style={{ font: `400 10.5px/1.35 ${SERIF}`, color: MUT3 }}>{c.institution ?? "INSTITUTION NOT ON RECORD"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 104, height: 4, background: RULE }}>
                        <div style={{ height: 4, background: GREEN, width: `${(c.shared_publications / maxShared) * 100}%` }} />
                      </div>
                      <div style={{ font: `500 11px/1 ${MONO}`, color: INK1 }}>{c.shared_publications}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <Link to={`/hcp/${hcpId}/publications-with/${c.hcp_id}`} style={{ ...mono(9, GREEN_DK, 0.08), whiteSpace: "nowrap" }}>shared record ↗</Link>
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 16, ...mono(8.5, MUT2, 0.11), lineHeight: 1.7, maxWidth: 720 }}>
                {inEstNeighbourhood
                  ? "RANKED BY SHARED PAPER COUNT · STANDING IS THE COLLABORATOR'S OWN POSITION, NEVER A JUDGEMENT ON THIS PROFILE"
                  : "NONE OF THE TOP FIVE HOLDS AN ESTABLISHED RANK — THIS IS A COLLABORATOR LIST, NOT AN ESTABLISHED NEIGHBORHOOD · STANDING IS THE COLLABORATOR'S OWN POSITION"}
              </div>
            </>
          ) : (
            <div style={{ ...serif(13, SERIF_INK), maxWidth: 1040 }}>
              {nw?.recent_collaborator_count != null
                ? `${nw.recent_collaborator_count} distinct co-authors are recorded across the two windows, and the count is what carries the network momentum percentile above. The top-collaborator identities are not joined for this record, so this section reports the count rather than naming a neighborhood it cannot see.`
                : "No collaborator rows are recorded for this profile — the count itself is the absent value, and it renders as this sentence rather than a blank."}
            </div>
          )}
        </Card>

        {/* scientific positions */}
        <SectionHead title="SCIENTIFIC POSITIONS"
          sub={(p.positions?.total ?? 0) > 0 ? `COVERED · ${p.positions!.first_basis} FIRST · ${p.positions!.senior_basis} SENIOR` : "ABSENCE STATE · COVERAGE, NOT AUTHORSHIP"}
          right="EXTRACTION WINDOW · TOP 100 US RISING STARS" tick={GOLD_MUTED} />
        {(p.positions?.total ?? 0) > 0 ? (
          <Card style={{ padding: "20px 22px" }}>
            <div style={mono(13, SERIF_INK, 0.14, 500)}>{p.positions!.total} EXTRACTED POSITIONS — INSIDE THE EXTRACTION WINDOW</div>
            <div style={{ marginTop: 14, ...serif(13, SERIF_INK), maxWidth: 1040 }}>
              Positions are extracted for the top 100 US rising stars. At US rank {usRank} this profile is inside that
              window and fully covered. The extractor accepts first authors as well as senior authors
              {p.positions!.first_basis > 0 ? `, which matters here: ${p.positions!.first_basis} of the ${p.positions!.total} positions rest on first-authored work.` : "."}
            </div>
            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderTop: `1px solid ${RULE}` }}>
              {[["EXTRACTED", p.positions!.total], ["FIRST-AUTHORED BASIS", p.positions!.first_basis], ["SENIOR-AUTHORED BASIS", p.positions!.senior_basis]].map(([lbl, v], i) => (
                <div key={String(lbl)} style={{ padding: i === 0 ? "14px 22px 0 0" : i === 1 ? "14px 22px 0" : "14px 0 0 22px", borderLeft: i > 0 ? `1px solid ${RULE}` : "none" }}>
                  <div style={mono(8, DIM, 0.14)}>{lbl}</div>
                  <div style={{ marginTop: 9, font: `500 22px/1 ${MONO}`, color: INK0 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${RULE}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={mono(8, FAINT, 0.11)}>STATEMENTS, BASIS AND EVIDENCE RENDER IN THE BELIEF-PROFILE PATTERN</div>
              <div style={{ flex: 1 }} />
              <Link to={`/hcp/${hcpId}/positions`} style={{ textDecoration: "none", padding: "6px 11px", border: `1px solid ${LINE.l2}`, font: `500 8px/1.3 ${MONO}`, letterSpacing: ".11em", color: MUT }}>ALL POSITIONS ↗</Link>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <div style={mono(13, SERIF_INK, 0.14, 500)}>
                {insideWindow ? "INSIDE THE WINDOW · NO POSITIONS ON FILE" : "OUTSIDE THE EXTRACTION WINDOW"}
              </div>
              <div style={{ padding: "3px 7px", border: `1px solid ${LINE.l2}`, ...mono(8, MUT, 0.11, 500) }}>
                {insideWindow ? "INSIDE THE EXTRACTION WINDOW" : "OUTSIDE THE EXTRACTION WINDOW · MOST OF THE BOARD"}
              </div>
            </div>
            <div style={{ marginTop: 14, ...serif(13, SERIF_INK), maxWidth: 1040 }}>
              {insideWindow
                ? "This profile is inside the extraction window, but no position is on file: either no recent first- or senior-authored paper carried a full abstract, or extraction ran and no position cleared the confidence floor. That is a fact about the pipeline's inputs, not about the physician."
                : "Positions are extracted for the top 100 US rising stars only. This profile is not in that set, so extraction has not been attempted. That is a coverage fact about the pipeline, not a fact about the physician — nothing here indicates an absence of scientific positions, and no inference about authorship or career stage should be read into it."}
            </div>
            <div style={{ marginTop: 20, ...mono(8, DIM, 0.14) }}>THREE DISTINCT STATES · THIS SURFACE NAMES WHICH ONE APPLIES</div>
            <div style={{ marginTop: 10, borderTop: `1px solid ${RULE}` }}>
              {posStates.map((s) => (
                <div key={s.n} style={{ display: "grid", gridTemplateColumns: "20px 1fr 190px 130px", alignItems: "baseline", gap: 12, padding: "12px 0", borderBottom: `1px solid ${RULE_SOFT}` }}>
                  <div style={mono(9, FAINT, 0)}>{s.n}</div>
                  <div style={{ font: `500 11.5px/1.5 ${MONO}`, letterSpacing: ".1em", color: s.applies ? INK1 : MUT2 }}>{s.label}</div>
                  <div style={{ font: `400 11px/1.5 ${SERIF}`, color: MUT3 }}>{s.mech}</div>
                  <div style={{ textAlign: "right", ...mono(9, s.applies ? RANK_GOLD : MUT2, 0.09) }}>
                    {s.applies ? "APPLIES HERE" : "DOES NOT APPLY"}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* field insights — ported from the community spine (2026-08-06): the
            composer + captured list (msl_hcp_notes write path). Rising was the
            one spine an MSL could not log an insight on — and with 59% positions
            coverage it is where the belief-link mechanism has the most claims
            to link to. */}
        <SectionHead title="FIELD INSIGHTS" sub={`${notes.length} CAPTURED · MSL-CAPTURED · YOUR TEAM ONLY`}
          right="COMPOSER + BELIEF LINKS · SAME WRITE PATH AS THE OTHER SPINES" />
        <Card style={{ padding: "18px 22px" }}>
          <FieldInsights hcp={profileHcp(hcpId, name, "NSCLC")} variant="ledger" />
        </Card>

        {/* field intelligence — ported from the community spine: the peer
            validation panel. Submit path unwired there too; states so honestly. */}
        <SectionHead title="FIELD INTELLIGENCE" sub="PEER VALIDATION · THREE QUESTIONS"
          right="SUBMISSION PATH NOT YET WIRED · STATED ON SUBMIT" />
        <FieldIntelligencePanel />

        {/* footer */}
      </div>
    </AppLayout>
  );
}
