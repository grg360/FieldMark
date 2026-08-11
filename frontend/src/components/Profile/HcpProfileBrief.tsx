import { useMediaQuery } from "../../lib/useMediaQuery";
// HCP Profile redesign — direction 1a "Brief", stage 1. Route: /hcp/:id/brief (alongside
// the existing DetailScreen, not replacing it). Source of form: Design "HCP Profile Build
// Reference" 1a. Source of fact: live data only (hcpProfile.ts / hcp_profile_brief RPC).
// Composed frame elements render their honest empty/withheld state per Design's render
// "ladder" thresholds. Inherits the cohort ledger's visual language verbatim: same score
// columns/labels, em-dash at ceiling, amber for rank figures only, sage cohort marker,
// serif-over-mono, OPEN ↗ trace links, review-before-use disclaimer.

import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import AppLayout from "../AppLayout";
import { FONT, GROUND, LINE, GOLD, COOL } from "../../lib/designTokens";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { floorFixed } from "../../lib/cohortLedger";
import { institutionToSlug } from "../../lib/institutionUtils";
import { fetchHcpThemes, getEstablishedScoreBreakdown, type TopCollaborator } from "../../lib/api";
import type { ResearchTheme } from "../../types/researchTheme";
import FieldInsights from "../FieldInsights/FieldInsights";
import MiniCollaboratorNetwork from "../MiniCollaboratorNetwork";
import AdministeredVolumeBlock from "./AdministeredVolumeBlock";
import ProfileRelationshipControls, { profileHcp } from "./ProfileRelationshipControls";
import ProfileSecondaryControls from "./ProfileSecondaryControls";
import {
  loadHcpProfile,
  loadFieldPresence,
  positionCount,
  renderSynthesis,
  money,
  roleLabel,
  journalShort,
  timelineAxisFloor,
  type HcpProfile,
  type FieldNote,
  type ProfilePosition,
  type ProfileSource,
} from "../../lib/hcpProfile";
import FederalFundingSection from "./FederalFundingSection";
import { FiToast } from "../FieldIntelligenceShared";

// Ledger palette, verbatim (self-contained visual system per the Build Reference).
// Register tokens substituted 2026-08-05 for exact value matches only (card,
// band, amber, ink0–3 → COOL). page/head/drawer and the ink4–6/dash greys
// are near-twins of GROUND/COOL (one digit off) — converging them is a visible
// change, deferred. sage/teal are cohort semantics; alpha hairlines stay per frame.
// ink1 carries COOL.ui since the 2026-08-05 consolidation (#e7e8e9 retired, Δ1.02).
const P = {
  page: "#08090A",
  card: GROUND.g1, // g1 well inside the g2 board (Commit C)
  head: "#0B0D10",
  band: GROUND.g1,
  drawer: "#0A0C0F",
  line: "rgba(255,255,255,.06)",
  lineMed: "rgba(255,255,255,.09)",
  lineStrong: "rgba(255,255,255,.14)",
  amber: GOLD.rank,
  sage: "#6E8F76", // Established cohort marker
  ink0: COOL.ui,
  ink1: COOL.ui,
  ink2: COOL.prose,
  ink3: COOL.muted,
  ink4: "#8F959A",
  ink5: "#7C8288",
  ink6: "#63696E",
  dash: "#71787E",
  teal: "#7FB3BB",
} as const;

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px ${FONT.mono}` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px ${FONT.serif}` } as const);

