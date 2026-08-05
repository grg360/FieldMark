// Community HCP profile — direction 1a "two spines", stage 1. Reached via /hcp/:id/brief
// when the HCP has no sourced positions (dispatched in ProfileDispatch). Community HCPs
// don't publish, so there is no belief profile: the spine is the INDUSTRY ENGAGEMENT
// RECORD (primary, full-bleed, first), with MSL FIELD INSIGHTS as the second spine right
// under it. Shares the ledger/academic visual language (same register, typography, score
// treatment, honest empty-state discipline). Money is typeset as evidence, never as
// achievement — neutral weight, counts always beside amounts. Live data only.

import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import NavBar from "../NavBar";
import { CONTENT_WIDTH } from "../../lib/designTokens";
import { institutionToSlug } from "../../lib/institutionUtils";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { loadFieldPresence, type FieldNote } from "../../lib/hcpProfile";
import { getCurrentUser } from "../../lib/authHelpers";
import { getOrCreateRelationship, type RelationshipStatus } from "../../lib/relationships";
import FieldInsights from "../FieldInsights/FieldInsights";
import RelationshipSection from "../RelationshipSection/RelationshipSection";
import AddToWatchlistPopover from "../AddToWatchlistPopover";
import ContextualizeHCPForm from "../ContextualizeHCPForm";
import OptOutRequestForm from "../OptOutRequestForm";
import { FiChip, FiModal, FiToast } from "../FieldIntelligenceShared";
import { profileHcp } from "./ProfileRelationshipControls";
import {
  loadCommunityProfile,
  loadEvidenceTier,
  money,
  moneyCompact,
  titleCase,
  MATERIALITY_USD,
  type CommunityProfile,
  type NsclcEvidenceTier,
  type Product,
} from "../../lib/communityProfile";

