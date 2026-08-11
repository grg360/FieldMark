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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import AppLayout from "../AppLayout";
import PageHero from "../PageHero";
import { useScoringDate, formatScoringDate } from "../../lib/scoringMeta";
import PeopleNavStrip from "../PeopleNavStrip";
import SearchBar from "../SearchBar";
import { FONT, GROUND, LINE, GOLD, COOL, WARM } from "../../lib/designTokens";
import { getRisingFlags, getBoardOpenTrials, getEstablishedFlags, type RisingFlags, type OpenTrialFlag, type EstablishedFlags } from "../../lib/risingProfile";
import { prefetchOpenTrialsDetail } from "../../lib/openTrials";
import { getDrawerLayerData, prefetchDrawerLayerData, dominantClasses, PRACTICE_FLOOR, type DrawerLayerData } from "../../lib/ledgerDrawer";
import TrialsPopup from "./TrialsPopup";
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
  card: GROUND.g1, // g1 well inside the g2 board (Commit C)
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

// ── Our-side controls (stage 3) — INSIGHTS · TRACKED · RELATIONSHIP, columned right ──
// Widths shared by the header and the rows so the columns line up. track widened
// 44→52 for the single-line TRACKED head (2026-08-06 label pass).
const OURS = { insight: 62, track: 52, state: 108 } as const;

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

// Boards at or under this row count render without the window virtualiser —
// see the note at the tail render (stale-measure padding under the last rank).
const VIRTUAL_MIN = 300;

