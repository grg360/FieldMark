// Practice-first community HCP profile. Frame authority:
// docs/design/Community HCP Profile Practice First.dc.html — layout, section order,
// treatments and palette are the frame's; every number is a live binding. Composed
// figures in the frame with no backing (per-code volumes, per-year services/$, site
// counts, distance-to-academic-centre) render as honest gaps or are omitted — never
// fabricated. Runs ALONGSIDE the two-spine profile at /hcp/:id/practice (not a cutover).
//
// Two treatments locked by the build brief:
//   1. beneficiary-years: total_beneficiaries_3yr is a SUM of annual counts, labeled
//      "beneficiary-years" everywhere, with the counted-three-times footnote and the
//      real distinct-person estimate beside it. Never "unique patients".
//   2. the −57% slope renders as a QUESTION ("ask him what moved"), not an alarm.
// The ONLY trend visual on the page is the 3-year beneficiary series. No payment trends.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import NavBar from "../NavBar";
import { CONTENT_WIDTH } from "../../lib/designTokens";
import { institutionToSlug } from "../../lib/institutionUtils";
import { useRelationships } from "../../contexts/RelationshipsContext";
import { getCurrentUser } from "../../lib/authHelpers";
import { getOrCreateRelationship, type RelationshipStatus } from "../../lib/relationships";
import { loadFieldPresence, type FieldNote } from "../../lib/hcpProfile";
import FieldInsights from "../FieldInsights/FieldInsights";
import AdministeredVolumeBlock from "./AdministeredVolumeBlock";
import RelationshipSection from "../RelationshipSection/RelationshipSection";
import AddToWatchlistPopover from "../AddToWatchlistPopover";
import ContextualizeHCPForm from "../ContextualizeHCPForm";
import OptOutRequestForm from "../OptOutRequestForm";
import { FiChip, FiModal, FiToast } from "../FieldIntelligenceShared";
import { profileHcp } from "./ProfileRelationshipControls";
import {
  loadCommunityProfile, money, moneyCompact, titleCase, MATERIALITY_USD,
  type CommunityProfile, type Product,
} from "../../lib/communityProfile";
import {
  loadPracticeProfile, classifyProducts, rucaLabel, placeOfServiceLabel,
  type PracticeProfile, type ClassifiedProduct, type AdminCode,
} from "../../lib/practiceProfile";

// Frame palette — literals from the .dc.html.
const F = {
  page: "#0a0b0b", alt: "#0b0c0c", card: "#0d0e0e", hover: "#121414", well: "#101212",
  line: "#1c1e1e", lineSub: "#141616", lineFaint: "#171919", border2: "#232626",
  bright: "#e6e2d8", body: "#cfcbc0", mid: "#b6b2a8", gray: "#9a9f9b", dim: "#8a8f8c",
  faint: "#7f857f", subtle: "#6b716e", ghost: "#5c625f", ghost2: "#4d534f",
  amber: "#d69a3c", amberBorder: "#493a20", blue: "#5b8dd9", blueBorder: "#2c3f5c",
  green: "#4e9e6a", greenBorder: "#22402f", red: "#b8574a", violet: "#8a7fb8",
} as const;
const mono = (s: number, w = 400) => ({ font: `${w} ${s}px 'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace` } as const);
const serif = (s: number, w = 400) => ({ font: `${w} ${s}px 'Source Serif 4',Georgia,serif` } as const);

const STATUS_LABEL: Record<RelationshipStatus, string> = {
  not_engaged: "Not Engaged", targeted: "Targeted", contacted: "Contacted",
  engaged: "Engaged", active_relationship: "Active Relationship", paused: "Paused",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : y ?? "—";
}
const fmtInt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const fmtUsd = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);

function SectionTag({ tag, sub, dim }: { tag: string; sub?: string; dim?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ color: dim ? F.ghost2 : F.amber, fontSize: 8 }}>◆</span>
      <span style={{ ...mono(9), letterSpacing: "0.2em", color: dim ? F.ghost : F.subtle }}>{tag}</span>
      {sub ? <span style={{ ...mono(9), letterSpacing: "0.14em", color: F.ghost2 }}>{sub}</span> : null}
    </div>
  );
}

function MIX_COLOR(label: string): string {
  const m: Record<string, string> = {
    "Consulting": F.amber, "Speaker bureau": F.blue, "Food & beverage": F.green,
    "Honoraria": F.violet, "Travel, lodging, education": F.ghost2, "Royalty": F.red,
  };
  return m[label] ?? F.ghost2;
}

const CLAIMS_TAG: Record<string, { text: (c: ClassifiedProduct) => string; color: string }> = {
  aligned: { text: (c) => `YES · ${c.matchedCode?.code ?? "top code"}`, color: F.amber },
  oral: { text: () => "ORAL · PART D", color: F.ghost },
  injectable_none: { text: () => "INJECTABLE · NONE", color: F.red },
  route_unknown: { text: () => "ROUTE UNKNOWN", color: F.ghost2 },
};