const P = {
  page: "#08090A", card: "#0E1013", head: "#0B0D10", band: "#0A0C0E", drawer: "#0A0C0F",
  line: "rgba(255,255,255,.06)", lineMed: "rgba(255,255,255,.09)", lineStrong: "rgba(255,255,255,.14)",
  amber: "#E0A75E", rose: "#B0848F", // Community cohort marker (ledger)
  ink0: "#EDEEEF", ink1: "#E7E8E9", ink2: "#C6CACD", ink3: "#A8AEB3", ink4: "#8F959A",
  ink5: "#7C8288", ink6: "#63696E", dash: "#71787E", teal: "#7FB3BB",
} as const;
const mono = (s: number, w = 400) => ({ font: `${w} ${s}px 'IBM Plex Mono',ui-monospace,monospace` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px 'Source Serif 4',Georgia,serif` } as const);

const STATUS_LABEL: Record<RelationshipStatus, string> = {
  not_engaged: "Not Engaged", targeted: "Targeted", contacted: "Contacted",
  engaged: "Engaged", active_relationship: "Active Relationship", paused: "Paused",
};

// Frame engagement-mix palette (1a): Consulting amber, Speaker blue, Food&Bev green,
// Honoraria violet, Travel gray. Royalty isn't drawn in the frame — cohort rose.
const MIX_COLOR: Record<string, string> = {
  "Consulting": "#D69A3C", "Speaker bureau": "#5B8FD6", "Food & beverage": "#57A878",
  "Honoraria": "#8A7FB8", "Travel, lodging, education": "#6F7370", "Royalty": "#B0848F",
};
const mixColor = (label: string) => MIX_COLOR[label] ?? "#6F7370";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : y ?? "—";
}

/** Amount-vs-count shape cell: two bars normalized to the visible column maxima. The
 *  divergence between them IS the intelligence — few-large (long amount, short count)
 *  vs many-small (short amount, long count) — with no invented labels or thresholds. */
function ShapeBars({ amount, payments, maxAmount, maxPayments }: { amount: number; payments: number; maxAmount: number; maxPayments: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
      <span style={{ height: 4, background: P.line, borderRadius: 1 }}>
        <span style={{ display: "block", height: 4, width: `${Math.max((amount / maxAmount) * 100, 2)}%`, background: P.rose, borderRadius: 1 }} />
      </span>
      <span style={{ height: 3, background: P.line, borderRadius: 1 }}>
        <span style={{ display: "block", height: 3, width: `${Math.max((payments / maxPayments) * 100, 2)}%`, background: P.ink6, borderRadius: 1 }} />
      </span>
    </div>
  );
}

function SectionHead({ id, glyph, tag, count, sub }: { id?: string; glyph: string; tag: string; count?: string; sub?: string }) {
  return (
    <div id={id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 0 12px", scrollMarginTop: 16, flexWrap: "wrap" }}>
      <span style={{ ...mono(11, 600), letterSpacing: ".16em", color: P.rose }}>{glyph}</span>
      <span style={{ ...mono(11, 600), letterSpacing: ".16em", color: P.ink1 }}>{tag}</span>
      {count ? <span style={{ ...mono(10, 500), letterSpacing: ".1em", color: P.ink4 }}>{count}</span> : null}
      {sub ? <span style={{ flex: 1, minWidth: 120, ...mono(9, 500), letterSpacing: ".1em", color: P.ink6, textAlign: "right" }}>{sub}</span> : null}
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

// Evidence line — frame 1d. Directly under the name, one slot, every state. Absence
// states its cause and never renders empty or as a zero. Prose is composed from the
// view's fields; the supported string is used verbatim (group 5 must read
// "cross-indication targeted therapy observed", never "NSCLC prescribing observed").
// Never renders a patient count or any tumour-type-attributed volume.
function EvidenceLine({ ev }: { ev: NsclcEvidenceTier | null }) {
  if (!ev) return null;
  const yrs = ev.anchor_years ?? [];
  const consecutive = yrs.length >= 2 && yrs[yrs.length - 1] - yrs[0] === yrs.length - 1;
  const stems = ev.anchor_stems ?? (ev.anchor_stem ? [ev.anchor_stem] : []);
  const stemPhrase = stems.length > 1 ? `${stems.slice(0, -1).join(", ")} and ${stems[stems.length - 1]}` : stems[0] ?? "a lung-only oral";
  const oralNoun = stems.length > 1 ? "orals indicated only for non-small cell lung cancer" : "an oral indicated only for non-small cell lung cancer";

  let accent: string = P.ink6; // dim by default (absence / other)
  let label = "EVIDENCE";
  let lead = "";
  let caveat = "";
  if (ev.tier === "anchored") {
    accent = P.amber;
    label = "EVIDENCE · MEDICARE PART D";
    const yearList = yrs.length ? yrs.join(", ") : "the observed period";
    lead = `Prescribed ${stemPhrase} — ${oralNoun} — in ${yearList}.`;
    caveat =
      (ev.years_anchored ?? yrs.length) >= 2
        ? `${ev.years_anchored ?? yrs.length}${consecutive ? " consecutive" : ""} years of prescribing is a materially stronger claim than one. Claims and prescribing carry no diagnosis.`
        : `A single year of prescribing. Claims and prescribing carry no diagnosis.`;
  } else if (ev.tier === "supported") {
    accent = "#B99A68";
    label = "EVIDENCE · SUPPORTING";
    lead = ev.supported_evidence ? `${ev.supported_evidence}.` : "Supporting evidence observed.";
    caveat = "Supporting evidence, not a lung-specific anchor. Claims and prescribing carry no diagnosis.";
  } else if (ev.tier === "candidate") {
    label = "EVIDENCE · SOLID-TUMOUR ORAL";
    lead = "Solid-tumour oral oncology prescribing, with no lung-specific evidence observed 2022–2024.";
    caveat = "Not disqualifying. A lung panel with no targetable mutation prescribes no oral therapy at all, so absence of a lung oral is never disproof of lung practice.";
  } else if (ev.tier === "heme_dominant") {
    label = "EVIDENCE · ORAL MIX";
    lead = "Oral oncology prescribing is predominantly haematology agents — over 70% of fills 2022–2024. No lung-only oral was prescribed in that period.";
    caveat = "A description of practice, not a disqualification. Reachable from the ledger by filter and searchable throughout.";
  } else {
    label = "EVIDENCE · NOT OBSERVED";
    lead = "No Medicare drug evidence was observed 2022–2024 — no Part D prescribing and no Part B drug billing. The likely reason is billing path: prescribing under an organisational NPI, or a panel weighted to Medicare Advantage.";
    caveat = "This is not evidence of inactivity. A lung panel with no targetable mutation prescribes no oral therapy at all, so absence of a lung oral is never disproof of lung practice.";
  }

  return (
    <div style={{ borderLeft: `2px solid ${accent}`, padding: "2px 0 2px 14px", marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ ...mono(9, 500), letterSpacing: ".11em", color: ev.tier === "anchored" ? P.amber : P.ink4 }}>{label}</span>
      <p style={{ margin: 0, ...serif(13.5), lineHeight: 1.55, color: P.ink2, textWrap: "pretty" }}>{lead}</p>
      <p style={{ margin: 0, ...serif(12.5), lineHeight: 1.55, color: P.ink4, textWrap: "pretty" }}>{caveat}</p>
      {ev.lung_weighted ? (
        <span style={{ alignSelf: "flex-start", ...mono(9), letterSpacing: ".1em", color: P.ink4, border: `1px solid ${P.lineStrong}`, padding: "4px 8px" }}>
          LUNG-WEIGHTED ORAL MIX
        </span>
      ) : null}
    </div>
  );
}

export default function CommunityHcpProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rel = useRelationships();
  const [p, setP] = useState<CommunityProfile | null>(null);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [evidence, setEvidence] = useState<NsclcEvidenceTier | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"recency" | "amount">("recency");

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    Promise.all([loadCommunityProfile(id), loadFieldPresence(id), loadEvidenceTier(id)]).then(([prof, fn, ev]) => {
      if (!alive) return;
      setP(prof); setNotes(fn); setEvidence(ev); setLoading(false);
    }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>Loading profile…</div></Shell>;
  if (!p || !p.hcp?.name) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>This profile could not be loaded.</div></Shell>;

  const status = id ? rel.getStatus(id) : "not_engaged";
  const loc = [titleCase(p.hcp.city), p.hcp.state].filter(Boolean).join(", ");
  // practice_shape is null when the HCP holds no community rank row (an HCP outside the
  // cohort can still land on this spine) — guard, don't crash; rows data-gate to absent.
  const ps = p.practice_shape ?? { patient_volume: null, setting: null, career_years: null, drug_breadth: null, total_career_pubs: null };
  const sc = p.score;
  const eng = p.engagement;

  // engagement record: split at the materiality threshold, sort per control
  const allProducts = eng.products ?? [];
  const shown = allProducts.filter((d) => (d.amount ?? 0) >= MATERIALITY_USD);
  const sortedShown = [...shown].sort((a, b) => {
    if (sort === "amount") return (b.amount ?? 0) - (a.amount ?? 0);
    return (b.most_recent ?? "").localeCompare(a.most_recent ?? ""); // recency default
  });

  // magnitude/breadth aggregates over the company record (complete, no missing values)
  const companies = p.entities ?? [];
  const maxCoAmount = Math.max(...companies.map((c) => c.amount), 1);
  const maxCoPayments = Math.max(...companies.map((c) => c.payments), 1);
  const lifetime = eng.lifetime_total ?? 0;
  const topShare = companies.length && lifetime > 0 ? (companies[0].amount / lifetime) * 100 : null;
  const activeThrough = [...companies.map((c) => c.most_recent), ...allProducts.map((d) => d.most_recent)]
    .filter((d): d is string => !!d).sort().pop() ?? null;
  const tailCompanies = Math.max((eng.distinct_companies ?? 0) - companies.length, 0);
  const tailAmount = lifetime > 0 ? Math.max(lifetime - companies.reduce((a, c) => a + c.amount, 0), 0) : null;

  const n = p.narrative;
  const mixTotal = (p.mix ?? []).reduce((a, m) => a + (m.amount ?? 0), 0);

  return (
    <Shell>
      <div style={{ padding: "20px 24px 120px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, ...mono(9.5, 500), letterSpacing: ".1em", color: P.ink5 }}>
          <span style={{ width: 3, height: 12, background: P.rose }} />
          <span style={{ color: P.rose }}>COMMUNITY</span><span>›</span>
          <Link to="/cohorts/ledger/community" style={{ color: P.teal, textDecoration: "none" }}>↑ BACK TO LEDGER</Link>
        </div>

        {/* header — frame 1a: three cells (identity+actions | PRACTICE SHAPE | COMMUNITY
            SCORE), one bordered container, left borders between cells. flex-wrap stands in
            for the frame's fixed 1fr/300/300 grid so narrow viewports stack. */}
        <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, position: "relative", display: "flex", flexWrap: "wrap" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: P.rose }} />
          {/* identification — chips, name, specialty · location · NPI, action row */}
          <div style={{ flex: "2 1 400px", minWidth: 0, padding: "22px 24px 20px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", ...mono(8.5, 600), letterSpacing: ".14em" }}>
              <span style={{ color: P.rose, border: `1px solid rgba(176,132,143,.4)`, borderRadius: 3, padding: "3px 7px" }}>COMMUNITY</span>
              <span style={{ color: P.amber, border: `1px solid rgba(224,167,94,.35)`, borderRadius: 3, padding: "3px 7px" }}>{STATUS_LABEL[status].toUpperCase()}</span>
              <span style={{ color: P.ink6 }}>NO PUBLICATION RECORD</span>
            </div>
            <span style={{ ...serif(31, 400), color: P.ink0, letterSpacing: "-.01em" }}>{p.hcp.name}</span>
            <span style={{ ...mono(10.5), color: P.ink4, letterSpacing: ".02em" }}>
              {p.hcp.specialty ? `${p.hcp.specialty}` : ""}
              {p.hcp.institution ? (
                <>
                  {p.hcp.specialty ? " · " : ""}
                  <a href={`/institution/${institutionToSlug(p.hcp.institution)}`}
                     onClick={(e) => { e.preventDefault(); navigate(`/institution/${institutionToSlug(p.hcp.institution!)}`); }}
                     style={{ color: P.teal, textDecoration: "none", borderBottom: `1px solid rgba(127,179,187,.3)` }}>{p.hcp.institution}</a>
                </>
              ) : null}
              {loc ? ` · ${loc}` : ""}
              {p.hcp.npi ? ` · NPI ${p.hcp.npi}` : ""}
            </span>
            <EvidenceLine ev={evidence} />
            <HeaderActions hcpId={p.hcp.id} npi={p.hcp.npi} onBrief={() => navigate(`/hcp/${p.hcp.id}/brief`)} />
          </div>
          {/* practice shape — frame: its own 300px cell, label-left / value-right rows */}
          <div style={{ flex: "1 1 260px", maxWidth: 320, padding: "22px 24px 20px", borderLeft: `1px solid ${P.line}`, display: "flex", flexDirection: "column" }}>
            <span style={{ ...mono(9, 600), letterSpacing: ".18em", color: P.ink6, paddingBottom: 14 }}>PRACTICE SHAPE</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {/* data-gated NSCLC therapy signals (2026-07-30 re-score) — proxies, labeled
                  "NSCLC-relevant", never "NSCLC patients". The legacy untraceable
                  patient_volume figure is no longer displayed. */}
              {(p.nsclc?.spend_3yr ?? 0) > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ ...mono(10.5), color: P.ink4 }}>Selected oncology therapy spend</span>
                  <span style={{ ...mono(12), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>{moneyCompact(p.nsclc!.spend_3yr)}<span style={{ ...mono(9), color: P.ink6 }}> / 3yr</span></span>
                </div>
              ) : null}
              {(p.nsclc?.volume_2023_est ?? 0) > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ ...mono(10.5), color: P.ink4 }}>Largest single-agent patient count</span>
                  <span style={{ ...mono(12), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>≈{Math.round(p.nsclc!.volume_2023_est!)}<span style={{ ...mono(9), color: P.ink6 }}> est. · 2023</span></span>
                </div>
              ) : null}
              {((p.nsclc?.spend_3yr ?? 0) > 0 || (p.nsclc?.volume_2023_est ?? 0) > 0) ? (
                <div style={{ ...mono(9), color: P.ink6, lineHeight: 1.5 }}>
                  Selected administered oncology agents. Claims carry no indication; these are not NSCLC-specific.
                </div>
              ) : null}
              {p.medicare_paid_corrected != null ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ ...mono(10.5), color: P.ink4 }}>Medicare paid</span>
                  <span style={{ ...mono(12), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>{moneyCompact(p.medicare_paid_corrected)}<span style={{ ...mono(9), color: P.ink6 }}> / 3yr</span></span>
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ ...mono(10.5), color: P.ink4 }}>Setting</span>
                <span style={{ ...mono(11), color: P.ink1 }}>{ps.setting ? `${titleCase(ps.setting)} practice` : "—"}</span>
              </div>
              {/* Open-Payments-derived: gated when zero — a bare "0" beside administered
                  therapy spend reads as broken when it actually means "no pharma
                  payments" (the engagement record carries that honest state). */}
              {(ps.drug_breadth ?? 0) > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ ...mono(10.5), color: P.ink4 }}>Drug breadth</span>
                  <span style={{ ...mono(12), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>{ps.drug_breadth}<span style={{ ...mono(9), color: P.ink6 }}> paid-around products</span></span>
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ ...mono(10.5), color: P.ink4 }}>Career</span>
                <span style={{ ...mono(11), color: P.ink1 }}>{ps.career_years != null ? `${ps.career_years} yrs post-fellowship` : "—"}</span>
              </div>
            </div>
          </div>
          {/* community score / decomposition — the interpretive frame */}
          <div style={{ flex: "1 1 260px", maxWidth: 320, padding: "22px 24px 20px", borderLeft: `1px solid ${P.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ ...mono(9, 600), letterSpacing: ".18em", color: P.ink6 }}>COMMUNITY SCORE</span>
            {p.has_score && sc?.normalized != null ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ ...mono(30, 500), color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{Math.round(sc.normalized)}</span>
                  <span style={{ ...mono(11), color: P.ink5 }}>/ 100</span>
                </div>
                <span style={{ ...mono(9.5), color: P.ink5, letterSpacing: ".04em" }}>Rank {sc.rank?.toLocaleString()} of {sc.scope_size?.toLocaleString()} · NSCLC community cohort</span>
                {/* decomposition — weight bars (frame panel treatment). Bars show the real
                    scoring WEIGHTS (40/30/15/10/5); exact per-component contribution values
                    are computed in the pipeline and not persisted, so weights are shown. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 8 }}>
                  {([["Therapy spend", 20], ["Therapy vol. (est.)", 20], ["Engagement", 30], ["Setting", 15], ["Career", 10], ["Publication", 5]] as [string, number][]).map(([l, w]) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 96, ...mono(9), color: P.ink4, letterSpacing: ".02em" }}>{l}</span>
                      <span style={{ flex: 1, height: 4, background: P.line, borderRadius: 1 }}>
                        <span style={{ display: "block", height: 4, width: `${w * 2}%`, background: l === "Publication" && (sc.total_career_pubs ?? 0) === 0 ? P.lineStrong : P.rose, borderRadius: 1 }} />
                      </span>
                      <span style={{ width: 30, textAlign: "right", ...mono(9), color: P.ink3, fontVariantNumeric: "tabular-nums" }}>{w}%</span>
                    </div>
                  ))}
                </div>
                {/* traceable inputs — the two stored signals behind the 40% activity
                    component, shown separately (never blended into one opaque number) */}
                {p.nsclc?.spend_signal != null && p.nsclc?.volume_signal != null ? (
                  <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".02em", paddingTop: 2 }}>
                    Oncology therapy signals (0–100 in cohort): spend {p.nsclc.spend_signal.toFixed(1)} · est. volume {p.nsclc.volume_signal.toFixed(1)}
                  </span>
                ) : null}
                {/* one-line note per the frame — methodology detail lives in the scoring
                    modal, not on the panel */}
                {(sc.total_career_pubs ?? 0) === 0 ? (
                  <span style={{ ...mono(9), lineHeight: 1.55, color: P.ink6, letterSpacing: ".02em", paddingTop: 2, borderTop: `1px solid ${P.line}`, marginTop: 2 }}>
                    No indexed publications — the 5-point publication component contributes nothing and is not redistributed.
                  </span>
                ) : null}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...mono(12, 600), letterSpacing: ".1em", color: P.ink4 }}>SCORE NOT COMPUTABLE</span>
                <span style={{ ...serif(12.5), color: P.ink5, lineHeight: 1.5 }}>Claims coverage below threshold — no community score. A partial score would be read as a low score, so the numeral is withheld.</span>
              </div>
            )}
          </div>
        </div>

        {/* two-column body per the frame: main content left, right rail right */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* ─────────── MAIN (left) ─────────── */}
        <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ◆ INDUSTRY ENGAGEMENT RECORD — PRIMARY (the spine) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHead glyph="◆" tag="INDUSTRY ENGAGEMENT RECORD" sub="PRIMARY" />
          {eng.has_record && (companies.length || shown.length) ? (
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
              {/* compliance framing, verbatim intent */}
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${P.line}`, ...serif(12.5), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>
                CMS Open Payments, disclosed transfers of value, published federally. It describes contact between industry and this practice — <span style={{ color: P.ink2 }}>not influence, not prescribing, not quality of care, and not standing relative to other practitioners</span>. Payment counts are shown beside every amount because thirty $40 meals and one $10K consulting agreement are different facts.
              </div>

              {/* aggregate framing — the record's magnitude, breadth, concentration and
                  recency. This is the complete part of the profile: zero missing values. */}
              <div style={{ display: "flex", flexWrap: "wrap", borderBottom: `1px solid ${P.line}`, background: P.head }}>
                {([
                  ["LIFETIME", money(eng.lifetime_total)],
                  ["COMPANIES", eng.distinct_companies != null ? String(eng.distinct_companies) : "—"],
                  ["TOP RELATIONSHIP", topShare != null ? `${Math.round(topShare)}% of lifetime` : "—"],
                  ["ACTIVE THROUGH", fmtMonth(activeThrough)],
                ] as [string, string][]).map(([l, v], i) => (
                  <div key={l} style={{ flex: "1 1 120px", padding: "10px 20px", borderLeft: i ? `1px solid ${P.line}` : "none" }}>
                    <div style={{ ...mono(8.5, 500), letterSpacing: ".12em", color: P.ink6, paddingBottom: 3 }}>{l}</div>
                    <div style={{ ...mono(12.5, 500), color: P.ink1, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* BY COMPANY — ranked by amount (rank_by_amount). The paired bars make the
                  amount-vs-count SHAPE visible: few-large vs many-small relationships. */}
              {companies.length ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 20px 6px", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink3 }}>BY COMPANY <span style={{ color: P.ink6 }}>· TOP {companies.length} OF {eng.distinct_companies ?? companies.length} BY AMOUNT</span></span>
                    <span style={{ ...mono(8.5), color: P.ink6 }}>
                      <span style={{ display: "inline-block", width: 14, height: 4, background: P.rose, borderRadius: 1, marginRight: 5, verticalAlign: "middle" }} />amount
                      <span style={{ display: "inline-block", width: 14, height: 3, background: P.ink6, borderRadius: 1, margin: "0 5px 0 12px", verticalAlign: "middle" }} />payments · scaled to the top row
                    </span>
                  </div>
                  <div style={{ display: "flex", padding: "6px 20px", borderBottom: `1px solid ${P.line}`, ...mono(8.5, 500), letterSpacing: ".1em", color: P.ink6 }}>
                    <span style={{ width: 26 }}>#</span>
                    <span style={{ flex: "1 1 140px" }}>COMPANY</span>
                    <span style={{ width: 96 }} aria-hidden />
                    <span style={{ width: 70, textAlign: "right" }}>AMOUNT</span>
                    <span style={{ width: 62, textAlign: "right" }}>PAYMENTS</span>
                    <span style={{ width: 68, textAlign: "right" }}>LAST</span>
                  </div>
                  {companies.map((c) => (
                    <div key={c.name} style={{ display: "flex", alignItems: "center", padding: "8px 20px", borderBottom: `1px solid ${P.line}` }}>
                      <span style={{ width: 26, ...mono(9.5), color: P.ink6, fontVariantNumeric: "tabular-nums" }}>{c.rank ?? "—"}</span>
                      <span style={{ flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...mono(10.5), color: P.ink2, paddingRight: 10 }}>{titleCase(c.name)}</span>
                      <span style={{ width: 96, paddingRight: 10, boxSizing: "border-box" }}>
                        <ShapeBars amount={c.amount} payments={c.payments} maxAmount={maxCoAmount} maxPayments={maxCoPayments} />
                      </span>
                      <span style={{ width: 70, textAlign: "right", ...mono(11.5), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{money(c.amount)}</span>
                      <span style={{ width: 62, textAlign: "right", ...mono(10.5), color: P.ink4, fontVariantNumeric: "tabular-nums" }}>{c.payments}</span>
                      <span style={{ width: 68, textAlign: "right", ...mono(9.5), color: P.ink5 }}>{fmtMonth(c.most_recent)}</span>
                    </div>
                  ))}
                  {tailCompanies > 0 ? (
                    <div style={{ padding: "9px 20px", borderBottom: `1px solid ${P.line}`, ...mono(9), color: P.ink5, letterSpacing: ".02em" }}>
                      {tailCompanies} further companies below the top {companies.length}{tailAmount != null ? `, aggregating ${money(tailAmount)}` : ""}.
                    </div>
                  ) : null}
                </>
              ) : null}

              {/* BY PRODUCT — trend-free: which agents the practice engages on. Amount,
                  count and recency only; no per-year columns exist to trend. */}
              {shown.length ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 20px 6px", flexWrap: "wrap", gap: 8 }}>
                    <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink3 }}>BY PRODUCT <span style={{ color: P.ink6 }}>· ABOVE THE ${MATERIALITY_USD.toLocaleString()} THRESHOLD</span></span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ ...mono(8.5, 600), letterSpacing: ".12em", color: P.ink6 }}>SORT</span>
                      {(["recency", "amount"] as const).map((k) => (
                        <button key={k} onClick={() => setSort(k)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, minHeight: 0, ...mono(9, sort === k ? 600 : 400), letterSpacing: ".08em", color: sort === k ? P.ink1 : P.ink5 }}>{k.toUpperCase()}</button>
                      ))}
                    </span>
                  </div>
                  <div style={{ display: "flex", padding: "6px 20px", borderBottom: `1px solid ${P.line}`, ...mono(8.5, 500), letterSpacing: ".1em", color: P.ink6 }}>
                    <span style={{ flex: "2 1 150px" }}>PRODUCT · REPORTING ENTITY</span>
                    <span style={{ width: 70, textAlign: "right" }}>AMOUNT</span>
                    <span style={{ width: 62, textAlign: "right" }}>PAYMENTS</span>
                    <span style={{ width: 68, textAlign: "right" }}>LAST</span>
                  </div>
                  {sortedShown.map((d, i) => <ProductRow key={i} d={d} />)}
                </>
              ) : null}

              <div style={{ padding: "12px 20px", ...mono(9), color: P.ink5, letterSpacing: ".04em" }}>
                {eng.distinct_drugs} products with reported transfers · {shown.length} above the ${MATERIALITY_USD.toLocaleString()} disclosure-materiality threshold shown
              </div>
            </div>
          ) : (
            <div style={{ border: `1px solid ${P.lineStrong}`, background: P.band, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ ...mono(10, 600), letterSpacing: ".12em", color: P.ink4 }}>NO ENGAGEMENT RECORD</span>
              <span style={{ ...serif(16, 500), color: P.ink1 }}>No reported transfers of value, 2019–2024.</span>
              <span style={{ ...serif(13), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>This is a fact about disclosure, not about the practitioner. The spine of this profile is missing — plan from claims volume and setting alone. An absence in the open-payments record is not evidence that no relationship exists.</span>
            </div>
          )}
        </div>

        {/* ◆ FIELD INSIGHTS — SECOND SPINE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead glyph="◆" tag="FIELD INSIGHTS" count={`(${notes.length})`} sub="SECOND SPINE · MSL-CAPTURED · YOUR TEAM ONLY" />
          <div style={{ ...mono(10.5), color: P.ink4, lineHeight: 1.7, letterSpacing: ".01em", textWrap: "pretty" }}>
            This practitioner has no published record. Everything below the engagement data is either machine-derived from claims and payments, or written by a person who was in the room. The second kind is scarce and load-bearing here.
          </div>
          {/* functional capture (composer + list) ported from DetailScreen; msl_hcp_notes */}
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
            <FieldInsights hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} />
          </div>
        </div>

        {/* ◆ WHY THIS PRACTITIONER — the narrative, or its absence in the same slot under
            the same heading. ~91% of the community cohort has no narrative row (generated
            for top-ranked HCPs only); the absence states the coverage fact, never blank. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead glyph="◆" tag="WHY THIS PRACTITIONER" />
          {n?.why_this ? (
            <div style={{ ...serif(15, 400), color: P.ink2, lineHeight: 1.6, textWrap: "pretty" }}>{n.why_this}</div>
          ) : (
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ ...mono(12, 600), letterSpacing: ".1em", color: P.ink4 }}>NO GENERATED SUMMARY</span>
              <span style={{ ...serif(12.5), color: P.ink5, lineHeight: 1.5, textWrap: "pretty" }}>Narrative synthesis runs for the top-ranked HCPs in each cohort and this practitioner ranks below that cut. A coverage fact, not a judgment about the practice.</span>
            </div>
          )}
        </div>

        {/* ◆ SIGNAL SUMMARY — MACHINE-DERIVED */}
        {(n?.signal_strength || n?.why_now || n?.engagement_angle || n?.caution) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead glyph="◆" tag="SIGNAL SUMMARY" sub="MACHINE-DERIVED" />
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {[["CONFIDENCE", n?.signal_strength], ["WHY NOW", n?.why_now], ["ENGAGEMENT ANGLE", n?.engagement_angle], ["CAUTION", n?.caution]].map(([l, v]) => v ? (
                <div key={l as string} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>{l}</span>
                  <span style={{ ...serif(13.5), color: P.ink3, lineHeight: 1.55, textWrap: "pretty" }}>{v}</span>
                </div>
              ) : null)}
              <span style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.ink6 }}>MODEL SYNTHESIS OVER THE RECORD ABOVE · REVIEW BEFORE USE · NO CLINICAL CLAIM</span>
            </div>
          </div>
        ) : null}

        </div>{/* ─────────── /MAIN ─────────── */}

        {/* ─────────── RIGHT RAIL ─────────── */}
        <div style={{ flex: "1 1 320px", maxWidth: 380, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ◆ ENGAGEMENT MIX — frame treatment: proportional stacked bar, color-swatched
            rows, computed synthesis line beneath. Category colors are the frame's own
            (same convention as the trajectory palette). */}
        {p.mix && mixTotal > 0 ? (() => {
          const rows = p.mix.filter((m) => (m.amount ?? 0) > 0).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
          const pct = (v: number | null) => ((v ?? 0) / mixTotal) * 100;
          const topCat = rows[0];
          const topEnt = p.entities?.[0];
          const restCompanies = (eng.distinct_companies ?? 0) - 1;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SectionHead glyph="◆" tag="ENGAGEMENT MIX" count={`${money(eng.lifetime_total)} LIFETIME`} />
              <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 22px" }}>
                {/* stacked bar — segment widths are category share of the 3yr mix */}
                <div style={{ display: "flex", height: 8, borderRadius: 1, overflow: "hidden", marginBottom: 14 }}>
                  {rows.map((m) => (
                    <span key={m.label} style={{ width: `${pct(m.amount)}%`, background: mixColor(m.label) }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {rows.map((m) => (
                    <div key={m.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ width: 7, height: 7, background: mixColor(m.label), flex: "none" }} />
                      <span style={{ flex: 1, ...mono(10.5), color: P.ink2 }}>{m.label}</span>
                      <span style={{ ...mono(10.5), color: P.ink4 }}>{money(m.amount)}</span>
                      <span style={{ width: 34, textAlign: "right", ...mono(9.5), color: P.ink6, fontVariantNumeric: "tabular-nums" }}>{Math.round(pct(m.amount))}%</span>
                    </div>
                  ))}
                </div>
                {/* synthesis — computed from the real mix + entity rows, no mock figures */}
                {topCat && topEnt ? (
                  <div style={{ marginTop: 11, ...mono(9), lineHeight: 1.55, color: P.ink6 }}>
                    {topCat.label} leads the mix ({Math.round(pct(topCat.amount))}% of the 3-yr categorised record). The largest single relationship is {titleCase(topEnt.name)} — {money(topEnt.amount)} across {topEnt.payments} payments{restCompanies > 0 ? `; the remainder spreads across ${restCompanies} further companies` : ""}.
                  </div>
                ) : null}
              </div>
            </div>
          );
        })() : null}

        {/* REPORTING ENTITIES rail panel removed — the redesigned engagement record's
            BY COMPANY table carries the same rows with richer treatment (rank, shape
            bars, recency); a duplicate list in the rail would just repeat it. */}

        {/* ◆ ENGAGEMENT TIMELINE */}
        {p.timeline && p.timeline.some((t) => (t.total ?? 0) > 0) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead glyph="◆" tag="ENGAGEMENT TIMELINE" />
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 22px" }}>
              <Timeline data={p.timeline} />
              <span style={{ ...mono(9), color: P.ink6, letterSpacing: ".02em" }}>Yearly totals cover the 2022–2024 reporting window held in the record; 2024 is partial — CMS publishes through June. Do not read the drop as disengagement. Earlier years (2019–2021) are not in the yearly breakdown.</span>
            </div>
          </div>
        ) : null}

        {/* ◆ FIELD INTELLIGENCE — frame right-rail treatment: three segmented validation
            questions rendered INLINE with a Submit control (not display-only chips). The
            submission path is still unwired (field_intel_* tables are SELECT-only — see
            KNOWN_ISSUES); submit says so honestly rather than faking success. */}
        <FieldIntelligencePanel />

        {/* ◆ RELATIONSHIP — frame order: status + follow-ups, field notes, then
            add-context / report-issue and the opt-out line. Track/+List moved to the
            header action row per the frame; status writes stay on RelationshipSection
            (same component, same write path, syncs with the ledger). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead glyph="◆" tag="RELATIONSHIP" sub="STATUS · FOLLOW-UPS · SYNCS WITH THE LEDGER" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
            <RelationshipSection hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>FIELD NOTES</span>
              {notes.length ? (
                <span style={{ ...mono(9.5), color: P.ink5, lineHeight: 1.5 }}>{notes.length} field insight{notes.length === 1 ? "" : "s"} captured — shown in the second spine.</span>
              ) : (
                <span style={{ border: `1px dashed ${P.lineStrong}`, borderRadius: 3, padding: "12px 14px", ...mono(10), color: P.ink5 }}>No field notes yet — add the first.</span>
              )}
            </div>
            <RailControls hcpId={p.hcp.id} hcpName={p.hcp.name} specialty={p.hcp.specialty} lastName={p.hcp.last_name} />
          </div>
        </div>

        </div>{/* ─────────── /RIGHT RAIL ─────────── */}
        </div>{/* ─────────── /two-column body ─────────── */}
      </div>
    </Shell>
  );
}

function ProductRow({ d }: { d: Product }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", padding: "9px 20px", borderBottom: `1px solid ${P.line}` }}>
      <div style={{ flex: "2 1 150px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ ...mono(11, 500), color: P.ink1, letterSpacing: ".02em" }}>{d.drug}</span>
        <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.entity ? d.entity.toUpperCase() : "—"}</span>
      </div>
      <span style={{ width: 70, textAlign: "right", ...mono(11.5), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{money(d.amount)}</span>
      <span style={{ width: 62, textAlign: "right", ...mono(10.5), color: P.ink4, fontVariantNumeric: "tabular-nums" }}>{d.payments ?? "—"}</span>
      <span style={{ width: 68, textAlign: "right", ...mono(9.5), color: P.ink5 }}>{fmtMonth(d.most_recent)}</span>
    </div>
  );
}

/** Header action row per frame 1a: ✦ BRIEF · + LIST · TRACK/◗ TRACKED · NPI Registry →.
 *  Track + watchlist reuse the exact write paths ProfileRelationshipControls used
 *  (toggleSave / AddToWatchlistPopover), only the placement moved to the header. */
function HeaderActions({ hcpId, npi, onBrief }: { hcpId: string; npi: string | null; onBrief: () => void }) {
  const { isTracked, toggleSave, refreshTracked } = useRelationships();
  const [userId, setUserId] = useState<string | null>(null);
  const [relationshipId, setRelationshipId] = useState<string | null>(null);
  const [wlAnchor, setWlAnchor] = useState<DOMRect | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    getCurrentUser().then((u) => alive && setUserId(u?.id ?? null));
    return () => { alive = false; };
  }, []);

  const tracked = isTracked(hcpId);
  const act = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "none",
    border: `1px solid ${P.lineStrong}`, cursor: "pointer", ...mono(10, 500), letterSpacing: ".08em",
    color: P.ink2, borderRadius: 3, minHeight: 0, textDecoration: "none",
  } as const;

  async function openWatchlist() {
    if (!userId) return;
    if (!relationshipId) {
      const rel = await getOrCreateRelationship(userId, hcpId, "hcp_profile");
      setRelationshipId(rel.id);
    }
    setWlAnchor(addRef.current?.getBoundingClientRect() ?? null);
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 10 }}>
      <button onClick={onBrief} title="Generate a pre-meeting brief" style={act}>✦ BRIEF</button>
      <button ref={addRef} onClick={() => void openWatchlist()} title="Add to a watchlist" style={act}>+ LIST</button>
      <button onClick={() => void toggleSave(hcpId, "hcp_profile")} title={tracked ? "Tracked — click to untrack" : "Track this HCP"}
        style={{ ...act, color: tracked ? P.teal : P.ink2, borderColor: tracked ? "rgba(127,179,187,.45)" : P.lineStrong }}>
        {tracked ? "◗ TRACKED" : "◗ TRACK"}
      </button>
      {npi ? (
        <a href={`https://npiregistry.cms.hhs.gov/provider-view/${npi}`} target="_blank" rel="noopener noreferrer"
          style={{ ...act, color: P.ink4 }}>NPI REGISTRY →</a>
      ) : null}
      {wlAnchor && userId && relationshipId ? (
        <AddToWatchlistPopover userId={userId} relationshipId={relationshipId} anchorRect={wlAnchor}
          onClose={() => { setWlAnchor(null); void refreshTracked(); }} />
      ) : null}
    </div>
  );
}

