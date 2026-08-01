// HCP Profile redesign — direction 1a "Brief", stage 1. Route: /hcp/:id/brief (alongside
// the existing DetailScreen, not replacing it). Source of form: Design "HCP Profile Build
// Reference" 1a. Source of fact: live data only (hcpProfile.ts / hcp_profile_brief RPC).
// Composed frame elements render their honest empty/withheld state per Design's render
// "ladder" thresholds. Inherits the cohort ledger's visual language verbatim: same score
// columns/labels, em-dash at ceiling, amber for rank figures only, sage cohort marker,
// serif-over-mono, OPEN ↗ trace links, review-before-use disclaimer.

import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import NavBar from "../NavBar";
import { CONTENT_WIDTH } from "../../lib/designTokens";
import { floorFixed } from "../../lib/cohortLedger";
import { institutionToSlug } from "../../lib/institutionUtils";
import { fetchHcpThemes, getEstablishedScoreBreakdown, type TopCollaborator } from "../../lib/api";
import type { ResearchTheme } from "../../types/researchTheme";
import FieldInsights from "../FieldInsights/FieldInsights";
import MiniCollaboratorNetwork from "../MiniCollaboratorNetwork";
import BibliographyScreen from "../BibliographyScreen";
import ProfileRelationshipControls, { profileHcp } from "./ProfileRelationshipControls";
import ProfileSecondaryControls from "./ProfileSecondaryControls";
import { FiToast } from "../FieldIntelligenceShared";
import {
  loadHcpProfile,
  loadFieldPresence,
  positionCount,
  sourceCount,
  renderSynthesis,
  renderSilence,
  money,
  roleLabel,
  journalShort,
  THRESHOLDS,
  type HcpProfile,
  type FieldNote,
  type ProfilePosition,
  type ProfileSource,
} from "../../lib/hcpProfile";

// Ledger palette, verbatim (self-contained visual system per the Build Reference).
const P = {
  page: "#08090A",
  card: "#0E1013",
  head: "#0B0D10",
  band: "#0A0C0E",
  drawer: "#0A0C0F",
  line: "rgba(255,255,255,.06)",
  lineMed: "rgba(255,255,255,.09)",
  lineStrong: "rgba(255,255,255,.14)",
  amber: "#E0A75E",
  sage: "#6E8F76", // Established cohort marker
  ink0: "#EDEEEF",
  ink1: "#E7E8E9",
  ink2: "#C6CACD",
  ink3: "#A8AEB3",
  ink4: "#8F959A",
  ink5: "#7C8288",
  ink6: "#63696E",
  dash: "#71787E",
  teal: "#7FB3BB",
} as const;

