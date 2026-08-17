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

import { CANON, DEPTH, FACE } from "../../lib/canonicalTokens";
import { taLabelForSlug } from "../../lib/taLabels";

// The ledger RPCs are TA-locked (see the strip note below). Slug is the pin.
const LEDGER_TA_SLUG = "nsclc";
import { getRisingFlags, getBoardOpenTrials, getEstablishedFlags, type RisingFlags, type OpenTrialFlag, type EstablishedFlags } from "../../lib/risingProfile";
import { prefetchOpenTrialsDetail } from "../../lib/openTrials";
import { getDrawerLayerData, prefetchDrawerLayerData, dominantClasses, PRACTICE_FLOOR, type DrawerLayerData } from "../../lib/ledgerDrawer";
import TrialsPopup from "./TrialsPopup";
import TerritorySelect from "./TerritorySelect";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { useFilterContext } from "../../lib/filter-context";
import { useTrack, type Track } from "../../lib/TrackContext";
import { resolveFeedRoute, trackToDashboardSlug } from "../../lib/routeSlugs";
import { taIdForApiSlug, getHcpWebSignals, type WebSignal } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { STATUS_LABEL, type RelationshipStatus } from "../../lib/relationships";
import {
  COHORTS,
  floorFixed,
  loadLedgerPage,
  loadLedgerMeta,
  thresholds,
  cellDisplay,
  mobileCells,
  layout,
  evidenceChip,
  LEDGER_PAGE_SIZE,
  COM_TIER_FILTERS,
  COM_ALL_TIERS,
  COM_DEFAULT_TIERS,
  type CohortConfig,
  type LedgerMeta,
  type LedgerRow,
  type Band,
  ledgerTerritoryTree,
  scopeFromKey,
  scopeIncludesUs,
  titleCase,
  money,
  type LedgerScope,
} from "../../lib/cohortLedger";
import { getCurrentUser } from "../../lib/authHelpers";
import { getUserTerritoryContext } from "../../lib/home";

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
// CANONICAL MIGRATION 2026-08-13. Every near-twin the 2026-08-05 pass declined
// to converge now resolves to its canonical step — the whole ramp is cool, so
// the "converging is a visible change" objection is spent: the change IS the
// resurfacing. Composition (RFC-02 §03): the page ground comes from the shell
// (AppLayout paints DEPTH.GROUND on BASE); the BOARD is the section-level
// PANEL; the card inside it steps DOWN to a flat RAISE (never two stacked
// gradients); rows are flat with an INSET hover; the drawer is OVERHANG.
const P = {
  page: CANON.GROUND.BASE, // was #08090A — the shell's ground, not a second one
  card: CANON.GROUND.RAISE, // flat inside the PANEL board (child steps down)
  head: CANON.GROUND.INSET, // was #0B0D10 — a header well reads as INSET
  rowHover: CANON.GROUND.INSET, // was #131619 — INSET's stated role is hover fill
  drawer: CANON.GROUND.RAISE, // was #0A0C0F — drawer body; depth comes from OVERHANG
  band: CANON.GROUND.RAISE,
  // Alpha hairlines retired: the register's rules are opaque ramp steps, so the
  // three alpha whites collapse onto HAIR/HAIR/EDGE (rule 1 — one value verbatim).
  line: CANON.LINE.HAIR,
  lineMed: CANON.LINE.HAIR,
  lineStrong: CANON.LINE.EDGE,
  amber: CANON.GOLD.RANK, // #E0A75E — byte-identical carry
  ink0: CANON.INK.PRIME,
  ink1: CANON.INK.PRIME,
  ink2: CANON.INK.BODY,
  ink3: CANON.INK.LABEL,
  ink4: CANON.INK.LABEL, // was #8F959A — LABEL is the luminance match
  ink5: CANON.INK.MUTE, // was #7C8288
  ink6: CANON.INK.MUTE, // was #63696E — MUTE, not GHOST: these carry live text
  dash: CANON.INK.MUTE, // honest-absence dash keeps its own name and its own step
} as const;

// EST factFinish inks (session-minted warm literals) reconciled into the cool
// canonical ramp — same luminance role, one ramp: #A8A29A→LABEL (primary fact),
// #43434A→GHOST (fade), #5F5F66→MUTE (insights minor).
const FACT_PRIMARY = CANON.INK.LABEL;
const FACT_FADE = CANON.INK.GHOST;
const FACT_MINOR = CANON.INK.MUTE;

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px ${FACE.data}` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px ${FACE.value}` } as const);

// COM rail (Design "Community Rail" 2A, 2026-08-11): tier vocabulary +
// reach abbreviation. Lowercase words render as true small-caps via
// font-variant; every row self-labels its own tier (sorts interleave tiers);
// heme is the affirmative different-specialty word, never a deficit.
const COM_RAIL_TIER_WORD: Record<string, string> = {
  anchored: "anchored",
  supported: "supported",
  heme_dominant: "heme-focused",
  candidate: "candidate",
  unresolved: "no medicare evidence",
};
// 9,017 -> "9.0K"; 8,762 -> "8.8K"; sub-1000 plain; absence is never zero.
function fmtReachK(v: number | null | undefined): string {
  if (v == null || v <= 0) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(Math.round(v));
}

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

