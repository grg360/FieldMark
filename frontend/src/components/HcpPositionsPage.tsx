// All Scientific Positions — register rebuild (2026-08-05).
// Layout authority: docs/design/All Scientific Positions.dc.html.
//
// Old-generation rebuild against the register, not a reconciliation:
//   • Cool ground/panels (GROUND/LINE), warm ink for the position prose
//     (WARM.*) — the reading-mode two-ramp rule's second application after the
//     Drugs asset page. Chrome, taxonomy labels and source sentences stay cool.
//   • Two-column split: the position at a reading measure LEFT, the source
//     sentence in the field RIGHT (border-left, cool italic).
//   • Grouped by publication, groups ordered by citation weight.
//   • Taxonomy reads by WEIGHT, not hue — the four polarities are an ink-
//     brightness ladder (positive brightest → hypothesis dimmest), no colour.
//   • Filter chips replace the native <select>.
//   • Empty state follows the rising profile's absence pattern: the coverage
//     fact, never a blank — extraction runs only on the top-200 established /
//     top-100 rising US window.

import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  getAllPositionsForHcp,
  type EvidencePosition,
  type PositionType,
  type PositionCategory,
} from "../lib/scientificPositions";
import { resolvePrimaryTaId, taDisplayNameForId } from "../lib/api";
import { supabase } from "../lib/supabase";
import { FONT, GROUND, LINE, COOL, WARM, GOLD } from "../lib/designTokens";
import AppLayout from "./AppLayout";
import PageHero from "./PageHero";

const MONO = FONT.mono;
const SERIF = FONT.serif;
const mono = (size: number, color: string, ls = 0.14, weight = 400) =>
  ({ font: `${weight} ${size}px/1 ${MONO}`, letterSpacing: `${ls}em`, color }) as const;

// Taxonomy by WEIGHT, not hue: the four polarities are an ink-brightness ladder
// on the cool ramp. Positive reads brightest (the strongest claim), hypothesis
// dimmest (the most tentative). No colour enters the row.
const POLARITY: Record<PositionType, { label: string; ink: string }> = {
  positive_position: { label: "POSITIVE", ink: COOL.ui },
  cautionary_position: { label: "CAUTIONARY", ink: COOL.prose },
  unmet_need_position: { label: "UNMET NEED", ink: COOL.muted },
  hypothesis_position: { label: "HYPOTHESIS", ink: COOL.chrome },
};
const POLARITY_ORDER: PositionType[] = [
  "positive_position",
  "cautionary_position",
  "unmet_need_position",
  "hypothesis_position",
];

const CATEGORY_LABEL: Record<PositionCategory, string> = {
  efficacy: "EFFICACY",
  patient_selection: "PATIENT SELECTION",
  biomarker: "BIOMARKER",
  safety: "SAFETY",
  resistance: "RESISTANCE",
  sequencing: "SEQUENCING",
  access: "ACCESS",
  diagnostics: "DIAGNOSTICS",
  methodology: "METHODOLOGY",
};
const CATEGORY_ORDER: PositionCategory[] = [
  "efficacy",
  "safety",
  "biomarker",
  "sequencing",
  "patient_selection",
  "resistance",
  "access",
  "diagnostics",
  "methodology",
];

const fmt = (n: number) => n.toLocaleString("en-US");

interface PubGroup {
  key: string;
  title: string;
  journal: string | null;
  year: number | null;
  citations: number | null;
  doi: string | null;
  pubmed: string | null;
  rows: EvidencePosition[];
}

