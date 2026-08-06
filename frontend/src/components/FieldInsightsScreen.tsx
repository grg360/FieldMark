// Field Insights — register rebuild (2026-08-05).
// Layout authority: docs/design/Field Insights.dc.html.
//
// Old-generation rebuild against the register, not a reconciliation:
//   • Cool ground/panels, warm ink for the observation body (WARM.*) — the
//     reading-mode two-ramp rule's third application. The MSL analysis, the
//     taxonomy and all chrome stay cool; the gold field-border marks analysis
//     as interpretation, not observation.
//   • Two-column split: the observed body LEFT at a reading measure, the MSL's
//     "why it matters" analysis RIGHT in a gold-edged field.
//   • Taxonomy reads by WEIGHT, not hue — categories order by action weight,
//     and a filled/half/outline glyph marks the tier. The old category colours
//     go.
//   • Group toggle: HCP / CATEGORY / DATE.
//   • Empty until an MSL logs something — absence states the fact, never blank.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFieldInsightsForCurrentUser, formatHcpDisplayName, formatInsightDate, type FieldInsight } from "../lib/fieldInsights";
import { CATEGORY_LABELS, type InsightCategory } from "../lib/insightCategories";
import { FONT, GROUND, LINE, COOL, WARM, GOLD } from "../lib/designTokens";
import AppLayout from "./AppLayout";
import PageHero from "./PageHero";

const MONO = FONT.mono;
const SERIF = FONT.serif;
const mono = (size: number, color: string, ls = 0.14, weight = 400) =>
  ({ font: `${weight} ${size}px/1 ${MONO}`, letterSpacing: `${ls}em`, color }) as const;

// Action weight — most actionable first; the tier sets the glyph and ink.
// Taxonomy reads by weight, never by hue.
const CATEGORY_WEIGHT: Record<InsightCategory, number> = {
  message_challenge: 0,
  evidence_gap: 1,
  competitor_signal: 2,
  safety_observation: 3,
  access_reimbursement: 4,
  message_reinforcement: 5,
  patient_selection: 6,
  clinical_practice_trend: 7,
  other: 8,
};
// Three visual tiers by weight: filled (obligates), half (feeds work), outline
// (accumulates). Ink brightens with weight rank.
function tierOf(cat: InsightCategory | null): 0 | 1 | 2 {
  const w = cat ? CATEGORY_WEIGHT[cat] : 8;
  return w <= 1 ? 0 : w <= 4 ? 1 : 2;
}
function tierInk(tier: 0 | 1 | 2): string {
  return tier === 0 ? COOL.ui : tier === 1 ? COOL.muted : COOL.chrome;
}
function Glyph({ tier }: { tier: 0 | 1 | 2 }) {
  const ink = tierInk(tier);
  if (tier === 0) return <span style={{ width: 9, height: 9, background: ink, display: "block", flex: "none" }} />;
  if (tier === 1) return <span style={{ width: 9, height: 9, border: `1px solid ${ink}`, boxSizing: "border-box", background: `linear-gradient(90deg, ${ink} 50%, transparent 50%)`, display: "block", flex: "none" }} />;
  return <span style={{ width: 9, height: 9, border: `1px solid ${ink}`, boxSizing: "border-box", display: "block", flex: "none" }} />;
}

const catLabel = (c: InsightCategory | null) =>
  (c ? CATEGORY_LABELS[c] : "Other").toUpperCase();

type GroupBy = "hcp" | "category" | "date";
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

interface Group { key: string; title: string; meta: string; items: FieldInsight[]; }