// Four-segment fill ladder. Filled segments read the state; Paused shows all outlined
// with a diagonal strike. Ink only — no hue. MENU-ONLY since 2026-08-09: the
// in-row instances were cut (meter-for-categorical read as noise on the row
// edge); it survives as reinforcement beside each label in the status menu.
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
// Tracked state amber (2026-08-09, Garrett): P.amber (= GOLD.rank #e0a75e, the
// EXISTING rank/score-rule amber — no new shade). Untracked outline stays dim ink.
function Bookmark({ on }: { on: boolean }) {
  return (
    <svg width="12" height="15" viewBox="0 0 12 15" aria-hidden>
      <path
        d="M1 1.5h10v12l-5-3.2-5 3.2z"
        fill={on ? P.amber : "none"}
        stroke={on ? P.amber : P.ink5}
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
// Rising evidence chip (2026-08-05): the /rising badges (RECENT SENIOR
// AUTHORSHIP, OPEN TRIAL) in the community ledger's chip slot — same component
// family, cohort-specific content. Both facts come from rising_board_flags,
// already computed for the rising surface.
function RisingChipView({ flag, hcpId, hcpName = "", mobile = false }: { flag: RisingFlags; hcpId: string; hcpName?: string; mobile?: boolean }) {
  const senior = flag.senior_transition;
  const trial = flag.on_open_trial;
  // Trials pop-up (2026-08-08, frame e672bf7a) — portaled, anchored to the
  // badge ref (the virtual rows are stacking contexts; see TrialsPopup).
  const [trialsOpen, setTrialsOpen] = useState(false);
  const trialBadgeRef = useRef<HTMLSpanElement>(null);
  if (!senior && !trial) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
      {senior ? (
        // Links to the publications surface, landing on the SENIOR AUTHOR band —
        // the badge's evidence. stopPropagation so the row's drawer stays closed.
        <Link
          to={`/hcp/${hcpId}/publications#senior-author`}
          onClick={(e) => e.stopPropagation()}
          title="Senior-authored years within the FieldMark corpus — we see only what is ingested. Opens the senior-author publications."
          style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${P.lineStrong}`, background: "transparent", padding: mobile ? "3px 8px" : "4px 9px", ...mono(mobile ? 9 : 9.5), letterSpacing: ".09em", textDecoration: "none", cursor: "pointer" }}
        >
          <span style={{ color: "#8fb8a6" }}>SENIOR AUTHORSHIP SINCE {flag.first_senior_year ?? "—"}</span>
          <span style={{ color: "#7A5520" }}>·</span>
          <span style={{ color: P.ink4 }}>{flag.recent_senior_pubs ?? "—"} PAPERS</span>
        </Link>
      ) : null}
      {trial ? (
        // Teal 2026-08-08 (deliberate — REVERSES the 2026-08-07 pure-ink pass,
        // decided, not drift): open-trial earns hue as the row's most
        // action-relevant fact; teal is unclaimed in the register (gold = rank/
        // anchored, violet = cohort marker, sage = authorship). #3FB8AF family,
        // text + toned border. Still never the cohort violet.
        // Click opens the trials pop-up (frame e672bf7a) — stopPropagation so
        // the row's drawer stays closed.
        <span style={{ position: "relative", display: "inline-flex" }}>
          <span
            ref={trialBadgeRef}
            title="Named investigator on >= 1 rendered open trial (gated view; the registry labels every site lead PI). Click for the trials."
            onClick={(e) => { e.stopPropagation(); setTrialsOpen((o) => !o); }}
            // hover prefetch (2026-08-09): the detail chain is two sequential
            // network legs — warming it on badge hover kills the pop-up's
            // frame-then-content two-step. Small deliberate target, no dwell timer.
            onMouseEnter={() => prefetchOpenTrialsDetail(hcpId)}
            style={{ display: "inline-flex", alignItems: "center", border: `1px solid rgba(63,184,175,0.45)`, padding: mobile ? "3px 8px" : "4px 9px", ...mono(mobile ? 9 : 9.5, 600), letterSpacing: ".09em", color: "#3FB8AF", cursor: "pointer" }}
          >
            OPEN TRIAL
          </span>
          {trialsOpen ? <TrialsPopup hcpId={hcpId} hcpName={hcpName} badgeRef={trialBadgeRef} onClose={() => setTrialsOpen(false)} /> : null}
        </span>
      ) : null}
    </div>
  );
}

// Established badge shelf (2026-08-08): all present flags in ONE flex-wrap row,
// the RisingChipView pattern. Chips and their ruled colors:
//   OPEN TRIAL       teal #3FB8AF  — board_open_trials (status-gated, cohort-
//                    agnostic; count/trialIds carried for the future pop-up)
//   SENIOR AUTHORSHIP sage #8fb8a6 — same hue as Rising's authorship badge:
//                    same claim-type, cross-ledger consistency
//   VERIFIED SOCIAL  PURE INK      — deliberately not amber: amber sits
//                    gold-adjacent to rank on the same row
// Overlap at ship time: 808 rows one chip, 189 two, 13 all three — one wrap
// row absorbs the max stack on desktop; mobile wraps to a second line.
function EstablishedChipView({ openTrial, est, hcpId, hcpName, mobile = false }: { openTrial?: OpenTrialFlag; est?: EstablishedFlags; hcpId: string; hcpName: string; mobile?: boolean }) {
  // Trials pop-up (2026-08-08, frame e672bf7a) — portaled, anchored to the
  // badge ref; the pop-up refetches by hcp_id (board_open_trials + details),
  // so trialIds on the flag stay unused here.
  const [trialsOpen, setTrialsOpen] = useState(false);
  const trialBadgeRef = useRef<HTMLSpanElement>(null);
  const chipBase = { display: "inline-flex", alignItems: "center", padding: mobile ? "3px 8px" : "4px 9px", ...mono(mobile ? 9 : 9.5, 600), letterSpacing: ".09em" } as const;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
      {openTrial ? (
        <span style={{ position: "relative", display: "inline-flex" }}>
          <span
            ref={trialBadgeRef}
            title="Named investigator on >= 1 rendered open trial (gated view; the registry labels every site lead PI). Click for the trials."
            onClick={(e) => { e.stopPropagation(); setTrialsOpen((o) => !o); }}
            // hover prefetch — see RisingChipView's badge note
            onMouseEnter={() => prefetchOpenTrialsDetail(hcpId)}
            style={{ ...chipBase, border: `1px solid rgba(63,184,175,0.45)`, color: "#3FB8AF", cursor: "pointer" }}
          >
            OPEN TRIAL
          </span>
          {trialsOpen ? <TrialsPopup hcpId={hcpId} hcpName={hcpName} badgeRef={trialBadgeRef} onClose={() => setTrialsOpen(false)} /> : null}
        </span>
      ) : null}
      {est?.senior_recent ? (
        <span title={`>= 1 senior-authored publication in the last 24 months — ${est.senior_pubs_24mo} in window${est.latest_senior_year ? `, latest ${est.latest_senior_year}` : ""}. Within the FieldMark corpus — we see only what is ingested.`} style={{ ...chipBase, border: `1px solid rgba(143,184,166,0.45)`, color: "#8fb8a6" }}>
          SENIOR AUTHORSHIP · {est.senior_pubs_24mo} IN 24 MO
        </span>
      ) : null}
      {est?.verified_social ? (
        <span title="Social account matched to our corpus and confirmed by a person — the same gate as the Social surface's gold. Never asserted from a database match alone." style={{ ...chipBase, border: `1px solid ${P.lineStrong}`, color: P.ink0 }}>
          VERIFIED SOCIAL
        </span>
      ) : null}
    </div>
  );
}

// ── Ledger drawer (2026-08-08 redesign — frame: Ledger Drawer.dc.html,
// project 022f071a). Replaces WHAT PLACED THIS ROW HERE + TRACE on EST/RS;
// COM keeps the old drawer until its own pass. Three layers, each computed
// against BOTH adjacent ranks (uniform neighbour rule): a neighbour that does
// not separate says so; rank 1 is down-only, the last loaded rank up-only.
// Profile link replaces TRACE.
//   SCORE spine  — universal, from row data already loaded (EST: which engine,
//                  sci vs net ceiling; RS: which of the four metrics leads)
//   PRACTICE     — hcp_canonical_topic_share_v1: dominant 1–2 canonical
//                  classes BY NAME (no axis abstraction), "n of m labeled
//                  publications" never a pie, floor on total_labeled_pubs
//   BELIEF       — extracted positions: divergence as a corpus fact; the
//                  absent state is "empty, not contradicted", verbatim
const SEP_INK = "#ddd6cb"; // a neighbour that separates
const NOSEP_INK = "#6b6660"; // "does not separate here"
// Belief-position quotes take SEP_INK too (2026-08-09 ruling): the quoted
// claims are long-dwell reading, so the register's warm-for-long-dwell rule
// would put them on the WARM ramp (they shipped at #c6bfb4) — but inside the
// drawer, consistency with the surrounding prose wins. Drawer-consistency
// overrides warm-for-long-dwell here on purpose; not a missed conversion.
// The drawer's owning rule — ONE value for the left edge AND the bottom
// separator (2026-08-09 bottom-edge ownership), in the COHORT MARKER hue.
// Colour corrected same day: the first pass "matched the left border", but
// the left border was amber — amber belongs to rank, not to cohort
// ownership. Both edges now take cfg.markerColor (EST sage #6E8F76, RS
// violet #9A8CC8), solid like the row's own cohort marker. Shared derivation
// so the two edges can't drift; same element + same colour = clean mitred
// corner where left meets bottom. 1px (2026-08-09 weight match): the ledger's
// line system is 1px everywhere — row separators (P.line), header underline
// (P.lineStrong) — so the drawer's rules take the same weight and read as part
// of the grid, not a heavier panel frame. (The 3px row cohort MARKER is a
// block, not a rule — not part of the line system.)
const drawerRule = (cfg: CohortConfig) => `1px solid ${cfg.markerColor}`;
// OUTER PERIMETER (2026-08-09 FINAL, reference corrected): matches THE LINE
// RUNNING DOWN THE LEDGER'S LEFT EDGE — the row cohort marker, width 3,
// background cfg.markerColor, full opacity (see the Row/MobileRow marker
// divs). NOT the white hairlines; the earlier hairline readings were the
// wrong reference and each pass thinned this border further from the target.
// Perimeter = 3px solid cfg.markerColor, identical value to that marker,
// all four sides. It is the ONLY line in the drawer — interior section
// dividers were removed the same day (sections separate by spacing alone).
const drawerPerimeter = (cfg: CohortConfig) => `3px solid ${cfg.markerColor}`;
// Coverage sublabels, measured 2026-08-08 (EST/US n=2,990; RS/US n=123):
// canonical-labeled pubs 97% / 99%; extracted positions 8% / 80%.
const COVERAGE = {
  EST: { practice: "97% OF COHORT", belief: "8% OF COHORT" },
  RS: { practice: "99% OF COHORT", belief: "80% OF COHORT" },
} as const;

const fmt1 = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

function estEngine(s: Record<string, number | null>): "network-led" | "scientific-led" | "balanced" | null {
  const sci = s.sci, net = s.net;
  if (sci == null || net == null) return null;
  return net > sci ? "network-led" : sci > net ? "scientific-led" : "balanced";
}

const RS_METRICS: Array<[string, string]> = [
  ["scimom", "scientific momentum"], ["netmom", "network momentum"],
  ["scivis", "scientific visibility"], ["netvis", "network visibility"],
];
function rsLead(s: Record<string, number | null>): [string, string] | null {
  let best: [string, string] | null = null;
  for (const m of RS_METRICS) {
    const v = s[m[0]];
    if (v == null) continue;
    if (!best || v > (s[best[0]] ?? -1)) best = m;
  }
  return best;
}
const rsNums = (s: Record<string, number | null>) =>
  `(${RS_METRICS.map(([k]) => (s[k] == null ? "—" : s[k])).join(" / ")})`;

interface NeighbourLine { rank: string; text: string; color: string }

function spineLayer(cfg: CohortConfig, row: LedgerRow, nbrs: LedgerRow[]): { text: string; lines: NeighbourLine[] } {
  if (cfg.tag === "RS") {
    const lead = rsLead(row.scores);
    const text = lead
      ? `Rising-star percentile ${fmt1(row.idx)}, led by ${lead[1]} (${row.scores[lead[0]]}) — the four metrics read ${rsNums(row.scores)}.`
      : `Rising-star percentile ${fmt1(row.idx)} — component metrics incomplete on this row.`;
    return {
      text,
      lines: nbrs.map((n) => {
        const nl = rsLead(n.scores);
        if (!lead || !nl) return { rank: `#${n.rank}`, text: "metrics incomplete on this side — not compared.", color: NOSEP_INK };
        return nl[0] === lead[0]
          ? { rank: `#${n.rank}`, text: `also led by ${nl[1]} ${rsNums(n.scores)} — does not separate here.`, color: NOSEP_INK }
          : { rank: `#${n.rank}`, text: `led by ${nl[1]} ${rsNums(n.scores)} — a different acceleration.`, color: SEP_INK };
      }),
    };
  }
  const eng = estEngine(row.scores);
  const sci = row.scores.sci, net = row.scores.net;
  const text = eng === "network-led"
    ? `Network is their ceiling — ${fmt1(net)} against ${fmt1(sci)} scientific. Network-led: the composite score hides which engine carries each person.`
    : eng === "scientific-led"
      ? `Scientific is their ceiling — ${fmt1(sci)} against ${fmt1(net)} network. Scientific-led: the composite score hides which engine carries each person.`
      : eng === "balanced"
        ? `Scientific and network ceilings tie at ${fmt1(sci)} — neither engine leads.`
        : "Engine ceilings incomplete on this row.";
  return {
    text,
    lines: nbrs.map((n) => {
      const ne = estEngine(n.scores);
      if (!eng || !ne) return { rank: `#${n.rank}`, text: "ceilings incomplete on this side — not compared.", color: NOSEP_INK };
      const nums = `(${fmt1(n.scores.sci)} sci / ${fmt1(n.scores.net)} net)`;
      return ne === eng
        ? { rank: `#${n.rank}`, text: `${ne} on the same ordering ${nums} — does not separate here.`, color: NOSEP_INK }
        : { rank: `#${n.rank}`, text: `${ne} ${nums} — the inverse engine.`, color: SEP_INK };
    }),
  };
}