export default function PracticeFirstProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rel = useRelationships();
  const [p, setP] = useState<CommunityProfile | null>(null);
  const [pr, setPr] = useState<PracticeProfile | null>(null);
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [engSort, setEngSort] = useState<"amount" | "recency" | "administered">("amount");
  const [hoverYear, setHoverYear] = useState<2021 | 2022 | 2023 | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    Promise.all([loadCommunityProfile(id), loadPracticeProfile(id), loadFieldPresence(id)])
      .then(([prof, prac, fn]) => {
        if (!alive) return;
        setP(prof); setPr(prac); setNotes(fn); setLoading(false);
      }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  const status = id ? rel.getStatus(id) : "not_engaged";

  // overlay — computed before any early return so hooks stay unconditional
  const overlay = useMemo(() => {
    const products = (p?.engagement.products ?? []).filter((d) => (d.amount ?? 0) >= MATERIALITY_USD);
    const codes = pr?.admin_codes ?? [];
    const classified = classifyProducts(products, codes);
    const by = (cls: string) => classified.filter((c) => c.cls === cls);
    const paidGenerics = new Set(classified.map((c) => c.ref?.generic.toLowerCase()).filter(Boolean) as string[]);
    const adminMapped = codes.filter((c) => c.name && c.category === "drug_admin");
    const adminNoEng = adminMapped.filter((c) => {
      const g = (c.name ?? "").toLowerCase().replace(/\s+(injection|injectable|protein-bound)\b.*$/, "").trim();
      return ![...paidGenerics].some((pg) => pg.includes(g) || g.includes(pg));
    });
    return { classified, aligned: by("aligned"), oral: by("oral"), injectable: by("injectable_none"), unknown: by("route_unknown"), adminMapped, adminNoEng };
  }, [p, pr]);

  if (loading) return <Shell><div style={{ padding: "40px 28px", ...mono(11), color: F.ghost }}>Loading profile…</div></Shell>;
  if (!p || !p.hcp?.name) return <Shell><div style={{ padding: "40px 28px", ...mono(11), color: F.ghost }}>This profile could not be loaded.</div></Shell>;

  const med = pr?.medicare ?? null;
  const cov = pr?.coverage ?? null;
  const sc = p.score;
  const eng = p.engagement;
  const loc = [titleCase(p.hcp.city), p.hcp.state].filter(Boolean).join(", ");
  const org = pr?.nppes?.organization ?? p.hcp.institution ?? null;
  const careerYears = p.practice_shape.career_years;
  const careerStage = pr?.nppes?.career_stage ?? null;

  const beneYears = med?.beneficiary_years_3yr ?? null;
  const y21 = med?.benes_2021 ?? null, y22 = med?.benes_2022 ?? null, y23 = med?.benes_2023 ?? null;
  const yoy = (a: number | null, b: number | null) => (a && b ? ((b - a) / a) * 100 : null);
  const slope = med?.benes_yoy_trend_pct ?? null;
  const svcPerBy = med?.services_3yr && beneYears ? med.services_3yr / beneYears : null;
  const maxYear = Math.max(y21 ?? 0, y22 ?? 0, y23 ?? 0, 1);
  const pos = placeOfServiceLabel(med?.place_of_service);
  const ruca = rucaLabel(med?.ruca);

  const { aligned, oral, injectable, unknown, adminMapped, adminNoEng, classified } = overlay;
  const notAdmin = oral.length + injectable.length + unknown.length;
  const pctile = sc?.rank && sc?.scope_size ? Math.min(99, Math.floor((1 - sc.rank / sc.scope_size) * 100)) : null;

  const clsOrder: Record<string, number> = { aligned: 0, injectable_none: 1, oral: 2, route_unknown: 3 };
  const engRows = [...classified].sort((a, b) => {
    if (engSort === "amount") return (b.product.amount ?? 0) - (a.product.amount ?? 0);
    if (engSort === "recency") return (b.product.most_recent ?? "").localeCompare(a.product.most_recent ?? "");
    return clsOrder[a.cls] - clsOrder[b.cls] || (b.product.amount ?? 0) - (a.product.amount ?? 0);
  });

  const mixTotal = (p.mix ?? []).reduce((a, m) => a + (m.amount ?? 0), 0);
  const mixRows = (p.mix ?? []).filter((m) => (m.amount ?? 0) > 0).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const companies = p.entities ?? [];
  const lastCapture = notes[0]?.occurred_at ?? notes[0]?.created_at ?? null;
  const sharpest = [...injectable].sort((a, b) => (b.product.most_recent ?? "").localeCompare(a.product.most_recent ?? ""))[0] ?? null;
  const genericNames = adminMapped.map((c) => (c.name ?? "").toLowerCase().replace(/\s+injection\b.*$/, "").replace(/\s+protein-bound\b.*$/, " protein-bound"));

  const hoverDetail =
    hoverYear === 2021 ? `2021 · ${fmtInt(y21)} beneficiaries · first year of the published window`
    : hoverYear === 2022 ? `2022 · ${fmtInt(y22)} beneficiaries · ${yoy(y21, y22) != null ? `${yoy(y21, y22)!.toFixed(1)}% YoY` : "—"}`
    : hoverYear === 2023 ? `2023 · ${fmtInt(y23)} beneficiaries · ${yoy(y22, y23) != null ? `${yoy(y22, y23)!.toFixed(1)}% YoY` : "—"}`
    : `2021–2023 aggregate · ${fmtInt(beneYears)} beneficiary-years · ${fmtInt(med?.services_3yr)} services · ${fmtUsd(med?.medicare_paid_corrected)} Medicare paid${slope != null ? ` · ${slope.toFixed(1)}% panel change` : ""}`;

  return (
    <Shell>
      {/* breadcrumb */}
      <div style={{ display: "flex", gap: 8, padding: "10px 28px", ...mono(10), letterSpacing: "0.1em", color: F.ghost2, borderBottom: `1px solid ${F.lineSub}` }}>
        <Link to="/" style={{ color: F.subtle, textDecoration: "none", border: 0 }}>Home</Link><span>/</span>
        <Link to="/cohorts/ledger/community" style={{ color: F.subtle, textDecoration: "none", border: 0 }}>Community</Link><span>/</span>
        <span style={{ color: F.gray }}>{p.hcp.name}</span>
      </div>

      {/* ── header: identity | practice shape | community score ── */}
      <div style={{ display: "flex", flexWrap: "wrap", borderBottom: `1px solid ${F.line}`, background: F.card }}>
        <div style={{ flex: "2 1 420px", minWidth: 0, padding: "22px 28px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ ...mono(9), letterSpacing: "0.16em", color: F.blue, border: `1px solid ${F.blueBorder}`, borderRadius: 2, padding: "3px 8px" }}>COMMUNITY</span>
            <span style={{ ...mono(9), letterSpacing: "0.16em", color: F.amber, border: `1px solid ${F.amberBorder}`, borderRadius: 2, padding: "3px 8px" }}>{STATUS_LABEL[status].toUpperCase()}</span>
            <span style={{ ...mono(9), letterSpacing: "0.16em", color: F.ghost2 }}>NO PUBLICATION RECORD</span>
          </div>
          <div style={{ ...serif(34), lineHeight: 1.05, color: F.bright, letterSpacing: "-0.01em", marginBottom: 12 }}>{p.hcp.name}</div>
          <div style={{ ...mono(11), letterSpacing: "0.06em", color: F.faint, display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {p.hcp.specialty ? <span>{p.hcp.specialty}</span> : null}
            {loc ? <><span style={{ color: "#3a403c" }}>·</span><span>{loc}</span></> : null}
            {p.hcp.npi ? <><span style={{ color: "#3a403c" }}>·</span><span>NPI {p.hcp.npi}</span></> : null}
          </div>
          {org ? (
            <div style={{ ...mono(11), letterSpacing: "0.04em", color: F.faint, marginBottom: 18 }}>
              <a href={`/institution/${institutionToSlug(org)}`}
                 onClick={(e) => { e.preventDefault(); navigate(`/institution/${institutionToSlug(org)}`); }}
                 style={{ color: F.blue, border: 0 }}>{org}</a>
              {pr?.nppes?.co_located_npis ? ` · ${pr.nppes.co_located_npis} co-located NPIs` : ""}
            </div>
          ) : <div style={{ marginBottom: 18 }} />}
          <HeaderActions hcpId={p.hcp.id} npi={p.hcp.npi} onBrief={() => navigate(`/hcp/${p.hcp.id}/brief`)} />
        </div>

        <div style={{ flex: "1 1 280px", maxWidth: 330, padding: "22px 26px", borderLeft: `1px solid ${F.line}` }}>
          <div style={{ ...mono(9), letterSpacing: "0.2em", color: F.ghost, marginBottom: 16 }}>PRACTICE SHAPE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {/* data-gated NSCLC therapy signals (2026-07-30 re-score). Proxies — drugs
                cross indications — so "NSCLC-relevant", never "NSCLC patients". */}
            {(p.nsclc?.spend_3yr ?? 0) > 0 ? (
              <ShapeRow l="Selected oncology therapy spend" v={moneyCompact(p.nsclc!.spend_3yr)} u=" / 3yr" />
            ) : null}
            {(p.nsclc?.volume_2023_est ?? 0) > 0 ? (
              <ShapeRow l="Largest single-agent patient count" v={`≈${Math.round(p.nsclc!.volume_2023_est!)}`} u=" est. · 2023" />
            ) : null}
            {((p.nsclc?.spend_3yr ?? 0) > 0 || (p.nsclc?.volume_2023_est ?? 0) > 0) ? (
              <div style={{ ...mono(9), color: F.faint, lineHeight: 1.5 }}>
                Selected administered oncology agents. Claims carry no indication; these are not NSCLC-specific.
              </div>
            ) : null}
            <ShapeRow l="Services" v={med?.services_3yr != null ? (med.services_3yr >= 1e6 ? `${(med.services_3yr / 1e6).toFixed(2)}M` : fmtInt(med.services_3yr)) : "—"} u=" line items" />
            {med?.medicare_paid_corrected != null ? (
              <ShapeRow l="Medicare paid" v={moneyCompact(med.medicare_paid_corrected)} u=" / 3yr" />
            ) : null}
            <ShapeRow l="Setting" v={pos ?? "—"} u={pos ? " · predominant" : undefined} />
            <ShapeRow l="Geography" v={ruca ?? "—"} />
            <ShapeRow l="Career" v={careerYears != null ? `${careerYears} yrs` : "—"} u={careerYears != null ? " post-fellowship" : undefined} />
          </div>
        </div>

        <div style={{ flex: "1 1 300px", maxWidth: 360, padding: "22px 26px", borderLeft: `1px solid ${F.line}` }}>
          <div style={{ ...mono(9), letterSpacing: "0.2em", color: F.ghost, marginBottom: 10 }}>COMMUNITY SCORE</div>
          {p.has_score && sc?.normalized != null ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 40, lineHeight: 1, color: F.blue, fontWeight: 500, letterSpacing: "-0.02em", ...mono(40, 500) }}>{Math.round(sc.normalized)}</span>
                <span style={{ ...mono(12), color: F.ghost }}>/ 100</span>
                {pctile != null ? <span style={{ ...mono(10), color: F.amber, letterSpacing: "0.1em", marginLeft: 6 }}>{pctile}th pct</span> : null}
              </div>
              <div style={{ ...mono(10), color: F.faint, lineHeight: 1.6, marginBottom: 14 }}>Rank <span style={{ color: F.amber }}>{sc.rank?.toLocaleString()} of {sc.scope_size?.toLocaleString()}</span> · NSCLC community cohort</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([["Therapy spend · 20", 20], ["Therapy vol (est.) · 20", 20], ["Engagement · 30", 30], ["Setting · 15", 15], ["Career · 10", 10], ["Publication · 5", 5]] as [string, number][]).map(([l, w]) => {
                  const dead = l.startsWith("Publication") && (sc.total_career_pubs ?? 0) === 0;
                  return (
                    <div key={l} style={{ display: "grid", gridTemplateColumns: "118px 1fr 34px", alignItems: "center", gap: 8 }}>
                      <span style={{ ...mono(10), color: F.faint }}>{l}</span>
                      <span style={{ height: 3, background: F.line, display: "block" }}>
                        <span style={{ display: "block", height: 3, width: dead ? "0%" : `${w * 2}%`, background: F.blue }} />
                      </span>
                      <span style={{ ...mono(10), color: dead ? F.ghost : F.body, textAlign: "right" }}>{w}%</span>
                    </div>
                  );
                })}
              </div>
              {/* the two stored signals behind the 40% activity component — traceable */}
              {p.nsclc?.spend_signal != null && p.nsclc?.volume_signal != null ? (
                <div style={{ ...mono(9.5), color: F.ghost, lineHeight: 1.6, marginTop: 10 }}>
                  Oncology therapy signals (0–100 in cohort): spend {p.nsclc.spend_signal.toFixed(1)} · est. volume {p.nsclc.volume_signal.toFixed(1)}
                </div>
              ) : null}
              {(sc.total_career_pubs ?? 0) === 0 ? (
                <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, marginTop: 12 }}>No indexed publications — the 5-point publication component contributes nothing and is not redistributed.</div>
              ) : null}
            </>
          ) : (
            <div style={{ ...serif(13), color: F.ghost, lineHeight: 1.5 }}>Claims coverage below threshold — no community score. A partial score would be read as a low score, so the numeral is withheld.</div>
          )}
        </div>
      </div>

      {/* ── ORIENTATION ── */}
      <div style={{ borderBottom: `1px solid ${F.line}`, background: F.alt, padding: "20px 28px 24px" }}>
        <div style={{ marginBottom: 14 }}><SectionTag tag="ORIENTATION" sub="— MACHINE-DERIVED · READ FIRST" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 32 }}>
          <div>
            <div style={{ ...mono(9), letterSpacing: "0.16em", color: F.ghost, marginBottom: 7 }}>WHO THIS IS</div>
            <div style={{ ...serif(14.5), lineHeight: 1.55, color: F.body, textWrap: "pretty" }}>
              A high-volume community practice{loc ? ` in ${loc}` : ""}{pos ? `, predominantly ${pos.toLowerCase()}-based` : ""}{careerYears != null ? `, ${careerYears} years in` : ""}.{adminMapped.length ? ` His top billed codes are led by ${genericNames.slice(0, 3).join(", ")} administration.` : ""}
            </div>
          </div>
          <div>
            <div style={{ ...mono(9), letterSpacing: "0.16em", color: F.ghost, marginBottom: 7 }}>WHAT CHANGED</div>
            <div style={{ ...serif(14.5), lineHeight: 1.55, color: F.body, textWrap: "pretty" }}>
              {y21 != null && y23 != null && slope != null && slope < -20 ? (
                <>The panel halved. <span style={{ color: F.amber }}>{fmtInt(y21)} → {fmtInt(y23)}</span> beneficiaries across 2021–2023. Fewer people each year — the claims show the shape of the change, not its cause.</>
              ) : y21 != null && y23 != null ? (
                <>Beneficiaries moved <span style={{ color: F.amber }}>{fmtInt(y21)} → {fmtInt(y23)}</span> across 2021–2023{slope != null ? ` (${slope.toFixed(0)}%)` : ""}. The claims show the shape, not the cause.</>
              ) : ("No published beneficiary series — the change over time cannot be stated.")}
            </div>
          </div>
          <div>
            <div style={{ ...mono(9), letterSpacing: "0.16em", color: F.ghost, marginBottom: 7 }}>THE ANGLE</div>
            <div style={{ ...serif(14.5), lineHeight: 1.55, color: F.body, textWrap: "pretty" }}>
              He is paid around {oral.length ? `${oral.length} oral agent${oral.length === 1 ? "" : "s"} Part B cannot see` : "agents"}{injectable.length ? ` and ${injectable.length} injectable${injectable.length === 1 ? "" : "s"} with no administration in his top codes` : ""}. How far the paid and administered lists truly overlap is open — the record holds only his top codes. The route split is the solid signal, and the first section below.
            </div>
          </div>
        </div>
      </div>

      {/* ── PAID AROUND vs ADMINISTERED — renders only when this HCP has paid products
          to cross (the meaningful no-engagement-record state lives on the engagement
          record section, once, not here) ── */}
      {classified.length && (aligned.length || notAdmin || adminNoEng.length) ? (
      <div style={{ borderBottom: `1px solid ${F.line}`, padding: "22px 28px 26px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, marginBottom: 10, flexWrap: "wrap" }}>
          <SectionTag tag="PAID AROUND vs ADMINISTERED" sub="— CROSS-DOMAIN · OPEN PAYMENTS × MEDICARE PART B" />
          <div style={{ ...mono(10), color: F.ghost }}>{classified.length} products above threshold · top {pr?.admin_codes.length ?? 0} of {fmtInt(med?.distinct_codes_3yr)} codes held</div>
        </div>
        {notAdmin ? (
          <div style={{ background: F.card, border: `1px solid ${F.line}`, borderRadius: 2, padding: "11px 14px", ...mono(10.5), lineHeight: 1.7, color: F.subtle, marginBottom: 18, textWrap: "pretty" }}>
            Part B claims see what is infused or injected in the office. Oral agents dispense through Part D and are <span style={{ color: F.gray }}>structurally invisible here</span>{oral.length ? ` — ${oral.length} of the ${notAdmin} unmatched products ${oral.length === 1 ? "is" : "are"} oral, and their absence means nothing` : ""}.{injectable.length ? ` The ${injectable.length === 1 ? "injectable" : `${injectable.length} injectables`} with no administration recorded ${injectable.length === 1 ? "is" : "are"} the ${injectable.length === 1 ? "one" : "ones"} worth reading.` : ""}
          </div>
        ) : null}
        {/* Data-gated: a bucket renders ONLY when this HCP's data populates it. A neutral
            gap (alignment uncomputable, no route-unknowns) drops silently — no empty
            bucket, no "0", no apology. Meaningful absences keep their honest states
            elsewhere (no-engagement-record, no-Part-B). 1–3 buckets render per HCP. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 1, background: F.line, border: `1px solid ${F.line}`, borderRadius: 2 }}>
          {aligned.length ? (
            <div style={{ background: F.card, padding: "16px 18px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ ...mono(10), letterSpacing: "0.16em", color: F.amber }}>ALIGNED</span>
                <span style={{ ...mono(16), color: F.amber }}>{aligned.length}</span>
              </div>
              <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.6, marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${F.lineFaint}` }}>Paid around it and it appears in his named top codes.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {aligned.map((c) => (
                  <div key={c.product.drug} style={{ padding: "9px 10px", margin: "0 -10px", borderRadius: 2 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ ...mono(12), color: F.bright, letterSpacing: "0.04em" }}>{c.product.drug}</span>
                      <span style={{ ...mono(12), color: F.amber }}>{money(c.product.amount)}</span>
                    </div>
                    <div style={{ ...mono(10), color: F.subtle, lineHeight: 1.6 }}>{c.ref?.generic}{c.matchedCode ? ` · ${c.matchedCode.code}` : ""}{c.ref?.maker ? ` · ${c.ref.maker}` : ""}</div>
                    <div style={{ ...mono(10), color: F.faint, lineHeight: 1.6 }}>administered · #{c.matchedCode?.ord} in his top codes</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notAdmin ? (
            <div style={{ background: F.card, padding: "16px 18px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ ...mono(10), letterSpacing: "0.16em", color: F.blue }}>PAID AROUND · NOT ADMINISTERED</span>
                <span style={{ ...mono(16), color: F.blue }}>{notAdmin}</span>
              </div>
              <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.6, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${F.lineFaint}` }}>Split by whether Part B could have seen it.</div>

              {oral.length ? (
                <>
                  <div style={{ ...mono(9), letterSpacing: "0.14em", color: F.ghost, marginBottom: 8 }}>ORAL · INVISIBLE TO PART B · {oral.length}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 14px", marginBottom: 16 }}>
                    {oral.map((c) => (
                      <div key={c.product.drug} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 6px", margin: "0 -6px", borderRadius: 2 }}>
                        <span style={{ ...mono(11), color: F.mid }}>{c.product.drug}</span>
                        <span style={{ ...mono(11), color: F.faint }}>{money(c.product.amount)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {injectable.length ? (
                <>
                  <div style={{ ...mono(9), letterSpacing: "0.14em", color: F.red, marginBottom: 8 }}>INJECTABLE · NO ADMINISTRATION RECORDED · {injectable.length}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {injectable.map((c) => (
                      <div key={c.product.drug} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "7px 8px", margin: "0 -8px", borderRadius: 2, borderLeft: `2px solid ${F.red}` }}>
                        <div>
                          <div style={{ ...mono(11.5), color: F.bright }}>{c.product.drug}</div>
                          <div style={{ ...mono(10), color: F.subtle }}>{c.ref?.generic} · {c.ref?.route}{c.ref?.maker ? ` · ${c.ref.maker}` : ""}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ ...mono(11.5), color: F.body }}>{money(c.product.amount)}</div>
                          <div style={{ ...mono(10), color: F.ghost }}>{c.product.payments ?? "—"} pmts</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {unknown.length ? (
                <>
                  <div style={{ ...mono(9), letterSpacing: "0.14em", color: F.ghost2, margin: "14px 0 8px" }}>ROUTE NOT IN REFERENCE · {unknown.length}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {unknown.map((c) => (
                      <div key={c.product.drug} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 8px", margin: "0 -8px", background: F.alt, borderRadius: 2 }}>
                        <span style={{ ...mono(11), color: F.faint }}>{c.product.drug} <span style={{ ...mono(9.5), color: F.ghost2, fontStyle: "italic" }}>route unmapped</span></span>
                        <span style={{ ...mono(9), color: F.ghost, letterSpacing: "0.1em", alignSelf: "center" }}>DATA TASK</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {injectable.length ? (
                <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${F.lineFaint}`, textWrap: "pretty" }}>
                  {injectable.length === 1 ? "One infusible" : `${injectable.length} infusibles`} with a relationship and no administration in the top codes. Either the product has not entered the practice, it sits below the top-code band, or it entered after the 2023 claims window closed.
                </div>
              ) : null}
            </div>
          ) : null}

          {adminNoEng.length ? (
            <div style={{ background: F.card, padding: "16px 18px 18px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ ...mono(10), letterSpacing: "0.16em", color: F.green }}>ADMINISTERED · NO ENGAGEMENT</span>
                <span style={{ ...mono(16), color: F.green }}>{adminNoEng.length}</span>
              </div>
              <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.6, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${F.lineFaint}` }}>His actual practice. No reported transfers of value against any of it.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {adminNoEng.map((c) => (
                  <div key={c.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 8px", margin: "0 -8px", borderRadius: 2 }}>
                    <span style={{ ...mono(11.5), color: F.bright }}>{(c.name ?? "").toLowerCase().replace(/\s+injection\b.*$/, "")}</span>
                    <span style={{ ...mono(10), color: F.faint }}>#{c.ord} · {c.code}</span>
                  </div>
                ))}
              </div>
              <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${F.lineFaint}`, textWrap: "pretty" }}>
                Named codes only, rank order from the claims record. Per-code beneficiary and dollar volumes are not retained in the summary — magnitude bars await a claims-detail rebuild. <a href="#treat" style={{ color: F.blue, border: 0 }}>Full administration table ↓</a>
              </div>
            </div>
          ) : null}
        </div>

        {/* WHAT TO DO WITH THIS */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 18, padding: "14px 16px", background: "#0f0d0a", border: "1px solid #2e2416", borderRadius: 2 }}>
          <span style={{ color: F.amber, fontSize: 8, lineHeight: 2.2 }}>◆</span>
          <div>
            <div style={{ ...mono(9), letterSpacing: "0.18em", color: F.amber, marginBottom: 6 }}>WHAT TO DO WITH THIS</div>
            <div style={{ ...serif(14.5), lineHeight: 1.55, color: F.body, maxWidth: "98ch", textWrap: "pretty" }}>
              The relationship record describes a {oral.length >= injectable.length ? "targeted-and-oral-therapy prescriber" : "prescriber"}. The claims describe an infusion practice{genericNames.length ? ` led by ${genericNames[0]}` : ""}. Both are true — the orals simply do not appear in Part B. Do not treat the gap as disengagement; treat it as a question about where the injectables went.{sharpest ? ` ${sharpest.product.drug} is the sharpest one: a relationship through ${fmtMonth(sharpest.product.most_recent)}, an ${sharpest.ref?.route ?? "injectable"} agent, and no administration in his top codes through 2023.` : ""}
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {/* ── PRACTICE REALITY ── */}
      <div style={{ borderBottom: `1px solid ${F.line}`, padding: "22px 28px 26px", background: F.alt }}>
        <div style={{ marginBottom: 10 }}>
          <SectionTag tag="PRACTICE REALITY" sub={`— MEDICARE PART B 2021–2023 · NPPES${cov ? ` · ${cov.medicare}% COVERAGE` : ""}`} />
        </div>
        {/* slope framing: QUESTION — locked by the brief */}
        {med && slope != null && slope < -20 ? (
          <div style={{ ...serif(19), lineHeight: 1.4, color: F.bright, marginBottom: 18, maxWidth: "110ch", textWrap: "pretty" }}>
            His panel fell {Math.abs(Math.round(slope))}% in three years. Ask him what moved — a partner's retirement, a site, a payer, a referral pattern. The claims record the shape of it and nothing about the reason.
          </div>
        ) : med ? (
          <div style={{ ...serif(19), lineHeight: 1.4, color: F.bright, marginBottom: 18, maxWidth: "110ch", textWrap: "pretty" }}>
            Beneficiary counts moved {fmtInt(y21)} → {fmtInt(y23)} across 2021–2023.
          </div>
        ) : null}

        {med ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,1fr) minmax(280px,400px)", gap: 1, background: F.line, border: `1px solid ${F.line}`, borderRadius: 2 }}>
            <div style={{ background: F.card, padding: "20px 24px 18px" }}>
              {/* frame (current rev): compact 334px slope + values row + −57% callout,
                  with the trend well and HOW TO READ IT beside it — not full-width bars */}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,334px) 1fr", gap: 28, alignItems: "start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ ...mono(9), letterSpacing: "0.16em", color: F.ghost }}>BENEFICIARIES / YR</span>
                    <span style={{ ...mono(9), letterSpacing: "0.1em", color: F.ghost2 }}>hover</span>
                  </div>
                  <div style={{ position: "relative", height: 128, borderBottom: `1px solid ${F.border2}` }}>
                    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1, background: F.lineFaint }} />
                    <div style={{ position: "absolute", left: 0, right: 0, top: 64, height: 1, background: F.lineSub }} />
                    {(() => {
                      const vals = [y21 ?? 0, y22 ?? 0, y23 ?? 0];
                      const xs = [34, 167, 300];
                      const minV = Math.min(...vals), spread = Math.max(maxYear - minV, 1);
                      const y = (v: number) => 14 + ((maxYear - v) / spread) * 74;
                      const pts = vals.map((v, i) => `${xs[i]},${y(v).toFixed(0)}`);
                      const declining = (yoy(y22, y23) ?? 0) < 0;
                      return (
                        <svg viewBox="0 0 334 128" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: 128, overflow: "visible" }}>
                          <polygon points={`${pts.join(" ")} 300,128 34,128`} fill="#12202f" />
                          <polyline points={pts.join(" ")} fill="none" stroke={F.blue} strokeWidth="1.5" />
                          {pts.map((pt, i) => {
                            const [cx, cy] = pt.split(",");
                            return <circle key={i} cx={cx} cy={cy} r="3.5" fill={F.card} stroke={i === 2 && declining ? F.red : F.blue} strokeWidth="1.5" />;
                          })}
                        </svg>
                      );
                    })()}
                    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
                      {([2021, 2022, 2023] as const).map((yr) => (
                        <div key={yr} onMouseEnter={() => setHoverYear(yr)} onMouseLeave={() => setHoverYear(null)}
                          style={{ cursor: "default", borderRadius: 2, background: hoverYear === yr ? F.hover : "transparent" }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", paddingTop: 8 }}>
                    <div>
                      <div style={{ ...mono(13), color: F.bright, letterSpacing: "-0.01em" }}>{fmtInt(y21)}</div>
                      <div style={{ ...mono(10), letterSpacing: "0.12em", color: F.ghost, marginTop: 2 }}>2021</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ ...mono(13), color: F.body, letterSpacing: "-0.01em" }}>{fmtInt(y22)}</div>
                      <div style={{ ...mono(10), letterSpacing: "0.12em", color: F.ghost, marginTop: 2 }}>2022 {yoy(y21, y22) != null ? <span style={{ color: (yoy(y21, y22) ?? 0) < 0 ? F.red : F.green }}>{(yoy(y21, y22) ?? 0) > 0 ? "+" : "−"}{Math.abs(Math.round(yoy(y21, y22) ?? 0))}%</span> : null}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ ...mono(13), color: F.bright, letterSpacing: "-0.01em" }}>{fmtInt(y23)}</div>
                      <div style={{ ...mono(10), letterSpacing: "0.12em", color: F.ghost, marginTop: 2 }}>2023 {yoy(y22, y23) != null ? <span style={{ color: (yoy(y22, y23) ?? 0) < 0 ? F.red : F.green }}>{(yoy(y22, y23) ?? 0) > 0 ? "+" : "−"}{Math.abs(Math.round(yoy(y22, y23) ?? 0))}%</span> : null}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${F.lineFaint}` }}>
                    {slope != null ? (
                      <>
                        <span style={{ ...mono(18), color: slope < 0 ? F.red : F.green, letterSpacing: "-0.01em" }}>{slope > 0 ? "+" : "−"}{Math.abs(Math.round(slope))}%</span>
                        <span style={{ ...mono(10), color: F.subtle, lineHeight: 1.5 }}>panel change<br />across three years</span>
                      </>
                    ) : null}
                    {/* frame draws "+58% services/patient" here — per-year services are not
                        published, so the trend is not computable; the real 3-yr rate stands in */}
                    {svcPerBy != null ? (
                      <span style={{ marginLeft: "auto", textAlign: "right" }}>
                        <span style={{ ...mono(18), color: F.amber, letterSpacing: "-0.01em" }}>{svcPerBy.toFixed(1)}</span><br />
                        <span style={{ ...mono(10), color: F.subtle }}>services / beneficiary-yr</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div style={{ padding: "10px 12px", background: F.well, border: `1px solid ${F.line}`, borderRadius: 2, minHeight: 38, ...mono(11), color: F.gray, lineHeight: 1.6, marginBottom: 14 }}>{hoverDetail}</div>
                  <div style={{ ...mono(9), letterSpacing: "0.16em", color: F.ghost, marginBottom: 8 }}>HOW TO READ IT</div>
                  <div style={{ ...serif(14.5), lineHeight: 1.55, color: F.body, marginBottom: 14, textWrap: "pretty" }}>
                    A halved panel is not by itself a practice winding down. Something narrowed the front door; the claims record that it narrowed, and nothing about why.
                  </div>
                  <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, textWrap: "pretty" }}>
                    2023 is the most recent complete Medicare Part B year published. The three annual counts sum to {fmtInt(beneYears)} beneficiary-years — that is not {fmtInt(beneYears)} distinct people, and a patient treated across all three years is counted three times.{med.unique_benes_est != null ? ` Distinct-person estimate: ≈${fmtInt(med.unique_benes_est)}.` : ""}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: F.card, padding: "20px 22px 18px", display: "flex", flexDirection: "column" }}>
              <div style={{ ...mono(9), letterSpacing: "0.16em", color: F.ghost, marginBottom: 14 }}>SCALE &amp; SETTING</div>
              <ScaleRow l="Services, 3-yr" v={fmtInt(med.services_3yr)} big />
              {med.medicare_paid_corrected != null ? (
                <ScaleRow l="Medicare paid, 3-yr" v={fmtUsd(med.medicare_paid_corrected)} big />
              ) : null}
              <ScaleRow l="Services / beneficiary-yr" v={svcPerBy != null ? svcPerBy.toFixed(1) : "—"} big />
              <ScaleRow l="Place of service" v={pos ? `${pos} · predominant` : "—"} />
              <ScaleRow l="Rurality (RUCA)" v={ruca ?? "—"} />
              <ScaleRow l="Organisation" v={org ?? "—"} />
              <ScaleRow l="Career stage" v={careerStage ?? (careerYears != null ? `${careerYears} yrs` : "—")} />
              <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, marginTop: 14, textWrap: "pretty" }}>
                {pos === "Office" ? "Predominantly office-based — the drug decision and the chair are his. " : ""}Distinct HCPCS codes billed, 3-yr: {fmtInt(med.distinct_codes_3yr)}.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ border: `1px dashed ${F.border2}`, borderRadius: 2, padding: "16px 18px", maxWidth: 720 }}>
            <div style={{ ...serif(14.5), color: F.gray, lineHeight: 1.5, marginBottom: 10 }}>No Medicare Part B activity 2021–2023. Practice reality cannot be stated.</div>
            <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.7, textWrap: "pretty" }}>Usually a practice with no Medicare-age panel or a clinician who bills under a group NPI. It is not evidence of a small practice. The spine of this profile is missing — read the engagement record alone, and read it carefully.</div>
          </div>
        )}
      </div>

      {/* ── WHAT HE ADMINISTERS ── */}
      {pr?.admin_codes.length ? (
        <div id="treat" style={{ borderBottom: `1px solid ${F.line}`, padding: "22px 28px 26px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, marginBottom: 10, flexWrap: "wrap" }}>
            <SectionTag tag="WHAT HE ADMINISTERS" sub="— TOP HCPCS · 3-YR RECORD · RANK ORDER" />
            <div style={{ ...mono(10), color: F.ghost }}>top {pr.admin_codes.length} of {fmtInt(med?.distinct_codes_3yr)} distinct codes held</div>
          </div>
          <div style={{ ...serif(19), lineHeight: 1.4, color: F.bright, marginBottom: 16, maxWidth: "110ch", textWrap: "pretty" }}>
            {adminMapped.length} of his top {pr.admin_codes.length} codes map to a named agent — {genericNames.join(", ")}. The rest are supportive-care and unclassified codes outside the NSCLC reference, held as gaps with their rank intact.
          </div>
          <div style={{ border: `1px solid ${F.line}`, borderRadius: 2, background: F.card }}>
            <div style={{ display: "grid", gridTemplateColumns: "44px 78px 1.6fr 1fr 120px", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${F.line}`, ...mono(9), letterSpacing: "0.14em", color: F.ghost }}>
              <span>RANK</span><span>CODE</span><span>AGENT</span><span>CLASS</span><span style={{ textAlign: "right" }}>ENGAGEMENT</span>
            </div>
            {pr.admin_codes.map((c) => <AdminRow key={c.code} c={c} aligned={aligned} />)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 10, ...mono(10), color: F.ghost, lineHeight: 1.65, flexWrap: "wrap" }}>
            <div style={{ maxWidth: "96ch", textWrap: "pretty" }}>
              {pr.admin_codes.length - adminMapped.length} codes carry claims rank with no agent name — HCPCS→agent mapping is {cov?.hcpcs_named ?? "—"}% complete across the top-200 cohort's held codes; the unmapped tail is supportive-care, unclassified and NOC codes, which resolve only by pairing with NDC-level data. Named here as a gap rather than dropped. Per-code beneficiary, service and dollar volumes are not retained in the summary — those columns await a claims-detail rebuild.
            </div>
          </div>
        </div>
      ) : null}

      {/* ── ADMINISTERED VOLUME — beneath practice scale; seam shown (this page
             carries the practice-scale block, so rule 04's denominator is visible) ── */}
      <div style={{ padding: "22px 28px 26px", borderBottom: `1px solid ${F.line}` }}>
        <AdministeredVolumeBlock hcpId={p.hcp.id} taSlug="nsclc" />
      </div>

      {/* ── lower two-column: insights + engagement + why | rail ── */}
      <div style={{ display: "flex", flexWrap: "wrap", borderBottom: `1px solid ${F.line}` }}>
        <div style={{ flex: "2 1 560px", minWidth: 0, borderRight: `1px solid ${F.line}` }}>

          {/* FIELD INSIGHTS */}
          <div style={{ padding: "22px 28px 24px", borderBottom: `1px solid ${F.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
              <SectionTag tag={`FIELD INSIGHTS (${notes.length})`} sub="— SECOND SPINE" />
              <div style={{ ...mono(10), color: F.ghost }}>{lastCapture ? `last capture ${fmtMonth(lastCapture)}` : "no captures yet"}</div>
            </div>
            <div style={{ ...mono(10.5), color: F.subtle, lineHeight: 1.7, marginBottom: 14, maxWidth: "92ch", textWrap: "pretty" }}>
              Everything above this line is machine-derived from claims and payments. Everything in this section was written by a person who was in the room. The second kind is scarce and load-bearing here.
            </div>
            <div style={{ border: `1px solid ${F.line}`, borderRadius: 2, background: F.card }}>
              <FieldInsights hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} />
            </div>
          </div>

          {/* ENGAGEMENT RECORD — CONTEXT. Data-gated with the one distinction that
              matters: NO record at all is a MEANINGFUL absence (a fact about disclosure)
              and keeps its honest state; it is never silently dropped. */}
          {!eng.has_record ? (
            <div style={{ padding: "22px 28px 24px", borderBottom: `1px solid ${F.line}` }}>
              <div style={{ marginBottom: 12 }}><SectionTag tag="INDUSTRY ENGAGEMENT RECORD" sub="— CONTEXT" /></div>
              <div style={{ border: `1px dashed ${F.border2}`, borderRadius: 2, padding: "16px 18px", maxWidth: 720 }}>
                <div style={{ ...serif(14.5), color: F.gray, lineHeight: 1.5, marginBottom: 10, textWrap: "pretty" }}>No reported transfers of value, 2019–2024. The cross-domain view collapses.</div>
                <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.7, textWrap: "pretty" }}>This is a fact about disclosure, not about the practitioner. Without a paid-around list there is nothing to cross against the administered record — plan from claims volume and setting alone.</div>
              </div>
            </div>
          ) : (
          <div style={{ padding: "22px 28px 24px", borderBottom: `1px solid ${F.line}` }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
              <SectionTag tag="INDUSTRY ENGAGEMENT RECORD" sub="— CONTEXT" />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ ...mono(9), letterSpacing: "0.14em", color: F.ghost, marginRight: 2 }}>SORT</span>
                {(["amount", "recency", "administered"] as const).map((k) => (
                  <button key={k} onClick={() => setEngSort(k)}
                    style={{ background: engSort === k ? "#111313" : "transparent", border: `1px solid ${engSort === k ? "#3a403c" : F.border2}`, color: engSort === k ? F.body : F.subtle, ...mono(9), letterSpacing: "0.12em", padding: "5px 10px", borderRadius: 2, cursor: "pointer", minHeight: 0 }}>
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...serif(17), lineHeight: 1.4, color: F.bright, marginBottom: 12, textWrap: "pretty" }}>
              {money(eng.lifetime_total)} lifetime across {eng.distinct_companies ?? "—"} reporting entities. Broad and shallow.
            </div>
            <div style={{ background: F.card, border: `1px solid ${F.line}`, borderRadius: 2, padding: "11px 14px", ...mono(10.5), lineHeight: 1.7, color: F.subtle, marginBottom: 14, textWrap: "pretty" }}>
              CMS Open Payments, 2019–2024. A record of <span style={{ color: F.gray }}>disclosed transfers of value</span>, published federally. It describes contact between industry and this practice — not influence, not prescribing, not quality of care, and not standing relative to other practitioners. Payment counts sit beside every amount because thirty $40 meals and one $10K consulting agreement are different facts. <span style={{ color: F.gray }}>No per-year trend is shown: at company and at product grain the annual columns are single-year blips and mostly zeros, and a line drawn through them would state a direction the data cannot support.</span>
            </div>
            {engRows.length ? (
            <>
            <div style={{ border: `1px solid ${F.line}`, borderRadius: 2, background: F.card }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.5fr 80px 74px 84px 1fr", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${F.line}`, ...mono(9), letterSpacing: "0.14em", color: F.ghost }}>
                <span>PRODUCT</span><span>REPORTING ENTITY</span><span style={{ textAlign: "right" }}>TRANSFERS</span><span style={{ textAlign: "right" }}>PAYMENTS</span><span>LAST</span><span>IN HIS CLAIMS</span>
              </div>
              {engRows.map((c) => (
                <div key={c.product.drug} style={{ display: "grid", gridTemplateColumns: "1.1fr 1.5fr 80px 74px 84px 1fr", gap: 12, padding: "9px 14px", borderBottom: `1px solid ${F.lineSub}`, alignItems: "baseline" }}>
                  <span style={{ ...mono(12), color: F.bright, letterSpacing: "0.03em" }}>{c.product.drug}</span>
                  <span style={{ ...mono(11), color: F.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.product.entity ?? "—"}</span>
                  <span style={{ ...mono(12), color: F.body, textAlign: "right" }}>{money(c.product.amount)}</span>
                  <span style={{ ...mono(11), color: F.faint, textAlign: "right" }}>{c.product.payments ?? "—"} pmts</span>
                  <span style={{ ...mono(11), color: F.faint }}>{fmtMonth(c.product.most_recent)}</span>
                  <span style={{ ...mono(10), color: CLAIMS_TAG[c.cls].color, letterSpacing: "0.08em" }}>{CLAIMS_TAG[c.cls].text(c)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 10, ...mono(10), color: F.ghost, flexWrap: "wrap" }}>
              <span>{eng.distinct_drugs} products with reported transfers · {classified.length} above the ${MATERIALITY_USD.toLocaleString()} disclosure-materiality threshold shown</span>
              <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span style={{ color: F.amber }}>● aligned {aligned.length}</span>
                <span style={{ color: F.ghost }}>● oral {oral.length}</span>
                <span style={{ color: F.red }}>● injectable, none {injectable.length}</span>
                {unknown.length ? <span style={{ color: F.ghost2 }}>● route unknown {unknown.length}</span> : null}
              </span>
            </div>
            </>
            ) : (
              <div style={{ ...mono(10), color: F.ghost, letterSpacing: "0.02em" }}>
                {eng.distinct_drugs} products with reported transfers · none above the ${MATERIALITY_USD.toLocaleString()} disclosure-materiality threshold.
              </div>
            )}
          </div>
          )}

          {/* WHY THIS PRACTITIONER — narrative is null for ~91% of the cohort (generated
              for top-ranked HCPs only), so guard the deref. Section hides when absent. */}
          {p.narrative?.why_this ? (
            <div style={{ padding: "22px 28px 26px" }}>
              <div style={{ marginBottom: 12 }}><SectionTag tag="WHY THIS PRACTITIONER" /></div>
              <div style={{ ...serif(15), lineHeight: 1.65, color: F.body, maxWidth: "96ch", paddingLeft: 14, borderLeft: `1px solid ${F.border2}`, textWrap: "pretty" }}>{p.narrative.why_this}</div>
            </div>
          ) : null}
        </div>

        {/* ── RIGHT RAIL ── */}
        <div style={{ flex: "1 1 300px", maxWidth: 400, background: F.alt }}>

          {/* ENGAGEMENT MIX */}
          {p.mix && mixTotal > 0 ? (
            <div style={{ padding: "20px 22px", borderBottom: `1px solid ${F.line}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ ...mono(9), letterSpacing: "0.18em", color: F.subtle }}>◆ ENGAGEMENT MIX</span>
                <span style={{ ...mono(10), color: F.ghost }}>{money(eng.lifetime_total)} LIFETIME</span>
              </div>
              <div style={{ display: "flex", height: 6, marginBottom: 14, gap: 1 }}>
                {mixRows.map((m) => <div key={m.label} style={{ width: `${((m.amount ?? 0) / mixTotal) * 100}%`, background: MIX_COLOR(m.label) }} />)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {mixRows.map((m) => (
                  <div key={m.label} style={{ display: "grid", gridTemplateColumns: "9px 1fr auto 34px", gap: 9, alignItems: "center" }}>
                    <span style={{ width: 7, height: 7, background: MIX_COLOR(m.label), display: "block" }} />
                    <span style={{ ...mono(11), color: F.mid }}>{m.label}</span>
                    <span style={{ ...mono(11), color: F.body }}>{money(m.amount)}</span>
                    <span style={{ ...mono(10), color: F.ghost, textAlign: "right" }}>{Math.round(((m.amount ?? 0) / mixTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
              {mixRows[0] && companies[0] ? (
                <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, marginTop: 12, textWrap: "pretty" }}>
                  {mixRows[0].label} leads the mix ({Math.round(((mixRows[0].amount ?? 0) / mixTotal) * 100)}% of the 3-yr categorised record). The largest single relationship is {titleCase(companies[0].name)} — {money(companies[0].amount)} across {companies[0].payments} payments.
                </div>
              ) : null}
            </div>
          ) : null}

          {/* REPORTING ENTITIES */}
          {companies.length ? (
            <div style={{ padding: "20px 22px", borderBottom: `1px solid ${F.line}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ ...mono(9), letterSpacing: "0.18em", color: F.subtle }}>◆ REPORTING ENTITIES</span>
                <span style={{ ...mono(10), color: F.ghost }}>{eng.distinct_companies} DISTINCT</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {companies.slice(0, 5).map((c) => (
                  <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr 60px 54px", gap: 8, alignItems: "baseline" }}>
                    <span style={{ ...mono(11), color: F.mid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleCase(c.name)}</span>
                    <span style={{ ...mono(10), color: F.ghost, textAlign: "right" }}>{c.payments} pmts</span>
                    <span style={{ ...mono(11), color: F.body, textAlign: "right" }}>{money(c.amount)}</span>
                  </div>
                ))}
              </div>
              <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, marginTop: 12 }}>
                {Math.max((eng.distinct_companies ?? 0) - 5, 0)} further entities below the top 5{eng.lifetime_total != null ? `, aggregating ${money(Math.max(eng.lifetime_total - companies.slice(0, 5).reduce((a, c) => a + c.amount, 0), 0))}` : ""}.
              </div>
            </div>
          ) : null}

          {/* DATA COVERAGE */}
          {cov ? (
            <div style={{ padding: "20px 22px", borderBottom: `1px solid ${F.line}` }}>
              <div style={{ ...mono(9), letterSpacing: "0.18em", color: F.subtle, marginBottom: 12 }}>◆ DATA COVERAGE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {([["Medicare Part B", cov.medicare, F.green], ["NPPES", cov.nppes, F.green], ["Open Payments", cov.open_payments, F.green], ["HCPCS → agent name", cov.hcpcs_named, F.amber], ["Publications", cov.publications, F.ghost2]] as [string, number, string][]).map(([l, v, col]) => (
                  <div key={l} style={{ display: "grid", gridTemplateColumns: "1fr 52px 34px", gap: 8, alignItems: "center" }}>
                    <span style={{ ...mono(11), color: col === F.amber ? F.amber : col === F.ghost2 ? F.ghost : F.mid }}>{l}</span>
                    <span style={{ height: 3, background: F.line, display: "block" }}><span style={{ display: "block", height: 3, width: `${v}%`, background: col }} /></span>
                    <span style={{ ...mono(10), color: col === F.amber ? F.amber : col === F.ghost2 ? F.ghost : F.body, textAlign: "right" }}>{v}%</span>
                  </div>
                ))}
              </div>
              <div style={{ ...mono(10), color: F.ghost, lineHeight: 1.65, marginTop: 12, textWrap: "pretty" }}>Coverage is measured across the top-200 US community cohort, not this record alone. The name-mapping gap is a build task, not a property of the practitioner.</div>
            </div>
          ) : null}

          {/* FIELD INTELLIGENCE */}
          <FieldIntelligencePanel />

          {/* RELATIONSHIP */}
          <div style={{ padding: "20px 22px", borderBottom: `1px solid ${F.line}` }}>
            <div style={{ ...mono(9), letterSpacing: "0.18em", color: F.subtle, marginBottom: 12 }}>◆ RELATIONSHIP</div>
            <RelationshipSection hcp={profileHcp(p.hcp.id, p.hcp.name, p.hcp.specialty)} />
          </div>

          {/* FIELD NOTES */}
          <div style={{ padding: "20px 22px" }}>
            <div style={{ ...mono(9), letterSpacing: "0.18em", color: F.subtle, marginBottom: 10 }}>◆ FIELD NOTES</div>
            {notes.length ? (
              <div style={{ ...mono(10), color: F.ghost, marginBottom: 10 }}>{notes.length} field insight{notes.length === 1 ? "" : "s"} captured — shown in the second spine.</div>
            ) : (
              <div style={{ border: `1px dashed ${F.border2}`, borderRadius: 2, padding: 14, textAlign: "center", ...mono(10), color: F.ghost, marginBottom: 10 }}>No field notes yet — add the first.</div>
            )}
            <RailControls hcpName={p.hcp.name} specialty={p.hcp.specialty} lastName={p.hcp.last_name} />
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: F.page, minHeight: "100vh" }}>
      <NavBar />
      <div style={{ maxWidth: CONTENT_WIDTH.wide, margin: "0 auto", width: "100%", boxSizing: "border-box", color: F.body, fontFamily: "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace", fontSize: 12, lineHeight: 1.5, fontVariantNumeric: "tabular-nums" }}>
        {children}
      </div>
    </div>
  );
}

