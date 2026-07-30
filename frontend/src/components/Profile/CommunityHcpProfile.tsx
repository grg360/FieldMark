// Community HCP profile — direction 1a "two spines", stage 1. Reached via /hcp/:id/brief
// when the HCP has no sourced positions (dispatched in ProfileDispatch). Community HCPs
// don't publish, so there is no belief profile: the spine is the INDUSTRY ENGAGEMENT
// RECORD (primary, full-bleed, first), with MSL FIELD INSIGHTS as the second spine right
// under it. Shares the ledger/academic visual language (same register, typography, score
// treatment, honest empty-state discipline). Money is typeset as evidence, never as
// achievement — neutral weight, counts always beside amounts. Live data only.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import NavBar from "../NavBar";
import { CONTENT_WIDTH } from "../../lib/designTokens";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { loadFieldPresence, type FieldNote } from "../../lib/hcpProfile";
import FieldInsights from "../FieldInsights/FieldInsights";
import ProfileRelationshipControls, { profileHcp } from "./ProfileRelationshipControls";
import {
  loadCommunityProfile,
  trajectory,
  money,
  titleCase,
  MATERIALITY_USD,
  type CommunityProfile,
  type Product,
  type TrajectoryDir,
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

function TrajCell({ dir, trend }: { dir: TrajectoryDir; trend: number | null }) {
  if (dir === "insufficient") return <span style={{ ...mono(9), color: P.ink6, letterSpacing: ".04em" }}>insufficient history</span>;
  const c = dir === "growing" ? "#7FB39A" : dir === "contracting" ? "#C08A8A" : P.ink4;
  const arrow = dir === "growing" ? "↑" : dir === "contracting" ? "↓" : "→";
  return <span style={{ ...mono(9.5, 500), color: c, letterSpacing: ".06em" }}>{arrow} {dir}{trend != null ? ` ${trend > 0 ? "+" : ""}${Math.round(trend)}%` : ""}</span>;
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
      <div style={{ maxWidth: CONTENT_WIDTH.wide, margin: "0 auto", width: "100%", boxSizing: "border-box", fontFamily: "'IBM Plex Mono',ui-monospace,monospace" }}>
        <NavBar />{children}
      </div>
    </div>
  );
}