export default function FieldInsightsScreen() {
  const navigate = useNavigate();
  const [insights, setInsights] = useState<FieldInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>("hcp");
  const [filter, setFilter] = useState<InsightCategory | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getFieldInsightsForCurrentUser()
      .then((data) => { if (!cancelled) setInsights(data); })
      .catch((err) => { console.warn("FieldInsightsScreen: load error", err); if (!cancelled) setInsights([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => insights.filter((i) => !filter || i.insight_category === filter),
    [insights, filter],
  );

  const categoriesPresent = useMemo(() => {
    const counts = new Map<InsightCategory, number>();
    for (const i of insights) {
      const c = (i.insight_category ?? "other") as InsightCategory;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => CATEGORY_WEIGHT[a[0]] - CATEGORY_WEIGHT[b[0]]);
  }, [insights]);

  const groups = useMemo<Group[]>(() => buildGroups(filtered, groupBy), [filtered, groupBy]);

  const heroStats = useMemo(() => {
    const hcps = new Set(insights.map((i) => i.hcp_id)).size;
    const cats = new Set(insights.map((i) => i.insight_category ?? "other")).size;
    const profiles = new Set(insights.map((i) => i.belief_claim_key).filter(Boolean)).size;
    return [
      { value: String(insights.length), label: "INSIGHTS" },
      { value: String(hcps), label: "HCPS" },
      { value: String(cats), label: "CATEGORIES" },
      { value: String(profiles), label: "LINKED PROFILES", gold: profiles > 0 },
    ];
  }, [insights]);

  const handleShare = () => {
    const subject = encodeURIComponent("Field Insights - Weekly Digest");
    const body = encodeURIComponent(buildEmailBody(insights));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const latest = insights[0] ? formatInsightDate(insights[0].occurred_at).toUpperCase() : null;
  const breadcrumbs = [{ label: "Home", path: "/me" }, { label: "Field Insights" }];
  const empty = !loading && insights.length === 0;

  const ledgerMeta = `${insights.length} INSIGHT${insights.length === 1 ? "" : "S"} · ${new Set(filtered.map((i) => i.hcp_id)).size} HCP${new Set(filtered.map((i) => i.hcp_id)).size === 1 ? "" : "S"} · ${categoriesPresent.length} CATEGOR${categoriesPresent.length === 1 ? "Y" : "IES"}${filter ? " · FILTERED" : ""}`;

  return (
    <AppLayout breadcrumbs={breadcrumbs} width="standard">
      <div style={{ fontFamily: SERIF, color: WARM.prose, paddingBottom: 40 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          <button
            type="button"
            onClick={handleShare}
            disabled={empty}
            style={{ ...mono(10, empty ? COOL.label : COOL.muted, 0.16), border: `1px solid ${LINE.l2}`, background: "transparent", padding: "8px 14px", cursor: empty ? "default" : "pointer", opacity: empty ? 0.5 : 1 }}
          >
            SHARE VIEW ↗
          </button>
        </div>

        <PageHero
          eyebrow="Insight Gen"
          meta={latest ? `UPDATED THROUGH ${latest}` : "MSL-CAPTURED FIELD INTELLIGENCE"}
          title="Field Insights"
          dek="Structured field intelligence from your HCP interactions. Each insight ties published beliefs to current beliefs across your territory. Share this view with your manager to surface emerging themes and patterns."
          stats={empty ? undefined : heroStats}
        />

        {loading ? (
          <div style={{ ...mono(11, COOL.label), padding: "40px 0" }}>LOADING INSIGHTS…</div>
        ) : empty ? (
          <EmptyState />
        ) : (
          <>
            {/* Taxonomy — categories present, ordered by action weight, glyph by tier */}
            {categoriesPresent.length > 0 ? (
              <section style={{ marginTop: 8, border: `1px solid ${LINE.l1}`, background: GROUND.g2, marginBottom: 40 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 11, padding: "12px 20px", borderBottom: `1px solid ${LINE.l0}` }}>
                  <span style={mono(11, GOLD.gold, 0)}>|</span>
                  <span style={mono(10, COOL.prose, 0.18, 500)}>TAXONOMY</span>
                  <span style={mono(10, COOL.label, 0.14)}>ORDERED BY ACTION WEIGHT · SELECT TO FILTER</span>
                  <span style={{ flex: 1 }} />
                  {filter ? <button type="button" onClick={() => setFilter(null)} style={{ ...mono(10, GOLD.gold, 0.14), border: "none", background: "transparent", cursor: "pointer" }}>CLEAR FILTER ×</button> : null}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, categoriesPresent.length)}, 1fr)` }}>
                  {categoriesPresent.map(([cat, n], i) => {
                    const tier = tierOf(cat);
                    const on = filter === cat;
                    return (
                      <div key={cat} onClick={() => setFilter(on ? null : cat)}
                        style={{ padding: "16px 20px 18px", borderRight: (i + 1) % 3 === 0 ? "none" : `1px solid ${LINE.l0}`, borderTop: i >= 3 ? `1px solid ${LINE.l0}` : "none", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <Glyph tier={tier} />
                          <span style={mono(10, tierInk(tier), 0.18, tier === 0 ? 700 : 500)}>{catLabel(cat)}</span>
                          <span style={{ flex: 1 }} />
                          <span style={{ font: `400 15px/1 ${SERIF}`, color: COOL.muted }}>{n}</span>
                        </div>
                        {on ? <div style={{ height: 2, background: GOLD.gold }} /> : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Ledger header + group toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 11, paddingBottom: 11, borderBottom: `1px solid ${LINE.l1}`, marginBottom: 26, flexWrap: "wrap" }}>
              <span style={mono(11, GOLD.gold, 0)}>|</span>
              <span style={mono(10, COOL.prose, 0.18, 500)}>INSIGHT LEDGER</span>
              <span style={mono(10, COOL.label, 0.14)}>{ledgerMeta}</span>
              <span style={{ flex: 1 }} />
              <span style={{ ...mono(9, COOL.label, 0.16), marginRight: 3 }}>GROUPED BY</span>
              {(["hcp", "category", "date"] as GroupBy[]).map((g) => (
                <button key={g} type="button" onClick={() => setGroupBy(g)}
                  style={{ ...mono(10, groupBy === g ? COOL.ui : COOL.chrome, 0.14, groupBy === g ? 500 : 400), border: `1px solid ${groupBy === g ? GOLD.dim : LINE.l1}`, background: groupBy === g ? GROUND.g2 : "transparent", padding: "7px 12px", cursor: "pointer" }}>
                  {g.toUpperCase()}
                </button>
              ))}
            </div>

            {groups.map((g) => (
              <section key={g.key} style={{ marginBottom: 46 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 16, paddingBottom: 10, borderBottom: `1px solid ${LINE.l0}`, marginBottom: 16 }}>
                  <span style={{ font: `400 21px/1.15 ${SERIF}`, color: WARM.prose }}>{g.title}</span>
                  <span style={{ flex: 1 }} />
                  <span style={mono(10, COOL.label, 0.14)}>{g.meta}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {g.items.map((it) => <InsightCard key={it.id} it={it} navigate={navigate} />)}
                </div>
              </section>
            ))}

            <div style={{ paddingTop: 12, borderTop: `1px solid ${LINE.l0}`, ...mono(9, COOL.floor, 0.14), lineHeight: 1.7 }}>
              MSL-CAPTURED FIELD INTELLIGENCE · UNVERIFIED OBSERVATION PLUS ANALYST INTERPRETATION · NOT A CLINICAL CLAIM · INTERNAL USE ONLY
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function InsightCard({ it, navigate }: { it: FieldInsight; navigate: (p: string) => void }) {
  const tier = tierOf(it.insight_category);
  const setting = (it.interaction_type ?? "").toUpperCase() || "OTHER";
  const hcpName = formatHcpDisplayName(it);
  return (
    <article style={{ border: `1px solid ${LINE.l1}`, background: GROUND.g2 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 28, padding: "14px 22px", borderBottom: `1px solid ${LINE.l0}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 12 }}>
          <Glyph tier={tier} />
          <span style={mono(10, tierInk(tier), 0.2, tier === 0 ? 700 : 500)}>{catLabel(it.insight_category)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={mono(10, COOL.label, 0.14)}>{setting}</span>
          <span style={{ width: 1, height: 9, background: LINE.l2, display: "block" }} />
          <span style={mono(10, COOL.muted, 0.14)}>{formatInsightDate(it.occurred_at).toUpperCase()}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 336px" }}>
        {/* observed body — warm reading prose */}
        <div style={{ padding: "24px 30px 22px 22px" }}>
          <p style={{ margin: 0, font: `400 17px/1.64 ${SERIF}`, color: WARM.body, textWrap: "pretty" }}>{it.body}</p>
          {it.belief_claim_title ? (
            <div style={{ marginTop: 22, display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={mono(9, COOL.label, 0.16)}>LINKED BELIEF PROFILE</span>
              <span
                onClick={() => navigate(`/hcp/${it.hcp_id}`)}
                style={{ font: `400 15px/1.3 ${SERIF}`, color: WARM.body, borderBottom: `1px solid ${LINE.l2}`, paddingBottom: 1, cursor: "pointer" }}>
                {it.belief_claim_title} <span style={{ color: GOLD.gold }}>→</span>
              </span>
            </div>
          ) : null}
        </div>
        {/* MSL analysis — cool field, gold left edge = interpretation, not observation */}
        <div style={{ borderLeft: `1px solid ${GOLD.gold}`, padding: "24px 22px 22px 21px", background: GROUND.g1 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...mono(10, GOLD.gold, 0.2, 500), marginBottom: 6 }}>WHY IT MATTERS</div>
            <div style={mono(9, COOL.label, 0.14)}>MSL ANALYSIS · NOT OBSERVED</div>
          </div>
          {it.why_it_matters ? (
            <p style={{ margin: 0, font: `400 14.5px/1.6 ${SERIF}`, color: COOL.prose, textWrap: "pretty" }}>{it.why_it_matters}</p>
          ) : (
            <p style={{ margin: 0, ...mono(10, COOL.label, 0.1), lineHeight: 1.6 }}>NO ANALYSIS LOGGED FOR THIS OBSERVATION.</p>
          )}
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 17, height: 17, borderRadius: "50%", border: `1px solid ${GOLD.dim}`, display: "flex", alignItems: "center", justifyContent: "center", ...mono(7, GOLD.gold, 0) }}>{it.author_initials}</span>
            <span style={mono(9, COOL.label, 0.16)}>LOGGED BY {hcpName ? "TEAM MSL" : "TEAM MSL"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div style={{ marginTop: 8, border: `1px solid ${LINE.l1}`, background: GROUND.g2 }}>
      <div style={{ padding: "14px 26px", background: GROUND.g1, borderBottom: `1px solid ${LINE.l1}`, ...mono(10, COOL.muted, 0.18, 500) }}>
        NO INSIGHTS LOGGED
      </div>
      <div style={{ padding: "30px 26px 32px", display: "grid", gap: 16, maxWidth: "74ch" }}>
        <p style={{ margin: 0, font: `400 20px/1.55 ${SERIF}`, color: WARM.body, textWrap: "pretty" }}>
          Field insights are captured by MSLs from their own HCP interactions. This ledger fills as your team logs observations from advisory boards, tumor boards, and congress conversations — each tied to the belief profile it touches.
        </p>
        <p style={{ margin: 0, font: `300 16px/1.6 ${SERIF}`, color: COOL.muted, textWrap: "pretty" }}>
          Absence here is a fact about capture, not about the field. Nothing has been logged yet — the surface stays empty rather than showing an estimate. Log an insight from any HCP profile and it appears here.
        </p>
      </div>
      <div style={{ padding: "14px 26px", borderTop: `1px solid ${LINE.l1}`, ...mono(9.5, COOL.label, 0.14) }}>
        MSL-CAPTURED · TIED TO A BELIEF PROFILE · UNVERIFIED OBSERVATION PLUS ANALYST INTERPRETATION
      </div>
    </div>
  );
}

function buildGroups(items: FieldInsight[], gb: GroupBy): Group[] {
  const sorted = [...items].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  if (gb === "category") {
    const m = new Map<InsightCategory, FieldInsight[]>();
    for (const i of sorted) {
      const c = (i.insight_category ?? "other") as InsightCategory;
      (m.get(c) ?? m.set(c, []).get(c)!).push(i);
    }
    return [...m.entries()]
      .sort((a, b) => CATEGORY_WEIGHT[a[0]] - CATEGORY_WEIGHT[b[0]])
      .map(([c, v]) => ({ key: c, title: CATEGORY_LABELS[c] ?? "Other", meta: metaLine(v), items: v }));
  }
  if (gb === "date") {
    const m = new Map<string, FieldInsight[]>();
    for (const i of sorted) {
      const d = new Date(i.occurred_at);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}`;
      (m.get(key) ?? m.set(key, []).get(key)!).push(i);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([k, v]) => {
        const [y, mo] = k.split("-");
        return { key: k, title: `${MONTHS[Number(mo)][0]}${MONTHS[Number(mo)].slice(1).toLowerCase()} ${y}`, meta: metaLine(v), items: v };
      });
  }
  const m = new Map<string, FieldInsight[]>();
  for (const i of sorted) {
    const name = formatHcpDisplayName(i);
    (m.get(name) ?? m.set(name, []).get(name)!).push(i);
  }
  return [...m.entries()]
    .map(([name, v]) => ({ key: name, title: name, meta: `${v.length} INSIGHT${v.length === 1 ? "" : "S"} · LATEST ${formatInsightDate(v[0].occurred_at).toUpperCase()}`, items: v }))
    .sort((a, b) => b.items.length - a.items.length);
}

function metaLine(v: FieldInsight[]): string {
  const hcps = new Set(v.map((i) => i.hcp_id)).size;
  return `${v.length} INSIGHT${v.length === 1 ? "" : "S"} · ${hcps} HCP${hcps === 1 ? "" : "S"}`;
}

function buildEmailBody(insights: FieldInsight[]): string {
  if (insights.length === 0) return "No field insights captured yet.";
  const lines = ["FIELD INSIGHTS - WEEKLY DIGEST", "", `${insights.length} insight${insights.length === 1 ? "" : "s"} captured.`, "", "-----", ""];
  for (const ins of insights) {
    const hcpName = formatHcpDisplayName(ins);
    const cat = ins.insight_category ? CATEGORY_LABELS[ins.insight_category] : "Uncategorized";
    lines.push(`${hcpName} - ${cat} - ${formatInsightDate(ins.occurred_at)}`, "", ins.body);
    if (ins.why_it_matters) lines.push("", `Why it matters: ${ins.why_it_matters}`);
    lines.push("", "-----", "");
  }
  return lines.join("\n");
}