function practiceLayer(
  subject: DrawerLayerData,
  nbrs: Array<{ rank: number; d: DrawerLayerData }>,
): { text: string; color: string; classes: Array<{ count: string; name: string; primary: string }>; lines: NeighbourLine[] } {
  const total = subject.topicTotal;
  if (total < PRACTICE_FLOOR) {
    return {
      text: `Too few labeled publications to characterize focus — ${total} of this HCP’s publications carry a canonical label, below the floor of ${PRACTICE_FLOOR}. Focus is not asserted here rather than inferred thinly.`,
      color: "#8b8479", classes: [],
      lines: nbrs.map((n) => ({ rank: `#${n.rank}`, text: "not compared — the floor is not met on this side of the layer.", color: NOSEP_INK })),
    };
  }
  const dom = dominantClasses(subject);
  const nbrLine = (n: { rank: number; d: DrawerLayerData }, domNames: string[]): NeighbourLine => {
    if (n.d.topicTotal < PRACTICE_FLOOR) return { rank: `#${n.rank}`, text: "below the labeling floor — not compared on this side.", color: NOSEP_INK };
    const nd = dominantClasses(n.d)[0] ?? n.d.topicClasses[0];
    if (!nd) return { rank: `#${n.rank}`, text: "no labeled publications on this side — not compared.", color: NOSEP_INK };
    const same = domNames.includes(nd.name);
    return same
      ? { rank: `#${n.rank}`, text: `also leads on ${nd.name} (${nd.labeled} of ${n.d.topicTotal}) — does not separate here.`, color: NOSEP_INK }
      : { rank: `#${n.rank}`, text: `leads on ${nd.name} (${nd.labeled} of ${n.d.topicTotal}).`, color: SEP_INK };
  };

  if (dom.length === 0) {
    return {
      text: `Spans multiple canonical classes with no dominant focus — across ${total} labeled publications no class clears a margin over the rest.`,
      color: SEP_INK, classes: [],
      lines: nbrs.map((n) => {
        if (n.d.topicTotal < PRACTICE_FLOOR) return { rank: `#${n.rank}`, text: "below the labeling floor — not compared on this side.", color: NOSEP_INK };
        const nd = dominantClasses(n.d)[0];
        return nd
          ? { rank: `#${n.rank}`, text: `leads on ${nd.name} (${nd.labeled} of ${n.d.topicTotal}) — concentration itself is the separation.`, color: SEP_INK }
          : { rank: `#${n.rank}`, text: "no dominant focus either — does not separate here.", color: NOSEP_INK };
      }),
    };
  }

  const domNames = dom.map((c) => c.name);
  const shared = nbrs.find((n) => {
    const nd = dominantClasses(n.d)[0] ?? n.d.topicClasses[0];
    return nd && domNames.includes(nd.name) && n.d.topicTotal >= PRACTICE_FLOOR;
  });
  const word = dom.length === 2 ? "Two classes clear the field" : "One class clears the field";
  let text: string;
  if (shared) {
    const shTop = (dominantClasses(shared.d)[0] ?? shared.d.topicClasses[0]).name;
    const next = domNames.find((c) => c !== shTop);
    text = next
      ? `${word} across ${total} labeled publications. #${shared.rank} shares ${shTop}; separation here is ${next}.`
      : `${word} across ${total} labeled publications. #${shared.rank} shares ${shTop} — this layer does not separate that side.`;
  } else {
    text = `${word} across ${total} labeled publications — no adjacent rank leads on ${domNames.join(" or ")}.`;
  }
  return {
    text, color: SEP_INK,
    classes: dom.map((c) => ({ count: `${c.labeled} of ${total}`, name: c.name, primary: `${c.primary} primary` })),
    lines: nbrs.map((n) => nbrLine(n, domNames)),
  };
}

function beliefLayer(
  subject: DrawerLayerData,
  nbrs: Array<{ rank: number; d: DrawerLayerData }>,
): { text: string; color: string; claims: string[]; more: number; lines: NeighbourLine[] } {
  const n = subject.beliefCount;
  if (n === 0) {
    return {
      text: "No extracted belief positions for this HCP yet. Nothing has been surfaced from this record — the layer is empty, not contradicted.",
      color: "#8b8479", claims: [], more: 0,
      lines: nbrs.map((x) => ({
        rank: `#${x.rank}`,
        text: x.d.beliefCount
          ? `${x.d.beliefCount} positions on record — nothing here to contrast them against.`
          : "no extracted positions either — does not separate here.",
        color: x.d.beliefCount ? SEP_INK : NOSEP_INK,
      })),
    };
  }
  const nbrNames = nbrs.map((x) => `#${x.rank}’s`).join(" or ");
  return {
    text: `${n} positions in this HCP’s record are not present in ${nbrNames}:`,
    color: SEP_INK, claims: subject.beliefTexts, more: Math.max(0, n - subject.beliefTexts.length),
    lines: nbrs.map((x) => ({
      rank: `#${x.rank}`,
      text: x.d.beliefCount
        ? `${x.d.beliefCount} positions on record, none matching these.`
        : "no extracted positions — does not separate here.",
      color: x.d.beliefCount ? SEP_INK : NOSEP_INK,
    })),
  };
}

function DrawerSection({ label, sub, mobile, rightInset, children }: { label: string; sub: string; mobile: boolean; rightInset?: number; children: React.ReactNode }) {
  return (
    // NO divider (2026-08-09 final): sections separate by spacing alone —
    // the drawer's outer perimeter is its only line.
    <div style={{ display: mobile ? "flex" : "grid", flexDirection: "column", gridTemplateColumns: "210px 1fr", gap: mobile ? 10 : 32, padding: mobile ? "20px 14px" : "26px 22px" }}>
      <div style={{ ...mono(10, 500), letterSpacing: ".14em", lineHeight: 1.7 }}>
        <div style={{ color: "#8b8479" }}>{label}</div>
        <div style={{ marginTop: 4, color: "#4f4a44" }}>{sub}</div>
      </div>
      {/* rightInset clears the top-edge PROFILE tab on the first section (desktop) */}
      <div style={rightInset && !mobile ? { paddingRight: rightInset } : undefined}>{children}</div>
    </div>
  );
}