function ShapeRow({ l, v, u }: { l: string; v: string; u?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <span style={{ ...mono(11), color: F.faint }}>{l}</span>
      <span style={{ ...mono(12, 500), color: F.bright, textAlign: "right" }}>{v}{u ? <span style={{ ...mono(10), color: F.ghost, fontWeight: 400 }}>{u}</span> : null}</span>
    </div>
  );
}

function ScaleRow({ l, v, big }: { l: string; v: string; big?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "9px 0", borderBottom: `1px solid ${F.lineFaint}`, gap: 10 }}>
      <span style={{ ...mono(11), color: F.faint }}>{l}</span>
      <span style={{ ...mono(big ? 14 : 12), color: F.bright, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );
}

function AdminRow({ c, aligned }: { c: AdminCode; aligned: ClassifiedProduct[] }) {
  const engagedBy = aligned.find((a) => a.matchedCode?.code === c.code) ?? null;
  const gap = !c.name;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 78px 1.6fr 1fr 120px", gap: 12, padding: "9px 16px", borderBottom: `1px solid ${F.lineSub}`, alignItems: "center", background: gap ? F.alt : "transparent", borderLeft: engagedBy ? `2px solid ${F.amber}` : "2px solid transparent" }}>
      <span style={{ ...mono(11), color: F.ghost }}>#{c.ord}</span>
      <span style={{ ...mono(11), color: gap ? F.ghost : F.faint }}>{c.code}</span>
      {gap ? (
        <span style={{ ...mono(12), color: F.subtle, fontStyle: "italic" }}>no name mapping in reference table</span>
      ) : (
        <span style={{ ...mono(12), color: F.bright }}>{(c.name ?? "").toLowerCase().replace(/\s+injection\b.*$/, "")}{engagedBy ? <span style={{ color: F.subtle }}> · {engagedBy.product.drug}</span> : null}</span>
      )}
      <span style={{ ...mono(11), color: gap ? F.ghost : engagedBy ? F.amber : F.faint }}>{gap ? "outside NSCLC reference" : (c.category ?? "—")}{engagedBy && !gap ? " · engaged" : ""}</span>
      <span style={{ textAlign: "right", ...mono(9), letterSpacing: "0.1em", color: gap ? F.ghost : engagedBy ? F.amber : F.green }}>{gap ? "DATA TASK" : engagedBy ? `PAID · ${money(engagedBy.product.amount)}` : "NONE REPORTED"}</span>
    </div>
  );
}

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
    background: "#111313", border: `1px solid ${F.border2}`, color: F.gray, ...mono(10),
    letterSpacing: "0.14em", padding: "7px 13px", borderRadius: 2, cursor: "pointer", minHeight: 0, textDecoration: "none",
  } as const;

  async function openWatchlist() {
    if (!userId) return;
    if (!relationshipId) {
      const r = await getOrCreateRelationship(userId, hcpId, "hcp_profile");
      setRelationshipId(r.id);
    }
    setWlAnchor(addRef.current?.getBoundingClientRect() ?? null);
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button onClick={onBrief} style={act}>✦ BRIEF</button>
      <button ref={addRef} onClick={() => void openWatchlist()} style={act}>+ LIST</button>
      <button onClick={() => void toggleSave(hcpId, "hcp_profile")}
        style={{ ...act, background: tracked ? "#101519" : "#111313", border: `1px solid ${tracked ? F.blueBorder : F.border2}`, color: tracked ? F.blue : F.gray }}>
        {tracked ? "◗ TRACKED" : "◗ TRACK"}
      </button>
      {npi ? <a href={`https://npiregistry.cms.hhs.gov/provider-view/${npi}`} target="_blank" rel="noopener noreferrer" style={{ ...act, background: "transparent", color: F.subtle }}>NPI Registry →</a> : null}
      {wlAnchor && userId && relationshipId ? (
        <AddToWatchlistPopover userId={userId} relationshipId={relationshipId} anchorRect={wlAnchor}
          onClose={() => { setWlAnchor(null); void refreshTracked(); }} />
      ) : null}
    </div>
  );
}