// COM fact finish (2026-08-12): EST's strip polish — serif face, size/weight
// step, tint hierarchy — using EST's ACTUAL inks (#A8A29A primary, #43434A
// fade, #5F5F66 insights minor), same hex, so the two strips are uniform.
// The Medicare presence checkmarks take P.amber — the same token as the
// ramp's anchoring rule. Gated by cfg.factFinish; the stepped-decimal ramp
// stays numericRamp-only. (A cool-mirror register was tried and scrapped
// same day — it read colder than EST, not uniform with it.)

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
// STATUS_LABEL now lives in lib/relationships.ts beside the type it labels
// (single-sourced 2026-08-13); this file imports it.
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
          <span style={{ color: CANON.MARK.EST }}>SENIOR AUTHORSHIP SINCE {flag.first_senior_year ?? "—"}</span>
          <span style={{ color: CANON.GOLD.EDGE }}>·</span>
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
            style={{ display: "inline-flex", alignItems: "center", border: `1px solid rgba(63,184,175,0.45)`, padding: mobile ? "3px 8px" : "4px 9px", ...mono(mobile ? 9 : 9.5, 600), letterSpacing: ".09em", color: CANON.ACTION.LINK, cursor: "pointer" }}
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
            style={{ ...chipBase, border: `1px solid rgba(63,184,175,0.45)`, color: CANON.ACTION.LINK, cursor: "pointer" }}
          >
            OPEN TRIAL
          </span>
          {trialsOpen ? <TrialsPopup hcpId={hcpId} hcpName={hcpName} badgeRef={trialBadgeRef} onClose={() => setTrialsOpen(false)} /> : null}
        </span>
      ) : null}
      {est?.senior_recent ? (
        <span title={`>= 1 senior-authored publication in the last 24 months — ${est.senior_pubs_24mo} in window${est.latest_senior_year ? `, latest ${est.latest_senior_year}` : ""}. Within the FieldMark corpus — we see only what is ingested.`} style={{ ...chipBase, border: `1px solid rgba(143,184,166,0.45)`, color: CANON.MARK.EST }}>
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
const SEP_INK = CANON.INK.BODY; // a neighbour that separates
const NOSEP_INK = CANON.INK.MUTE; // "does not separate here"
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
      color: CANON.INK.MUTE, classes: [],
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
      color: CANON.INK.MUTE, claims: [], more: 0,
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
      <div style={{ ...mono(11, 500), letterSpacing: ".14em", lineHeight: 1.7 }}>
        <div style={{ color: CANON.INK.MUTE }}>{label}</div>
        <div style={{ marginTop: 4, color: CANON.INK.MUTE }}>{sub}</div>
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
          <span style={{ ...mono(13), color: CANON.INK.MUTE, textAlign: "right" }}>{l.rank}</span>
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
          // Canonical 2026-08-13: the hand-rolled three-stop gradient + hand-set
          // cast shadow ARE the OVERHANG register — swapped for the token, so a
          // ramp re-temperature carries the drawer with it. The 5px overhang,
          // the transitions and the one-line system below are unchanged.
          ...DEPTH.OVERHANG,
          // ONE LINE SYSTEM preserved: OVERHANG ships a top-edge rim, but this
          // box is documented to draw NO edge (the drawer's own drawerRule is
          // the only perimeter line). Take the token's SURFACE and SHADOW, drop
          // its rim — the depth cue here is the top-lit gradient + cast shadow.
          borderTop: "none",
          margin: entered ? "0 -5px" : "0 0px", // the 5px overhang
          // Shadow stays animated (0 when closed); the entered value is now the
          // canonical OVERHANG cast rather than the hand-set rgba(0,0,0,.92).
          boxShadow: entered ? (DEPTH.OVERHANG.boxShadow as string) : "0 0 0 rgba(0,0,0,0)",
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
          font: `700 ${mobile ? "9px" : "11px"} ${FACE.ui}`, letterSpacing: ".2em", color: cfg.markerColor, textDecoration: "none",
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
        <div style={{ ...serif(17), lineHeight: 1.62, color: SEP_INK, textWrap: "pretty" as const }}>{spine.text}</div>
        <NeighbourLines lines={spine.lines} />
      </DrawerSection>

      <DrawerSection label="PRACTICE · CANONICAL FOCUS" sub={cov.practice} mobile={mobile}>
        {layers == null ? (
          <div style={{ ...mono(11), color: P.ink5, letterSpacing: ".1em" }}>READING THE LABELED CORPUS…</div>
        ) : (
          <>
            <div style={{ ...serif(17), lineHeight: 1.62, color: pr.color, textWrap: "pretty" as const }}>{pr.text}</div>
            {pr.classes.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
                {pr.classes.map((k) => (
                  <div key={k.name} style={{ display: "grid", gridTemplateColumns: mobile ? "84px 1fr" : "112px 1fr auto", gap: 16, alignItems: "baseline" }}>
                    <span style={{ ...mono(15), color: P.amber, textAlign: "right" }}>{k.count}</span>
                    <span style={{ ...serif(15), color: SEP_INK }}>{k.name}</span>
                    {mobile ? null : <span style={{ ...mono(11), letterSpacing: ".1em", color: CANON.INK.MUTE }}>{k.primary.toUpperCase()}</span>}
                  </div>
                ))}
              </div>
            ) : null}
            <NeighbourLines lines={pr.lines} />
            <div style={{ ...mono(9), letterSpacing: ".1em", color: CANON.INK.MUTE, lineHeight: 1.7, marginTop: 16 }}>
              A PUBLICATION CAN CARRY SEVERAL CANONICAL LABELS — COUNTS OVERLAP AND DO NOT SUM TO THE LABELED TOTAL.
            </div>
          </>
        )}
      </DrawerSection>

      <DrawerSection label="BELIEF · EXTRACTED POSITIONS" sub={cov.belief} mobile={mobile}>
        {layers == null ? (
          <div style={{ ...mono(11), color: P.ink5, letterSpacing: ".1em" }}>READING THE POSITION RECORD…</div>
        ) : (
          <>
            <div style={{ ...serif(17), lineHeight: 1.62, color: bl.color, textWrap: "pretty" as const }}>{bl.text}</div>
            {bl.claims.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16, paddingLeft: 16, borderLeft: "1px solid rgba(216,162,74,.28)" }}>
                {bl.claims.map((c, i) => (
                  <div key={i} style={{ ...serif(15), lineHeight: 1.55, color: SEP_INK, fontStyle: "italic", textWrap: "pretty" as const }}>{c}</div>
                ))}
                {bl.more > 0 ? <div style={{ ...mono(9), letterSpacing: ".1em", color: P.ink5 }}>+ {bl.more} MORE ON THE PROFILE</div> : null}
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
        <div style={{ ...mono(9), letterSpacing: ".1em", color: CANON.INK.MUTE, lineHeight: 1.7 }}>
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
  const border = chip.strength === "anchored" ? CANON.GOLD.EDGE : chip.strength === "supported" ? P.lineStrong : P.lineMed;
  const bg = chip.strength === "anchored" ? "rgba(224,167,94,.05)" : "transparent";
  const tierColor = chip.strength === "anchored" ? P.amber : chip.strength === "supported" ? CANON.GOLD.RANK : P.ink4;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 3 }}>
      <span style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", flexWrap: "wrap", gap: 8, border: `1px ${dashed ? "dashed" : "solid"} ${border}`, background: bg, padding: mobile ? "3px 8px" : "4px 9px", ...mono(mobile ? 9 : 9.5), letterSpacing: ".09em" }}>
        <span style={{ color: tierColor }}>{chip.tierWord}</span>
        {chip.segments.map((seg, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CANON.GOLD.EDGE }}>·</span>
            <span style={{ color: chip.strength === "anchored" && i === 1 ? CANON.GOLD.PRIME : P.ink4 }}>{seg}</span>
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
    ...mono(9),
    letterSpacing: ".1em",
    color: on ? CANON.GOLD.PRIME : P.ink6,
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
      {/* Per-cohort rail head (Phase 3): COM is a roster — the leading figure is
          the Medicare reach FACT, never a rank. EST/RS keep their real rank rail. */}
      {cfg.tag === "COM" ? (
        // One label (2026-08-12): the header names only the tier word — the
        // reach value self-labels via the 2A cell's own caption, so a reach
        // sub-line here double-labeled it and read as a qualifier of the tier.
        // The invisible second line holds the two-line cell height: the header
        // row bottom-aligns (alignItems flex-end), so matched height lands
        // EVIDENCE TIER on the same head line as MEDICARE/PHARMA/COMPANIES.
        <div style={{ width: 104, paddingRight: 12, ...mono(9, 500), letterSpacing: ".14em", color: P.ink4 }}>
          EVIDENCE TIER<br /><span style={{ visibility: "hidden" }}>·</span>
        </div>
      ) : (
        <div style={{ width: 104, paddingRight: 12, ...mono(9, 500), letterSpacing: ".14em", color: P.amber }}>
          RANK<br /><span style={{ color: P.ink5 }}>US · GLOBAL</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 300, textAlign: "center", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
        PHYSICIAN · {cfg.nameSub}
      </div>
      {/* COM (2026-08-12): the idx slot is the MEDICARE PART D presence fact,
          paired with a PART B presence column — two-line heads matching the
          PHARMA PAYMENTS / COMPANIES ENGAGED grammar. EST/RS keep COHORT SCORE. */}
      {cfg.tag === "COM" ? (
        <>
          <div style={{ width: 88, textAlign: "center", whiteSpace: "nowrap", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
            MEDICARE<br /><span style={{ color: P.ink5 }}>PART D</span>
          </div>
          <div style={{ width: 88, textAlign: "center", whiteSpace: "nowrap", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
            MEDICARE<br /><span style={{ color: P.ink5 }}>PART B</span>
          </div>
        </>
      ) : (
        <div style={{ width: 88, textAlign: "center", whiteSpace: "nowrap", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
          COHORT SCORE
        </div>
      )}
      {cfg.cols.map((c) => (
        // c.align is the single-source alignment shared with the Row value
        // cell (2026-08-12); absent = legacy centered head over a right value.
        <div key={c.key} style={{ width: c.w, textAlign: c.align ?? "center", ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>
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
              <span style={{ font: `600 44px ${FACE.data}`, color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 0.86, letterSpacing: "-.015em" }}>
                {row.rank}
              </span>
              {/* Scope label was hardcoded "US" — it asserted US for every row, so a
                  German KOL read "#1 US". It now names the country this rank is actually
                  against. Rising additionally carries the Europe rank, giving the three
                  scores: country · Europe · global. */}
              <span style={{ ...mono(9, 500), color: CANON.GOLD.RANK, letterSpacing: ".12em" }}>
                {row.scoredCountry ?? "US"}
              </span>
            </div>
            {row.europeRank != null && (
              <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".06em" }}>#{row.europeRank} EUROPE</span>
            )}
            <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".06em" }}>#{row.globalRank ?? "—"} GLOBAL</span>
          </div>
        ) : (
          // COM rail — Design "Community Rail" 2A · SET IN SERIF (2026-08-11):
          // the tier word joins the editorial voice (serif small-caps, the same
          // family as the physician names), cool slate — never amber, never the
          // rank-numeral weight. Reach beneath is an abbreviated cool fact,
          // centered; its caption carries the 3YR timeframe (2026-08-12 — moved
          // here from the rail header, which now labels only the tier word).
          // Absence is never zero: no Part B benes renders "—".
          <div style={{ width: 104, paddingRight: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, textAlign: "center" }}>
            <span style={{ ...serif(15, 500), color: CANON.INK.BODY, fontVariant: "small-caps", letterSpacing: "0.02em", lineHeight: 1.15 }}>
              {COM_RAIL_TIER_WORD[row.tier ?? ""] ?? "community"}
            </span>
            <span style={{ width: 26, height: 1, background: CANON.LINE.EDGE }} />
            <span style={{ ...mono(13), color: CANON.INK.MUTE, letterSpacing: ".05em", fontVariantNumeric: "tabular-nums" }}>
              {fmtReachK(row.patientVolume)}
            </span>
            <span style={{ ...mono(9), color: CANON.INK.MUTE, letterSpacing: ".16em", whiteSpace: "nowrap" }}>REACH · 3YR</span>
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
            <div style={{ ...serif(13), lineHeight: 1.55, color: P.ink4, textWrap: "pretty" }}>{row.summary}</div>
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
            imported. Gated by cfg.numericRamp (EST + RS, 2026-08-11 — the ranked
            cohorts' shared row class); COM stays off. */}
        {cfg.numericRamp && row.idx != null ? (
          (() => {
            const [ipart, dpart = ""] = floorFixed(row.idx ?? 0, cfg.idxDecimals).split(".");
            return (
              <div style={{ width: 88, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7 }}>
                <div style={{ width: 44, height: 2, background: P.amber }} />
                <div style={{ display: "flex", alignItems: "baseline", letterSpacing: "-.012em" }}>
                  <span style={{ ...serif(44, 600), lineHeight: 0.92, color: CANON.INK.PRIME }}>{ipart}</span>
                  {dpart ? <span style={{ ...serif(30), lineHeight: 0.92, color: CANON.INK.BODY }}>.{dpart}</span> : null}
                </div>
              </div>
            );
          })()
        ) : row.idx != null ? (
          <div style={{ width: 88, textAlign: "right", ...mono(17, 500), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>
            {floorFixed(row.idx, cfg.idxDecimals)}
          </div>
        ) : (
          // COM roster (Phase 3): no index — the Part-D presence fact takes the
          // slot (centered under the MEDICARE / PART D head since 2026-08-12;
          // serif cool finish same day).
          <div style={{ width: 88, textAlign: "center", ...(cfg.factFinish ? { ...serif(13, 500), color: P.ink0, letterSpacing: ".02em" } : { ...mono(9), color: P.ink5, letterSpacing: ".08em" }) }}>
            {/* white label + rule-amber check (2026-08-12 split) */}
            {row.partDPresent ? (cfg.factFinish ? <>PART D <span style={{ color: P.amber }}>✓</span></> : "PART D ✓") : ""}
          </div>
        )}
        {/* MEDICARE PART B presence (2026-08-12): patient_volume > 0 is the
            only presence definition the board carries — no part_b_present flag
            exists, and the ledger RPC coalesces null volume to 0, so absent
            and zero are one state. Dash for that state, never a "0" and never
            a ✓ — absence is not a count. The reach NUMBER stays in the rail;
            this cell is presence only. */}
        {cfg.tag === "COM" ? (
          <div style={{ width: 88, textAlign: "center" }}>
            {row.patientVolume != null && row.patientVolume > 0 ? (
              <span style={cfg.factFinish ? { ...serif(13, 500), color: P.ink0, letterSpacing: ".02em" } : { ...mono(9), color: P.ink5, letterSpacing: ".08em" }}>
                {cfg.factFinish ? <>PART B <span style={{ color: P.amber }}>✓</span></> : "PART B ✓"}
              </span>
            ) : (
              <span style={{ ...mono(9), color: P.dash, letterSpacing: ".1em" }}>—</span>
            )}
          </div>
        ) : null}
        {/* score cells */}
        {cfg.cols.map((col) => {
          const d = cellDisplay(row, col, th);
          if (d.kind === "absent") {
            return (
              <div key={col.key} style={{ width: col.w, textAlign: col.align ?? "right" }}>
                <span style={{ ...mono(9), color: P.dash, letterSpacing: ".1em" }}>{d.text}</span>
              </div>
            );
          }
          // Ranked cohorts (cfg.numericRamp) ride the 2A ramp below the score:
          // pharma faded a step further (frame literals #A8A29A/#43434A — warm
          // support, chrome-dark fade; near-twins of no register token, NOT
          // converged). Dash/absent cells keep their treatment — the ramp is
          // for numerals only. COM keeps the mono cells (no ramp on the roster).
          if (cfg.numericRamp && d.kind !== "dash") {
            return (
              <div key={col.key} style={{ width: col.w, textAlign: col.align ?? "right" }}>
                {col.noRank ? (
                  <span style={{ ...serif(15), color: FACT_FADE }}>{d.text}</span>
                ) : (
                  <span style={{ ...serif(20, 500), color: FACT_PRIMARY }}>{d.text}</span>
                )}
              </div>
            );
          }
          // COM fact finish — the ramp's serif polish with the ramp's own
          // inks (same hex as the EST branch above), same size/weight/
          // de-emphasis hierarchy. Dash/absent cells keep their treatment:
          // the finish is for facts only.
          if (cfg.factFinish && d.kind !== "dash") {
            return (
              <div key={col.key} style={{ width: col.w, textAlign: col.align ?? "right" }}>
                {col.noRank ? (
                  <span style={{ ...serif(15), color: FACT_FADE }}>{d.text}</span>
                ) : (
                  <span style={{ ...serif(20, 500), color: FACT_PRIMARY }}>{d.text}</span>
                )}
              </div>
            );
          }
          const color = d.kind === "dash" ? P.dash : col.noRank ? P.ink4 : P.ink0;
          return (
            <div key={col.key} style={{ width: col.w, textAlign: col.align ?? "right" }}>
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
            // EST/RS ramp and COM factFinish share the insights minor tint
            // (frame literal #5F5F66).
            <span style={{ ...mono(13), color: cfg.numericRamp || cfg.factFinish ? FACT_MINOR : P.ink2, fontVariantNumeric: "tabular-nums" }}>{insight}</span>
          ) : (
            <span style={{ ...mono(9), color: P.dash, letterSpacing: ".1em" }}>—</span>
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
        {/* COM centers the label under the centered RELATIONSHIP head (2026-08-12,
            with the strip's plumb pass); EST/RS keep their shipped left set. */}
        <div style={{ width: OURS.state, position: "relative", textAlign: cfg.tag === "COM" ? "center" : undefined }}>
          <button
            onClick={(e) => { stop(e); setMenuOpen((o) => !o); }}
            title={STATUS_LABEL[status]}
            style={{ display: cfg.tag === "COM" ? "inline-flex" : "flex", justifyContent: cfg.tag === "COM" ? "center" : undefined, alignItems: "center", gap: 8, background: "none", border: "none", padding: "3px 2px", cursor: "pointer", minHeight: 0, textAlign: cfg.tag === "COM" ? "center" : "left" }}
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
              <div onClick={stop} style={{ position: "absolute", top: 26, left: 0, zIndex: 41, background: CANON.GROUND.BASE, border: `1px solid ${P.lineStrong}`, boxShadow: "0 8px 24px rgba(0,0,0,.5)", minWidth: 176 }}>
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={(e) => { stop(e); setMenuOpen(false); if (s !== status) void setStatus(row.hcpId, s, "cohort_ledger"); }}
                    style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 10px", background: s === status ? P.rowHover : "transparent", border: "none", borderBottom: `1px solid ${P.line}`, cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = P.rowHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = s === status ? P.rowHover : "transparent")}
                  >
                    <StateLadder status={s} />
                    <span style={{ ...mono(11), color: s === status ? P.ink1 : P.ink4, letterSpacing: ".04em" }}>{STATUS_LABEL[s]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* drawer (2026-08-08): EST/RS take the three-layer redesign; COM takes
          the 1B call sheet (2026-08-12). All three cohorts take the 5px
          overhang treatment on desktop (2026-08-09; RS same day with the
          cohort-tinted rails, COM 2026-08-12) — see DrawerOverhang. */}
      {open && cfg.tag !== "COM" ? (
        <DrawerOverhang>
          <LedgerDrawerView cfg={cfg} row={row} up={rowByRank?.get((row.rank ?? 0) - 1)} down={rowByRank?.get((row.rank ?? 0) + 1)} overhang />
        </DrawerOverhang>
      ) : null}
      {open && cfg.tag === "COM" ? (
        <DrawerOverhang>
          <CommunityCallSheet cfg={cfg} row={row} overhang />
        </DrawerOverhang>
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
              <span style={{ font: `600 30px ${FACE.data}`, color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 0.85, letterSpacing: "-.015em" }}>{row.rank}</span>
              <span style={{ ...mono(9, 500), color: CANON.GOLD.RANK, letterSpacing: ".12em" }}>
                {row.scoredCountry ?? "US"}
              </span>
              {row.europeRank != null && (
                <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".06em" }}>#{row.europeRank} EU</span>
              )}
              <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".06em" }}>#{row.globalRank ?? "—"} GLB</span>
            </div>
          ) : (
            // COM mobile rail — 2A adapted inline for 390px: tier word (serif
            // small-caps) leads, abbreviated reach + label follow; wraps clean.
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...serif(13, 500), color: CANON.INK.BODY, fontVariant: "small-caps", letterSpacing: "0.02em" }}>
                {COM_RAIL_TIER_WORD[row.tier ?? ""] ?? "community"}
              </span>
              <span style={{ ...mono(11), color: CANON.INK.MUTE, letterSpacing: ".05em", fontVariantNumeric: "tabular-nums" }}>{fmtReachK(row.patientVolume)}</span>
              <span style={{ ...mono(9), color: CANON.INK.MUTE, letterSpacing: ".16em" }}>MEDICARE REACH</span>
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
          <Link to={`/hcp/${row.hcpId}`} onClick={stop} style={{ ...serif(17, 500), color: P.ink0, textDecoration: "none", borderBottom: `1px solid ${P.lineStrong}` }}>{row.name}</Link>
          {row.archetype ? (
            <span style={{ ...mono(9, 500), color: P.ink3, letterSpacing: ".08em", padding: "1px 5px", border: `1px solid ${P.lineStrong}`, borderRadius: 2 }}>{row.archetype.toUpperCase()}</span>
          ) : null}
        </div>
        {row.chips.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {row.chips.map((chip, i) => (
              <span key={i} style={{ ...mono(9), color: i === 0 ? P.ink4 : P.ink5, letterSpacing: ".02em" }}>{chip}</span>
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
              <span style={{ ...mono(9, 500), color: P.ink6, letterSpacing: ".12em" }}>{c.label}</span>
              <span style={{ ...mono(13), color: c.value === "—" ? P.dash : P.ink1, fontVariantNumeric: "tabular-nums" }}>{c.value}</span>
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
              <div onClick={stop} style={{ position: "absolute", top: 26, left: 0, zIndex: 41, background: CANON.GROUND.BASE, border: `1px solid ${P.lineStrong}`, boxShadow: "0 8px 24px rgba(0,0,0,.5)", minWidth: 190 }}>
                {STATUS_ORDER.map((s) => (
                  <button key={s} onClick={(e) => { stop(e); setMenuOpen(false); if (s !== status) void setStatus(row.hcpId, s, "cohort_ledger"); }} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px", background: s === status ? P.rowHover : "transparent", border: "none", borderBottom: `1px solid ${P.line}`, cursor: "pointer", textAlign: "left" }}>
                    <StateLadder status={s} />
                    <span style={{ ...mono(11), color: s === status ? P.ink1 : P.ink4, letterSpacing: ".04em" }}>{STATUS_LABEL[s]}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* drawer (2026-08-08): EST/RS take the stacked three-layer redesign;
          COM takes the stacked 1B call sheet (2026-08-12). Mobile keeps the
          flat drawer — no overhang. */}
      {open && cfg.tag !== "COM" ? (
        <LedgerDrawerView cfg={cfg} row={row} up={rowByRank?.get((row.rank ?? 0) - 1)} down={rowByRank?.get((row.rank ?? 0) + 1)} mobile />
      ) : null}
      {open && cfg.tag === "COM" ? <CommunityCallSheet cfg={cfg} row={row} mobile /> : null}
    </div>
  );
}

// ── Community drawer — 1B "Call Sheet" (Design frame Community Drawer.dc.html,
// 2026-08-12): read left, dial right. LEFT is claims/NPPES prose + a fact grid
// and works for every board member; RIGHT is a fixed mono ACCESS rail fed by
// web-signals enrichment with three honest states (enriched / not yet
// gathered / searched-nothing-found) and per-row absence inside the first.
// The generated summary is an absent-first slot — the drawer is complete
// without it, and its text is regenerable (Phase 4).
interface CallSheetFacts {
  loaded: boolean;
  signals: WebSignal[];
  setting: string | null;
  pubs: number | null;
  nppesInstitution: string | null;
}

const CS = {
  label: CANON.INK.MUTE,
  micro: CANON.INK.MUTE,
  faint: CANON.INK.MUTE,
  prose: CANON.INK.BODY,
  dim: CANON.INK.MUTE,
  gold: CANON.GOLD.PRIME,
  hair: CANON.LINE.HAIR,
};

function csSig(signals: WebSignal[], type: string): WebSignal | null {
  return signals.find((sg) => sg.signal_type === type && sg.signal_value) ?? null;
}

function CommunityCallSheet({ cfg, row, mobile, overhang }: { cfg: CohortConfig; row: LedgerRow; mobile?: boolean; overhang?: boolean }) {
  const [facts, setFacts] = useState<CallSheetFacts>({ loaded: false, signals: [], setting: null, pubs: null, nppesInstitution: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      const [signals, hcpRes] = await Promise.all([
        getHcpWebSignals(row.hcpId),
        supabase.from("hcps_v2").select("nppes_practice_setting, in_corpus_pub_count, institution_normalized").eq("id", row.hcpId).maybeSingle(),
      ]);
      if (!alive) return;
      const h = (hcpRes.data ?? {}) as { nppes_practice_setting?: string | null; in_corpus_pub_count?: number | null; institution_normalized?: string | null };
      setFacts({
        loaded: true,
        signals,
        setting: h.nppes_practice_setting ?? null,
        // in_corpus_pub_count, NOT total_career_pubs: what WE hold, not a career
        // total. NULL means no OpenAlex record — unmeasured, never zero.
        pubs: h.in_corpus_pub_count ?? null,
        nppesInstitution: h.institution_normalized ?? null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [row.hcpId]);

  const real = facts.signals.filter((sg) => sg.signal_type !== "no_signals_found");
  const searchedNothing = facts.loaded && real.length === 0 && facts.signals.some((sg) => sg.signal_type === "no_signals_found");
  const enriched = real.length > 0;

  const vol = row.patientVolume != null && row.patientVolume > 0 ? Math.round(row.patientVolume) : null;
  const tierWord = COM_RAIL_TIER_WORD[row.tier ?? ""] ?? "community";
  const loc = row.chips[1] ?? "";

  // LEFT prose — factual templates only; every clause is a held fact.
  const tierSentence = (() => {
    if (row.tier === "anchored") {
      const stems = (row.anchorStems ?? (row.anchorStem ? [row.anchorStem] : [])).join(", ");
      const years = (row.anchorYears ?? []).join(" and ");
      const recurs = row.recurrenceBand === "recurs" ? ", recurring across years rather than appearing once" : "";
      return "Anchored on their own prescribing record — " + (stems || "lung-only oral") + " claims" + (years ? " in " + years : "") + recurs + ".";
    }
    // NSCLC IS CORRECT HERE — DO NOT WIDEN TO "LUNG CANCER". The evidence tier is
    // computed from a claims code set that is NSCLC-specific and carries no SCLC
    // codes, so naming it "lung cancer" would assert coverage the data does not
    // have. The TA DISPLAY LABEL was renamed 2026-08-15; this clinical criterion
    // was not. Same for the candidate tier below, and ScoringExplainedModal.
    if (row.tier === "supported") return "Supported by " + (row.supportedEvidence ?? "corroborating NSCLC evidence") + " in the claims record.";
    if (row.tier === "heme_dominant") return "A heme-focused practice — the oral record concentrates in blood cancers; a different specialty, not a deficit.";
    // NSCLC-specific by construction: see the supported-tier note above.
    if (row.tier === "candidate") return "An oncology claims footprint without NSCLC-specific drug evidence — a candidate on the record so far.";
    return "No Medicare drug-claims evidence to characterize the treatment mix.";
  })();
  const reachSentence = vol != null
    ? vol.toLocaleString() + " Medicare beneficiaries over three years of Part B."
    : "No Part B beneficiary record — reach is unmeasured here, not zero.";
  const practiceBits = [
    facts.setting ? titleCase(facts.setting) + " practice" : null,
    row.scores["years"] != null ? String(Math.round(row.scores["years"] as number)) + " years in practice" : null,
    row.partDPresent ? "oral agents move through their own Part D record" : null,
  ].filter(Boolean);
  const practiceSentence = practiceBits.length ? practiceBits.join(" · ") + "." : "";

  const eng = row.scores["eng"];
  const companies = row.scores["companies"];

  const gridRows: { label: string; value: string; dim?: boolean }[] = [
    { label: "EVIDENCE TIER", value: titleCase(tierWord) + (row.supportedEvidence ? " · " + row.supportedEvidence : "") },
    { label: "MEDICARE REACH", value: vol != null ? vol.toLocaleString() + " beneficiaries · 3-year Part B" : "No Part B record — unmeasured, not zero", dim: vol == null },
    { label: "SETTING", value: [facts.setting ? titleCase(facts.setting) : null, loc || null].filter(Boolean).join(" · ") || "Not on record", dim: !facts.setting && !loc },
    { label: "PHARMA CONTACT", value: eng != null && eng > 0 ? money(eng) + " lifetime" + (companies ? " across " + Math.round(companies) + " companies" : "") + " — a fact, not a rating" : "None recorded — absence of a record, not of relationships", dim: !(eng != null && eng > 0) },
    // No `> 0` test: in_corpus_pub_count is never 0 when non-null (a staged row has
    // at least one flattened publication). NULL is the only empty state and it means
    // unmeasured — no OpenAlex record — not a count of nothing.
    { label: "PUBLICATIONS (IN CORPUS)", value: facts.pubs != null ? String(facts.pubs) + " in the FieldMark corpus" : "Not indexed — no OpenAlex record. Expected in this cohort, not a gap", dim: facts.pubs == null },
  ];

  // RIGHT rail — the per-row matrix.
  const inst = csSig(real, "institution");
  const dept = csSig(real, "department");
  const phone = csSig(real, "office_phone");
  const linkedin = csSig(real, "linkedin_url");
  const title = csSig(real, "academic_title");
  const faculty = csSig(real, "faculty_profile_url");
  const email = csSig(real, "institutional_email");
  const missingBits = enriched
    ? [!dept ? "department" : null, !phone ? "office line" : null, !linkedin ? "LinkedIn" : null, !csSig(real, "lab_url") ? "lab page" : null].filter(Boolean)
    : [];

  const microLabel = (t: string, dim?: boolean) => (
    <div style={{ ...mono(9), letterSpacing: ".12em", color: dim ? CS.faint : CS.micro, marginBottom: 4 }}>{t}</div>
  );
  const railRow = (key: string, body: ReactNode, first?: boolean) => (
    <div key={key} style={{ borderTop: first ? "none" : `1px solid ${CS.hair}`, paddingTop: first ? 0 : 13 }}>{body}</div>
  );

  const railRows: ReactNode[] = [];
  if (enriched) {
    railRows.push(railRow("practice", (
      <>
        {microLabel("PRACTICE GROUP")}
        <div style={{ ...serif(15), color: CS.prose, lineHeight: 1.5 }}>{inst?.signal_value ?? facts.nppesInstitution ?? "Practice-based · no institutional affiliation"}</div>
        {inst?.source_url || faculty?.signal_value ? (
          <a href={inst?.source_url ?? faculty?.signal_value ?? undefined} target="_blank" rel="noreferrer" style={{ ...mono(9), letterSpacing: ".1em", color: CS.gold, textDecoration: "none", display: "inline-block", marginTop: 5 }}>PRACTICE PAGE ↗</a>
        ) : null}
      </>
    ), true));
    if (title) railRows.push(railRow("title", (<>{microLabel("TITLE")}<div style={{ ...serif(15), color: CS.prose }}>{title.signal_value}</div></>)));
    if (dept) railRows.push(railRow("dept", (<>{microLabel("DEPARTMENT")}<div style={{ ...serif(15), color: CS.prose }}>{dept.signal_value}</div></>)));
    if (phone) railRows.push(railRow("phone", (<>{microLabel("OFFICE LINE")}<div style={{ ...mono(15, 500), color: CS.gold }}>{phone.signal_value}</div></>)));
    if (linkedin) railRows.push(railRow("li", (
      <>
        {microLabel("LINKEDIN")}
        <a href={linkedin.signal_value.startsWith("http") ? linkedin.signal_value : "https://" + linkedin.signal_value} target="_blank" rel="noreferrer" style={{ ...mono(9), letterSpacing: ".1em", color: CS.gold, textDecoration: "none" }}>OPEN ↗</a>
      </>
    )));
    if (email) railRows.push(railRow("email", (<>{microLabel("EMAIL")}<div style={{ ...mono(11), color: CS.prose, overflowWrap: "anywhere" }}>{email.signal_value}</div></>)));
    if (missingBits.length) railRows.push(railRow("missing", (
      <>
        {microLabel("NOT FOUND", true)}
        <div style={{ ...serif(13), color: CS.dim, lineHeight: 1.55 }}>No {missingBits.join(", ")} resolved.</div>
      </>
    )));
  } else {
    // NPPES facts ARE access information — real content, never blank or an error.
    railRows.push(railRow("loc", (<>{microLabel("PRACTICE LOCATION")}<div style={{ ...serif(15), color: CS.prose }}>{loc || "Not on record"}</div></>), true));
    if (row.chips[0]) railRows.push(railRow("spec", (<>{microLabel("SPECIALTY")}<div style={{ ...serif(15), color: CS.prose }}>{row.chips[0]}</div></>)));
    if (facts.setting) railRows.push(railRow("set", (<>{microLabel("SETTING")}<div style={{ ...serif(15), color: CS.prose }}>{titleCase(facts.setting)}</div></>)));
    railRows.push(railRow("state", (
      <div style={{ ...mono(9), letterSpacing: ".08em", lineHeight: 1.7, color: CS.dim }}>
        {searchedNothing ? "SEARCHED — NO PUBLIC WEB PRESENCE FOUND." : facts.loaded ? "CONTACT INTEL NOT YET GATHERED · SEE PROFILE" : ""}
      </div>
    )));
  }

  return (
    // Same enclosure mechanism as LedgerDrawerView (2026-08-12 parity): the
    // perimeter is drawerPerimeter — 3px solid cfg.markerColor, rendered
    // unconditionally — and the overhang wrapper carries depth only.
    // position:relative anchors the top-edge PROFILE tab.
    <div style={{ position: "relative", background: overhang ? "transparent" : P.drawer, border: drawerPerimeter(cfg) }}>
      {/* The filing tab, TOP-RIGHT — copied from LedgerDrawerView so the one
          profile affordance sits in the identical spot across all three
          cohort drawers (rose from cfg.markerColor for COM). */}
      <Link
        to={`/hcp/${row.hcpId}`}
        onClick={(e) => e.stopPropagation()}
        title={`${row.name} — profile`}
        style={{
          ...(mobile
            ? { display: "block", width: "fit-content", marginLeft: "auto", margin: "10px 14px 0 auto", borderRadius: 6 }
            : { position: "absolute" as const, right: 22, top: 0, zIndex: 3, borderRadius: "0 0 8px 8px" }),
          font: `700 ${mobile ? "9px" : "11px"} ${FACE.ui}`, letterSpacing: ".2em", color: cfg.markerColor, textDecoration: "none",
          background: `${cfg.markerColor}1A`, border: drawerRule(cfg), borderTop: mobile ? drawerRule(cfg) : "none",
          padding: mobile ? "7px 14px" : "11px 26px 10px", whiteSpace: "nowrap",
          boxShadow: mobile ? "none" : "0 4px 14px rgba(0,0,0,.35)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${cfg.markerColor}30`; e.currentTarget.style.borderColor = cfg.markerColor; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = `${cfg.markerColor}1A`; e.currentTarget.style.borderColor = cfg.markerColor; }}
      >
        PROFILE
      </Link>
      <div style={{ display: mobile ? "flex" : "grid", flexDirection: mobile ? "column" : undefined, gridTemplateColumns: mobile ? undefined : "1fr 372px" }}>
        {/* LEFT — the read. Claims/NPPES only: complete for every board member. */}
        <div style={{ padding: mobile ? "16px 16px 18px 19px" : "20px 26px 20px 127px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ ...mono(9, 500), letterSpacing: ".18em", color: CS.label }}>THE PRACTICE IN FRONT OF YOU</div>
          {row.summary ? (
            // Absent-first summary slot: renders only when the narrative exists;
            // regenerable text (Phase 4), so no layout depends on it.
            <div style={{ ...serif(13), fontStyle: "italic", lineHeight: 1.6, color: CANON.INK.BODY, textWrap: "pretty" }}>{row.summary}</div>
          ) : null}
          <div style={{ ...serif(15), lineHeight: 1.65, color: CS.prose, textWrap: "pretty" }}>
            {tierSentence} {reachSentence} {practiceSentence}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingTop: 12, borderTop: `1px solid ${CS.hair}` }}>
            {gridRows.map((g) => (
              <div key={g.label} style={{ display: "grid", gridTemplateColumns: mobile ? "110px 1fr" : "150px 1fr", gap: 12, alignItems: "baseline" }}>
                <span style={{ ...mono(9), letterSpacing: ".12em", color: g.dim ? CS.faint : CS.micro }}>{g.label}</span>
                <span style={{ ...serif(13), lineHeight: 1.5, color: g.dim ? CS.dim : CS.prose }}>{g.value}</span>
              </div>
            ))}
          </div>
        </div>
        {/* RIGHT — the fixed ACCESS rail. Mono, never reflows. */}
        <div style={{ padding: mobile ? "16px 16px 18px 19px" : "20px 24px", borderLeft: mobile ? undefined : `1px solid ${P.line}`, borderTop: mobile ? `1px solid ${P.line}` : undefined }}>
          {/* rightInset-style clearance (same mechanism as DrawerSection's) so
              the signal count clears the top-edge PROFILE tab on desktop */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 13, paddingRight: mobile ? 0 : 120 }}>
            <span style={{ ...mono(9, 500), letterSpacing: ".18em", color: CS.label }}>ACCESS</span>
            <span style={{ ...mono(9), letterSpacing: ".12em", color: CS.faint }}>
              {enriched ? `${real.length} SIGNALS` : searchedNothing ? "SEARCHED · NONE FOUND" : facts.loaded ? "NOT YET GATHERED" : ""}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>{railRows}</div>
        </div>
      </div>
      {/* Footer — the rule text alone, full width. The PROFILE affordance is
          the top-right filing tab (2026-08-12, matching EST/RS). */}
      <div style={{ padding: mobile ? "10px 16px 14px 19px" : "10px 26px 14px 127px", borderTop: `1px solid ${CS.hair}` }}>
        <span style={{ ...mono(9), letterSpacing: ".1em", lineHeight: 1.7, color: CS.faint }}>
          CLAIMS-DERIVED FACTS AND RESOLVED WEB SIGNALS · NOTHING HERE IS RANKED · PROVENANCE AND SOURCE RECORDS LIVE ON THE PROFILE
        </span>
      </div>
    </div>
  );
}

function BandHeader({ band }: { band: Band }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 20px 7px 23px", background: P.band, borderBottom: `1px solid ${P.line}` }}>
      <span style={{ ...mono(9, 500), letterSpacing: ".16em", color: P.ink4 }}>{band.label}</span>
      <span style={{ flex: 1, height: 1, background: P.lineMed }} />
      <span style={{ ...mono(9), letterSpacing: ".1em", color: CANON.INK.MUTE }}>{band.note}</span>
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

  // Territory scope — default SPLIT by cohort (Garrett 2026-08-12, second
  // pass): COM is a practice-based roster and opens on the MSL's territory;
  // EST/RS are NATIONAL ranked leaderboards and open US-wide — a territory
  // default there hides the actual top ranks (#1 Ramalingam practices in
  // Georgia; an NE default would bury him). The selector still overrides all
  // three; switching cohorts resets to the incoming cohort's own default
  // (override stays view-local, per the morning rule).
  const [myTerritory, setMyTerritory] = useState<LedgerScope | null>(null);
  const [scope, setScope] = useState<LedgerScope | null>(null);
  const [territoryResolved, setTerritoryResolved] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await getCurrentUser();
      const ctx = user ? await getUserTerritoryContext(user.id) : null;
      if (!alive) return;
      const mine: LedgerScope | null =
        ctx && ctx.states.length > 0
          ? { key: "mine", label: ctx.territoryLabel ?? "My territory", states: ctx.states, countries: ["US"] }
          : null;
      setMyTerritory(mine);
      setScope(
        cfg.tag === "COM" && mine ? mine : { key: "us:national", label: "United States", states: [], countries: ["US"] },
      );
      setTerritoryResolved(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const applyScope = useCallback(
    (key: string) => {
      setScope(scopeFromKey(key, myTerritory));
    },
    [myTerritory],
  );
  // Cohort switches do NOT remount this component (one route component for all
  // three), so the reset to the incoming cohort's default must be explicit:
  // any override dies with the cohort view it was made in. COM → territory;
  // EST/RS → national (the default split above).
  useEffect(() => {
    if (!territoryResolved) return;
    setScope(
      cfg.tag === "COM" && myTerritory ? myTerritory : { key: "us:national", label: "United States", states: [], countries: ["US"] },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);
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
    if (!scope) return; // territory still resolving — one fetch, no national flash
    setFailed(false);
    setRows([]);
    setMeta(null);
    setHasMore(false);
    setOpen(null);
    loadingMore.current = true;
    // COM re-loads page 0 when the tier filter changes (a different population → a fresh
    // contiguous ranking); EST/RS ignore selectedTiers.
    // States are meaningful ONLY on a US scope — the RPCs return zero rows for a
    // country+state mismatch (e.g. {DE} + {NY}). scopeFromKey already clears states on a
    // European scope; this is the belt-and-braces gate at the call site.
    const statesArg = scopeIncludesUs(scope) ? scope?.states : [];
    const tiersArg = cfg.tag === "COM" ? selectedTiers : undefined;
    Promise.all([loadLedgerMeta(cfg), loadLedgerPage(cfg, 0, LEDGER_PAGE_SIZE, tiersArg, statesArg, scope?.countries)])
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
  }, [cfg, selectedTiers, scope]);

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
    // States are meaningful ONLY on a US scope — the RPCs return zero rows for a
    // country+state mismatch (e.g. {DE} + {NY}). scopeFromKey already clears states on a
    // European scope; this is the belt-and-braces gate at the call site.
    const statesArg = scopeIncludesUs(scope) ? scope?.states : [];
    const tiersArg = cfg.tag === "COM" ? selectedTiers : undefined;
    loadLedgerPage(cfg, afterCursor, LEDGER_PAGE_SIZE, tiersArg, statesArg, scope?.countries)
      .then((page) => {
        setRows((prev) => [...prev, ...page.rows]);
        setHasMore(page.hasMore);
        loadingMore.current = false;
      })
      .catch(() => {
        loadingMore.current = false;
      });
  }, [cfg, hasMore, rows, selectedTiers, scope]);

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
        {/* Search (2026-08-11): no inline bar — the NavBar magnifier is THE
            search on every breakpoint (it mounts with an ambient-TA fallback,
            so it renders here too). The default-visible desktop strip is gone;
            search appears only when the magnifier is clicked. */}
        {/* PeopleNavStrip (2026-07-31): the ledger is the PEOPLE destination, so it carries
            the shipped strip. Cohort row drives /cohorts/ledger/:cohort (one cohort control —
            the old in-page CohortTabs toggle is gone). Filters/territory chips stay suppressed:
            the ledger's own TERRITORY selector (header row) is the scope control
            now that the RPCs take p_states — the strip chip would be a second,
            competing control. Telescope/Landscape/TA/indication controls
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
        <div style={{ padding: "24px 20px 48px", margin: "8px 0 24px", ...DEPTH.PANEL, border: `1px solid ${CANON.LINE.HAIR}`, fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
          {/* Hero — canonical H1 (PageHero, Commit B 2026-08-05): the ledger's
              title leaves the card header for a page hero; the header row keeps
              the cohort tick + the meta line at card scale. */}
          <div style={{ padding: "6px 0 22px" }}>
            <PageHero
              narrow={isMobile}
              // HERO CONTRACT 2026-08-15. Reverses the 2026-08-11 header pattern,
              // which made the COHORT the H1 ("ESTABLISHED" at 52) and pushed the
              // surface name into the eyebrow. Under the title rule the H1 names
              // the SURFACE and everything that varies — cohort, TA — is scope.
              // The practical argument: switching cohorts changed the biggest
              // word on the page, so moving between three views of one board read
              // as moving between three surfaces. The cohort is not lost, and is
              // not only in the eyebrow: the ledger card directly below still
              // carries its tick in cfg.markerColor plus the tag.
              //
              // THE COHORT SEGMENT SURVIVES THE 2026-08-16 SCOPE CUT, alone of the
              // eight. Everywhere else the first segment restated the title one
              // size down; here it does not — "Cohort Ledger" does not say WHICH
              // cohort, and which cohort is the whole difference between three
              // views that are otherwise the same surface. So the rule is not
              // "drop the first segment", it is "drop what the title already
              // says", and on this surface that leaves the cohort standing.
              //
              // It spells out now (ESTABLISHED, not EST) for the same reason the
              // abbreviations went elsewhere: EST read as a truncation artifact.
              // cfg.title.split is the same source the cluster label and the
              // identity mark below already read, so the three agree by
              // construction.
              //
              // AREA DROPS ON NARROW (2026-08-16). Spelling the cohort out put all
              // three over the 310px budget at 386px — ESTABLISHED 333, COMMUNITY
              // 314, RISING STARS 342. Dropping ONCOLOGY costs a flat 102px and
              // brings all three well inside: 231 / 213 / 240, i.e. 79 / 98 / 70
              // of headroom. The lever is the SAME rule that cut the
              // scope segment, applied one level down: drop what is already said.
              // ONCOLOGY is derivable from LUNG CANCER — the area is implied by
              // the indication, so on a phone it is the segment carrying the least
              // that is not already there. It is not a new exception and not a
              // truncation: the string is shorter by a whole segment, chosen, not
              // clipped mid-word. Desktop keeps all three, because desktop has the
              // room and the area is worth stating where it costs nothing.
              //
              // ONLY THE TWO LEDGERS PULL THIS LEVER, because only they carry a
              // cohort segment. The six TA-only surfaces sit at 203px at every
              // width and keep both segments — dropping ONCOLOGY there would
              // leave LUNG CANCER alone, buying nothing and costing the pairing.
              eyebrow={[cfg.title.split(" / ")[0], taLabelForSlug(LEDGER_TA_SLUG), isMobile ? null : "Oncology"].filter(Boolean).join(" · ")}
              meta={`WEEKLY BUILD · AS OF ${formatScoringDate(scoredAt)}`}
              title="Cohort Ledger"
              // The cluster label names the cohort instead of saying "IN COHORT".
              // With the cohort out of the H1 this is the one place it is stated
              // at a legible size, next to the figure it counts. The name is
              // taken from cfg.title, which lost its only consumer when the
              // title rule moved the cohort out of the H1 — so the field earns
              // its keep again rather than sitting dead with a stale "/ NSCLC"
              // half nobody renders.
              stats={cohortTotal ? { variant: "cluster", items: [{ value: cohortTotal.toLocaleString(), label: `${cfg.title.split(" / ")[0]} HCPs`, center: true }] } : undefined}
            />
          </div>
          <div style={{ border: `1px solid ${CANON.LINE.HAIR}`, background: P.card }}>

            {/* header — cohort tick + meta line (title moved to the page hero) */}
            <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 6 : 0, justifyContent: "space-between", padding: isMobile ? "12px 16px" : "14px 20px", borderBottom: `1px solid ${P.lineMed}` }}>
              {/* COHORT IDENTITY MARK (2026-08-15). Was a 3x14 rule beside the
                  3-letter tag at mono 9 — the smallest type on the card, carrying
                  the surface's most important remaining signal after the title
                  rule moved the cohort out of the H1. Now spelled out at 13/600
                  with a 4x22 rule: a step above the 11px meta beside it and well
                  below the 30/52 title, which is the slot it should hold. The
                  eyebrow no longer abbreviates against it (2026-08-16): both
                  read cfg.title.split(" / ")[0], so the gold eyebrow above and
                  this mark in the cohort's own colour say the same word.
                  Tracking eases .14em -> .11em: wide tracking at 9px reads as
                  deliberate, at 13px it reads as loose. */}
              <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ width: 4, height: 22, background: cfg.markerColor }} />
                <span style={{ ...mono(13, 600), color: cfg.markerColor, letterSpacing: ".11em" }}>{cfg.title.split(" / ")[0]}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ ...mono(11), color: P.ink5, letterSpacing: ".1em", textWrap: "pretty" }}>{metaLine}</span>
                {/* Territory scope (Commit 2): the selector IS the control and the
                    label — counts, chips and rows all reslice server-side. */}
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ ...mono(9, 500), color: P.ink4, letterSpacing: ".14em" }}>TERRITORY</span>
                  <TerritorySelect
                    nodes={ledgerTerritoryTree(cfg.tag)}
                    value={scope?.key ?? "us:national"}
                    onChange={applyScope}
                    mine={myTerritory ? { key: "mine", label: myTerritory.label } : null}
                    mono={mono}
                    palette={P}
                  />
                </label>
              </span>
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
                        <span style={{ ...mono(9, 500), letterSpacing: ".16em", color: P.ink4 }}>RANKED</span>
                        <span style={{ flex: 1, height: 1, background: P.lineMed }} />
                        <span style={{ ...mono(9), letterSpacing: ".1em", color: CANON.INK.MUTE }}>
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
                      <div style={{ padding: "12px 23px", ...mono(11), color: P.ink5, letterSpacing: ".08em", borderTop: `1px solid ${P.line}` }}>
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
                <div key={i} style={{ ...mono(11), lineHeight: 1.75, color: CANON.INK.MUTE, letterSpacing: ".04em" }}>{n}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