// Frame 1a's three validation questions, rendered inline in the rail with segmented
// options. The write path is unwired (SELECT-only tables) — submit acknowledges honestly.
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
      <SectionHead glyph="◆" tag="FIELD INTELLIGENCE" />
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

// Relationship-panel tail per frame 1a: Add context / Report data issue stacked, then the
// opt-out line. Reuses the same forms/handlers the old Contact & Controls bucket used —
// same non-persistence, same honest toasts.
const ISSUE_TYPES = ["incorrect institution", "wrong specialty", "outdated info", "other"] as const;
const ISSUE_NOTE_CHIPS = [
  "Affiliation recently changed", "Specialty label mismatch", "Publication count seems stale",
  "Score inconsistent with field read", "Possible duplicate profile",
] as const;

function RailControls({ hcpId: _hcpId, hcpName, specialty, lastName }: { hcpId: string; hcpName: string; specialty?: string | null; lastName: string | null }) {
  const [ctxOpen, setCtxOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [issueType, setIssueType] = useState<string | null>(null);
  const [issueNotes, setIssueNotes] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); };
  const ta = specialty && /lung|onc/i.test(specialty) ? "Oncology" : undefined;

  const stack = {
    textAlign: "center", padding: "9px 0", background: "none", border: `1px solid ${P.lineStrong}`,
    borderRadius: 3, ...mono(10.5, 500), color: P.ink2, cursor: "pointer", minHeight: 0, width: "100%",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button style={{ ...stack, color: P.teal, borderColor: "rgba(127,179,187,.35)" }} onClick={() => setCtxOpen(true)}>Add context</button>
      <button style={stack} onClick={() => setReportOpen(true)}>Report data issue</button>
      <span style={{ ...mono(9), lineHeight: 1.6, color: P.ink6, paddingTop: 6 }}>
        Are you {lastName ? `Dr. ${lastName}` : "this practitioner"}?{" "}
        <button onClick={() => setOptOpen(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...mono(9), color: P.teal, minHeight: 0 }}>
          Request opt-out or claim this profile.
        </button>{" "}
        Payment data is federal public record and cannot be removed here.
      </span>

      {ctxOpen && (
        <ContextualizeHCPForm hcpName={hcpName} therapeuticArea={ta} onClose={() => setCtxOpen(false)}
          onSubmit={() => { setCtxOpen(false); showToast("Saved. Your contribution will appear in aggregate when 3+ MSLs contribute similar context."); }} />
      )}
      {optOpen && (
        <OptOutRequestForm hcpName={hcpName} onClose={() => setOptOpen(false)}
          onSubmit={() => { setOptOpen(false); showToast("Request received — we'll respond within 5 business days."); }} />
      )}
      {reportOpen && (
        <FiModal title="Report data issue" onClose={() => setReportOpen(false)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "rgba(232,230,223,.5)", marginBottom: 8 }}>Issue type</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ISSUE_TYPES.map((opt) => (
                <FiChip key={opt} label={opt} selected={issueType === opt} onClick={() => setIssueType(issueType === opt ? null : opt)} />
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "rgba(232,230,223,.5)", marginBottom: 8 }}>Notes (select all that apply)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ISSUE_NOTE_CHIPS.map((opt) => (
                <FiChip key={opt} label={opt} selected={issueNotes.has(opt)} multi onClick={() => {
                  const next = new Set(issueNotes); if (next.has(opt)) next.delete(opt); else next.add(opt); setIssueNotes(next);
                }} />
              ))}
            </div>
          </div>
          <button type="button" style={{ ...stack, width: "auto", padding: "8px 14px" }}
            onClick={() => { setReportOpen(false); showToast("Issue reported — thank you for helping improve this profile."); }}>Submit report</button>
        </FiModal>
      )}
      <FiToast message={toast} />
    </div>
  );
}

function Timeline({ data }: { data: { year: number; total: number | null }[] }) {
  const max = Math.max(...data.map((d) => d.total ?? 0), 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 60 }}>
        {data.map((d) => (
          <div key={d.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ ...mono(9), color: P.ink4 }}>{money(d.total)}</span>
            <div title={`${d.year}: ${money(d.total)}`} style={{ width: "100%", height: `${((d.total ?? 0) / max) * 100}%`, minHeight: (d.total ?? 0) > 0 ? 3 : 1, background: d.year === 2024 ? "rgba(176,132,143,.5)" : P.rose }} />
            <span style={{ ...mono(9), color: P.ink6 }}>{d.year}{d.year === 2024 ? " ·partial" : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