export default function HcpPositionsPage() {
  const { id: hcpId } = useParams<{ id: string }>();
  const location = useLocation();
  const navTaId = (location.state as { taId?: string } | null)?.taId;
  const [taId, setTaId] = useState<string | undefined>(navTaId);
  const [positions, setPositions] = useState<EvidencePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [hcpName, setHcpName] = useState<string>("");
  const [polarity, setPolarity] = useState<PositionType | "all">("all");
  const [category, setCategory] = useState<PositionCategory | "all">("all");
  const [coverage, setCoverage] = useState<Coverage | null>(null);

  useEffect(() => {
    if (navTaId) { setTaId(navTaId); return; }
    if (!hcpId) return;
    let cancelled = false;
    void (async () => {
      const primary = await resolvePrimaryTaId(hcpId);
      if (!cancelled) setTaId(primary ?? undefined);
    })();
    return () => { cancelled = true; };
  }, [hcpId, navTaId]);

  useEffect(() => {
    let cancelled = false;
    if (!hcpId || !taId) return;
    setLoading(true);
    Promise.all([getAllPositionsForHcp(hcpId, taId), fetchHcpName(hcpId)])
      .then(([data, name]) => {
        if (cancelled) return;
        setPositions(data);
        setHcpName(name);
      })
      .catch((err) => console.warn("HcpPositionsPage: load error", err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hcpId, taId]);

  // Coverage fact for the empty state — fetched only when there is nothing to show.
  useEffect(() => {
    if (loading || positions.length > 0) return;
    let cancelled = false;
    void fetchCoverage(taId).then((c) => { if (!cancelled) setCoverage(c); });
    return () => { cancelled = true; };
  }, [loading, positions.length, taId]);

  const counts = useMemo(() => {
    const byPolarity: Record<string, number> = { all: positions.length };
    for (const t of POLARITY_ORDER) byPolarity[t] = positions.filter((p) => p.position_type === t).length;
    const byCategory: Record<string, number> = {};
    for (const c of CATEGORY_ORDER) byCategory[c] = positions.filter((p) => p.position_category === c).length;
    return { byPolarity, byCategory };
  }, [positions]);

  const filtered = useMemo(
    () => positions.filter((p) =>
      (polarity === "all" || p.position_type === polarity) &&
      (category === "all" || p.position_category === category)),
    [positions, polarity, category],
  );

  const groups = useMemo<PubGroup[]>(() => {
    const m = new Map<string, PubGroup>();
    for (const p of filtered) {
      const key = p.publication_id;
      if (!m.has(key)) {
        m.set(key, {
          key,
          title: p.pub_title ?? "UNTITLED PUBLICATION",
          journal: p.journal,
          year: p.pub_year,
          citations: p.citation_count,
          doi: p.doi,
          pubmed: p.pubmed_id,
          rows: [],
        });
      }
      m.get(key)!.rows.push(p);
    }
    return [...m.values()].sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0));
  }, [filtered]);

  const heroStats = useMemo(() => {
    const pubs = new Set(positions.map((p) => p.publication_id)).size;
    const drugs = new Set(positions.map((p) => p.drug_name).filter(Boolean)).size;
    return [
      { value: fmt(positions.length), label: "POSITIONS" },
      { value: fmt(pubs), label: "PUBLICATIONS" },
      { value: fmt(drugs), label: "DRUGS" },
    ];
  }, [positions]);

  const taLabel = taId ? taDisplayNameForId(taId) : "";
  const breadcrumbs = [
    { label: "Home", path: "/me" },
    ...(hcpId ? [{ label: hcpName || "Profile", path: `/hcp/${hcpId}` }] : []),
    { label: "Scientific Positions" },
  ];

  const empty = !loading && positions.length === 0;

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <div style={{ fontFamily: SERIF, color: WARM.prose, paddingBottom: 40 }}>
        <PageHero
          eyebrow="Scientific Positions"
          meta={taLabel ? `${taLabel.toUpperCase()} · EXTRACTED FROM PUBLISHED LITERATURE` : "EXTRACTED FROM PUBLISHED LITERATURE"}
          title="All Scientific Positions"
          dek={hcpName
            ? `Every position extracted from the published literature of ${hcpName}${taLabel ? ` in ${taLabel}` : ""}, each held to the sentence that supports it.`
            : "Every position extracted from the published literature, each held to the sentence that supports it."}
          stats={empty ? undefined : heroStats}
        />

        {loading ? (
          <div style={{ ...mono(11, COOL.label), padding: "40px 0" }}>LOADING POSITIONS…</div>
        ) : empty ? (
          <EmptyState hcpName={hcpName} taLabel={taLabel} coverage={coverage} hcpId={hcpId} />
        ) : (
          <>
            {/* Filter panel — chips replace the native select */}
            <div style={{ marginTop: 8, border: `1px solid ${LINE.l1}`, background: GROUND.g2, padding: "18px 24px 20px", display: "grid", gap: 14 }}>
              <FilterRow label="POSITION">
                <Chip on={polarity === "all"} onClick={() => setPolarity("all")}>ALL {counts.byPolarity.all}</Chip>
                {POLARITY_ORDER.map((t) => counts.byPolarity[t] > 0 ? (
                  <Chip key={t} on={polarity === t} onClick={() => setPolarity(t)}>
                    {POLARITY[t].label} {counts.byPolarity[t]}
                  </Chip>
                ) : null)}
              </FilterRow>
              <div style={{ borderTop: `1px solid ${LINE.l0}`, paddingTop: 14 }}>
                <FilterRow label="CATEGORY">
                  <Chip on={category === "all"} onClick={() => setCategory("all")}>ALL</Chip>
                  {CATEGORY_ORDER.map((c) => counts.byCategory[c] > 0 ? (
                    <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                      {CATEGORY_LABEL[c]}
                    </Chip>
                  ) : null)}
                </FilterRow>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 24, padding: "30px 0 12px" }}>
              <div style={mono(10.5, COOL.muted, 0.2)}>POSITIONS</div>
              <div style={mono(9.5, COOL.label, 0.16)}>
                {filtered.length} OF {positions.length}
                {polarity === "all" && category === "all" ? " · GROUPED BY PUBLICATION · ORDERED BY CITATION WEIGHT" : " · FILTERED"}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ ...mono(11, COOL.label), padding: "24px 0" }}>NO POSITIONS MATCH THE CURRENT FILTERS.</div>
            ) : (
              <div style={{ display: "grid", gap: 18 }}>
                {groups.map((g) => <PubGroupCard key={g.key} group={g} />)}
              </div>
            )}

            <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${LINE.l1}`, ...mono(9.5, COOL.label, 0.14), lineHeight: 1.9 }}>
              POSITIONS ARE EXTRACTED FROM PUBLISHED LITERATURE · EACH IS HELD TO THE QUOTED SENTENCE THAT SUPPORTS IT · NOT AN ENDORSEMENT BY THE PHYSICIAN · REVIEW BEFORE USE · NO CLINICAL CLAIM
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ width: 74, flex: "none", ...mono(9.5, COOL.label, 0.18) }}>{label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...mono(10, on ? GOLD.bright : COOL.chrome, 0.14, 500),
        padding: "7px 13px",
        border: `1px solid ${on ? GOLD.dim : LINE.l2}`,
        background: on ? GROUND.g0 : "transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function PubGroupCard({ group: g }: { group: PubGroup }) {
  const bits = [g.journal?.toUpperCase(), g.year != null ? String(g.year) : null, g.citations != null ? `${fmt(g.citations)} CITATIONS` : null].filter(Boolean);
  return (
    <div style={{ border: `1px solid ${LINE.l1}`, background: GROUND.g2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 24, padding: "14px 26px", background: GROUND.g1, borderBottom: `1px solid ${LINE.l1}` }}>
        <div style={{ ...mono(10, COOL.muted, 0.16, 500), lineHeight: 1.5 }}>
          {g.title.length > 90 ? `${g.title.slice(0, 90)}…` : g.title}
          {bits.length ? <span style={{ color: COOL.chrome }}>{"  ·  "}{bits.join("  ·  ")}</span> : null}
        </div>
        <div style={{ display: "flex", gap: 14, flex: "none" }}>
          {g.doi ? <a href={`https://doi.org/${g.doi}`} target="_blank" rel="noreferrer" style={{ ...mono(10, GOLD.gold, 0.14, 500), textDecoration: "none" }}>DOI</a> : null}
          {g.pubmed ? <a href={`https://pubmed.ncbi.nlm.nih.gov/${g.pubmed}/`} target="_blank" rel="noreferrer" style={{ ...mono(10, GOLD.gold, 0.14, 500), textDecoration: "none" }}>PUBMED</a> : null}
        </div>
      </div>
      {g.rows.map((p) => <PositionRow key={p.position_id} pos={p} />)}
    </div>
  );
}

