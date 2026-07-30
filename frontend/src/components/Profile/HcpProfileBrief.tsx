// HCP Profile redesign — direction 1a "Brief", stage 1. Route: /hcp/:id/brief (alongside
// the existing DetailScreen, not replacing it). Source of form: Design "HCP Profile Build
// Reference" 1a. Source of fact: live data only (hcpProfile.ts / hcp_profile_brief RPC).
// Composed frame elements render their honest empty/withheld state per Design's render
// "ladder" thresholds. Inherits the cohort ledger's visual language verbatim: same score
// columns/labels, em-dash at ceiling, amber for rank figures only, sage cohort marker,
// serif-over-mono, OPEN ↗ trace links, review-before-use disclaimer.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import NavBar from "../NavBar";
import { CONTENT_WIDTH } from "../../lib/designTokens";
import { supabase } from "../../lib/supabase";
import FieldInsights from "../FieldInsights/FieldInsights";
import ProfileRelationshipControls, { profileHcp } from "./ProfileRelationshipControls";
import {
  loadHcpProfile,
  loadFieldPresence,
  positionCount,
  sourceCount,
  renderSynthesis,
  renderSilence,
  lensOn,
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
const SUPP_WINDOW = 3; // ledger's ceiling window

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

// Score cell in the ledger's treatment: em-dash "AT CEILING" when the score sits at the
// cohort ceiling, else the numeral with its basis (a low score reads low, not broken).
function ScoreCell({ label, sub, value, ceiling, basis, noRank, absent, decimals }: {
  label: string; sub: string; value: number | null; ceiling?: number | null; basis?: string; noRank?: boolean; absent?: string; decimals?: number;
}) {
  let text: string;
  let atCeiling = false;
  if (value == null || (noRank && value <= 0)) {
    text = absent ?? "—";
  } else if (!noRank && ceiling != null && value >= ceiling - SUPP_WINDOW) {
    text = "—";
    atCeiling = true;
  } else {
    text = decimals != null ? value.toFixed(decimals) : String(Math.round(value));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 92 }}>
      <span style={{ ...mono(9, 500), letterSpacing: ".14em", color: P.ink6 }}>{label}<br /><span style={{ color: P.ink5 }}>{sub}</span></span>
      <span style={{ ...mono(22, 500), color: atCeiling ? P.dash : noRank ? P.ink3 : P.ink0, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{text}</span>
      <span style={{ ...mono(8.5, 500), letterSpacing: ".1em", color: P.ink6 }}>{atCeiling ? "AT CEILING" : noRank ? "EXCLUDED FROM RANK" : basis ?? ""}</span>
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
  const [p, setP] = useState<HcpProfile | null>(null);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [ceilings, setCeilings] = useState<{ sci?: number; net?: number }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      loadHcpProfile(id),
      loadFieldPresence(id),
      supabase.rpc("ledger_meta", { p_cohort: "EST" }),
    ]).then(([prof, fn, meta]) => {
      if (!alive) return;
      setP(prof);
      setNotes(fn);
      setCeilings(((meta.data as { ceilings?: { sci?: number; net?: number } })?.ceilings) ?? {});
      setLoading(false);
    }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>Loading profile…</div></Shell>;
  if (!p || !p.hcp?.name) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>This profile could not be loaded.</div></Shell>;

  const s = p.scores;
  const nPos = positionCount(p);
  const nSrc = sourceCount(p);
  const hasSynthPara = renderSynthesis(p);
  const showSilence = renderSilence(p);
  const isLensOn = lensOn(p);
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
            <Link to="/cohorts/ledger" style={{ color: P.teal, textDecoration: "none" }}>↑ BACK TO LEDGER</Link>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", ...mono(9, 500), letterSpacing: ".1em", color: P.ink6 }}>
            {[["BRIEF", "brief"], [`BELIEF ${nPos}`, "belief"], [`FIELD ${notes.length}`, "field"], ["SIGNAL", "signal"], ["RECORD", "record"], ["INTEL", "intel"]].map(([t, a]) => (
              <a key={a} href={`#${a}`} style={{ color: P.ink5, textDecoration: "none" }}>{t}</a>
            ))}
          </div>
        </div>

        {/* header + score band (ledger treatment) */}
        <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: P.sage }} />
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4, borderBottom: `1px solid ${P.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{ ...mono(34, 500), color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s?.index != null ? s.index.toFixed(1) : "—"}</span>
              <span style={{ ...mono(9.5, 500), letterSpacing: ".1em", color: P.ink5 }}>INDEX · RANK {s?.rank ?? "—"} US · #{s?.global_rank ?? "—"} GLOBAL</span>
            </div>
            <span style={{ ...serif(24, 600), color: P.ink0, letterSpacing: "-.01em", paddingTop: 4 }}>{p.hcp.name}</span>
            <span style={{ ...mono(11), color: P.ink4, letterSpacing: ".02em" }}>{[p.hcp.institution, loc].filter(Boolean).join(" · ")}</span>
            <span style={{ ...mono(9.5, 500), letterSpacing: ".08em", color: P.ink6 }}>
              {p.hcp.npi ? `NPI ${p.hcp.npi}` : ""}{p.hcp.specialty ? ` · ${p.hcp.specialty.toUpperCase()}` : ""} · VERIFIED NPI REGISTRY
            </span>
          </div>
          <div style={{ padding: "16px 24px", display: "flex", gap: 36, flexWrap: "wrap", alignItems: "flex-start" }}>
            <ScoreCell label="INDEX" sub="IN COHORT" value={s?.index ?? null} decimals={1} basis={s?.vs_cohort_mean != null ? `${s.vs_cohort_mean > 0 ? "+" : ""}${s.vs_cohort_mean} VS COHORT MEAN` : ""} />
            <ScoreCell label="SCI" sub="CEILING" value={s?.sci ?? null} ceiling={ceilings.sci} basis={s?.basis_senior != null ? `${s.basis_senior} SENIOR PUBS` : ""} />
            <ScoreCell label="NET" sub="CEILING" value={s?.net ?? null} ceiling={ceilings.net} basis={s?.basis_papers != null ? `${s.basis_papers} PAPERS` : ""} />
            <ScoreCell label="PHARMA" sub="NOT RANKED" value={s?.pharma ?? null} noRank absent="NO DISCLOSURES ON RECORD" />
          </div>
          <div style={{ padding: "0 24px 14px", ...mono(9, 500), letterSpacing: ".08em", color: P.ink6 }}>
            RECORD DEPTH{nSrc < 12 ? " · THIN" : ""} · {nPos} POSITION{nPos === 1 ? "" : "S"} · {nSrc} SOURCE{nSrc === 1 ? "" : "S"} · {notes.length} FIELD NOTE{notes.length === 1 ? "" : "S"}{p.record_depth.oldest ? ` · OLDEST SOURCE ${p.record_depth.oldest}` : ""}
          </div>
        </div>

        {/* objective lens — OFF in stage 1 */}
        <div style={{ border: `1px solid ${P.line}`, background: P.band, padding: "13px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink5 }}>OBJECTIVE LENS</span>
          <span style={{ ...mono(10), color: P.ink4, letterSpacing: ".06em" }}>
            LENS OFF · {isLensOn ? "relevance matching is stage 2" : `${nPos} position${nPos === 1 ? "" : "s"} is below the threshold (${THRESHOLDS.lensMinPositions}) to select against`}
          </span>
        </div>

        {/* THE BRIEF */}
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
          <SectionHead id="belief" tag="BELIEF PROFILE" count={`${nPos} POSITION${nPos === 1 ? "" : "S"} · ${nSrc} SOURCE${nSrc === 1 ? "" : "S"} · ALL PUBLISHED`} sub="POSITIONS DESCRIBE THE PUBLISHED WORK · NOT THE PERSON" />
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
                <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>Nothing has been extracted from the published record for this HCP in NSCLC. This is an absence in the record, not evidence that no position exists — the score band above is comparable cohort-wide regardless.</span>
              </div>
            )}
          </div>
        </div>

        {/* FIELD PRESENCE — the only section an MSL can fill. Functional capture (composer
            + list) ported from DetailScreen; writes msl_hcp_notes via createNote. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="field" tag="FIELD PRESENCE" count={`${notes.length} CONTRIBUTION${notes.length === 1 ? "" : "S"}`} sub="MSL-CAPTURED · STRUCTURED REACTIONS · YOUR TEAM ONLY" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
            <FieldInsights hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} />
          </div>
        </div>

        {/* RELATIONSHIP — track, add-to-watchlist, status, follow-ups (ported from DetailScreen) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="relationship" tag="RELATIONSHIP" sub="TRACK · STATUS · FOLLOW-UPS · SYNCS WITH THE LEDGER" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 20px" }}>
            <ProfileRelationshipControls hcpId={p.hcp.id} hcpName={p.hcp.name} specialty={p.hcp.specialty} />
          </div>
        </div>

        {/* THE RECORD */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="record" tag="THE RECORD" sub="SCIENTIFIC AND COMMERCIAL FOOTPRINT AT EQUAL WEIGHT" />
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
            {/* timeline (years present + zero years drawn as the shape of the record) */}
            {p.record.timeline && p.record.timeline.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>PUBLICATION TIMELINE</span>
                <Timeline data={p.record.timeline} />
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
            {/* collaborators — no co-authorship network table in stage 1 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>TOP COLLABORATORS</span>
              <span style={{ ...serif(12.5), color: P.ink5, lineHeight: 1.5 }}>The co-authorship collaborator network is not wired in stage 1 — the shared-position tallies it needs do not exist yet.</span>
            </div>
          </div>
        </div>

        {/* FIELD INTELLIGENCE — UNRATED until a real review exists */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="intel" tag="FIELD INTELLIGENCE" sub="NOT SET · REQUIRES 1 REVIEW" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
            {["COMMUNITY CONFIDENCE", "ENGAGEMENT POTENTIAL", "SCIENTIFIC CREDIBILITY", "MOMENTUM TRAJECTORY"].map((l) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ ...mono(9, 500), letterSpacing: ".1em", color: P.ink6 }}>{l}</span>
                <span style={{ ...mono(12, 600), letterSpacing: ".1em", color: P.ink5 }}>UNRATED</span>
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1", ...mono(9), lineHeight: 1.6, color: P.ink6, letterSpacing: ".04em" }}>
              CHIPS STAY UNRATED RATHER THAN DEFAULTING TO A MIDDLE VALUE. A DEFAULTED "MODERATE" WOULD READ AS A FINDING.
            </div>
          </div>
        </div>

        {/* SIGNAL SUMMARY — generated synthesis */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead id="signal" tag="SIGNAL SUMMARY" sub="GENERATED SYNTHESIS" />
          {p.signal_summary ? (
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ ...serif(15, 400), color: P.ink2, lineHeight: 1.6, textWrap: "pretty" }}>{p.signal_summary}</span>
              <span style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.ink6 }}>MODEL SYNTHESIS OVER THE SOURCES ABOVE · REVIEW BEFORE USE · NO CLINICAL CLAIM · METHODOLOGY V4.2</span>
            </div>
          ) : (
            <Withheld head="SIGNAL SUMMARY · WITHHELD" title="No generated synthesis for this HCP yet." body="The synthesis is generated over the sourced record. None is on file for this HCP in NSCLC." />
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: P.page, minHeight: "100vh" }}>
      <div style={{ maxWidth: CONTENT_WIDTH.wide, margin: "0 auto", width: "100%", boxSizing: "border-box", fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
        <NavBar />
        {children}
      </div>
    </div>
  );
}

function Timeline({ data }: { data: { year: number; count: number }[] }) {
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
          <div key={d.year} title={`${d.year}: ${d.count}`} style={{ flex: 1, height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 1, background: d.count ? P.sage : "rgba(255,255,255,.06)" }} />
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
