// Assets index — grouped by molecular target. Design frame 2b.
//
// Organised by target, because that is how treatment is selected and a territory
// is worked; grouping cuts across modality (amivantamab, a bispecific, sits with
// the EGFR TKIs). Group totals are distinct-publication unions, NOT sums of member
// counts — publications naming two assets in one group would double-count — so the
// group totals deliberately do not sum to the deployment total, and the UI says so.
// Backbone chemotherapy and the one deployment asset with no molecular target sit
// in their own sections; membership keys on is_backbone, never on target == null.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AssetNav from "./AssetNav";
import { COLOR, FONT } from "../../lib/designTokens";
import { formatIndexDate } from "../../lib/assets";
import {
  loadAssetIndex,
  DENSITY_GLYPH,
  DENSITY_LABEL,
  type AssetIndexModel,
  type IndexAssetRow,
  type DensityTier,
} from "../../lib/assetIndex";

type View = "target" | "flat";
type Scale = "within" | "whole";

const eyebrow = {
  fontFamily: FONT.mono,
  fontSize: 9,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: COLOR.ink4,
} as const;
const note = { fontFamily: FONT.mono, fontSize: 10, lineHeight: 1.7, color: COLOR.ink5 } as const;

const TIER_COLOR: Record<DensityTier, string> = {
  dense: COLOR.ink2,
  intermittent: COLOR.ink3,
  sparse: COLOR.ink5,
};

function ctlBtn(active: boolean): React.CSSProperties {
  return {
    fontFamily: FONT.mono,
    fontSize: 11,
    padding: "6px 10px",
    cursor: "pointer",
    background: active ? COLOR.amberSoft : "transparent",
    border: `1px solid ${active ? COLOR.amber : COLOR.hairStrong}`,
    color: active ? COLOR.amber : COLOR.ink3,
  };
}

function AssetRow({ row, denom, showAlso }: { row: IndexAssetRow; denom: number; showAlso: boolean }) {
  const width = denom > 0 ? `${Math.max(1, (row.n / denom) * 100).toFixed(1)}%` : "0%";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "210px 68px minmax(0,1fr) 66px 120px",
        alignItems: "center",
        gap: 14,
        padding: "9px 0",
        borderTop: `1px solid ${COLOR.hair}`,
      }}
    >
      <Link
        to={`/assets/${row.slug}`}
        style={{ fontFamily: FONT.sans, fontSize: 13, color: COLOR.ink1, textDecoration: "none" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.amber)}
        onMouseLeave={(e) => (e.currentTarget.style.color = COLOR.ink1)}
      >
        {row.generic}
      </Link>
      <span
        style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.1em", color: TIER_COLOR[row.tier] }}
        title={`${DENSITY_LABEL[row.tier]} — clears 40 themed in ${row.yearsCleared} of 7 completed years (2019–2025); 2026 in progress`}
      >
        {DENSITY_GLYPH[row.tier]}
      </span>
      <div style={{ height: 5, background: COLOR.hairStrong, borderRadius: 2 }}>
        <div style={{ height: 5, width, background: COLOR.indigo, borderRadius: 2 }} />
      </div>
      <span
        style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 12, color: COLOR.ink1, fontVariantNumeric: "tabular-nums" }}
      >
        {row.n.toLocaleString()}
      </span>
      <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: "0.08em", color: COLOR.ink4, textAlign: "right" }}>
        {showAlso && row.alsoTargets.length > 0 ? `ALSO ${row.alsoTargets.join(", ")}` : ""}
      </span>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14, border: `1px solid ${COLOR.hairStrong}`, background: COLOR.surfaceCard, padding: "20px 22px" }}>
      {children}
    </div>
  );
}

export default function AssetsIndexPage() {
  const [model, setModel] = useState<AssetIndexModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>("target");
  const [scale, setScale] = useState<Scale>("within");

  useEffect(() => {
    let alive = true;
    loadAssetIndex()
      .then((m) => alive && (setModel(m), setLoading(false)))
      .catch(() => alive && (setFailed(true), setLoading(false)));
    return () => {
      alive = false;
    };
  }, []);

  const scaleNote =
    scale === "within"
      ? "Bars scale within each target group — each is relative to the leader of its own group. Read a bar down its group, not across the index."
      : model
      ? `Bars scale to the whole index — one shared axis, osimertinib at ${model.globalMax.toLocaleString()}. Comparable across groups, but small groups read as nearly empty.`
      : "";

  return (
    <div style={{ backgroundColor: COLOR.ground, minHeight: "100vh", fontFamily: FONT.sans }}>
      <AssetNav active="assets" />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 96px", width: "100%", boxSizing: "border-box" }}>
        {loading ? (
          <div style={{ ...note, padding: "40px 0", fontSize: 12 }}>Loading assets…</div>
        ) : failed || !model ? (
          <div style={{ ...note, padding: "40px 0", fontSize: 12, color: COLOR.ink3 }}>
            The asset index could not be loaded.
          </div>
        ) : (
          <IndexBody model={model} view={view} setView={setView} scale={scale} setScale={setScale} scaleNote={scaleNote} />
        )}
      </div>
    </div>
  );
}