function NeighbourLines({ lines }: { lines: NeighbourLine[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      {lines.map((l) => (
        <div key={l.rank} style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 16, alignItems: "baseline" }}>
          <span style={{ ...mono(12), color: "#7d766c", textAlign: "right" }}>{l.rank}</span>
          <span style={{ ...serif(15), lineHeight: 1.55, textWrap: "pretty" as const, color: l.color }}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Drawer overhang (2026-08-09 — frame: Drawer Overhang Test.dc.html, project
// 022f071a, the 5PX HYBRID toggle state, NOT the 15px one). The open drawer
// overhangs the ledger 5px each side with lit side rails (border sides at
// rgba(255,255,255,.09)), a brighter top lip (.13), a gradient surface and a
// cast shadow — depth from light, not distance; 15px broke grid alignment with
// two drawers open. The wrapper carries the frame's padding approach: 44px
// side/bottom padding with matching negative side margins, so overhang, rails
// and shadow paint OUTSIDE the ledger edge instead of clipping at the
// overflow:hidden that animates the reveal. All painted area stays inside the
// row element, so the virtualiser's measured height covers it — nothing paints
// over the next row (the stacking-context constraint that rules out true
// protrusion). 420ms decelerating open per the frame; close stays an instant
// unmount — exit animation would need delayed unmount the virtualised list
// doesn't carry. EST + RS desktop (RS joined 2026-08-09 with the cohort-tinted
// rails); mobile keeps the flat drawer.
const DRAWER_EASE = "cubic-bezier(.22,.68,.24,1)";
function DrawerOverhang({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      style={{
        overflow: "hidden",
        boxSizing: "border-box",
        padding: entered ? "0 44px 44px" : "0 44px 0",
        margin: "0 -44px",
        maxHeight: entered ? 1400 : 0,
        opacity: entered ? 1 : 0,
        transition: `max-height .42s ${DRAWER_EASE}, padding-bottom .42s ${DRAWER_EASE}, opacity .3s ease`,
      }}
    >
      {/* ONE LINE SYSTEM (2026-08-09 mechanism unification): this box draws NO
          cohort border and NO edge ring — it carries DEPTH ONLY (gradient
          surface, cast drop shadow, and the lip as an inset highlight sitting
          just inside the perimeter). The cohort outline is the inner drawer's
          drawerRule — the same 1px solid border mechanism as the interior
          section dividers — so perimeter and interior lines match by
          construction. The old 0 0 0 1px black ring is gone with the alpha-
          ramped rails: both were edge mechanisms that made the perimeter
          render unlike a border. Raised survives the swap — the depth cue is
          the top-lit surface + cast shadow + lip highlight, not the edge
          technique. */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          background: "linear-gradient(180deg,#15151a 0%,#111114 30%,#0e0e11 100%)",
          margin: entered ? "0 -5px" : "0 0px", // the 5px overhang
          // depth from surface + cast shadow ONLY (2026-08-09 round 4): the
          // inset lip was an edge shadow — removed so the outer LINE is purely
          // the real hairline border on the drawer element.
          boxShadow: entered ? "0 22px 40px -20px rgba(0,0,0,.92)" : "0 0 0 rgba(0,0,0,0)",
          transition: `margin .42s ${DRAWER_EASE}, box-shadow .42s ease`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function LedgerDrawerView({ cfg, row, up, down, mobile = false, overhang = false }: { cfg: CohortConfig; row: LedgerRow; up?: LedgerRow; down?: LedgerRow; mobile?: boolean; overhang?: boolean }) {
  const [layers, setLayers] = useState<Map<string, DrawerLayerData> | null>(null);
  const nbrRows = [up, down].filter((r): r is LedgerRow => !!r); // rank 1 down-only; last loaded rank up-only
  const taId = taIdForApiSlug("nsclc");
  const nbrKey = nbrRows.map((r) => r.hcpId).join(",");

  useEffect(() => {
    if (!taId) return; // slug map miss — layers stay in their loading state rather than fetching unscoped
    let alive = true;
    setLayers(null);
    void getDrawerLayerData([row.hcpId, ...nbrRows.map((r) => r.hcpId)], taId).then((m) => { if (alive) setLayers(m); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.hcpId, nbrKey, taId]);

  const cov = cfg.tag === "RS" ? COVERAGE.RS : COVERAGE.EST;
  const spine = spineLayer(cfg, row, nbrRows);
  const empty: DrawerLayerData = { topicTotal: 0, topicClasses: [], beliefCount: 0, beliefTexts: [] };
  const subj = layers?.get(row.hcpId) ?? empty;
  const nbrData = nbrRows.map((r) => ({ rank: r.rank ?? 0, d: layers?.get(r.hcpId) ?? empty }));
  const pr = practiceLayer(subj, nbrData);
  const bl = beliefLayer(subj, nbrData);

  return (
    // Full cohort enclosure, ONE mechanism (2026-08-09 unification): the
    // perimeter is drawerRule — a real 1px solid cfg.markerColor border —
    // rendered UNCONDITIONALLY, wrapped or not, and the interior section
    // dividers use the identical value, so every cohort line in the drawer is
    // the same 1px solid border and matches by construction. The overhang box
    // above carries depth only (gradient, cast shadow, inset lip) and draws no
    // edge of its own. position:relative anchors the top-edge PROFILE tab.
    <div style={{ position: "relative", background: overhang ? "transparent" : P.drawer, border: drawerPerimeter(cfg) }}>
      {/* The filing tab, TOP-RIGHT (2026-08-09 reversal — a filing-cabinet tab
          sits at the top of the folder): hangs INSIDE the drawer from the sage
          top rule — square where it meets the top edge, rounded bottom corners,
          shadow cast downward, label bold. Cohort hue per Garrett's call
          (cfg.markerColor, semantic use). */}
      <Link
        to={`/hcp/${row.hcpId}`}
        onClick={(e) => e.stopPropagation()}
        title={`${row.name} — profile`}
        style={{
          // MOBILE (2026-08-10): in-flow compact chip, top-right — the absolute
          // tab rendered OVER the section content at 393px (the desktop
          // clearance inset is desktop-only). In flow, collision is impossible.
          ...(mobile
            ? { display: "block", width: "fit-content", marginLeft: "auto", margin: "10px 14px 0 auto", borderRadius: 6 }
            : { position: "absolute" as const, right: 22, top: 0, zIndex: 3, borderRadius: "0 0 8px 8px" }),
          // Plex SANS 700 (2026-08-09): Plex Mono's 700 is stroke-light by
          // design and invisible at 10.5px — the mono face was the blocker,
          // not the weight. Sans bolds visibly at this size. Size and
          // letter-spacing unchanged.
          font: `700 ${mobile ? "9.5px" : "10.5px"} ${FONT.sans}`, letterSpacing: ".2em", color: cfg.markerColor, textDecoration: "none",
          background: `${cfg.markerColor}1A`, border: drawerRule(cfg), borderTop: mobile ? drawerRule(cfg) : "none",
          padding: mobile ? "7px 14px" : "11px 26px 10px", whiteSpace: "nowrap",
          boxShadow: mobile ? "none" : "0 4px 14px rgba(0,0,0,.35)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${cfg.markerColor}30`; e.currentTarget.style.borderColor = cfg.markerColor; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = `${cfg.markerColor}1A`; e.currentTarget.style.borderColor = cfg.markerColor; }}
      >
        PROFILE
      </Link>
      <DrawerSection label={cfg.tag === "RS" ? "SCORE · WHAT IS ACCELERATING" : "SCORE · WHICH ENGINE"} sub="ALWAYS PRESENT" mobile={mobile} rightInset={160}>
        <div style={{ ...serif(16), lineHeight: 1.62, color: SEP_INK, textWrap: "pretty" as const }}>{spine.text}</div>
        <NeighbourLines lines={spine.lines} />
      </DrawerSection>

      <DrawerSection label="PRACTICE · CANONICAL FOCUS" sub={cov.practice} mobile={mobile}>
        {layers == null ? (
          <div style={{ ...mono(10), color: P.ink5, letterSpacing: ".1em" }}>READING THE LABELED CORPUS…</div>
        ) : (
          <>
            <div style={{ ...serif(16), lineHeight: 1.62, color: pr.color, textWrap: "pretty" as const }}>{pr.text}</div>
            {pr.classes.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {pr.classes.map((k) => (
                  <div key={k.name} style={{ display: "grid", gridTemplateColumns: mobile ? "84px 1fr" : "112px 1fr auto", gap: 16, alignItems: "baseline" }}>
                    <span style={{ ...mono(14), color: P.amber, textAlign: "right" }}>{k.count}</span>
                    <span style={{ ...serif(15), color: SEP_INK }}>{k.name}</span>
                    {mobile ? null : <span style={{ ...mono(10), letterSpacing: ".1em", color: "#5d5851" }}>{k.primary.toUpperCase()}</span>}
                  </div>
                ))}
              </div>
            ) : null}
            <NeighbourLines lines={pr.lines} />
            <div style={{ ...mono(9), letterSpacing: ".1em", color: "#4f4a44", lineHeight: 1.7, marginTop: 16 }}>
              A PUBLICATION CAN CARRY SEVERAL CANONICAL LABELS — COUNTS OVERLAP AND DO NOT SUM TO THE LABELED TOTAL.
            </div>
          </>
        )}
      </DrawerSection>

      <DrawerSection label="BELIEF · EXTRACTED POSITIONS" sub={cov.belief} mobile={mobile}>
        {layers == null ? (
          <div style={{ ...mono(10), color: P.ink5, letterSpacing: ".1em" }}>READING THE POSITION RECORD…</div>
        ) : (
          <>
            <div style={{ ...serif(16), lineHeight: 1.62, color: bl.color, textWrap: "pretty" as const }}>{bl.text}</div>
            {bl.claims.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, paddingLeft: 16, borderLeft: "1px solid rgba(216,162,74,.28)" }}>
                {bl.claims.map((c, i) => (
                  <div key={i} style={{ ...serif(15), lineHeight: 1.55, color: SEP_INK, fontStyle: "italic", textWrap: "pretty" as const }}>{c}</div>
                ))}
                {bl.more > 0 ? <div style={{ ...mono(9.5), letterSpacing: ".1em", color: P.ink5 }}>+ {bl.more} MORE ON THE PROFILE</div> : null}
              </div>
            ) : null}
            <NeighbourLines lines={bl.lines} />
          </>
        )}
      </DrawerSection>

      {/* Footer — the rule text alone, full width. The PROFILE filing tab moved
          to the drawer's TOP-RIGHT 2026-08-09 (filing-cabinet reversal: the tab
          sits at the top of the folder) — see the container's first child. The
          tab remains the one profile affordance; row-click expansion untouched. */}
      <div style={{ padding: mobile ? "14px 14px 20px" : "16px 22px 22px" }}>
        <div style={{ ...mono(9), letterSpacing: ".1em", color: "#4f4a44", lineHeight: 1.7 }}>
          EVERY LAYER IS COMPUTED AGAINST BOTH ADJACENT RANKS; A NEIGHBOUR THAT DOES NOT SEPARATE SAYS SO.
          PERCENTILES, METHODOLOGY VERSION AND SOURCE RECORDS LIVE ON THE PROFILE.
        </div>
      </div>
    </div>
  );
}

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

// Label pass 2026-08-06: labels are centred over their columns; renamed heads are
// single-line except the score columns, whose display heads (col.head/headSub —
// e.g. SCIENTIFIC over MOMENTUM) stack in two lines. RANK keeps its two-line
// left-aligned amber treatment. col.label/col.sub still feed trace() unchanged.
function ColumnHeads({ cfg }: { cfg: CohortConfig }) {
  const head = (label: string, w: number) => (
    <div style={{ width: w, textAlign: "center", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>{label}</div>
  );
  return (
    <div style={{ display: "flex", alignItems: "flex-end", padding: "10px 20px 8px 23px", borderBottom: `1px solid ${P.lineStrong}`, background: P.head }}>
      <div style={{ width: 104, paddingRight: 12, ...mono(9, 500), letterSpacing: ".14em", color: P.amber }}>
        RANK<br /><span style={{ color: P.ink5 }}>US · GLOBAL</span>
      </div>
      <div style={{ flex: 1, minWidth: 300, textAlign: "center", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
        PHYSICIAN · {cfg.nameSub}
      </div>
      <div style={{ width: 88, textAlign: "center", whiteSpace: "nowrap", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
        COHORT SCORE
      </div>
      {cfg.cols.map((c) => (
        <div key={c.key} style={{ width: c.w, textAlign: "center", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
          {c.head ?? c.label}
          {/* headSub === "" is the explicit single-line head (PHARMA ENGAGEMENT) */}
          {(c.headSub ?? c.sub) ? <><br /><span style={{ color: P.ink5 }}>{c.headSub ?? c.sub}</span></> : null}
        </div>
      ))}
      {/* our-side controls — universal across cohorts */}
      <div style={{ width: 14 }} />
      {head("INSIGHTS", OURS.insight)}
      {head("TRACKED", OURS.track)}
      {head("RELATIONSHIP", OURS.state)}
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
  flag,
  openTrial,
  estFlag,
  rowByRank,
}: {
  cfg: CohortConfig;
  row: LedgerRow;
  cohortTotal: number;
  th: Record<string, number | null>;
  open: boolean;
  onToggle: () => void;
  flag?: RisingFlags;
  openTrial?: OpenTrialFlag;
  estFlag?: EstablishedFlags;
  rowByRank?: Map<number, LedgerRow>;
}) {
  const { isTracked, toggleSave, getStatus, setStatus, getInsightCount } = useRelationships();
  const [menuOpen, setMenuOpen] = useState(false);
  const tracked = isTracked(row.hcpId);
  const status = getStatus(row.hcpId);
  const insight = getInsightCount(row.hcpId);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  // Hover prefetch (2026-08-09): the drawer's layer pair measures ~330-560ms
  // while the open animates in 420ms — fetched on click, values landed as a
  // second beat mid-animation. Prefetching on a 120ms hover dwell (cleared on
  // leave, so sweeping the pointer down the list fires nothing) means the
  // click usually opens with data already cached; the open never waits either
  // way — the drawer's scaffolding covers the cold-click case.
  const prefetchTimer = useRef<number | null>(null);
  const startPrefetch = () => {
    if (cfg.tag === "COM") return; // COM's old drawer reads no layer data
    prefetchTimer.current = window.setTimeout(() => {
      const taId = taIdForApiSlug("nsclc");
      if (!taId) return;
      const nbrs = [rowByRank?.get((row.rank ?? 0) - 1), rowByRank?.get((row.rank ?? 0) + 1)].filter((r): r is LedgerRow => !!r);
      prefetchDrawerLayerData([row.hcpId, ...nbrs.map((r) => r.hcpId)], taId);
    }, 120);
  };
  const cancelPrefetch = () => {
    if (prefetchTimer.current != null) window.clearTimeout(prefetchTimer.current);
  };

  return (
    <div style={{ position: "relative", borderBottom: `1px solid ${P.line}` }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: cfg.markerColor }} />
      {/* amber open-indicator strip removed 2026-08-09: it ran the row's FULL
          height, so beside the open drawer's sage border it read as a second,
          parallel gold line. The open drawer itself is the open indicator. */}
      {/* tracked right-edge strip removed 2026-08-09: the amber bookmark is the
          one tracked indicator — the whitish edge strip was a redundant second
          signal reading as unfinished chrome. */}
      {/* alignItems center (2026-08-06): cells vertically centre against the tallest
          cell (usually name+summary) — the old flex-start + per-cell paddingTop nudges
          are gone with it. */}
      <div
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", padding: "13px 20px 13px 23px", cursor: "pointer" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = P.rowHover; startPrefetch(); }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; cancelPrefetch(); }}
      >
        {/* Leading cell: EST/RS the rank; COM (Phase 3 roster, not ranked) the
            reach FACT — Medicare beneficiaries, the within-band sort key. */}
        {row.rank != null ? (
          <div style={{ width: 104, paddingRight: 12, display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ font: `600 40px 'IBM Plex Sans Condensed','IBM Plex Mono',monospace`, color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 0.86, letterSpacing: "-.015em" }}>
                {row.rank}
              </span>
              <span style={{ ...mono(9.5, 500), color: "#A07B45", letterSpacing: ".12em" }}>US</span>
            </div>
            <span style={{ ...mono(9.5), color: P.ink5, letterSpacing: ".06em" }}>#{row.globalRank ?? "—"} GLOBAL</span>
          </div>
        ) : (
          <div style={{ width: 104, paddingRight: 12, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ font: `500 26px 'IBM Plex Sans Condensed','IBM Plex Mono',monospace`, color: P.ink2, fontVariantNumeric: "tabular-nums", lineHeight: 0.9 }}>
              {row.patientVolume != null && row.patientVolume > 0 ? Math.round(row.patientVolume).toLocaleString() : "—"}
            </span>
            <span style={{ ...mono(8.5), color: P.ink5, letterSpacing: ".1em" }}>MEDICARE BENES · 3YR</span>
          </div>
        )}
        {/* name + chips + summary */}
        <div style={{ flex: 1, minWidth: 300, paddingRight: 24, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            {/* Name links to the profile; the row's own onClick toggles the drawer,
                so stop propagation here. The row also keeps its OPEN ↗ affordance. */}
            <Link
              to={`/hcp/${row.hcpId}`}
              onClick={stop}
              style={{ ...serif(17, 500), color: P.ink0, letterSpacing: "-.005em", textDecoration: "none", borderBottom: `1px solid ${P.lineStrong}` }}
            >
              {row.name}
            </Link>
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
          {/* Priority (ruled 2026-08-08): EST badges BEFORE tier — on EST the tier
              branch is vestigial (1-in-720 boundary artifact) and badges must
              not be suppressed by it. NOTE for the community extension: COM is
              all-tiered, so this chain would hide the badges on every COM row —
              reconsider the slot before badging community. */}
          {flag ? <RisingChipView flag={flag} hcpId={row.hcpId} hcpName={row.name} /> : (openTrial || estFlag?.senior_recent || estFlag?.verified_social) ? <EstablishedChipView openTrial={openTrial} est={estFlag} hcpId={row.hcpId} hcpName={row.name} /> : row.tier ? <EvidenceChipView row={row} /> : null}
          {row.summary ? (
            <div style={{ ...serif(13.5), lineHeight: 1.55, color: P.ink4, textWrap: "pretty" }}>{row.summary}</div>
          ) : null}
        </div>
        {/* cohort score — 2A numeric treatment (frame: Ledger Numeric Typography
            .dc.html, "1B at density", imported 2026-08-09 SCORES ONLY — no copy,
            layout or description drift came with it): serif score with stepped
            decimal (integer full-size, decimal smaller but full-value) over a
            short amber anchoring rule. 56px in the frame; 44px here per the
            frame's own at-density note ("score down to ~44px" for the build) —
            the live row is far denser than the mockup's 26px padding. Numerals
            in WARM ink per Garrett's ruling (no icy cast); the rule takes
            P.amber, the ledger's one amber — the frame's #c9922e is not
            imported. EST only; RS/COM keep the mono cell until their own pass. */}
        {cfg.tag === "EST" ? (
          (() => {
            const [ipart, dpart = ""] = floorFixed(row.idx ?? 0, cfg.idxDecimals).split(".");
            return (
              <div style={{ width: 88, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
                <div style={{ width: 44, height: 2, background: P.amber }} />
                <div style={{ display: "flex", alignItems: "baseline", letterSpacing: "-.012em" }}>
                  <span style={{ ...serif(44, 600), lineHeight: 0.92, color: WARM.prose }}>{ipart}</span>
                  {dpart ? <span style={{ ...serif(30), lineHeight: 0.92, color: WARM.body }}>.{dpart}</span> : null}
                </div>
              </div>
            );
          })()
        ) : row.idx != null ? (
          <div style={{ width: 88, textAlign: "right", ...mono(18, 500), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>
            {floorFixed(row.idx, cfg.idxDecimals)}
          </div>
        ) : (
          // COM roster (Phase 3): no index — the Part-D presence fact takes the slot.
          <div style={{ width: 88, textAlign: "right", ...mono(9.5), color: P.ink5, letterSpacing: ".08em" }}>
            {row.partDPresent ? "PART D ✓" : ""}
          </div>
        )}
        {/* score cells */}
        {cfg.cols.map((col) => {
          const d = cellDisplay(row, col, th);
          if (d.kind === "absent") {
            return (
              <div key={col.key} style={{ width: col.w, textAlign: "right" }}>
                <span style={{ ...mono(9.5), color: P.dash, letterSpacing: ".1em" }}>{d.text}</span>
              </div>
            );
          }
          // EST rides the 2A ramp below the score: SCI/NET supporting serif,
          // pharma faded a step further (frame literals #A8A29A/#43434A — warm
          // support, chrome-dark fade; near-twins of no register token, NOT
          // converged). Dash/absent cells keep their treatment — the ramp is
          // for numerals only. RS/COM keep the mono cells.
          if (cfg.tag === "EST" && d.kind !== "dash") {
            return (
              <div key={col.key} style={{ width: col.w, textAlign: "right" }}>
                {col.noRank ? (
                  <span style={{ ...serif(15), color: "#43434A" }}>{d.text}</span>
                ) : (
                  <span style={{ ...serif(22, 500), color: "#A8A29A" }}>{d.text}</span>
                )}
              </div>
            );
          }
          const color = d.kind === "dash" ? P.dash : col.noRank ? P.ink4 : P.ink0;
          return (
            <div key={col.key} style={{ width: col.w, textAlign: "right" }}>
              <span style={{ ...mono(13), color, fontVariantNumeric: "tabular-nums" }}>{d.text}</span>
            </div>
          );
        })}

        {/* ── our-side controls (stage 3) ─────────────────────────────────── */}
        <div style={{ width: 14 }} />
        {/* INSIGHTS — count of captured field insights; a dash where none, so an
            empty cell reads as measured-zero rather than not-rendered */}
        <div style={{ width: OURS.insight, textAlign: "center" }}>
          {insight > 0 ? (
            // EST: bottom of the 2A ramp — insights minor (frame literal #5F5F66)
            <span style={{ ...mono(cfg.tag === "EST" ? 12 : 13), color: cfg.tag === "EST" ? "#5F5F66" : P.ink2, fontVariantNumeric: "tabular-nums" }}>{insight}</span>
          ) : (
            <span style={{ ...mono(9.5), color: P.dash, letterSpacing: ".1em" }}>—</span>
          )}
        </div>
        {/* TRACKED — bookmark toggle (does not open the drawer) */}
        <div style={{ width: OURS.track, display: "flex", justifyContent: "center" }}>
          <button
            onClick={(e) => { stop(e); void toggleSave(row.hcpId, "cohort_ledger"); }}
            title={tracked ? "Tracked — click to untrack" : "Track this HCP"}
            style={{ background: "none", border: "none", padding: 4, cursor: "pointer", lineHeight: 0, minHeight: 0 }}
          >
            <Bookmark on={tracked} />
          </button>
        </div>
        {/* RELATIONSHIP — state label (click → menu). The in-row fill ladder was
            removed 2026-08-09: a categorical state rendered as a meter read as a
            random white band on the row edge and competed with the score numerals.
            The ladder still renders inside the status menu below. */}
        <div style={{ width: OURS.state, position: "relative" }}>
          <button
            onClick={(e) => { stop(e); setMenuOpen((o) => !o); }}
            title={STATUS_LABEL[status]}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "3px 2px", cursor: "pointer", minHeight: 0, textAlign: "left" }}
          >
            {/* wraps at the word break (ACTIVE / RELATIONSHIP) instead of overflowing
                the 108px column — nowrap removed 2026-08-06 */}
            <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".06em", lineHeight: 1.35 }}>
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

      {/* drawer (2026-08-08): EST/RS take the three-layer redesign; COM keeps
          the old why/trace until its own pass. Both EST and RS take the 5px
          overhang treatment (2026-08-09; extended to RS same day with the
          cohort-tinted rails — sage/violet from cfg) — see DrawerOverhang. */}
      {open && cfg.tag !== "COM" ? (
        <DrawerOverhang>
          <LedgerDrawerView cfg={cfg} row={row} up={rowByRank?.get((row.rank ?? 0) - 1)} down={rowByRank?.get((row.rank ?? 0) + 1)} overhang />
        </DrawerOverhang>
      ) : null}
      {open && cfg.tag === "COM" ? (
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
  flag,
  openTrial,
  estFlag,
  rowByRank,
}: {
  cfg: CohortConfig;
  row: LedgerRow;
  cohortTotal: number;
  th: Record<string, number | null>;
  open: boolean;
  onToggle: () => void;
  flag?: RisingFlags;
  openTrial?: OpenTrialFlag;
  estFlag?: EstablishedFlags;
  rowByRank?: Map<number, LedgerRow>;
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
      {/* amber open-indicator strip removed 2026-08-09 (double-line vs the sage
          drawer border); tracked edge strip removed same day — amber bookmark is
          the one tracked signal */}

      <div onClick={onToggle} style={{ padding: "13px 16px 14px 19px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 7 }}>
        {/* rank + track/index */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          {row.rank != null ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ font: `600 34px 'IBM Plex Sans Condensed','IBM Plex Mono',monospace`, color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 0.85, letterSpacing: "-.015em" }}>{row.rank}</span>
              <span style={{ ...mono(8.5, 500), color: "#A07B45", letterSpacing: ".12em" }}>US</span>
              <span style={{ ...mono(8.5), color: P.ink5, letterSpacing: ".06em" }}>#{row.globalRank ?? "—"} GLB</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ font: `500 24px 'IBM Plex Sans Condensed','IBM Plex Mono',monospace`, color: P.ink2, fontVariantNumeric: "tabular-nums", lineHeight: 0.9 }}>
                {row.patientVolume != null && row.patientVolume > 0 ? Math.round(row.patientVolume).toLocaleString() : "—"}
              </span>
              <span style={{ ...mono(8), color: P.ink5, letterSpacing: ".1em" }}>BENES · 3YR</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={(e) => { stop(e); void toggleSave(row.hcpId, "cohort_ledger"); }} title={tracked ? "Tracked — tap to untrack" : "Track"} style={{ background: "none", border: "none", padding: 4, cursor: "pointer", lineHeight: 0, minHeight: 0 }}>
              <Bookmark on={tracked} />
            </button>
            {row.idx != null ? (
              <span style={{ ...mono(17, 500), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{floorFixed(row.idx, cfg.idxDecimals)}</span>
            ) : null}
          </div>
        </div>

        {/* name + archetype + meta */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <Link to={`/hcp/${row.hcpId}`} onClick={stop} style={{ ...serif(16, 500), color: P.ink0, textDecoration: "none", borderBottom: `1px solid ${P.lineStrong}` }}>{row.name}</Link>
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
        {flag ? <RisingChipView flag={flag} hcpId={row.hcpId} hcpName={row.name} mobile /> : (openTrial || estFlag?.senior_recent || estFlag?.verified_social) ? <EstablishedChipView openTrial={openTrial} est={estFlag} hcpId={row.hcpId} hcpName={row.name} mobile /> : row.tier ? <EvidenceChipView row={row} mobile /> : null}

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

        {/* stage-3 controls row: state label (tap → menu) + insight. In-row fill
            ladder removed 2026-08-09, same call as desktop — menu keeps it. */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 2, position: "relative" }}>
          <button onClick={(e) => { stop(e); setMenuOpen((o) => !o); }} title={STATUS_LABEL[status]} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "2px 0", cursor: "pointer", minHeight: 0 }}>
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

      {/* drawer (2026-08-08): EST/RS take the stacked three-layer redesign;
          COM keeps why-over-trace until its own pass. */}
      {open && cfg.tag !== "COM" ? (
        <LedgerDrawerView cfg={cfg} row={row} up={rowByRank?.get((row.rank ?? 0) - 1)} down={rowByRank?.get((row.rank ?? 0) + 1)} mobile />
      ) : null}
      {open && cfg.tag === "COM" ? (
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
  flags,
  openTrials,
  estFlags,
  rowByRank,
}: {
  cfg: CohortConfig;
  rows: LedgerRow[];
  th: Record<string, number | null>;
  cohortTotal: number;
  open: string | null;
  onToggle: (id: string) => void;
  onNearEnd: () => void;
  isMobile: boolean;
  flags?: Map<string, RisingFlags>;
  openTrials?: Map<string, OpenTrialFlag>;
  estFlags?: Map<string, EstablishedFlags>;
  rowByRank?: Map<number, LedgerRow>;
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
        const id = `${cfg.tag}-${row.hcpId}`;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start - scrollMargin}px)` }}
          >
            <RowComp cfg={cfg} row={row} cohortTotal={cohortTotal} th={th} open={open === id} onToggle={() => onToggle(id)} flag={flags?.get(row.hcpId)} openTrial={openTrials?.get(row.hcpId)} estFlag={estFlags?.get(row.hcpId)} rowByRank={rowByRank} />
          </div>
        );
      })}
    </div>
  );
}

export default function CohortLedger() {
  const scoredAt = useScoringDate();
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
  const [risingFlags, setRisingFlags] = useState<Map<string, RisingFlags>>(new Map());
  const [openTrials, setOpenTrials] = useState<Map<string, OpenTrialFlag>>(new Map());
  const [estFlags, setEstFlags] = useState<Map<string, EstablishedFlags>>(new Map());
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
    // EST/RS keyset on the last rank; COM (Phase 3 roster, no rank) keysets on
    // the composite (tier_priority, patient_volume, hcp_id) cursor.
    const lastRow = rows.length ? rows[rows.length - 1] : null;
    const afterCursor =
      cfg.tag === "COM"
        ? lastRow
          ? { tierPriority: lastRow.tierPriority ?? 5, patientVolume: lastRow.patientVolume ?? 0, hcpId: lastRow.hcpId }
          : undefined
        : (lastRow?.rank ?? 0);
    const tiersArg = cfg.tag === "COM" ? selectedTiers : undefined;
    loadLedgerPage(cfg, afterCursor, LEDGER_PAGE_SIZE, tiersArg)
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
  const isRising = cfg.tag === "RS";
  const isEst = !isCom && !isRising;
  useEffect(() => {
    if (!isRising || rows.length === 0) { setRisingFlags(new Map()); return; }
    let alive = true;
    getRisingFlags(rows.map((r) => r.hcpId)).then((f) => { if (alive) setRisingFlags(f); });
    return () => { alive = false; };
  }, [isRising, rows]);
  // Established badges (2026-08-08): board_open_trials (open-trial, status-gated,
  // 460 of 2,990) + established_board_flags (24-mo senior authorship 727,
  // verified social 38). Two reads in parallel, both keyed on hcp_id — rising
  // keeps rising_board_flags (its senior badge needs the momentum spine).
  useEffect(() => {
    if (!isEst || rows.length === 0) { setOpenTrials(new Map()); setEstFlags(new Map()); return; }
    let alive = true;
    const ids = rows.map((r) => r.hcpId);
    getBoardOpenTrials(ids).then((f) => { if (alive) setOpenTrials(f); });
    getEstablishedFlags(ids).then((f) => { if (alive) setEstFlags(f); });
    return () => { alive = false; };
  }, [isEst, rows]);
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
  // Neighbour lookup for the drawer's uniform neighbour rule — the full loaded
  // row set by rank, spanning band/tail boundaries.
  const rowByRank = useMemo(() => new Map(rows.filter((r) => r.rank != null).map((r) => [r.rank as number, r] as const)), [rows]);

  const renderRow = (row: LedgerRow) => {
    const id = `${cfg.tag}-${row.hcpId}`;
    return <RowComp key={id} cfg={cfg} row={row} cohortTotal={cohortTotal} th={th} open={open === id} onToggle={() => toggle(id)} flag={isRising ? risingFlags.get(row.hcpId) : undefined} openTrial={isEst ? openTrials.get(row.hcpId) : undefined} estFlag={isEst ? estFlags.get(row.hcpId) : undefined} rowByRank={rowByRank} />;
  };

  return (
    <AppLayout width="wide">
      <div style={{ width: "100%", boxSizing: "border-box" }}>
        {/* search — parity with the feed header (the strip carries no search). NSCLC TA id
            because the ledger RPCs are NSCLC-locked. DESKTOP ONLY (2026-08-10):
            on mobile the nav magnifier's overlay is THE one search — this same
            SearchBar component in its overlay variant, hidden until revealed.
            Rendering the inline bar too put two searches on screen at once. */}
        {nsclcTaId && !isMobile ? (
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
        {/* Commit C 2026-08-05: g2 board per the Pulse scheme; the ledger card
            inside is a g1 well with an l1 edge. */}
        <div style={{ padding: "24px 20px 48px", margin: "8px 0 24px", background: GROUND.g2, border: `1px solid ${LINE.l1}`, fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
          {/* Hero — canonical H1 (PageHero, Commit B 2026-08-05): the ledger's
              title leaves the card header for a page hero; the header row keeps
              the cohort tick + the meta line at card scale. */}
          <div style={{ padding: "6px 0 22px" }}>
            <PageHero
              narrow={isMobile}
              eyebrow={`${cfg.tag} · Cohort ledger`}
              meta={`WEEKLY BUILD · AS OF ${formatScoringDate(scoredAt)}`}
              title={cfg.title}
              stats={cohortTotal ? [{ value: cohortTotal.toLocaleString(), label: "IN COHORT", center: true }] : undefined}
            />
          </div>
          <div style={{ border: `1px solid ${LINE.l1}`, background: P.card }}>

            {/* header — cohort tick + meta line (title moved to the page hero) */}
            <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 6 : 0, justifyContent: "space-between", padding: isMobile ? "12px 16px" : "14px 20px", borderBottom: `1px solid ${P.lineMed}` }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 3, height: 14, background: cfg.markerColor }} />
                <span style={{ ...mono(9.5, 600), color: cfg.markerColor, letterSpacing: ".14em" }}>{cfg.tag}</span>
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
                {cfg.sortLabel ? (
                  <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".1em", alignSelf: "center", marginLeft: "auto" }}>
                    {cfg.sortLabel}
                  </span>
                ) : null}
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
                {/* below the head the index separates people — a plain ranked list,
                    virtualised only past VIRTUAL_MIN rows. Small boards (Rising: 123)
                    render statically: the window virtualiser's dynamic-measure cache can
                    hold a stale height for an unmounted row (e.g. measured with its
                    drawer open, or before the rising badges loaded), which pads the
                    scroll container past the real last row — visible as dead space under
                    the final rank on the one cohort whose bottom users actually reach. */}
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
                    {tailRows.length > VIRTUAL_MIN ? (
                      <VirtualTail
                        cfg={cfg}
                        rows={tailRows}
                        th={th}
                        cohortTotal={cohortTotal}
                        open={open}
                        onToggle={toggle}
                        onNearEnd={loadMore}
                        isMobile={isMobile}
                        flags={isRising ? risingFlags : undefined}
                        openTrials={isEst ? openTrials : undefined}
                        estFlags={isEst ? estFlags : undefined}
                        rowByRank={rowByRank}
                      />
                    ) : (
                      tailRows.map(renderRow)
                    )}
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