function SectionHead({ id, tag, count, sub }: { id: string; tag: string; count?: string; sub?: string }) {
  // Mobile (2026-08-10): the descriptor drops BELOW the label as a full-width
  // line — as a right column at 390px it squeezed into a 3-4 row sliver.
  const isMobile = useMediaQuery("(max-width: 767px)");
  if (isMobile) {
    return (
      <div id={id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 0 12px", scrollMarginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ width: 3, height: 13, background: P.sage, flexShrink: 0 }} />
          <span style={{ ...mono(11, 600), letterSpacing: ".16em", color: P.ink1 }}>{tag}</span>
          {count ? <span style={{ ...mono(10, 500), letterSpacing: ".1em", color: P.ink4 }}>{count}</span> : null}
        </div>
        {sub ? <span style={{ ...mono(9, 500), letterSpacing: ".12em", color: P.ink6, lineHeight: 1.6 }}>{sub}</span> : null}
      </div>
    );
  }
  return (
    <div id={id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 0 12px", scrollMarginTop: 16 }}>
      <span style={{ width: 3, height: 13, background: P.sage }} />
      <span style={{ ...mono(11, 600), letterSpacing: ".16em", color: P.ink1 }}>{tag}</span>
      {count ? <span style={{ ...mono(10, 500), letterSpacing: ".1em", color: P.ink4 }}>{count}</span> : null}
      {sub ? <span style={{ flex: 1, ...mono(9, 500), letterSpacing: ".12em", color: P.ink6, textAlign: "right" }}>{sub}</span> : null}
    </div>
  );
}

// A withheld/empty card — the honest state. Design: empty commercial/field sections must
// say "an absence in the record, not evidence no relationship exists."
function Withheld({ head, title, body, foot }: { head: string; title: string; body: string; foot?: string }) {
  return (
    <div style={{ border: `1px solid ${P.line}`, background: P.band, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink5 }}>{head}</span>
      <span style={{ ...serif(15, 500), color: P.ink2, lineHeight: 1.4 }}>{title}</span>
      <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>{body}</span>
      {foot ? <span style={{ ...mono(9, 500), letterSpacing: ".1em", color: P.ink6, paddingTop: 2 }}>{foot}</span> : null}
    </div>
  );
}

// Score cell in the ledger's treatment. CEILING SUPPRESSION REMOVED 2026-07-31 (same
// change as the ledger's cellDisplay): scores print as stored — the 3-point window on a
// top-compressed percentile distribution dashed every head value as "— AT CEILING".
// Composite figures (decimals set) FLOOR rather than round, matching the card feed's
// formatScoreFloor1 so the same cohort_score reads identically on all three surfaces.
function ScoreCell({ label, sub, value, basis, noRank, absent, decimals }: {
  label: string; sub: string; value: number | null; basis?: string; noRank?: boolean; absent?: string; decimals?: number;
}) {
  let text: string;
  if (value == null || (noRank && value <= 0)) {
    text = absent ?? "—";
  } else {
    text = decimals != null ? floorFixed(value, decimals) : String(Math.round(value));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 92 }}>
      <span style={{ ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>{label}<br /><span style={{ color: P.ink5 }}>{sub}</span></span>
      <span style={{ ...mono(22, 500), color: noRank ? P.ink3 : P.ink0, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{text}</span>
      <span style={{ ...mono(8.5, 500), letterSpacing: ".1em", color: P.ink6 }}>{noRank ? "EXCLUDED FROM RANK" : basis ?? ""}</span>
    </div>
  );
}

function EvidenceRail({ sources, count }: { sources: ProfileSource[] | null; count: number }) {
  // real per-position source COUNT always renders; individual rows render only when real.
  if (!sources || sources.length === 0) {
    return <span style={{ ...mono(9.5, 500), letterSpacing: ".08em", color: P.ink5 }}>{count} SOURCE{count === 1 ? "" : "S"} · SHOW SOURCES</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {/* The ROW is the link (2026-08-10): the old trailing "OPEN ↗" was the
          only affordance and floated to a different x per row (ragged arrows).
          The journal·year carries the teal underline as the visible affordance;
          rows without a DOI render inert, exactly as before. RULED (Garrett,
          same day): the full-row click target STAYS — a generous tap target,
          especially on mobile; the desktop pointer-over-empty-space is a
          trivial cosmetic cost and nothing else in the row competes for the
          click. Do not confine the link to the title text. */}
      {sources.slice(0, 4).map((s, i) => {
        const inner = (
          <>
            <span style={{ ...mono(9.5, 500), letterSpacing: ".06em", color: s.doi ? P.teal : P.ink3, borderBottom: s.doi ? `1px solid rgba(127,179,187,.3)` : "none" }}>{journalShort(s.journal)} {s.pub_year ?? ""}</span>
            {s.author_role ? <span style={{ ...mono(8.5, 500), letterSpacing: ".08em", color: P.ink5 }}>{roleLabel(s.author_role)}</span> : null}
            {s.citation_count != null ? <span style={{ ...mono(8.5), color: P.ink6 }}>{s.citation_count} CIT</span> : null}
          </>
        );
        return s.doi ? (
          <a key={i} href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer" title="Open the source (DOI)" style={{ display: "flex", alignItems: "baseline", gap: 8, textDecoration: "none" }}>
            {inner}
          </a>
        ) : (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>{inner}</div>
        );
      })}
      {sources.length > 4 ? <span style={{ ...mono(8.5), color: P.ink6 }}>+ {sources.length - 4} MORE</span> : null}
    </div>
  );
}

function PositionCard({ pos, sourceRows }: { pos: ProfilePosition; sourceRows: ProfileSource[] | null }) {
  const single = (pos.paper_count ?? 0) <= 1;
  const years = (pos.sources ?? []).map((s) => s.pub_year).filter((y): y is number => y != null);
  // Same axis-floor guard as the career timeline: an ancient mis-linked source year
  // must not stretch this position's "SOURCED" range. Latent today (no position
  // sources a pre-2001 pub) but the fragility is identical, so route it through too.
  const loYear = years.length ? timelineAxisFloor(years) : null;
  const hiYear = years.length ? Math.max(...years) : null;
  const yr = loYear == null ? "" : loYear === hiYear ? `${loYear}` : `${loYear}–${hiYear}`;
  // BASIS must agree with the EVIDENCE rail beneath it. The rail is drawn from
  // sourceRows (the RPC's ≤5-position sample → distinct pubs); BASIS states that
  // same count. When the theme's full supporting_paper_count exceeds the sample,
  // the partiality is made legible ("SAMPLE OF M") rather than implied, with
  // ALL POSITIONS ↗ (header) as the uncapped route.
  const railPubs = sourceRows?.length ?? 0;
  const fullPapers = pos.paper_count ?? railPubs;
  const basisN = railPubs || fullPapers;
  return (
    <div
      // Scroll anchor a field insight's belief_claim_key deep-links to
      // (InsightCard's goToClaim → getElementById(`claim-<key>`)). scrollMarginTop
      // keeps the landed claim clear of the sticky chrome.
      id={pos.claim_key ? `claim-${pos.claim_key}` : undefined}
      style={{ borderTop: `1px solid ${P.line}`, padding: "14px 0", display: "flex", flexDirection: "column", gap: 8, scrollMarginTop: 96 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...serif(16, 600), color: P.ink0 }}>{pos.theme}</span>
        {single ? <span style={{ ...mono(8, 600), letterSpacing: ".12em", color: P.amber, padding: "1px 6px", border: `1px solid rgba(224,167,94,.4)` }}>SINGLE SOURCE</span> : null}
        {pos.confidence != null ? <span style={{ ...mono(8.5, 500), letterSpacing: ".08em", color: P.ink5 }}>CONF {pos.confidence.toFixed(2)}</span> : null}
      </div>
      <span style={{ ...serif(13.5), color: P.ink3, lineHeight: 1.55, textWrap: "pretty", display: "block" }}>{pos.summary}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", ...mono(9, 500), letterSpacing: ".08em", color: P.ink5 }}>
        <span>BASIS {basisN} PUBLICATION{basisN === 1 ? "" : "S"}{fullPapers > basisN && basisN > 0 ? ` · SAMPLE OF ${fullPapers}` : ""}</span>
        {yr ? <span>SOURCED {yr}</span> : null}
      </div>
      {/* EVIDENCE only — the FIELD CORROBORATION and MOVEMENT columns were string
          literals (0 reactions, no prior state), not queries, and are removed. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
        <span style={{ ...mono(8.5, 600), letterSpacing: ".14em", color: P.ink6 }}>EVIDENCE{fullPapers > basisN ? " · SAMPLE, ALL POSITIONS ↗ FOR THE FULL SET" : ""}</span>
        <EvidenceRail sources={sourceRows} count={basisN} />
      </div>
    </div>
  );
}

export default function HcpProfileBrief() {
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint - 2026-08-10 profile mobile pass
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [p, setP] = useState<HcpProfile | null>(null);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [collaborators, setCollaborators] = useState<TopCollaborator[]>([]);
  const [themes, setThemes] = useState<ResearchTheme[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    // ledger_meta ceilings fetch removed with ceiling suppression (2026-07-31) — the
    // compiler forbids the dead wiring (noUnusedLocals); the ledger's own ceiling
    // machinery in cohortLedger.ts is untouched.
    Promise.all([
      loadHcpProfile(id),
      loadFieldPresence(id),
      fetchHcpThemes(id),
    ]).then(([prof, fn, th]) => {
      if (!alive) return;
      setP(prof);
      setNotes(fn);
      setThemes(th.data ?? []);
      setLoading(false);
    }).catch(() => alive && setLoading(false));
    // collaborator network — same source DetailScreen uses (established score breakdown).
    // DEFECT FIX: getEstablishedScoreBreakdown requires (hcpId, taSlug); it was called with
    // one arg, so the breakdown never resolved and the collaborator rail loaded nothing.
    getEstablishedScoreBreakdown(id, "nsclc").then((b) => alive && setCollaborators(b?.top_collaborators ?? [])).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  // honor a #hash on arrival (e.g. #belief-profile deep-links) once content is laid out
  useEffect(() => {
    if (loading || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, location.hash]);

  const isDesktop = useIsDesktop();

  if (loading) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>Loading profile…</div></Shell>;
  if (!p || !p.hcp?.name) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>This profile could not be loaded.</div></Shell>;

  const s = p.scores;
  const nPos = positionCount(p);
  const hasSynthPara = renderSynthesis(p);
  // Belief-profile counterweight: the position mix by category — the shape the
  // prose can't show at a glance ("what kind of expert"), genuinely new next to
  // the count already in the section head. Aggregated from the synthesis tiers,
  // falling back to the raw single-source positions on the thin path.
  const catMix = (() => {
    const counts = new Map<string, number>();
    const add = (c?: string | null) => { const k = (c ?? "").trim(); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); };
    for (const t of p.belief.tiers ?? []) for (const pos of t.positions ?? []) for (const c of pos.categories ?? []) add(c);
    if (counts.size === 0) for (const rp of p.belief.raw_positions ?? []) add(rp.category);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();
  const loc = [p.hcp.city, p.hcp.state].filter(Boolean).join(", ");

  return (
    <Shell>
      <div style={{ padding: "20px 24px 48px", display: "flex", flexDirection: "column", gap: 26 }}>
        {/* breadcrumb + section spine */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, ...mono(9.5, 500), letterSpacing: ".1em", color: P.ink5 }}>
            <span style={{ width: 3, height: 12, background: P.sage }} />
            <span style={{ color: P.sage }}>EST</span>
            <span style={{ color: P.ink3 }}>ESTABLISHED / NSCLC</span>
            <span>›</span>
            <span>RANK {s?.rank ?? "—"} US</span>
            <span>›</span>
            <Link to="/cohorts/ledger/established" style={{ color: P.teal, textDecoration: "none" }}>↑ BACK TO LEDGER</Link>
          </div>
          {/* section spine — frame order: orientation/operational first, belief payoff last */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", ...mono(9, 500), letterSpacing: ".1em", color: P.ink6 }}>
            {[["SIGNAL", "signal"], ["RELATIONSHIP", "relationship"], ["CONTROLS", "contact"], [`FIELD ${notes.length}`, "field"], ["RECORD", "record"], ["BRIEF", "brief"], [`BELIEF ${nPos}`, "belief-profile"], ...(themes.length ? [["RESEARCH", "themes"] as [string, string]] : [])].map(([t, a]) => (
              <a key={a} href={`#${a}`} style={{ color: P.ink5, textDecoration: "none" }}>{t}</a>
            ))}
          </div>
        </div>

        {/* header + score band (ledger treatment) */}
        <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: P.sage }} />
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4, borderBottom: `1px solid ${P.line}`, ...(isMobile ? { alignItems: "center", textAlign: "center" as const } : {}) }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", justifyContent: isMobile ? "center" : "flex-start" }}>
              <span style={{ ...mono(34, 500), color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s?.index != null ? floorFixed(s.index, 1) : "—"}</span>
              <span style={{ ...mono(9.5, 500), letterSpacing: ".1em", color: P.ink5 }}>INDEX · RANK {s?.rank ?? "—"} US · #{s?.global_rank ?? "—"} GLOBAL</span>
            </div>
            <span style={{ ...serif(30, 400), color: P.ink0, letterSpacing: "-.01em", paddingTop: 4 }}>{p.hcp.name}</span>
            <span style={{ ...mono(11), color: P.ink4, letterSpacing: ".02em" }}>
              {p.hcp.institution ? (
                <a href={`/institution/${institutionToSlug(p.hcp.institution)}`}
                   onClick={(e) => { e.preventDefault(); navigate(`/institution/${institutionToSlug(p.hcp.institution!)}`); }}
                   style={{ color: P.teal, textDecoration: "none", borderBottom: `1px solid rgba(127,179,187,.3)` }}>{p.hcp.institution}</a>
              ) : null}
              {p.hcp.institution && loc ? " · " : ""}{loc}
            </span>
            <span style={{ ...mono(9.5, 500), letterSpacing: ".08em", color: P.ink6 }}>
              {p.hcp.npi ? (
                <a href={`https://npiregistry.cms.hhs.gov/provider-view/${p.hcp.npi}`} target="_blank" rel="noopener noreferrer"
                   style={{ color: P.teal, textDecoration: "none", borderBottom: `1px solid rgba(127,179,187,.3)` }}>NPI {p.hcp.npi} ↗</a>
              ) : null}{p.hcp.specialty ? ` · ${p.hcp.specialty.toUpperCase()}` : ""} · VERIFIED NPI REGISTRY
            </span>
            {/* nav parity — Generate Brief + full-page publications / positions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 8, justifyContent: isMobile ? "center" : "flex-start" }}>
              <button onClick={() => navigate(`/hcp/${p.hcp.id}/brief`)} title="Generate a pre-meeting brief"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", background: "none", border: `1px solid rgba(224,167,94,.5)`, cursor: "pointer", ...mono(10, 600), letterSpacing: ".08em", color: P.amber, borderRadius: 2 }}>✦ GENERATE BRIEF</button>
              <button onClick={() => navigate(`/hcp/${p.hcp.id}/publications`, { state: { taId: undefined } })} title="All publications"
                style={{ padding: "7px 13px", background: "none", border: `1px solid ${P.lineStrong}`, cursor: "pointer", ...mono(10, 500), letterSpacing: ".08em", color: P.ink3, borderRadius: 2 }}>ALL PUBLICATIONS ↗</button>
              <button onClick={() => navigate(`/hcp/${p.hcp.id}/positions`)} title="Full positions page"
                style={{ padding: "7px 13px", background: "none", border: `1px solid ${P.lineStrong}`, cursor: "pointer", ...mono(10, 500), letterSpacing: ".08em", color: P.ink3, borderRadius: 2 }}>ALL POSITIONS ↗</button>
            </div>
          </div>
          <div style={{ padding: "16px 24px", display: "flex", gap: isMobile ? "16px 28px" : 36, flexWrap: "wrap", alignItems: "flex-start", justifyContent: isMobile ? "center" : "flex-start", textAlign: isMobile ? ("center" as const) : undefined }}>
            <ScoreCell label="INDEX" sub="IN COHORT" value={s?.index ?? null} decimals={1} basis={s?.vs_cohort_mean != null ? `${s.vs_cohort_mean > 0 ? "+" : ""}${s.vs_cohort_mean} VS COHORT MEAN` : ""} />
            <ScoreCell label="SCI" sub="CEILING" value={s?.sci ?? null} decimals={1} basis={s?.basis_senior != null ? `${s.basis_senior} SENIOR PUBS` : ""} />
            <ScoreCell label="NET" sub="CEILING" value={s?.net ?? null} decimals={1} basis={s?.basis_papers != null ? `${s.basis_papers} PAPERS` : ""} />
            <ScoreCell label="PHARMA" sub="NOT RANKED" value={s?.pharma ?? null} decimals={1} noRank absent="NO DISCLOSURES ON RECORD" />
          </div>
          {/* Identity footer strip (frame): distinct publications, positions, themes,
              field insights — the record's real footprint. The old line counted
              "SOURCES" as raw position-statements (mislabeled); publications is the
              honest depth figure. THIN when the distinct-publication basis is small. */}
          <div style={{ padding: "0 24px 14px", ...mono(9, 500), letterSpacing: ".08em", color: P.ink6, textAlign: isMobile ? ("center" as const) : undefined }}>
            {p.record.publications_total ?? "—"} PUBLICATION{p.record.publications_total === 1 ? "" : "S"}{p.record_depth.papers < 12 ? " · THIN SOURCED RECORD" : ""} · {nPos} POSITION{nPos === 1 ? "" : "S"} · {themes.length} THEME{themes.length === 1 ? "" : "S"} · {notes.length} FIELD INSIGHT{notes.length === 1 ? "" : "S"}{p.record_depth.oldest ? ` · OLDEST SOURCE ${p.record_depth.oldest}` : ""}
          </div>
        </div>

        {/* ── SIGNAL SUMMARY — who is this (orientation, top) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="signal" tag="SIGNAL SUMMARY" count="WHO IS THIS" sub="GENERATED SYNTHESIS" />
          {p.signal_summary ? (
            /* Single column (2026-08-07): the 74ch prose + 216px stamp left ~500px
               of dead field between them and read as broken. Prose runs the
               container at a 90ch measure; the provenance stamp folds to one mono
               caveat line beneath, the way caveat lines render everywhere else. */
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px" }}>
              <span style={{ ...serif(15, 400), color: P.ink2, lineHeight: 1.6, textWrap: "pretty", display: "block" }}>{p.signal_summary}</span>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${P.line}`, ...mono(9, 500), letterSpacing: ".08em", color: P.ink6, lineHeight: 1.7 }}>
                GENERATED SYNTHESIS · DATA RUN {p.signal_summary_generated_at ? p.signal_summary_generated_at.slice(0, 10) : "UNSTAMPED"} · READS {p.record_depth.sources ?? 0} SOURCE{p.record_depth.sources === 1 ? "" : "S"} · {p.record_depth.papers ?? 0} PAPER{p.record_depth.papers === 1 ? "" : "S"} · PROMPT {p.signal_summary_version ? p.signal_summary_version.toUpperCase() : "UNVERSIONED"} · REVIEW BEFORE USE · NO CLINICAL CLAIM
              </div>
            </div>
          ) : (
            <Withheld head="SIGNAL SUMMARY · WITHHELD" title="No generated synthesis for this HCP yet." body="The synthesis is generated over the sourced record. None is on file for this HCP in NSCLC." />
          )}
        </div>

        {/* ── RELATIONSHIP + CONTACT & CONTROLS — paired workspace controls (frame:
            two equal columns, RELATIONSHIP left, stretched to identical height;
            stacks to one column on mobile) ── */}
        <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: 20, alignItems: "stretch" }}>
          {/* ── RELATIONSHIP ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead id="relationship" tag="RELATIONSHIP" count="TRACK · STATUS · FOLLOW-UPS" sub="SYNCS WITH THE LEDGER" />
            <div style={{ flex: 1, border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 20px" }}>
              <ProfileRelationshipControls hcpId={p.hcp.id} hcpName={p.hcp.name} specialty={p.hcp.specialty} />
            </div>
          </div>

          {/* ── CONTACT & CONTROLS ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead id="contact" tag="CONTACT & CONTROLS" sub="ACCESS · FIELD REVIEW · REPORT · OPT-OUT" />
            <div style={{ flex: 1, border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 20px" }}>
              <ProfileSecondaryControls hcpId={p.hcp.id} hcpName={p.hcp.name} specialty={p.hcp.specialty} />
            </div>
          </div>
        </div>

        {/* ── FIELD INSIGHTS — single header (was doubled FIELD PRESENCE / FIELD INSIGHTS);
            ledger-register cards via the variant prop. Content + capture function preserved
            by the shared component; community passes no variant so it is unchanged. ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="field" tag="FIELD INSIGHTS" count={`${notes.length} CAPTURED · MSL-ENTERED`} sub="TEAM OBSERVATION · NEVER A SCORED POSITION" />
          {/* Deep-link into the full Field Insights surface, scoped to this HCP —
              the surface is otherwise reachable only from a below-the-fold Home link. */}
          {notes.length > 0 ? (
            <Link to={`/me/insights?hcp=${p.hcp.id}`} style={{ ...mono(9.5, 500), letterSpacing: ".12em", color: P.ink4, textDecoration: "none", borderBottom: `1px solid ${P.lineStrong}`, alignSelf: "flex-start" }}>
              ALL FIELD INSIGHTS ON {p.hcp.name.toUpperCase()} ↗
            </Link>
          ) : null}
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
            <FieldInsights hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} variant="ledger" hideHeader />
          </div>
        </div>

        {/* ── THE RECORD ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="record" tag="THE RECORD" count={`${p.record.publications_total ?? ""} SOURCES`} sub="SCIENTIFIC AND COMMERCIAL FOOTPRINT AT EQUAL WEIGHT" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
            {/* stats */}
            {/* stat cells center label over numeral (The Record v2 frame) */}
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[["PUBLICATIONS", p.record.publications_total], ["SENIOR AUTHOR", p.record.senior_pub_count], ["SENIOR 5YR", p.record.senior_recent_5yr], ["GUIDELINES", p.record.guideline_count]].map(([l, v]) => (
                <div key={l as string} style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", textAlign: "center" }}>
                  <span style={{ ...mono(9, 500), letterSpacing: ".12em", color: P.ink6 }}>{l}</span>
                  <span style={{ ...mono(20, 500), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>{v ?? "—"}</span>
                </div>
              ))}
            </div>
            {/* timeline — click a year to open its per-year bibliography (same as DetailScreen) */}
            {p.record.timeline && p.record.timeline.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>PUBLICATION TIMELINE · CLICK A YEAR</span>
                {/* A year click navigates to the redesigned publications surface (URL
                    changes to ?year=), not an in-route state overlay — so the year view
                    is reachable, linkable, and browser-back returns to the profile. */}
                <Timeline data={p.record.timeline} onYearPress={(y) => navigate(`/hcp/${p.hcp.id}/publications?year=${y}`)} />
              </div>
            ) : null}
            {/* THE RECORD recompose (The Record v2 frame, approved 2026-08-10):
                two hairline-topped pairs with a center rule — Pharma | Engagement
                Mix, then Federal Funding | Top Collaborators. The frame's warm
                demo palette and JetBrains Mono are re-inked to the app register
                (cool hairlines, IBM Plex, existing P inks). Mobile stacks each
                pair (left, rule, right). */}
            <RecordPair
              left={
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>PHARMA ENGAGEMENT · OPEN PAYMENTS · EXCLUDED FROM RANK</span>
                  {p.record.pharma_companies && p.record.pharma_companies.length ? (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {p.record.pharma_companies.map((c, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 14, alignItems: "baseline", padding: "9px 0 10px", borderBottom: `1px solid ${P.line}` }}>
                          <span style={{ ...mono(10), color: P.ink6, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</span>
                          <span style={{ ...mono(10.5), color: P.ink3, letterSpacing: ".04em", minWidth: 0, overflowWrap: "anywhere" }}>
                            {c.name.toUpperCase()} <span style={{ color: P.ink6 }}>{c.count} PAYMENTS</span>
                          </span>
                          <span style={{ ...mono(14, 500), color: P.ink1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.5 }}>No disclosed payments in the record. This is an absence in the open-payments record. It is not evidence that no relationship exists.</span>
                  )}
                </div>
              }
              right={(() => {
                const mix = p.record.engagement_mix ?? {};
                const hasMix = Object.values(mix).some((v) => (Number(v) || 0) > 0);
                return hasMix ? <EngagementMixDonut mix={mix} /> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>ENGAGEMENT MIX · 3YR</span>
                    <span style={{ ...serif(12.5), color: P.ink5, lineHeight: 1.5 }}>No categorized payments in the 3-year window.</span>
                  </div>
                );
              })()}
            />
            <RecordPair
              left={
                /* federal funding — NIH RePORTER display facts; displayed, never
                   ranked — state (rich/sparse) derives from the HCP's data */
                <FederalFundingSection hcpId={p.hcp.id} />
              }
              right={
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>TOP COLLABORATORS</span>
                  {collaborators.length ? (
                    <MiniCollaboratorNetwork hcpName={p.hcp.name} hcpId={p.hcp.id} collaborators={collaborators} />
                  ) : (
                    <span style={{ ...serif(12.5), color: P.ink5, lineHeight: 1.5 }}>No co-authorship network on record for this HCP.</span>
                  )}
                </div>
              }
            />
          </div>
        </div>

        {/* ── MEDICARE ADMINISTERED THERAPY — self-contained block (own header +
             absence states), as on Community/PracticeFirst. The former outer
             "ADMINISTERED VOLUME · NSCLC CODE SET" SectionHead was retired
             2026-08-10 (Option A): it asserted the tumour-type attribution the
             2026-08-04 block rewrite removed, and its "treats at scale" question
             read an empty state as an answer Part B cannot give. ── */}
        <AdministeredVolumeBlock hcpId={p.hcp.id} taSlug="nsclc" withholdSeam />

        {/* THE BRIEF section removed (2026-08-03, per Design): the frame drops it in
            both populated and sparse. Its three cards were WHAT CHANGED and WHERE
            SILENT (permanently withheld literals) plus a TOP SOURCED POSITION /
            TOP RESEARCH THEME hero that only re-rendered the top-tier position
            (shown in full under BELIEF PROFILE below) or the first research theme
            (shown under RESEARCH INVOLVEMENT). No fact is lost. */}

        {/* BELIEF PROFILE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* DEFECT FIX: header paired a synthesis-layer theme count (nPos) against a
              raw position-statement count labelled SOURCES (record_depth.sources = 49
              for Heymach). The true distinct-publication footprint is record_depth.papers
              (10). Relabel to PUBLICATIONS so the header agrees with the per-card BASIS. */}
          <SectionHead id="belief-profile" tag="BELIEF PROFILE" count={`${nPos} POSITION${nPos === 1 ? "" : "S"} · ${p.record_depth.papers} PUBLICATION${p.record_depth.papers === 1 ? "" : "S"} · ALL PUBLISHED`} sub="POSITIONS DESCRIBE THE PUBLISHED WORK · NOT THE PERSON" />
          {/* A section that shows a subset offers the full set — same principle as
              FIELD INSIGHTS → /me/insights. The header ALL POSITIONS button and this
              are both routes to the full positions page; the section-level link is the
              one a reader in the positions finds. */}
          {nPos > 0 ? (
            <Link to={`/hcp/${p.hcp.id}/positions`} style={{ ...mono(9.5, 500), letterSpacing: ".12em", color: P.ink4, textDecoration: "none", borderBottom: `1px solid ${P.lineStrong}`, alignSelf: "flex-start" }}>
              ALL {nPos} POSITION{nPos === 1 ? "" : "S"} ↗
            </Link>
          ) : null}
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px" }}>
            {/* synthesis paragraph (or withheld state) at a measure, with the
                category mix as the right-field counterweight — the shape the prose
                can't show at a glance. Only rendered when positions exist. */}
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: "min(300px, 100%)" }}>
                {hasSynthPara ? (
                  <div style={{ ...serif(15, 400), color: P.ink2, lineHeight: 1.6, textWrap: "pretty", paddingBottom: 6 }}>{p.belief.headline}</div>
                ) : nPos > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 10 }}>
                    <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink5 }}>NO SYNTHESIS AT THIS DEPTH</span>
                    <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.55, textWrap: "pretty", display: "block" }}>The one-paragraph characterisation is generated from the shape of a record — the tiers, the recurrences, the throughline. {nPos} position{nPos === 1 ? "" : "s"} {nPos === 1 ? "has" : "have"} no shape. The positions themselves are below, unsummarised.</span>
                  </div>
                ) : null}
              </div>
              {catMix.length ? (
                <div style={{ width: 216, maxWidth: "100%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                  <span style={{ ...mono(9, 600), letterSpacing: ".16em", color: P.ink5 }}>BY CATEGORY</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {catMix.map(([cat, n]) => (
                      <div key={cat} style={{ display: "flex", justifyContent: "space-between", gap: 12, ...mono(9.5, 500), letterSpacing: ".08em", color: P.ink4 }}>
                        <span>{cat.replace(/_/g, " ").toUpperCase()}</span>
                        <span style={{ color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{n}</span>
                      </div>
                    ))}
                  </div>
                  <span style={{ ...mono(8.5, 500), letterSpacing: ".08em", color: P.ink6, paddingTop: 2 }}>
                    {p.record_depth.papers ?? 0} PUBLICATION{p.record_depth.papers === 1 ? "" : "S"}{p.record_depth.oldest && p.record_depth.newest ? ` · ${p.record_depth.oldest}–${p.record_depth.newest}` : ""}
                  </span>
                </div>
              ) : null}
            </div>

            {/* positions: synthesized tiers, else raw single-source cards, else empty */}
            {p.belief.tiers && p.belief.tiers.some((t) => t.positions && t.positions.length) ? (
              p.belief.tiers.filter((t) => t.positions && t.positions.length).map((t) => (
                <div key={t.key} style={{ paddingTop: 12 }}>
                  <span style={{ ...mono(9.5, 600), letterSpacing: ".14em", color: P.ink4 }}>{t.label} <span style={{ color: P.ink6 }}>{t.positions!.length}</span></span>
                  {t.positions!.map((pos, i) => (
                    <PositionCard key={i} pos={pos} sourceRows={pos.sources} />
                  ))}
                </div>
              ))
            ) : p.belief.raw_positions && p.belief.raw_positions.length ? (
              <div style={{ paddingTop: 6 }}>
                <span style={{ ...mono(9.5, 600), letterSpacing: ".14em", color: P.ink4 }}>SOURCED · BELOW TIER THRESHOLD <span style={{ color: P.ink6 }}>{p.belief.raw_positions.length}</span></span>
                {p.belief.raw_positions.map((r, i) => (
                  <div key={i} style={{ borderTop: `1px solid ${P.line}`, padding: "13px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ ...serif(15, 600), color: P.ink0 }}>{r.text}</span>
                      <span style={{ ...mono(8, 600), letterSpacing: ".12em", color: P.amber, padding: "1px 6px", border: `1px solid rgba(224,167,94,.4)` }}>SINGLE SOURCE</span>
                    </div>
                    {r.excerpt ? <span style={{ ...serif(12.5), color: P.ink4, lineHeight: 1.5, textWrap: "pretty" }}>{r.excerpt}</span> : null}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, ...mono(9), letterSpacing: ".06em", color: P.ink5 }}>
                      <span>{roleLabel(r.role)}</span><span>{r.year}</span>
                      {/* journal·year IS the link — the "OPEN ↗" suffix dropped 2026-08-10 (row-alignment pass) */}
                      {r.source?.doi ? <a href={`https://doi.org/${r.source.doi}`} target="_blank" rel="noreferrer" title="Open the source (DOI)" style={{ color: P.teal, textDecoration: "none", borderBottom: `1px solid rgba(127,179,187,.3)` }}>{journalShort(r.source.journal)} {r.source.year}</a> : null}
                    </div>
                  </div>
                ))}
                <div style={{ ...mono(9), lineHeight: 1.6, color: P.ink6, letterSpacing: ".04em", paddingTop: 12, borderTop: `1px solid ${P.line}`, marginTop: 6 }}>
                  NO POSITIONS REACHED A TIER. TIERS NEED A PATTERN — A CLAIM RECURRING ACROSS VENUES, CORROBORATED IN THE FIELD — WHICH THIS RECORD CANNOT ESTABLISH. EMPTY TIERS ARE NOT DRAWN.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink5 }}>NO SOURCED POSITIONS</span>
                <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>
                  Nothing has been extracted from the published record for this HCP in NSCLC. This is an absence in the record, not evidence that no position exists — the score band above is comparable cohort-wide regardless.
                  {themes.length ? " Publication-derived research involvement is below — a broader, any-authorship signal that shows where the work is without asserting a stance." : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RESEARCH INVOLVEMENT — hcp_research_themes_v2, the second tier of the two-tier
            model. Positions above ASSERT a stance (leadership-authored, advocacy tier);
            themes show INVOLVEMENT (any authorship) and must never read as "advocates
            for". Data-gated: absent entirely when the HCP has no ranked themes.
            NOTE: no Design frame exists for this section — treatment is a minimal
            adaptation of this profile's ledger register, pending a frame. */}
        {themes.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead id="themes" tag="RESEARCH INVOLVEMENT" count={`${themes.length} THEME${themes.length === 1 ? "" : "S"} · PUBLICATION-DERIVED`} sub="ACTIVE IN THESE AREAS · ANY-AUTHORSHIP BASIS · INVOLVEMENT, NOT ADVOCACY" />
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px" }}>
              <div style={{ ...serif(13), color: P.ink4, lineHeight: 1.55, textWrap: "pretty", paddingBottom: 4 }}>
                Themes are extracted from this HCP's authored publications in NSCLC — any authorship position counts. They show where the work is. They are a weaker claim than the positions above{nPos ? "" : " would be"}: involvement in an area is not a stance on it.
              </div>
              {themes.map((t) => <ThemeRow key={t.id} t={t} />)}
            </div>
          </div>
        ) : null}

        {/* FIELD INTELLIGENCE — bottom panel, cross-profile consistency (2026-08-10) */}
        <FieldIntelligencePanel />

      </div>
    </Shell>
  );
}