function PositionRow({ pos }: { pos: EvidencePosition }) {
  const pol = POLARITY[pos.position_type];
  const tags = [
    pol.label,
    pos.position_category ? CATEGORY_LABEL[pos.position_category] : null,
    pos.drug_name?.toUpperCase() ?? null,
    pos.biomarker?.toUpperCase() ?? null,
  ].filter(Boolean) as string[];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "0 40px", padding: "24px 26px 26px", borderTop: `1px solid ${LINE.l0}` }}>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0 7px", ...mono(10, COOL.muted, 0.14, 500) }}>
          {tags.map((t, i) => (
            <span key={i} style={{ display: "inline-flex", gap: 7 }}>
              {i > 0 ? <span style={{ color: LINE.l2 }}>·</span> : null}
              {/* the polarity tag (i===0) carries the weight ink; the rest are muted */}
              <span style={{ color: i === 0 ? pol.ink : COOL.muted, fontWeight: i === 0 ? 600 : 400 }}>{t}</span>
            </span>
          ))}
        </div>
        {/* the position — warm reading prose */}
        <p style={{ margin: 0, font: `400 20px/1.5 ${SERIF}`, color: WARM.body, textWrap: "pretty" }}>
          {pos.position_text}
        </p>
      </div>
      {/* the source sentence — in the field, cool italic */}
      <div style={{ display: "grid", gap: 10, alignContent: "start", borderLeft: `1px solid ${LINE.l2}`, paddingLeft: 26 }}>
        <div style={mono(9.5, COOL.chrome, 0.18)}>SOURCE SENTENCE</div>
        <p style={{ margin: 0, font: `italic 300 14.5px/1.6 ${SERIF}`, color: COOL.chrome, textWrap: "pretty" }}>
          {pos.evidence_excerpt}
        </p>
      </div>
    </div>
  );
}