const mono = (s: number, w = 400) => ({ font: `${w} ${s}px 'IBM Plex Mono',ui-monospace,monospace` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px 'Source Serif 4',Georgia,serif` } as const);

function SectionHead({ id, tag, count, sub }: { id: string; tag: string; count?: string; sub?: string }) {
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
      {sources.slice(0, 4).map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...mono(9.5, 500), letterSpacing: ".06em", color: P.ink3 }}>{journalShort(s.journal)} {s.pub_year ?? ""}</span>
          {s.author_role ? <span style={{ ...mono(8.5, 500), letterSpacing: ".08em", color: P.ink5 }}>{roleLabel(s.author_role)}</span> : null}
          {s.citation_count != null ? <span style={{ ...mono(8.5), color: P.ink6 }}>{s.citation_count} CIT</span> : null}
          {s.doi ? (
            <a href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer" style={{ ...mono(8.5, 500), letterSpacing: ".06em", color: P.teal, textDecoration: "none", borderBottom: `1px solid rgba(127,179,187,.3)` }}>OPEN ↗</a>
          ) : null}
        </div>
      ))}
      {sources.length > 4 ? <span style={{ ...mono(8.5), color: P.ink6 }}>+ {sources.length - 4} MORE</span> : null}
    </div>
  );
}

function PositionCard({ pos, sourceRows, count }: { pos: ProfilePosition; sourceRows: ProfileSource[] | null; count: number }) {
  const single = (pos.paper_count ?? 0) <= 1;
  const years = (pos.sources ?? []).map((s) => s.pub_year).filter((y): y is number => y != null);
  const yr = years.length ? (Math.min(...years) === Math.max(...years) ? `${years[0]}` : `${Math.min(...years)}–${Math.max(...years)}`) : "";
  return (
    <div style={{ borderTop: `1px solid ${P.line}`, padding: "14px 0", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...serif(16, 600), color: P.ink0 }}>{pos.theme}</span>
        {single ? <span style={{ ...mono(8, 600), letterSpacing: ".12em", color: P.amber, padding: "1px 6px", border: `1px solid rgba(224,167,94,.4)` }}>SINGLE SOURCE</span> : null}
        {pos.confidence != null ? <span style={{ ...mono(8.5, 500), letterSpacing: ".08em", color: P.ink5 }}>CONF {pos.confidence.toFixed(2)}</span> : null}
      </div>
      <span style={{ ...serif(13.5), color: P.ink3, lineHeight: 1.55, textWrap: "pretty" }}>{pos.summary}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", ...mono(9, 500), letterSpacing: ".08em", color: P.ink5 }}>
        <span>BASIS {pos.paper_count ?? count} PUBLICATION{(pos.paper_count ?? count) === 1 ? "" : "S"}</span>
        {yr ? <span>SOURCED {yr}</span> : null}
      </div>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap", paddingTop: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...mono(8.5, 600), letterSpacing: ".14em", color: P.ink6 }}>EVIDENCE</span>
          <EvidenceRail sources={sourceRows} count={count} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...mono(8.5, 600), letterSpacing: ".14em", color: P.ink6 }}>FIELD CORROBORATION</span>
          <span style={{ ...mono(9.5), color: P.ink5 }}>NOT OBSERVED · 0 MSL REACTIONS LOGGED</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...mono(8.5, 600), letterSpacing: ".14em", color: P.ink6 }}>MOVEMENT</span>
          <span style={{ ...mono(9.5), color: P.ink5 }}>NO PRIOR STATE · first sourced {years.length ? Math.min(...years) : "—"}</span>
        </div>
      </div>
      <div style={{ paddingTop: 2 }}>
        <span style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.ink5 }}>Heard them speak to this? </span>
        <span style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.teal }}>+ LOG A REACTION</span>
      </div>
    </div>
  );
}

export default function HcpProfileBrief() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [p, setP] = useState<HcpProfile | null>(null);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [collaborators, setCollaborators] = useState<TopCollaborator[]>([]);
  const [themes, setThemes] = useState<ResearchTheme[]>([]);
  const [bibYear, setBibYear] = useState<number | null>(null); // per-year bibliography overlay
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
    // collaborator network — same source DetailScreen uses (established score breakdown)
    getEstablishedScoreBreakdown(id).then((b) => alive && setCollaborators(b?.top_collaborators ?? [])).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  // honor a #hash on arrival (e.g. #belief-profile deep-links) once content is laid out
  useEffect(() => {
    if (loading || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, location.hash]);

  if (loading) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>Loading profile…</div></Shell>;
  if (!p || !p.hcp?.name) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>This profile could not be loaded.</div></Shell>;

  // per-year bibliography drill-down — same component DetailScreen uses (no canonical URL exists)
  if (bibYear !== null) return <BibliographyScreen hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} year={bibYear} onBack={() => setBibYear(null)} />;

  const s = p.scores;
  const nPos = positionCount(p);
  const nSrc = sourceCount(p);
  const hasSynthPara = renderSynthesis(p);
  const showSilence = renderSilence(p);
  const loc = [p.hcp.city, p.hcp.state].filter(Boolean).join(", ");

  // top sourced position for the Brief's expected-position card (no objective in stage 1)
  const topTier = p.belief.tiers?.find((t) => t.positions && t.positions.length);
  const topPos = topTier?.positions?.[0] ?? null;

  return (
    <Shell>
      <div style={{ padding: "20px 24px 120px", display: "flex", flexDirection: "column", gap: 26 }}>
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
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4, borderBottom: `1px solid ${P.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ ...mono(34, 500), color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s?.index != null ? floorFixed(s.index, 1) : "—"}</span>
              <span style={{ ...mono(9.5, 500), letterSpacing: ".1em", color: P.ink5 }}>INDEX · RANK {s?.rank ?? "—"} US · #{s?.global_rank ?? "—"} GLOBAL</span>
            </div>
            <span style={{ ...serif(24, 600), color: P.ink0, letterSpacing: "-.01em", paddingTop: 4 }}>{p.hcp.name}</span>
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 8 }}>
              <button onClick={() => navigate(`/hcp/${p.hcp.id}/brief`)} title="Generate a pre-meeting brief"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", background: "none", border: `1px solid rgba(224,167,94,.5)`, cursor: "pointer", ...mono(10, 600), letterSpacing: ".08em", color: P.amber, borderRadius: 2 }}>✦ GENERATE BRIEF</button>
              <button onClick={() => navigate(`/hcp/${p.hcp.id}/publications`, { state: { taId: undefined } })} title="All publications"
                style={{ padding: "7px 13px", background: "none", border: `1px solid ${P.lineStrong}`, cursor: "pointer", ...mono(10, 500), letterSpacing: ".08em", color: P.ink3, borderRadius: 2 }}>ALL PUBLICATIONS ↗</button>
              <button onClick={() => navigate(`/hcp/${p.hcp.id}/positions`)} title="Full positions page"
                style={{ padding: "7px 13px", background: "none", border: `1px solid ${P.lineStrong}`, cursor: "pointer", ...mono(10, 500), letterSpacing: ".08em", color: P.ink3, borderRadius: 2 }}>ALL POSITIONS ↗</button>
            </div>
          </div>
          <div style={{ padding: "16px 24px", display: "flex", gap: 36, flexWrap: "wrap", alignItems: "flex-start" }}>
            <ScoreCell label="INDEX" sub="IN COHORT" value={s?.index ?? null} decimals={1} basis={s?.vs_cohort_mean != null ? `${s.vs_cohort_mean > 0 ? "+" : ""}${s.vs_cohort_mean} VS COHORT MEAN` : ""} />
            <ScoreCell label="SCI" sub="CEILING" value={s?.sci ?? null} decimals={1} basis={s?.basis_senior != null ? `${s.basis_senior} SENIOR PUBS` : ""} />
            <ScoreCell label="NET" sub="CEILING" value={s?.net ?? null} decimals={1} basis={s?.basis_papers != null ? `${s.basis_papers} PAPERS` : ""} />
            <ScoreCell label="PHARMA" sub="NOT RANKED" value={s?.pharma ?? null} decimals={1} noRank absent="NO DISCLOSURES ON RECORD" />
          </div>
          <div style={{ padding: "0 24px 14px", ...mono(9, 500), letterSpacing: ".08em", color: P.ink6 }}>
            RECORD DEPTH{nSrc < 12 ? " · THIN" : ""} · {nPos} POSITION{nPos === 1 ? "" : "S"} · {nSrc} SOURCE{nSrc === 1 ? "" : "S"} · {notes.length} FIELD NOTE{notes.length === 1 ? "" : "S"}{p.record_depth.oldest ? ` · OLDEST SOURCE ${p.record_depth.oldest}` : ""}
          </div>
        </div>

        {/* orientation strip — frame: "ORIENTATION FIRST" + the relevance-matching v2
            LABEL (a deferred feature; render the label, not the feature). Replaces the
            old objective-lens strip. */}
        <div style={{ border: `1px solid ${P.line}`, background: P.band, padding: "11px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ ...mono(8.5, 500), letterSpacing: ".16em", color: P.ink5 }}>ORIENTATION FIRST · THE SCHOLARLY RECORD BELOW</span>
          <span style={{ ...mono(8.5, 500), letterSpacing: ".16em", color: P.teal }}>RELEVANCE MATCHING V2 STAGE ↗</span>
        </div>

        {/* ── SIGNAL SUMMARY — who is this (orientation, top) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="signal" tag="SIGNAL SUMMARY" count="WHO IS THIS" sub="GENERATED SYNTHESIS" />
          {p.signal_summary ? (
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ ...serif(15, 400), color: P.ink2, lineHeight: 1.6, textWrap: "pretty" }}>{p.signal_summary}</span>
              <span style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.ink6 }}>MODEL SYNTHESIS OVER THE SOURCED AUDIT · REVIEW BEFORE USE · NO CLINICAL CLAIM · METHODOLOGY V4.2</span>
            </div>
          ) : (
            <Withheld head="SIGNAL SUMMARY · WITHHELD" title="No generated synthesis for this HCP yet." body="The synthesis is generated over the sourced record. None is on file for this HCP in NSCLC." />
          )}
        </div>

        {/* ── RELATIONSHIP ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="relationship" tag="RELATIONSHIP" count="TRACK · STATUS · FOLLOW-UPS" sub="SYNCS WITH THE LEDGER" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 20px" }}>
            <ProfileRelationshipControls hcpId={p.hcp.id} hcpName={p.hcp.name} specialty={p.hcp.specialty} />
          </div>
        </div>

        {/* ── CONTACT & CONTROLS ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="contact" tag="CONTACT & CONTROLS" sub="ACCESS · FIELD REVIEW · REPORT · OPT-OUT" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 20px" }}>
            <ProfileSecondaryControls hcpId={p.hcp.id} hcpName={p.hcp.name} specialty={p.hcp.specialty} />
          </div>
        </div>

        {/* ── FIELD INSIGHTS — single header (was doubled FIELD PRESENCE / FIELD INSIGHTS);
            ledger-register cards via the variant prop. Content + capture function preserved
            by the shared component; community passes no variant so it is unchanged. ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="field" tag="FIELD INSIGHTS" count={`${notes.length} CAPTURED · MSL-ENTERED`} sub="TEAM OBSERVATION · NEVER A SCORED POSITION" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
            <FieldInsights hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} variant="ledger" hideHeader />
          </div>
        </div>

        {/* ── FIELD INTELLIGENCE — nested after Field Insights per the frame: interactive
            rating buttons + submit. Write path unwired (field_intel_* SELECT-only, see
            KNOWN_ISSUES); submit acknowledges honestly rather than faking success. ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="intel" tag="FIELD INTELLIGENCE" count="TEAM RATINGS" sub="NOT SET · REQUIRES 2 RATERS" />
          <FieldIntelligencePanel />
        </div>

        {/* ── THE RECORD ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="record" tag="THE RECORD" count={`${p.record.publications_total ?? ""} SOURCES`} sub="SCIENTIFIC AND COMMERCIAL FOOTPRINT AT EQUAL WEIGHT" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
            {/* stats */}
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
              {[["PUBLICATIONS", p.record.publications_total], ["SENIOR AUTHOR", p.record.senior_pub_count], ["SENIOR 5YR", p.record.senior_recent_5yr], ["GUIDELINES", p.record.guideline_count]].map(([l, v]) => (
                <div key={l as string} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ ...mono(9, 500), letterSpacing: ".12em", color: P.ink6 }}>{l}</span>
                  <span style={{ ...mono(20, 500), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>{v ?? "—"}</span>
                </div>
              ))}
            </div>
            {/* timeline — click a year to open its per-year bibliography (same as DetailScreen) */}
            {p.record.timeline && p.record.timeline.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>PUBLICATION TIMELINE · CLICK A YEAR</span>
                <Timeline data={p.record.timeline} onYearPress={(y) => setBibYear(y)} />
              </div>
            ) : null}
            {/* pharma engagement */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>PHARMA ENGAGEMENT · OPEN PAYMENTS · EXCLUDED FROM RANK</span>
              {p.record.pharma_companies && p.record.pharma_companies.length ? (
                p.record.pharma_companies.map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", ...mono(10), color: P.ink3 }}>
                    <span style={{ letterSpacing: ".04em" }}>{c.name.toUpperCase()} <span style={{ color: P.ink6 }}>{c.count} PAYMENTS</span></span>
                    <span style={{ color: P.ink2 }}>{money(c.amount)}</span>
                  </div>
                ))
              ) : (
                <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.5 }}>No disclosed payments in the record. This is an absence in the open-payments record. It is not evidence that no relationship exists.</span>
              )}
            </div>
            {/* engagement mix */}
            {p.record.engagement_mix ? <EngagementMix mix={p.record.engagement_mix} /> : null}
            {/* collaborators */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>TOP COLLABORATORS</span>
              {collaborators.length ? (
                <MiniCollaboratorNetwork hcpName={p.hcp.name} hcpId={p.hcp.id} collaborators={collaborators} />
              ) : (
                <span style={{ ...serif(12.5), color: P.ink5, lineHeight: 1.5 }}>No co-authorship network on record for this HCP.</span>
              )}
            </div>
          </div>
        </div>

        {/* ── THE BRIEF — payoff begins ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHead id="brief" tag="THE BRIEF" sub="MODEL SELECTION OVER SOURCED RECORDS · NO CLINICAL CLAIM" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
            {/* expected position — no objective in stage 1: top sourced position, honestly labelled */}
            {topPos ? (
              <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink5 }}>TOP SOURCED POSITION{nPos === 1 ? " · ONE POSITION ONLY" : ""}</span>
                <span style={{ ...serif(15, 600), color: P.ink0, lineHeight: 1.35 }}>{topPos.theme}</span>
                <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.5, textWrap: "pretty" }}>{topPos.summary}</span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
                  <span style={{ ...mono(9, 500), letterSpacing: ".08em", color: P.ink5 }}>{topPos.paper_count ?? 1} PAPER{(topPos.paper_count ?? 1) === 1 ? "" : "S"} · {notes.length} FIELD NOTE{notes.length === 1 ? "" : "S"}</span>
                  <a href="#belief" style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.teal, textDecoration: "none" }}>→ POSITIONS</a>
                </div>
              </div>
            ) : themes.length ? (
              /* INVOLVEMENT tier carries the hero when no advocacy position exists — a
                 weaker claim, labeled as such, never phrased as a stance. */
              <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink5 }}>TOP RESEARCH THEME · INVOLVEMENT, NOT A STANCE</span>
                <span style={{ ...serif(15, 600), color: P.ink0, lineHeight: 1.35 }}>{themes[0].theme_name}</span>
                <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.5, textWrap: "pretty" }}>Active in this area across {themes[0].paper_count} publication{themes[0].paper_count === 1 ? "" : "s"} (any authorship position). No sourced advocacy position exists for this HCP — involvement shows where the work is, not what they argue.</span>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
                  <span style={{ ...mono(9, 500), letterSpacing: ".08em", color: P.ink5 }}>{themes.length} THEME{themes.length === 1 ? "" : "S"} · PUBLICATION-DERIVED</span>
                  <a href="#themes" style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.teal, textDecoration: "none" }}>→ INVOLVEMENT</a>
                </div>
              </div>
            ) : (
              <Withheld head="EXPECTED POSITION · WITHHELD" title="No sourced positions yet." body="Nothing has been extracted from the published record for this HCP in NSCLC. This is an absence in the record, not evidence that no position exists." foot="RENDERS FROM ≥1 SOURCED POSITION" />
            )}
            {/* what changed — always withheld in stage 1 (no position snapshots) */}
            <Withheld head="WHAT CHANGED · WITHHELD" title="No dated movement to report." body="A delta needs two dated observations of the same position. There are no position snapshots over time in stage 1, so there is no prior state to compare against." foot={`REQUIRES ≥${THRESHOLDS.deltaMinObservations} DATED OBSERVATIONS · + LOG A NOTE`} />
            {/* where silent — 12+ sources gate; topic naming is stage 2 */}
            {showSilence ? (
              <Withheld head="WHERE THE RECORD IS SILENT · WITHHELD" title="Silence detection is stage 2." body={`The record is dense enough (${nSrc} sources) for absence to be a finding, but naming which topics are silent needs the silence topic taxonomy, which is stage 2.`} foot="THRESHOLD MET · TAXONOMY STAGE 2 → METHOD ↗" />
            ) : (
              <Withheld head="WHERE THE RECORD IS SILENT · WITHHELD" title="The record is too thin for silence to be a finding." body={`Absence is only informative against a dense record. With ${nSrc} source${nSrc === 1 ? "" : "s"}, every topic is absent — naming one would be an artefact of thin coverage, not a read on their views.`} foot={`REQUIRES ≥${THRESHOLDS.silenceMinSources} SOURCED POSITIONS → METHOD ↗`} />
            )}
          </div>
        </div>

        {/* BELIEF PROFILE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="belief-profile" tag="BELIEF PROFILE" count={`${nPos} POSITION${nPos === 1 ? "" : "S"} · ${nSrc} SOURCE${nSrc === 1 ? "" : "S"} · ALL PUBLISHED`} sub="POSITIONS DESCRIBE THE PUBLISHED WORK · NOT THE PERSON" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px" }}>
            {/* synthesis paragraph or its withheld state */}
            {hasSynthPara ? (
              <div style={{ ...serif(15, 400), color: P.ink2, lineHeight: 1.6, textWrap: "pretty", paddingBottom: 6 }}>{p.belief.headline}</div>
            ) : nPos > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 10 }}>
                <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink5 }}>NO SYNTHESIS AT THIS DEPTH</span>
                <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>The one-paragraph characterisation is generated from the shape of a record — the tiers, the recurrences, the throughline. {nPos} position{nPos === 1 ? "" : "s"} {nPos === 1 ? "has" : "have"} no shape. The positions themselves are below, unsummarised.</span>
              </div>
            ) : null}

            {/* positions: synthesized tiers, else raw single-source cards, else empty */}
            {p.belief.tiers && p.belief.tiers.some((t) => t.positions && t.positions.length) ? (
              p.belief.tiers.filter((t) => t.positions && t.positions.length).map((t) => (
                <div key={t.key} style={{ paddingTop: 12 }}>
                  <span style={{ ...mono(9.5, 600), letterSpacing: ".14em", color: P.ink4 }}>{t.label} <span style={{ color: P.ink6 }}>{t.positions!.length}</span></span>
                  {t.positions!.map((pos, i) => (
                    <PositionCard key={i} pos={pos} sourceRows={pos.sources} count={pos.paper_count ?? pos.sources?.length ?? 0} />
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
                      {r.source?.doi ? <a href={`https://doi.org/${r.source.doi}`} target="_blank" rel="noreferrer" style={{ color: P.teal, textDecoration: "none" }}>{journalShort(r.source.journal)} {r.source.year} OPEN ↗</a> : null}
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

      </div>
    </Shell>
  );
}

// Frame's four rating dimensions. Options mirror the frame verbatim. Submission is
// unwired (field_intel_* tables are SELECT-only per KNOWN_ISSUES) — submit acknowledges
// honestly, matching the community profile's field-intel panel.
const FI_DIMENSIONS = [
  { key: "dataMatch", label: "DATA MATCHES FIELD REALITY", options: ["Confirms", "Partial", "Disputes"] },
  { key: "engagement", label: "ENGAGEMENT POTENTIAL", options: ["High", "Moderate", "Low"] },
  { key: "credibility", label: "SCIENTIFIC CREDIBILITY", options: ["Strong", "Moderate", "Early"] },
  { key: "momentum", label: "MOMENTUM TRAJECTORY", options: ["Accelerating", "Steady", "Plateauing"] },
] as const;

function FieldIntelligencePanel() {
  const [answers, setAnswers] = useState<Record<string, string | null>>({ dataMatch: null, engagement: null, credibility: null, momentum: null });
  const [toast, setToast] = useState<string | null>(null);
  const complete = FI_DIMENSIONS.every((d) => answers[d.key]);
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); };
  return (
    <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ ...serif(14), color: P.ink3, lineHeight: 1.5 }}>Field Intelligence pending — be among the first to contribute.</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...mono(9, 500), letterSpacing: ".14em", color: P.ink5 }}>COMMUNITY CONFIDENCE</span>
        <span style={{ marginLeft: "auto", ...mono(9, 600), color: P.teal }}>0%</span>
        <span style={{ ...mono(9), color: P.ink6 }}>0 MSLS · 2 REQUIRED</span>
      </div>
      <div style={{ height: 3, background: P.line }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "18px 28px" }}>
        {FI_DIMENSIONS.map((d) => (
          <div key={d.key}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 9 }}>
              <span style={{ ...mono(9, 500), letterSpacing: ".14em", color: P.ink4 }}>{d.label}</span>
              <span style={{ ...mono(8, 500), letterSpacing: ".1em", color: answers[d.key] ? P.teal : P.ink6 }}>{answers[d.key] ? answers[d.key]!.toUpperCase() : "UNRATED"}</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {d.options.map((opt) => {
                const on = answers[d.key] === opt;
                return (
                  <button key={opt} type="button"
                    onClick={() => setAnswers((a) => ({ ...a, [d.key]: a[d.key] === opt ? null : opt }))}
                    style={{ flex: 1, textAlign: "center", ...mono(9, 600), letterSpacing: ".1em", padding: "11px 6px", cursor: "pointer",
                      background: on ? "rgba(127,179,187,.10)" : "none", border: `1px solid ${on ? P.teal : P.lineStrong}`, color: on ? P.ink1 : P.ink3, borderRadius: 2 }}>
                    {opt.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <button type="button" disabled={!complete}
        onClick={() => { if (!complete) return; showToast("Field review recorded — the submission path (field-intel write) is not yet wired; stored locally only."); }}
        style={{ textAlign: "center", padding: "11px 0", ...mono(9, 700), letterSpacing: ".2em", cursor: complete ? "pointer" : "not-allowed",
          background: complete ? "#0d1411" : "none", border: `1px solid ${complete ? "#2f4436" : P.lineStrong}`, color: complete ? "#8caf94" : P.ink6, borderRadius: 2 }}>
        SUBMIT VALIDATION
      </button>
      <div style={{ ...mono(9), lineHeight: 1.6, color: P.ink6, letterSpacing: ".04em" }}>
        UNTIL TWO RATERS AGREE, A DIMENSION READS UNRATED RATHER THAN AS A FINDING. YOUR IDENTITY IS NEVER SHARED · CONTRIBUTOR UUID ONLY.
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
    <div style={{ background: P.page, minHeight: "100vh" }}>
      <NavBar />
      <div style={{ maxWidth: CONTENT_WIDTH.wide, margin: "0 auto", width: "100%", boxSizing: "border-box", fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
        {children}
      </div>
    </div>
  );
}

function Timeline({ data, onYearPress }: { data: { year: number; count: number }[]; onYearPress?: (year: number) => void }) {
  const years = data.map((d) => d.year);
  const lo = Math.min(...years), hi = Math.max(...years);
  const max = Math.max(...data.map((d) => d.count), 1);
  const byYear = new Map(data.map((d) => [d.year, d.count]));
  const span = [];
  for (let y = lo; y <= hi; y++) span.push({ year: y, count: byYear.get(y) ?? 0 }); // zero years drawn, not omitted
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 56 }}>
        {span.map((d) => (
          <div key={d.year} title={`${d.year}: ${d.count} — open bibliography`}
            onClick={() => d.count > 0 && onYearPress?.(d.year)}
            style={{ flex: 1, height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 1, background: d.count ? P.sage : "rgba(255,255,255,.06)", cursor: onYearPress && d.count > 0 ? "pointer" : "default" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...mono(8.5), color: P.ink6, paddingTop: 4 }}>
        <span>{lo}</span><span>{hi}</span>
      </div>
    </div>
  );
}

function EngagementMix({ mix }: { mix: Record<string, number> }) {
  const entries = Object.entries(mix).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (!total) return null;
  const order = ["consulting", "speaker", "travel", "research", "honoraria", "education", "food", "royalty"];
  entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>ENGAGEMENT MIX · 3YR</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
        {entries.map(([k, v]) => (
          <span key={k} style={{ ...mono(9.5), color: P.ink4, letterSpacing: ".04em" }}>
            {k.toUpperCase()} <span style={{ color: P.ink2 }}>{Math.round((v / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