function IndexBody({
  model,
  view,
  setView,
  scale,
  setScale,
  scaleNote,
}: {
  model: AssetIndexModel;
  view: View;
  setView: (v: View) => void;
  scale: Scale;
  setScale: (s: Scale) => void;
  scaleNote: string;
}) {
  const h = model.header;
  const legend = model.legend;
  // In flat view "within target" has no meaning — bars fall back to the whole index.
  const useWithin = view === "target" && scale === "within";

  return (
    <>
      {/* Header */}
      <div style={{ padding: "34px 0 22px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
        <h1 style={{ margin: "0 0 12px", fontFamily: FONT.sans, fontSize: 27, fontWeight: 500, letterSpacing: "-0.01em", color: COLOR.ink1 }}>
          Assets index · NSCLC corpus
        </h1>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 36, alignItems: "start" }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 16, lineHeight: 1.55, color: COLOR.ink2 }}>
            Organised by molecular target, because that is how treatment is selected and how a
            territory is worked. Grouping cuts across modality: amivantamab is a bispecific antibody
            sitting with eight small-molecule TKIs, because they compete for the same patient.
          </div>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "5px 14px", fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.5, color: COLOR.ink3 }}>
              <span>43 deployment assets reach</span>
              <span style={{ textAlign: "right", color: COLOR.ink1 }}>{h.deploymentPubs.toLocaleString()}</span>
              <span>8 backbone agents reach</span>
              <span style={{ textAlign: "right", color: COLOR.ink1 }}>{h.backbonePubs.toLocaleString()}</span>
              <span>all 51 reach</span>
              <span style={{ textAlign: "right", color: COLOR.ink1 }}>{h.allPubs.toLocaleString()}</span>
              <span>NSCLC corpus</span>
              <span style={{ textAlign: "right", color: COLOR.ink1 }}>{h.corpus.toLocaleString()}</span>
            </div>
            <div style={{ ...note, marginTop: 10 }}>
              Distinct publications, not asset–publication edges. The first two scopes overlap by{" "}
              {h.overlap.toLocaleString()} records and do not partition — they are not drawn as a whole.
            </div>
          </div>
        </div>
      </div>

      {/* Controls + density legend */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "16px 0", borderBottom: `1px solid ${COLOR.hairStrong}`, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={eyebrow}>View</span>
            <div style={{ display: "flex", gap: 1 }}>
              <button type="button" style={ctlBtn(view === "target")} onClick={() => setView("target")}>By target</button>
              <button type="button" style={ctlBtn(view === "flat")} onClick={() => setView("flat")}>Flat · volume</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={eyebrow}>Bar scale</span>
            <div style={{ display: "flex", gap: 1 }}>
              <button type="button" style={ctlBtn(scale === "within")} onClick={() => setScale("within")}>Within target</button>
              <button type="button" style={ctlBtn(scale === "whole")} onClick={() => setScale("whole")}>Whole index</button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: FONT.mono, fontSize: 10, color: COLOR.ink3 }}>
          {(["dense", "intermittent", "sparse"] as DensityTier[]).map((t) => (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ letterSpacing: "0.1em", color: TIER_COLOR[t] }}>{DENSITY_GLYPH[t]}</span>
              {DENSITY_LABEL[t]} {legend[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Scale note + density explainer */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
        <div style={{ padding: "14px 0", fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.6, color: COLOR.ink3 }}>{scaleNote}</div>
        <div style={{ padding: "14px 0 14px 22px", borderLeft: `1px solid ${COLOR.hair}`, fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.6, color: COLOR.ink3 }}>
          Density is measured, not judged: how many of the 7 completed years (2019–2025) clear 40
          themed publications; 2026 is in progress. It predicts the page, nothing about the therapy.
        </div>
      </div>

      {/* Body */}
      <div style={{ paddingTop: 8 }}>
        {view === "target" ? (
          <>
            {model.targetGroups.map((g) => {
              const groupMax = Math.max(1, ...g.rows.map((r) => r.n));
              const denom = useWithin ? groupMax : model.globalMax;
              return (
                <div key={g.target} style={{ padding: "20px 0 6px", borderBottom: `1px solid ${COLOR.hair}` }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingBottom: 10 }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 500, letterSpacing: "0.14em", color: COLOR.amber }}>{g.target}</span>
                    <span style={{ fontFamily: FONT.mono, fontSize: 10, color: COLOR.ink4 }}>
                      {g.rows.length} asset{g.rows.length === 1 ? "" : "s"} · {g.distinctPubs.toLocaleString()} distinct publications
                    </span>
                  </div>
                  {g.rows.map((r) => (
                    <AssetRow key={r.slug} row={r} denom={denom} showAlso />
                  ))}
                </div>
              );
            })}

            {/* Backbone */}
            <SectionCard>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 500, letterSpacing: "0.14em", color: COLOR.ink1 }}>BACKBONE CHEMOTHERAPY</span>
                <span style={{ fontFamily: FONT.mono, fontSize: 10, color: COLOR.ink4 }}>
                  {model.backbone.rows.length} assets · {model.backbone.distinctPubs.toLocaleString()} distinct publications
                </span>
              </div>
              <div style={{ fontFamily: FONT.serif, fontSize: 14, lineHeight: 1.6, color: COLOR.ink2, maxWidth: 700, marginBottom: 14 }}>
                These agents have no molecular target. That is what backbone chemotherapy is, not a gap
                in the data — so they sit outside the target structure rather than in a null group, and
                they are listed rather than dropped. Section membership keys on{" "}
                <span style={{ fontFamily: FONT.mono, fontSize: 12, color: COLOR.ink1 }}>is_backbone</span>, never on target being null.
              </div>
              {model.backbone.rows.map((r) => (
                <AssetRow key={r.slug} row={r} denom={Math.max(1, ...model.backbone.rows.map((x) => x.n))} showAlso={false} />
              ))}
              <div style={{ ...note, marginTop: 12 }}>
                Row counts sum to {model.backbone.rowSum.toLocaleString()} because these agents are
                co-administered and co-mentioned; {model.backbone.distinctPubs.toLocaleString()} is the
                distinct union. Density is shown for consistency but these assets are outside the
                43-asset deployment count in the legend above.
              </div>
            </SectionCard>

            {/* No molecular target, not backbone */}
            {model.nullNonBackbone.length > 0 ? (
              <SectionCard>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, marginBottom: 8 }}>
                  <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 500, letterSpacing: "0.14em", color: COLOR.ink1 }}>NO MOLECULAR TARGET, NOT BACKBONE</span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: COLOR.ink4 }}>
                    {model.nullNonBackbone.length} asset{model.nullNonBackbone.length === 1 ? "" : "s"} ·{" "}
                    {model.nullNonBackbone.reduce((s, r) => s + r.n, 0).toLocaleString()} publications
                  </span>
                </div>
                {model.nullNonBackbone.map((r) => (
                  <AssetRow key={r.slug} row={r} denom={Math.max(1, ...model.nullNonBackbone.map((x) => x.n))} showAlso={false} />
                ))}
                <div style={{ fontFamily: FONT.mono, fontSize: 13, lineHeight: 1.7, color: COLOR.ink3, maxWidth: 820, marginTop: 12 }}>
                  A deployment asset with <span style={{ color: COLOR.ink1 }}>target = null</span> and{" "}
                  <span style={{ color: COLOR.ink1 }}>is_backbone = false</span>. It gets its own section,
                  named for what is true of it, rather than being filed under chemotherapy or hidden. The
                  section is a real state in the taxonomy, not a catch-all: any future asset matching the
                  same two conditions lands here and the count moves.
                </div>
              </SectionCard>
            ) : null}

            <div style={{ ...note, marginTop: 22, lineHeight: 1.8, maxWidth: 900 }}>
              {model.counts.targetGroups} target groups from the controlled vocabulary, holding the{" "}
              {model.counts.targetedAssets} deployment assets that carry a target; the 43rd has none and
              sits in the section above. Six assets are multi-target and appear in every group they
              belong to, marked <span style={{ color: COLOR.ink3 }}>ALSO …</span> — so the groups hold{" "}
              {model.counts.rows} rows for {model.counts.targetedAssets} assets, and group publication
              totals do not sum to {model.header.deploymentPubs.toLocaleString()}.
            </div>
          </>
        ) : (
          /* Flat · volume */
          <div style={{ paddingTop: 14 }}>
            {model.flat.map((r) => (
              <AssetRow key={r.slug} row={r} denom={model.globalMax} showAlso={false} />
            ))}
            <div style={{ ...note, marginTop: 16 }}>
              All 43 deployment assets by publication volume, on one axis (osimertinib at{" "}
              {model.globalMax.toLocaleString()}). Bars are volume only — no cross-asset ranking on
              anything else, and no composite.
            </div>
          </div>
        )}

        <div style={{ ...note, marginTop: 36 }}>
          FieldMark NSCLC corpus, {model.header.corpus.toLocaleString()} records, indexed {formatIndexDate()}.
        </div>
      </div>
    </>
  );
}