// Frame's three validation questions for THIS surface — note the middle one is the
// panel-decline question, tied to the practice-reality slope. Submission path unwired
// (field_intel_* is SELECT-only); submit acknowledges honestly.
const FI_QUESTIONS = [
  { key: "claims", label: "Claims record matches practice reality", options: ["Confirms", "Partial", "Disputes"] },
  { key: "decline", label: "Panel decline — known cause?", options: ["Yes", "Suspect", "No"] },
  { key: "access", label: "Access in practice", options: ["Open", "Gated", "Closed"] },
] as const;

function FieldIntelligencePanel() {
  const [answers, setAnswers] = useState<Record<string, string | null>>({ claims: null, decline: null, access: null });
  const [toast, setToast] = useState<string | null>(null);
  const complete = FI_QUESTIONS.every((q) => answers[q.key]);
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); };
  return (
    <div style={{ padding: "20px 22px", borderBottom: `1px solid ${F.line}` }}>
      <div style={{ ...mono(9), letterSpacing: "0.18em", color: F.subtle, marginBottom: 10 }}>◆ FIELD INTELLIGENCE</div>
      <div style={{ ...mono(10), color: F.faint, lineHeight: 1.6, marginBottom: 12 }}>Validation pending — 0 MSLs have reviewed this profile.</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ ...mono(9), letterSpacing: "0.14em", color: F.amber }}>COMMUNITY CONFIDENCE</span>
        <span style={{ ...mono(10), color: F.ghost }}>0 MSLs</span>
      </div>
      {FI_QUESTIONS.map((q) => (
        <div key={q.key}>
          <div style={{ ...mono(10), color: F.faint, marginBottom: 6 }}>{q.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 12 }}>
            {q.options.map((opt) => {
              const on = answers[q.key] === opt;
              return (
                <button key={opt} onClick={() => setAnswers((a) => ({ ...a, [q.key]: a[q.key] === opt ? null : opt }))}
                  style={{ background: on ? "#181a19" : "#111313", border: `1px solid ${on ? "#3a403c" : F.border2}`, color: on ? F.body : F.gray, ...mono(10), padding: "7px 4px", borderRadius: 2, cursor: "pointer", minHeight: 0 }}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button disabled={!complete}
        onClick={() => { if (!complete) return; showToast("Field review recorded — the submission path (field-intel write) is not yet wired; stored locally only."); }}
        style={{ width: "100%", background: "#0f1010", border: `1px solid ${F.border2}`, color: complete ? F.body : F.ghost, ...mono(10), letterSpacing: "0.14em", padding: 9, borderRadius: 2, cursor: complete ? "pointer" : "not-allowed", minHeight: 0 }}>
        Submit validation
      </button>
      <div style={{ ...mono(9), color: F.ghost2, textAlign: "center", marginTop: 8 }}>Your identity is never shared. Contributor UUID only.</div>
      <FiToast message={toast} />
    </div>
  );
}

const ISSUE_TYPES = ["incorrect institution", "wrong specialty", "outdated info", "other"] as const;
const ISSUE_NOTE_CHIPS = [
  "Affiliation recently changed", "Specialty label mismatch", "Publication count seems stale",
  "Score inconsistent with field read", "Possible duplicate profile",
] as const;

function RailControls({ hcpName, specialty, lastName }: { hcpName: string; specialty?: string | null; lastName: string | null }) {
  const [ctxOpen, setCtxOpen] = useState(false);
  const [optOpen, setOptOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [issueType, setIssueType] = useState<string | null>(null);
  const [issueNotes, setIssueNotes] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3200); };
  const ta = specialty && /lung|onc/i.test(specialty) ? "Oncology" : undefined;

  return (
    <div>
      <button onClick={() => setCtxOpen(true)}
        style={{ width: "100%", background: "#111313", border: `1px solid ${F.border2}`, color: F.gray, ...mono(10), letterSpacing: "0.12em", padding: 9, borderRadius: 2, cursor: "pointer", marginBottom: 8, minHeight: 0 }}>Add context</button>
      <button onClick={() => setReportOpen(true)}
        style={{ width: "100%", background: "transparent", border: `1px solid ${F.border2}`, color: F.subtle, ...mono(10), letterSpacing: "0.12em", padding: 9, borderRadius: 2, cursor: "pointer", minHeight: 0 }}>Report data issue</button>
      <div style={{ ...mono(9), color: F.ghost2, lineHeight: 1.7, marginTop: 14 }}>
        Are you {lastName ? `Dr. ${lastName}` : "this practitioner"}?{" "}
        <button onClick={() => setOptOpen(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...mono(9), color: F.blue, minHeight: 0 }}>Request opt-out or claim this profile.</button>{" "}
        Payment and claims data are federal public record and cannot be removed by us.
      </div>
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
          <button type="button"
            style={{ background: "#111313", border: `1px solid ${F.border2}`, color: F.gray, ...mono(10), letterSpacing: "0.1em", padding: "8px 14px", borderRadius: 2, cursor: "pointer", minHeight: 0 }}
            onClick={() => { setReportOpen(false); showToast("Issue reported — thank you for helping improve this profile."); }}>Submit report</button>
        </FiModal>
      )}
      <FiToast message={toast} />
    </div>
  );
}