// FIELD INTELLIGENCE panel removed (2026-08-03): the four-dimension rating grid
// rendered hardcoded 0% / 0 MSLS on every profile with an unwired submit
// (field_intel_* tables are SELECT-only). It was a literal, not data. FIELD
// INSIGHTS — the MSL-captured notes with linked belief positions — is a different
// block and stays.

// FIELD INTELLIGENCE — restored 2026-08-10 as the NEW three-question inline
// panel (the Rising/Community treatment), NOT the four-dimension grid removed
// 2026-08-03. The removal's reason — fake "0%" literals and a submit that
// silently pretended to work — is addressed the way the other two profiles
// address it: "Validation pending — 0 MSLs" is a true statement while the
// field_intel_* tables are SELECT-only, and submit SAYS the path is unwired
// rather than faking success. Bottom panel on all three profiles.
const FI_QUESTIONS = [
  { key: "confidence", label: "Engagement record matches field reality", options: ["Confirms", "Partial", "Disputes"] },
  { key: "access", label: "Access in practice", options: ["Open", "Gated", "Closed"] },
  { key: "referral", label: "Referral influence in region", options: ["High", "Moderate", "Low"] },
] as const;

function FieldIntelligencePanel() {
  const [answers, setAnswers] = useState<Record<string, string | null>>({ confidence: null, access: null, referral: null });
  const [toast, setToast] = useState<string | null>(null);
  const complete = FI_QUESTIONS.every((q) => answers[q.key]);
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionHead id="field-intel" tag="FIELD INTELLIGENCE" sub="PEER VALIDATION · THREE QUESTIONS" />
      <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ ...mono(10), color: P.ink5 }}>Validation pending — 0 MSLs have reviewed this profile.</span>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.amber }}>COMMUNITY CONFIDENCE</span>
            <span style={{ ...mono(9), color: P.ink6 }}>0 MSLs</span>
          </div>
          <div style={{ height: 3, background: P.line }} />
        </div>
        {FI_QUESTIONS.map((q) => (
          <div key={q.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ ...mono(10), color: P.ink4 }}>{q.label}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {q.options.map((opt) => {
                const on = answers[q.key] === opt;
                return (
                  <button key={opt} onClick={() => setAnswers((a) => ({ ...a, [q.key]: a[q.key] === opt ? null : opt }))}
                    style={{ flex: 1, textAlign: "center", padding: "7px 0", background: on ? "rgba(255,255,255,.07)" : "none", cursor: "pointer",
                      border: `1px solid ${on ? "rgba(255,255,255,.28)" : P.lineStrong}`, borderRadius: 3, ...mono(10, on ? 600 : 400), color: on ? P.ink0 : P.ink2, minHeight: 0 }}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button disabled={!complete}
          onClick={() => { if (!complete) return; showToast("Field review recorded — the submission path (field-intel write) is not yet wired; stored locally only."); }}
          style={{ textAlign: "center", padding: "10px 0", background: "none", border: `1px solid ${P.lineStrong}`, borderRadius: 3,
            ...mono(10.5, 500), color: complete ? P.ink2 : P.ink6, cursor: complete ? "pointer" : "not-allowed", opacity: complete ? 1 : 0.6, minHeight: 0 }}>
          Submit validation
        </button>
        <span style={{ textAlign: "center", ...mono(8.5), color: P.ink6, marginTop: -6 }}>Your identity is never shared. Contributor UUID only.</span>
      </div>
      <FiToast message={toast} />
    </div>
  );
}

// Centrality is the theme's strength grade (core / supporting / peripheral) — rendered
// as a graded chip, ledger register. Involvement language only.
const CENTRALITY_CHIP: Record<string, { color: string; border: string }> = {
  core: { color: P.ink1, border: "rgba(110,143,118,.55)" }, // sage-bordered — strongest involvement
  supporting: { color: P.ink3, border: "rgba(255,255,255,.18)" },
  peripheral: { color: P.ink5, border: "rgba(255,255,255,.10)" },
};

function ThemeRow({ t }: { t: ResearchTheme }) {
  const chip = CENTRALITY_CHIP[t.centrality] ?? CENTRALITY_CHIP.peripheral;
  return (
    <div style={{ borderTop: `1px solid ${P.line}`, padding: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...serif(15, 600), color: P.ink0 }}>{t.theme_name}</span>
        <span style={{ ...mono(8, 600), letterSpacing: ".12em", color: chip.color, padding: "1px 6px", border: `1px solid ${chip.border}` }}>{t.centrality.toUpperCase()}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", ...mono(9, 500), letterSpacing: ".08em", color: P.ink5 }}>
        <span>ACTIVE IN · {t.paper_count} PUBLICATION{t.paper_count === 1 ? "" : "S"}</span>
        {(t.example_pmids ?? []).slice(0, 3).map((pmid) => (
          <a key={pmid} href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`} target="_blank" rel="noreferrer"
             style={{ ...mono(8.5, 500), letterSpacing: ".06em", color: P.teal, textDecoration: "none", borderBottom: `1px solid rgba(127,179,187,.3)` }}>
            PMID {pmid} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout width="wide">
      {/* Commit C 2026-08-05: g2 board per the Pulse scheme; interior cards
          are g1 wells. */}
      <div style={{ width: "100%", boxSizing: "border-box", margin: "8px 0 24px", padding: "24px 24px 40px", background: GROUND.g2, border: `1px solid ${LINE.l1}`, fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
        {children}
      </div>
    </AppLayout>
  );
}

function Timeline({ data, onYearPress }: { data: { year: number; count: number }[]; onYearPress?: (year: number) => void }) {
  const years = data.map((d) => d.year);
  // Axis floor, not data floor: an ancient mis-linked year (disambiguation error)
  // must not stretch the axis and crush the real record. Counts stay whole — years
  // below `lo` are simply not drawn as columns; every total elsewhere still includes them.
  const lo = timelineAxisFloor(years), hi = Math.max(...years);
  const max = Math.max(...data.map((d) => d.count), 1);
  const byYear = new Map(data.map((d) => [d.year, d.count]));
  const span = [];
  for (let y = lo; y <= hi; y++) span.push({ year: y, count: byYear.get(y) ?? 0 }); // zero years drawn, not omitted
  // Per-bar year labels, centered (2026-08-10 audit item — never previously
  // implemented; the old row labeled only the two ends). Two-digit form on
  // long spans so labels stay clear of each other at narrow bar widths.
  const short = span.length > 14;
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {span.map((d) => (
        <div key={d.year} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ height: 56, display: "flex", alignItems: "flex-end" }}>
            <div title={`${d.year}: ${d.count} — open bibliography`}
              onClick={() => d.count > 0 && onYearPress?.(d.year)}
              style={{ width: "100%", height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 1, background: d.count ? P.sage : "rgba(255,255,255,.06)", cursor: onYearPress && d.count > 0 ? "pointer" : "default" }} />
          </div>
          <span style={{ ...mono(short ? 7.5 : 8), color: P.ink6, textAlign: "center", fontVariantNumeric: "tabular-nums", letterSpacing: short ? 0 : ".02em" }}>
            {short ? `’${String(d.year).slice(2)}` : d.year}
          </span>
        </div>
      ))}
    </div>
  );
}

// RECORD PAIR — the v2 frame's two-column scaffold: hairline top, a center
// rule between columns, 34px breathing room each side of it. Mobile stacks
// left over right with a soft rule between (the frame's media query).
function RecordPair({ left, right }: { left: ReactNode; right: ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 767px)"); // ledger breakpoint
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${P.lineMed}`, paddingTop: 24 }}>
        <div>{left}</div>
        <div style={{ borderTop: `1px solid ${P.line}`, paddingTop: 26, marginTop: 26 }}>{right}</div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", borderTop: `1px solid ${P.lineMed}`, paddingTop: 24 }}>
      <div style={{ paddingRight: 34, minWidth: 0 }}>{left}</div>
      <div style={{ paddingLeft: 34, borderLeft: `1px solid ${P.lineMed}`, minWidth: 0 }}>{right}</div>
    </div>
  );
}

// ENGAGEMENT MIX — donut + legend (2026-08-10, replaces the one-line text mix).
// Category hues are the Community profile's mix palette verbatim, so the same
// category wears the same color on both spines; education (absent from the
// Community set) takes the frame teal — the one candidate CVD-separated from
// every other hue on the g1 card (validated, worst live pair vs travel grey
// ΔE 18). No hue is load-bearing: every segment has a legend row with label,
// dollars and share, and segments keep a 2px surface gap. The seven keys are
// the brief RPC's category columns; dollar values are the same 3-yr Open
// Payments totals the old text line summarized.
const MIX_META: Record<string, { label: string; color: string }> = {
  consulting: { label: "CONSULTING", color: "#D69A3C" },
  speaker: { label: "SPEAKER BUREAU", color: "#5B8FD6" },
  // travel diverges from Community's gray (2026-08-10, Garrett): it is the
  // dominant segment on most academic mixes and the frame gray read as dead
  // weight. Burnt orange — the one orange CVD-separated from consulting amber
  // (ΔE 10.4 deutan, validated); Community's swatch still wears gray until
  // its own pass.
  travel: { label: "TRAVEL & LODGING", color: "#C96A3E" },
  honoraria: { label: "HONORARIA", color: "#8A7FB8" },
  education: { label: "EDUCATION", color: P.teal },
  food: { label: "FOOD & BEVERAGE", color: "#57A878" },
  royalty: { label: "ROYALTY", color: "#B0848F" },
};

function EngagementMixDonut({ mix }: { mix: Record<string, number> }) {
  const entries = Object.entries(mix)
    .map(([k, v]) => [k, Number(v) || 0] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!total) return null;
  const meta = (k: string) => MIX_META[k] ?? { label: k.toUpperCase(), color: P.dash };
  const R = 46, W = 14, C = 60; // ring radius / thickness / center of the 120 viewBox
  const GAP = entries.length > 1 ? 0.045 : 0; // ~2px surface gap at this radius
  let angle = -Math.PI / 2; // 12 o'clock start, largest segment first
  const segs = entries.map(([k, v]) => {
    const sweep = (v / total) * Math.PI * 2;
    const a0 = angle + GAP / 2;
    const a1 = Math.max(angle + sweep - GAP / 2, a0 + 0.01);
    angle += sweep;
    return { k, v, a0, a1 };
  });
  const pt = (a: number) => `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>ENGAGEMENT MIX · 3YR</span>
      {/* frame arrangement: ring beside its legend, wrapping when narrow */}
      <div style={{ display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap" }}>
      <svg viewBox="0 0 120 120" style={{ width: 132, height: 132, flex: "none" }} role="img" aria-label="Engagement mix by payment category">
        {entries.length === 1 ? (
          <circle cx={C} cy={C} r={R} fill="none" stroke={meta(entries[0][0]).color} strokeWidth={W}>
            <title>{`${meta(entries[0][0]).label} · ${money(entries[0][1])} · 100%`}</title>
          </circle>
        ) : (
          segs.map((s) => (
            <path
              key={s.k}
              d={`M ${pt(s.a0)} A ${R} ${R} 0 ${s.a1 - s.a0 > Math.PI ? 1 : 0} 1 ${pt(s.a1)}`}
              fill="none"
              stroke={meta(s.k).color}
              strokeWidth={W}
            >
              <title>{`${meta(s.k).label} · ${money(s.v)} · ${Math.round((s.v / total) * 100)}%`}</title>
            </path>
          ))
        )}
        <text x={C} y={C - 1} textAnchor="middle" fill={P.ink1} style={{ font: `600 13px ${FONT.mono}`, fontVariantNumeric: "tabular-nums" }}>{money(total)}</text>
        <text x={C} y={C + 13} textAnchor="middle" fill={P.ink6} style={{ font: `500 7.5px ${FONT.mono}`, letterSpacing: ".14em" }}>3YR TOTAL</text>
      </svg>
      {/* legend — frame grid: swatch · label · promoted amount · share */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200, flex: 1 }}>
        {entries.map(([k, v], i) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "10px 1fr auto 42px", gap: 10, alignItems: "center", paddingBottom: i < entries.length - 1 ? 9 : 0, borderBottom: i < entries.length - 1 ? `1px solid ${P.line}` : "none" }}>
            <span style={{ width: 8, height: 8, background: meta(k).color, display: "block" }} />
            <span style={{ ...mono(9.5), letterSpacing: ".08em", color: P.ink3 }}>{meta(k).label}</span>
            <span style={{ ...mono(14, 500), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>{money(v)}</span>
            <span style={{ ...mono(11.5), color: P.ink6, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round((v / total) * 100)}%</span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