export default function CommunityHcpProfile() {
  const { id } = useParams<{ id: string }>();
  const rel = useRelationships();
  const [p, setP] = useState<CommunityProfile | null>(null);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"recency" | "trajectory" | "amount">("recency");

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    Promise.all([loadCommunityProfile(id), loadFieldPresence(id)]).then(([prof, fn]) => {
      if (!alive) return;
      setP(prof); setNotes(fn); setLoading(false);
    }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>Loading profile…</div></Shell>;
  if (!p || !p.hcp?.name) return <Shell><div style={{ padding: "40px 24px", ...mono(11), color: P.ink5 }}>This profile could not be loaded.</div></Shell>;

  const status = id ? rel.getStatus(id) : "not_engaged";
  const loc = [titleCase(p.hcp.city), p.hcp.state].filter(Boolean).join(", ");
  const ps = p.practice_shape;
  const sc = p.score;
  const eng = p.engagement;

  // engagement record: split at the materiality threshold, sort per control
  const allProducts = eng.products ?? [];
  const shown = allProducts.filter((d) => (d.amount ?? 0) >= MATERIALITY_USD);
  const sortedShown = [...shown].sort((a, b) => {
    if (sort === "amount") return (b.amount ?? 0) - (a.amount ?? 0);
    if (sort === "trajectory") return (b.trend_pct ?? -999) - (a.trend_pct ?? -999);
    return (b.most_recent ?? "").localeCompare(a.most_recent ?? ""); // recency default
  });
  const legend = shown.reduce((acc, d) => { acc[trajectory(d.trend_pct)]++; return acc; }, { growing: 0, stable: 0, contracting: 0, insufficient: 0 } as Record<TrajectoryDir, number>);

  const n = p.narrative;
  const mixTotal = (p.mix ?? []).reduce((a, m) => a + (m.amount ?? 0), 0);

  return (
    <Shell>
      <div style={{ padding: "20px 24px 120px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, ...mono(9.5, 500), letterSpacing: ".1em", color: P.ink5 }}>
          <span style={{ width: 3, height: 12, background: P.rose }} />
          <span style={{ color: P.rose }}>COMMUNITY</span><span>›</span>
          <Link to="/cohorts/ledger" style={{ color: P.teal, textDecoration: "none" }}>↑ BACK TO LEDGER</Link>
        </div>

        {/* identity + practice shape + score (interpretive frame beside identity) */}
        <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, position: "relative", display: "flex", flexWrap: "wrap" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: P.rose }} />
          <div style={{ flex: "2 1 420px", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 6, borderRight: `1px solid ${P.line}` }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", ...mono(8.5, 600), letterSpacing: ".12em" }}>
              <span style={{ color: P.rose, border: `1px solid rgba(176,132,143,.4)`, padding: "1px 6px" }}>COMMUNITY</span>
              <span style={{ color: P.ink4, border: `1px solid ${P.lineStrong}`, padding: "1px 6px" }}>{STATUS_LABEL[status].toUpperCase()}</span>
              <span style={{ color: P.ink5, border: `1px solid ${P.lineStrong}`, padding: "1px 6px" }}>NO PUBLICATION RECORD</span>
            </div>
            <span style={{ ...serif(24, 600), color: P.ink0, letterSpacing: "-.01em", paddingTop: 4 }}>{p.hcp.name}</span>
            <span style={{ ...mono(10.5), color: P.ink4, letterSpacing: ".02em" }}>{[p.hcp.specialty, loc, p.hcp.npi ? `NPI ${p.hcp.npi}` : ""].filter(Boolean).join(" · ")}</span>
            {/* practice shape */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "10px 20px", paddingTop: 12 }}>
              {[["PATIENT VOLUME", ps.patient_volume != null ? `${ps.patient_volume.toLocaleString()} vol · signal` : "—"],
                ["SETTING", ps.setting ? `${titleCase(ps.setting)} practice` : "—"],
                ["DRUG BREADTH", ps.drug_breadth != null ? `${ps.drug_breadth} products` : "—"],
                ["CAREER", ps.career_years != null ? `${ps.career_years} yrs post-fellowship` : "—"]].map(([l, v]) => (
                <div key={l} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ ...mono(8.5, 500), letterSpacing: ".12em", color: P.ink6 }}>{l}</span>
                  <span style={{ ...mono(11), color: P.ink2 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          {/* community score / decomposition — the interpretive frame */}
          <div style={{ flex: "1 1 260px", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>COMMUNITY SCORE</span>
            {p.has_score && sc?.composite != null ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ ...mono(30, 500), color: P.amber, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{sc.composite}</span>
                  <span style={{ ...mono(11), color: P.ink5 }}>/ 100</span>
                </div>
                <span style={{ ...mono(9.5), color: P.ink5, letterSpacing: ".04em" }}>Rank {sc.rank?.toLocaleString()} of {sc.scope_size?.toLocaleString()} · NSCLC community cohort</span>
                {/* decomposition — weights are real; exact per-component contributions are not persisted */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingTop: 6 }}>
                  {[["Practice volume", 40], ["Engagement", 30], ["Setting", 15], ["Career", 10], ["Publication", 5]].map(([l, w]) => (
                    <div key={l as string} style={{ display: "flex", justifyContent: "space-between", ...mono(9.5), color: P.ink4 }}>
                      <span>{l}</span><span style={{ color: P.ink5 }}>{w}% weight</span>
                    </div>
                  ))}
                </div>
                <span style={{ ...mono(9), lineHeight: 1.55, color: P.ink6, letterSpacing: ".02em", paddingTop: 2 }}>
                  {(sc.total_career_pubs ?? 0) === 0 ? "No indexed publications — the 5-point publication component contributes nothing and is not redistributed. " : ""}Community scores are structurally capped at 95. Per-component contribution values are computed in the scoring pipeline and not persisted; the composite and its weights are shown.
                </span>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ ...mono(12, 600), letterSpacing: ".1em", color: P.ink4 }}>SCORE NOT COMPUTABLE</span>
                <span style={{ ...serif(12.5), color: P.ink5, lineHeight: 1.5 }}>Claims coverage below threshold — no community score. A partial score would be read as a low score, so the numeral is withheld.</span>
              </div>
            )}
          </div>
        </div>

        {/* ◆ INDUSTRY ENGAGEMENT RECORD — PRIMARY (the spine) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionHead glyph="◆" tag="INDUSTRY ENGAGEMENT RECORD" sub="PRIMARY" />
          {eng.has_record && shown.length ? (
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
              {/* compliance framing, verbatim intent */}
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${P.line}`, ...serif(12.5), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>
                CMS Open Payments, disclosed transfers of value, published federally. It describes contact between industry and this practice — <span style={{ color: P.ink2 }}>not influence, not prescribing, not quality of care, and not standing relative to other practitioners</span>. Payment counts are shown beside every amount because thirty $40 meals and one $10K consulting agreement are different facts.
              </div>
              {/* sort control */}
              <div style={{ padding: "8px 20px", borderBottom: `1px solid ${P.line}`, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ ...mono(8.5, 600), letterSpacing: ".12em", color: P.ink6 }}>SORT</span>
                {(["recency", "trajectory", "amount"] as const).map((k) => (
                  <button key={k} onClick={() => setSort(k)} style={{ background: "none", border: "none", cursor: "pointer", ...mono(9, sort === k ? 600 : 400), letterSpacing: ".08em", color: sort === k ? P.ink1 : P.ink5 }}>{k.toUpperCase()}</button>
                ))}
              </div>
              {/* column heads */}
              <div style={{ display: "flex", padding: "8px 20px", borderBottom: `1px solid ${P.line}`, ...mono(8.5, 500), letterSpacing: ".1em", color: P.ink6, background: P.head }}>
                <span style={{ flex: "2 1 160px" }}>PRODUCT · REPORTING ENTITY</span>
                <span style={{ width: 90, textAlign: "right" }}>TRANSFERS</span>
                <span style={{ width: 74, textAlign: "right" }}>PAYMENTS</span>
                <span style={{ width: 120, textAlign: "right" }}>TRAJECTORY 22–24</span>
              </div>
              {sortedShown.map((d, i) => <ProductRow key={i} d={d} />)}
              {/* footer: threshold + legend */}
              <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, ...mono(9), color: P.ink5, letterSpacing: ".04em" }}>
                <span>{eng.distinct_drugs} products with reported transfers · {shown.length} above the ${MATERIALITY_USD.toLocaleString()} disclosure-materiality threshold shown</span>
                <span style={{ display: "flex", gap: 12 }}>
                  <span style={{ color: "#7FB39A" }}>● growing {legend.growing}</span>
                  <span style={{ color: P.ink4 }}>● stable {legend.stable}</span>
                  <span style={{ color: "#C08A8A" }}>● contracting {legend.contracting}</span>
                  {legend.insufficient ? <span style={{ color: P.ink6 }}>● insufficient {legend.insufficient}</span> : null}
                </span>
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
          <div style={{ ...serif(12.5), color: P.ink4, lineHeight: 1.55, textWrap: "pretty" }}>
            This practitioner has no published record. Everything above the engagement data is machine-derived from claims and payments, or written by a person who was in the room. The second kind is scarce and load-bearing here.
          </div>
          {/* functional capture (composer + list) ported from DetailScreen; msl_hcp_notes */}
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card }}>
            <FieldInsights hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} />
          </div>
        </div>

        {/* ◆ WHY THIS PRACTITIONER */}
        {n.why_this ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead glyph="◆" tag="WHY THIS PRACTITIONER" />
            <div style={{ ...serif(15, 400), color: P.ink2, lineHeight: 1.6, textWrap: "pretty" }}>{n.why_this}</div>
          </div>
        ) : null}

        {/* ◆ SIGNAL SUMMARY — MACHINE-DERIVED */}
        {(n.signal_strength || n.why_now || n.engagement_angle || n.caution) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead glyph="◆" tag="SIGNAL SUMMARY" sub="MACHINE-DERIVED" />
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {[["CONFIDENCE", n.signal_strength], ["WHY NOW", n.why_now], ["ENGAGEMENT ANGLE", n.engagement_angle], ["CAUTION", n.caution]].map(([l, v]) => v ? (
                <div key={l as string} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ ...mono(9, 600), letterSpacing: ".14em", color: P.ink6 }}>{l}</span>
                  <span style={{ ...serif(13.5), color: P.ink3, lineHeight: 1.55, textWrap: "pretty" }}>{v}</span>
                </div>
              ) : null)}
              <span style={{ ...mono(9, 500), letterSpacing: ".06em", color: P.ink6 }}>MODEL SYNTHESIS OVER THE RECORD ABOVE · REVIEW BEFORE USE · NO CLINICAL CLAIM</span>
            </div>
          </div>
        ) : null}

        {/* ◆ ENGAGEMENT MIX */}
        {p.mix && mixTotal > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead glyph="◆" tag="ENGAGEMENT MIX" count={`${money(eng.lifetime_total)} LIFETIME`} />
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
              {p.mix.filter((m) => (m.amount ?? 0) > 0).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)).map((m) => (
                <div key={m.label} style={{ display: "flex", justifyContent: "space-between", ...mono(10.5), color: P.ink3 }}>
                  <span>{m.label}</span>
                  <span><span style={{ color: P.ink2 }}>{money(m.amount)}</span> <span style={{ color: P.ink5 }}>{Math.round(((m.amount ?? 0) / mixTotal) * 100)}%</span></span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ◆ REPORTING ENTITIES */}
        {p.entities && p.entities.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead glyph="◆" tag="REPORTING ENTITIES" count={`${eng.distinct_companies} DISTINCT`} />
            <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "14px 22px", display: "flex", flexDirection: "column", gap: 5 }}>
              {p.entities.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", ...mono(10), color: P.ink3 }}>
                  <span style={{ letterSpacing: ".02em" }}>{c.name.toUpperCase()} <span style={{ color: P.ink6 }}>{c.payments} PAYMENTS</span></span>
                  <span style={{ color: P.ink2 }}>{money(c.amount)}</span>
                </div>
              ))}
              {(eng.distinct_companies ?? 0) > p.entities.length ? (
                <span style={{ ...mono(9), color: P.ink6, paddingTop: 3 }}>{(eng.distinct_companies ?? 0) - p.entities.length} further entities below the top {p.entities.length}.</span>
              ) : null}
            </div>
          </div>
        ) : null}

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

        {/* ◆ FIELD INTELLIGENCE — UNRATED */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead glyph="◆" tag="FIELD INTELLIGENCE" sub="VALIDATION PENDING · 0 MSLs HAVE REVIEWED THIS PROFILE" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "18px 22px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
            {[["COMMUNITY CONFIDENCE", "engagement record matches field reality"], ["ACCESS IN PRACTICE", "open / gated / closed"], ["REFERRAL INFLUENCE", "high / moderate / low"]].map(([l, s]) => (
              <div key={l} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ ...mono(9, 500), letterSpacing: ".1em", color: P.ink6 }}>{l}</span>
                <span style={{ ...mono(12, 600), letterSpacing: ".1em", color: P.ink5 }}>UNRATED</span>
                <span style={{ ...mono(8.5), color: P.ink6, letterSpacing: ".02em" }}>{s}</span>
              </div>
            ))}
            <div style={{ gridColumn: "1 / -1", ...mono(9), lineHeight: 1.6, color: P.ink6, letterSpacing: ".04em" }}>CHIPS STAY UNRATED RATHER THAN DEFAULTING TO A MIDDLE VALUE. YOUR IDENTITY IS NEVER SHARED · CONTRIBUTOR UUID ONLY.</div>
          </div>
        </div>

        {/* ◆ RELATIONSHIP — track, add-to-watchlist, status, follow-ups (ported from
            DetailScreen; canonical StatusEditor replaces the earlier custom menu — one
            status control, in sync with the ledger). Opt-out kept below. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionHead glyph="◆" tag="RELATIONSHIP" sub="TRACK · STATUS · FOLLOW-UPS · SYNCS WITH THE LEDGER" />
          <div style={{ border: `1px solid ${P.lineMed}`, background: P.card, padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <ProfileRelationshipControls hcpId={p.hcp.id} hcpName={p.hcp.name} specialty={p.hcp.specialty} />
            <span style={{ ...mono(9), lineHeight: 1.55, color: P.ink6, letterSpacing: ".02em" }}>Are you {p.hcp.name}? Request opt-out or claim this profile. Payment data is federal public record and cannot be removed here.</span>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function ProductRow({ d }: { d: Product }) {
  const dir = trajectory(d.trend_pct);
  const span = [d.py2022, d.py2023, d.py2024].map((v, i) => ((v ?? 0) > 0 ? 2022 + i : null)).filter((y): y is number => y != null);
  const spanTxt = span.length ? (span.length === 1 ? `${span[0]}` : `${span[0]}–${span[span.length - 1]}`) : (d.most_recent ? d.most_recent.slice(0, 4) : "—");
  return (
    <div style={{ display: "flex", alignItems: "flex-start", padding: "11px 20px", borderBottom: `1px solid ${P.line}` }}>
      <div style={{ flex: "2 1 160px", display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ ...mono(11.5, 500), color: P.ink1, letterSpacing: ".02em" }}>{d.drug}</span>
        <span style={{ ...mono(9), color: P.ink5, letterSpacing: ".02em" }}>{d.entity ? d.entity.toUpperCase() : "—"} · SPAN {spanTxt}</span>
      </div>
      <span style={{ width: 90, textAlign: "right", ...mono(12), color: P.ink2, fontVariantNumeric: "tabular-nums" }}>{money(d.amount)}</span>
      <span style={{ width: 74, textAlign: "right", ...mono(11), color: P.ink4, fontVariantNumeric: "tabular-nums" }}>{d.payments ?? "—"}</span>
      <span style={{ width: 120, textAlign: "right" }}><TrajCell dir={dir} trend={d.trend_pct} /></span>
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