interface Coverage { estWith: number; estTotal: number; risWith: number; risTotal: number; }

function EmptyState({ hcpName, taLabel, coverage, hcpId }: { hcpName: string; taLabel: string; coverage: Coverage | null; hcpId?: string }) {
  const estPct = coverage && coverage.estTotal ? Math.round((coverage.estWith / coverage.estTotal) * 100) : null;
  const risPct = coverage && coverage.risTotal ? Math.round((coverage.risWith / coverage.risTotal) * 100) : null;
  return (
    <div style={{ marginTop: 8, border: `1px solid ${LINE.l1}`, background: GROUND.g2 }}>
      <div style={{ padding: "14px 26px", background: GROUND.g1, borderBottom: `1px solid ${LINE.l1}`, ...mono(10, COOL.muted, 0.18, 500) }}>
        NO POSITIONS EXTRACTED
      </div>
      <div style={{ padding: "30px 26px 32px", display: "grid", gap: 16 }}>
        <p style={{ margin: 0, font: `400 20px/1.55 ${SERIF}`, color: WARM.body, textWrap: "pretty" }}>
          Position extraction runs only on the top 200 established and top 100 rising US physicians in each therapeutic area.
          {hcpName ? ` ${hcpName} sits` : " This profile sits"} outside that window, so no positions have been extracted for it.
        </p>
        <p style={{ margin: 0, font: `300 16px/1.6 ${SERIF}`, color: COOL.muted, textWrap: "pretty" }}>
          Absence here is a fact about the pipeline, not about the physician&rsquo;s published work.
          Nine in ten US-ranked established profiles have no extracted positions. Publications, trials, and congress activity are indexed in full.
        </p>
        {coverage ? (
          <div style={{ display: "flex", gap: 40, marginTop: 6, paddingTop: 18, borderTop: `1px solid ${LINE.l1}` }}>
            <div>
              <div style={{ font: `300 26px/1 ${SERIF}`, color: WARM.body }}>{fmt(coverage.estWith)}<span style={{ color: WARM.muted }}> / {fmt(coverage.estTotal)}</span></div>
              <div style={{ marginTop: 8, ...mono(9.5, COOL.label, 0.16) }}>ESTABLISHED WITH POSITIONS{estPct != null ? ` · ${estPct}%` : ""}</div>
            </div>
            <div style={{ borderLeft: `1px solid ${LINE.l1}`, paddingLeft: 40 }}>
              <div style={{ font: `300 26px/1 ${SERIF}`, color: WARM.body }}>{fmt(coverage.risWith)}<span style={{ color: WARM.muted }}> / {fmt(coverage.risTotal)}</span></div>
              <div style={{ marginTop: 8, ...mono(9.5, COOL.label, 0.16) }}>RISING WITH POSITIONS{risPct != null ? ` · ${risPct}%` : ""}</div>
            </div>
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, padding: "14px 26px", borderTop: `1px solid ${LINE.l1}`, ...mono(9.5, COOL.label, 0.14) }}>
        <div>EXTRACTION WINDOW · {taLabel ? taLabel.toUpperCase() + " · " : ""}TOP 200 ESTABLISHED · TOP 100 RISING</div>
        {hcpId ? (
          <div style={{ display: "flex", gap: 16, flex: "none" }}>
            <a href={`/hcp/${hcpId}/publications`} style={{ ...mono(9.5, GOLD.gold, 0.14, 500), textDecoration: "none" }}>PUBLICATIONS ↗</a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

async function fetchHcpName(hcpId: string): Promise<string> {
  try {
    const { data } = await supabase.from("hcps_v2").select("first_name, last_name").eq("id", hcpId).maybeSingle();
    if (!data) return "";
    const d = data as { first_name?: string; last_name?: string };
    return `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim();
  } catch { return ""; }
}

async function fetchCoverage(taId?: string): Promise<Coverage | null> {
  if (!taId) return null;
  try {
    // Established: US-region board size and how many carry >=1 extracted position.
    const [{ count: estTotal }, { data: estWithRows }, { count: risTotal }, { data: risWithRows }] = await Promise.all([
      supabase.from("hcp_established_ranks_v3").select("hcp_id", { count: "exact", head: true }).eq("therapeutic_area_id", taId).eq("scope_type", "region").eq("scope_value", "US"),
      supabase.rpc("count_hcps_with_positions", { p_ta_id: taId, p_cohort: "established" }).then((r) => ({ data: r.data })),
      supabase.from("hcp_rising_star_ranks_v3").select("hcp_id", { count: "exact", head: true }).eq("therapeutic_area_id", taId).not("us_rank", "is", null),
      supabase.rpc("count_hcps_with_positions", { p_ta_id: taId, p_cohort: "rising" }).then((r) => ({ data: r.data })),
    ]);
    return {
      estTotal: estTotal ?? 0,
      estWith: typeof estWithRows === "number" ? estWithRows : 0,
      risTotal: risTotal ?? 0,
      risWith: typeof risWithRows === "number" ? risWithRows : 0,
    };
  } catch {
    return null;
  }
}
