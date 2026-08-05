// Drugs (Assets) Index — "Volume III" editorial redesign.
// Layout authority: docs/design/Drugs Index.dc.html (project 1be10392).
//
// The frame hardcodes its data; the real page is driven ENTIRELY by loadAssetIndex()
// (asset_mention_v1 distinct counts, asset_group_distinct unions, density RPC, config
// roster + targets). The audit confirmed those counts are honest — distinct-publication,
// NSCLC-scoped, one per-drug count shown once per target group — so this is a clean
// presentation swap, no count logic changed. The index date + corpus total are the
// COMPUTED values from the model (asset_index_meta), never the old hardcoded constants.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NavBar from "../NavBar";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { FONT, GROUND } from "../../lib/designTokens";
import { formatIndexDate } from "../../lib/assets";
import { ASSETS, DEPLOYMENT_ASSETS, BACKBONE_ASSETS } from "../../lib/assetConfig";
import {
  loadAssetIndex,
  DENSITY_GLYPH,
  DENSITY_LABEL,
  type AssetIndexModel,
  type IndexAssetRow,
} from "../../lib/assetIndex";

// ── palette (from the frame) ──────────────────────────────────────────────────
// Register migration 2026-08-05: only the font stacks matched tokens exactly.
// This palette is WARM-tinted throughout — BG/PANEL/H1–H4 vs the cool SCALE,
// GOLD #c9903c / GOLD_DIM #7d6234 / GOLD_FAINT #6f5629 vs GOLD.gold #be914d /
// goldMuted #7a6136 / goldDeep #6b542f, and the INK/MUT/DIM ramps vs INK.* —
// all near-twins, none byte-identical, so all stay local. Converging them is a
// visible change reserved for its own commit. (Local GOLD name shadows nothing:
// only FONT is imported from designTokens here.)
const BG = GROUND.g0, PANEL = "#0e0d0c", PANEL2 = "#111010"; // BG absorbed 2026-08-05 (was #0a0a09, one byte)
const GOLD = "#c9903c", GOLD_DIM = "#7d6234", GOLD_FAINT = "#6f5629";
const INK = "#f0ebe1", INK2 = "#e6e1d8", INK3 = "#cfc9be";
const MUT = "#a9a399", MUT2 = "#8a8378", MUT3 = "#6b665e", DIM = "#544f49", DIM2 = "#413d38", DIM3 = "#302d29";
const H1 = "#1c1b18", H2 = "#201f1c", H3 = "#232120", H4 = "#191816";
const SERIF = FONT.serif;
const MONO = FONT.mono;

const fmt = (n: number) => n.toLocaleString("en-US");

type View = "target" | "flat";
type Sort = "volume" | "alpha";
type Kind = "target" | "chemo" | "none";

interface Membership { label: string; rank: number; of: number; pubs: number; kind: Kind }
interface AssetRec { name: string; slug: string; count: number; tier: IndexAssetRow["tier"]; yearsCleared: number; kind: Kind; groups: Membership[] }

export default function AssetsIndexPage() {
  const [model, setModel] = useState<AssetIndexModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    let alive = true;
    loadAssetIndex()
      .then((m) => alive && (setModel(m), setLoading(false)))
      .catch(() => alive && (setFailed(true), setLoading(false)));
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: SERIF, color: INK2 }}>
      <style>{"@keyframes fmIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}"}</style>
      <NavBar />
      {loading ? (
        <div style={{ padding: "48px 34px", fontFamily: MONO, fontSize: 12, color: MUT3 }}>Loading the index…</div>
      ) : failed || !model ? (
        <div style={{ padding: "48px 34px", fontFamily: MONO, fontSize: 12, color: MUT3 }}>The drug index could not be loaded.</div>
      ) : (
        <Index model={model} isMobile={isMobile} />
      )}
    </div>
  );
}

function Index({ model, isMobile }: { model: AssetIndexModel; isMobile: boolean }) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("target");
  const [sort, setSort] = useState<Sort>("volume");
  const [hov, setHov] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  // asset → memberships (per-drug count is identical across its groups — the audited fact)
  const assetMap = useMemo(() => {
    const m = new Map<string, AssetRec>();
    const ensure = (r: IndexAssetRow, kind: Kind): AssetRec => {
      let a = m.get(r.generic);
      if (!a) { a = { name: r.generic, slug: r.slug, count: r.n, tier: r.tier, yearsCleared: r.yearsCleared, kind, groups: [] }; m.set(r.generic, a); }
      return a;
    };
    for (const g of model.targetGroups) g.rows.forEach((r, i) => ensure(r, "target").groups.push({ label: g.target, rank: i + 1, of: g.rows.length, pubs: g.distinctPubs, kind: "target" }));
    model.backbone.rows.forEach((r, i) => ensure(r, "chemo").groups.push({ label: "BACKBONE CHEMOTHERAPY", rank: i + 1, of: model.backbone.rows.length, pubs: model.backbone.distinctPubs, kind: "chemo" }));
    model.nullNonBackbone.forEach((r, i) => ensure(r, "none").groups.push({ label: "NO MOLECULAR TARGET", rank: i + 1, of: model.nullNonBackbone.length, pubs: r.n, kind: "none" }));
    return m;
  }, [model]);

  const active = hov ?? sel;
  const pinned = sel != null && hov == null;

  // ── shared row renderer ──
  const Row = ({ r, rank, showAlso, forGroup }: { r: IndexAssetRow; rank: number; showAlso?: boolean; forGroup?: string }) => {
    const rec = assetMap.get(r.generic);
    const isActive = active === r.generic;
    const alsoTargets = forGroup && rec ? rec.groups.filter((g) => g.kind === "target" && g.label !== forGroup).map((g) => g.label) : [];
    const allTargets = showAlso && rec ? rec.groups.map((g) => (g.kind === "target" ? g.label : g.kind === "chemo" ? "BACKBONE" : "NO TARGET")) : [];
    const alsoText = allTargets.length ? "IN " + allTargets.join(" · ") : alsoTargets.length ? "ALSO IN " + alsoTargets.join(" · ") : "";
    const to = `/assets/${r.slug}`;
    const nameColor = isActive ? "#f4efe4" : INK3;
    const nameStyle = { font: `400 13px/1.15 ${SERIF}`, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", color: nameColor, textDecoration: "none", transition: "color .13s ease" };
    return (
      <div
        // Desktop: hover previews, whole-row click pins into the briefing rail (the name is
        // a real Link for one-click access to the record — see below). Mobile: no rail
        // exists, so the row tap navigates straight to the asset record (restores the old
        // linkage). No new destinations — only /assets/:slug, as before.
        onMouseEnter={isMobile ? undefined : () => setHov(r.generic)}
        onMouseLeave={isMobile ? undefined : () => setHov(null)}
        onClick={isMobile ? () => navigate(to) : () => setSel(r.generic)}
        style={{ position: "relative", display: "grid", gridTemplateColumns: "18px minmax(0,1fr) auto auto", alignItems: "baseline", columnGap: 7, padding: "5px 6px 6px 4px", cursor: "pointer", borderBottom: `1px solid ${H4}`, transition: "background .13s ease, box-shadow .13s ease", ...(isActive ? { background: "#181611", boxShadow: `inset 2px 0 0 ${GOLD}` } : {}) }}
      >
        <span style={{ font: `500 8.5px/1 ${MONO}`, letterSpacing: ".04em", textAlign: "right", color: isActive ? GOLD : "#3e3a35" }}>{String(rank).padStart(2, "0")}</span>
        {isMobile ? (
          <span style={nameStyle}>{r.generic}</span>
        ) : (
          // Real link → one-click to the asset record; stopPropagation so it doesn't also
          // pin. Clicking anywhere else on the row still pins.
          <Link to={to} onClick={(e) => e.stopPropagation()} style={nameStyle}>{r.generic}</Link>
        )}
        <span title={DENSITY_LABEL[r.tier]} style={{ font: `400 7px/1 ${MONO}`, letterSpacing: ".08em", color: isActive ? "#6e6558" : DIM3 }}>{DENSITY_GLYPH[r.tier]}</span>
        <span style={{ font: `500 11.5px/1 ${MONO}`, fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: 40, color: isActive ? "#f4efe4" : INK3 }}>{fmt(r.n)}</span>
        {alsoText ? <div style={{ gridColumn: "2 / 5", padding: "4px 0 1px", font: `500 7.5px/1 ${MONO}`, letterSpacing: ".14em", color: isActive ? GOLD : GOLD_FAINT }}>{alsoText}</div> : null}
      </div>
    );
  };

  // ── section 01 body: target chapters or flat ──
  const sortRows = (rows: IndexAssetRow[]) =>
    sort === "alpha" ? [...rows].sort((a, b) => a.generic.localeCompare(b.generic)) : rows;

  let chapters: { ord: string; label: string; meta: string; body: JSX.Element }[] = [];
  let sec1Title: string, sec1Meta: string;

  if (view === "flat") {
    const flat = [...model.flat].sort((a, b) =>
      sort === "alpha" ? a.generic.localeCompare(b.generic) : b.n - a.n || a.generic.localeCompare(b.generic),
    );
    sec1Title = "EVERY DEPLOYMENT ASSET, UNGROUPED";
    sec1Meta = `${DEPLOYMENT_ASSETS.length} ASSETS · ONE ROW EACH · BY VOLUME`;
    chapters = [{
      ord: "01", label: sort === "alpha" ? "A – Z" : "BY VOLUME", meta: `${flat.length} assets`,
      body: <>{flat.map((r, i) => <Row key={r.slug} r={r} rank={i + 1} showAlso />)}</>,
    }];
  } else {
    sec1Title = "TARGETED ASSETS";
    sec1Meta = `${model.counts.targetGroups} CHAPTERS · ${model.counts.targetedAssets} ASSETS · ${model.counts.rows} ROWS · ${fmt(model.header.deploymentPubs)} REACH`;
    const groups = sort === "alpha" ? [...model.targetGroups].sort((a, b) => a.target.localeCompare(b.target)) : model.targetGroups;
    chapters = groups.map((g, gi) => ({
      ord: String(gi + 1).padStart(2, "0"),
      label: g.target,
      meta: `${g.rows.length} · ${fmt(g.distinctPubs)}`,
      body: <>{sortRows(g.rows).map((r) => <Row key={g.target + r.slug} r={r} rank={g.rows.indexOf(r) + 1} forGroup={g.target} />)}</>,
    }));
  }

  const multiTarget = useMemo(
    () => [...assetMap.values()].filter((a) => a.groups.filter((g) => g.kind === "target").length > 1).sort((a, b) => b.count - a.count),
    [assetMap],
  );

  const cols = isMobile ? "1fr" : "minmax(0,1fr) 306px";
  const chapCols = isMobile ? "1fr" : "296px 3"; // CSS columns masonry
  const openRecord = (slug: string) => navigate(`/assets/${slug}`);

  const ctl = (on: boolean): React.CSSProperties => ({
    padding: "5px 11px", font: `500 9.5px/1 ${MONO}`, letterSpacing: ".11em", cursor: "pointer", borderRadius: 2,
    background: on ? "#151310" : "transparent", border: `1px solid ${on ? GOLD_DIM : "#242220"}`, color: on ? "#e8dcc4" : MUT3,
  });

  return (
    <div style={{ minWidth: isMobile ? undefined : 1120, paddingBottom: 0 }}>
      {/* header */}
      <div style={{ padding: isMobile ? "22px 16px 0" : "30px 34px 0", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 470px", gap: isMobile ? 22 : 56, alignItems: "start" }}>
        <div>
          <div style={{ font: `500 9px/1 ${MONO}`, letterSpacing: ".24em", color: MUT3, marginBottom: 12 }}>INDEX · VOLUME III</div>
          <h1 style={{ margin: "0 0 12px", font: `400 30px/1.1 ${SERIF}`, letterSpacing: "-.008em", color: INK }}>Drugs Index · NSCLC</h1>
          <p style={{ margin: 0, maxWidth: 620, font: `300 14.5px/1.55 ${SERIF}`, color: MUT }}>Organized by molecular target, because that is how treatment is selected and how a territory is worked. Grouping cuts across modality: amivantamab is a bispecific antibody sitting with small-molecule TKIs, because they compete for the same patient.</p>
        </div>
        <div style={{ paddingTop: 4 }}>
          <ReachRow label={`${DEPLOYMENT_ASSETS.length} deployment assets reach`} value={fmt(model.header.deploymentPubs)} />
          <ReachRow label={`${BACKBONE_ASSETS.length} backbone agents reach`} value={fmt(model.header.backbonePubs)} />
          <ReachRow label={`all ${ASSETS.length} reach`} value={fmt(model.header.allPubs)} />
          <ReachRow label="NSCLC corpus" value={fmt(model.header.corpus)} />
          <p style={{ margin: "10px 0 0", font: `400 9.5px/1.6 ${MONO}`, letterSpacing: ".02em", color: DIM, maxWidth: 420 }}>Distinct publications, not asset–publication edges. The first two scopes overlap by {fmt(model.header.overlap)} records and do not partition — they are not drawn as a whole.</p>
        </div>
      </div>

      {/* controls */}
      <div style={{ margin: isMobile ? "22px 16px 0" : "26px 34px 0", borderTop: `1px solid ${H1}`, borderBottom: `1px solid ${H1}`, padding: "10px 0", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ font: `400 8.5px/1 ${MONO}`, letterSpacing: ".16em", color: "#4e4a44" }}>VIEW</span>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => setView("target")} style={ctl(view === "target")}>BY TARGET</button>
            <button onClick={() => setView("flat")} style={ctl(view === "flat")}>FLAT · VOLUME</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ font: `400 8.5px/1 ${MONO}`, letterSpacing: ".16em", color: "#4e4a44" }}>ORDER</span>
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => setSort("volume")} style={ctl(sort === "volume")}>VOLUME</button>
            <button onClick={() => setSort("alpha")} style={ctl(sort === "alpha")}>A–Z</button>
          </div>
        </div>
      </div>

      {/* main grid: sections + briefing rail */}
      <div style={{ margin: isMobile ? "20px 16px 0" : "24px 34px 0", display: "grid", gridTemplateColumns: cols, gap: isMobile ? 24 : 34, alignItems: "start" }}>
        <div>
          {/* SECTION 01 */}
          <SectionHead ord="01" accent={GOLD} title={sec1Title} meta={sec1Meta} />
          <div style={{ columns: chapCols, columnGap: 32 }}>
            {chapters.map((ch) => (
              <div key={ch.ord + ch.label} style={{ breakInside: "avoid", display: "inline-block", width: "100%", margin: "0 0 22px", verticalAlign: "top" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "0 6px 5px 4px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                    <span style={{ font: `500 8.5px/1 ${MONO}`, color: "#413d38", letterSpacing: ".04em" }}>{ch.ord}</span>
                    <span style={{ font: `600 10.5px/1 ${MONO}`, letterSpacing: ".19em", color: GOLD, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.label}</span>
                  </div>
                  <span style={{ font: `400 8.5px/1 ${MONO}`, letterSpacing: ".05em", color: DIM, whiteSpace: "nowrap" }}>{ch.meta}</span>
                </div>
                <div style={{ height: 1, background: H3, margin: "0 6px 6px 4px" }} />
                {ch.body}
              </div>
            ))}
          </div>

          {/* SECTION 02 + 03 */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.55fr) minmax(0,1fr)", gap: 30, marginTop: 6, minWidth: 0 }}>
            <div>
              <SectionHead ord="02" accent={MUT2} title="BACKBONE CHEMOTHERAPY" meta={`${model.backbone.rows.length} AGENTS · ${fmt(model.backbone.distinctPubs)} DISTINCT PUBLICATIONS`} />
              <p style={{ margin: "0 0 14px", maxWidth: 640, font: `300 13px/1.6 ${SERIF}`, color: "#a09a90" }}>These agents have no molecular target. That is what backbone chemotherapy is, not a gap in the data — so they sit outside the target structure rather than in a null group, and they are listed rather than dropped. Section membership keys on <span style={{ font: `400 11.5px/1 ${MONO}`, color: GOLD }}>is_backbone</span>, never on target being null.</p>
              <div style={{ columns: isMobile ? undefined : "236px 2", columnGap: 30 }}>
                {[...model.backbone.rows].sort((a, b) => (sort === "alpha" ? a.generic.localeCompare(b.generic) : b.n - a.n)).map((r) => (
                  <div key={r.slug} style={{ breakInside: "avoid" }}>
                    <Row r={r} rank={model.backbone.rows.indexOf(r) + 1} />
                  </div>
                ))}
              </div>
              <p style={{ margin: "14px 0 0", font: `400 9.5px/1.65 ${MONO}`, color: "#4e4a44", maxWidth: 700 }}>Row counts sum to {fmt(model.backbone.rowSum)} because these agents are co-administered and co-mentioned; {fmt(model.backbone.distinctPubs)} is the distinct union. Density is shown for consistency but these assets are outside the {DEPLOYMENT_ASSETS.length}-asset deployment count in the legend above.</p>
            </div>

            <div>
              <SectionHead ord="03" accent={MUT2} title="" meta={`${model.nullNonBackbone.length} ASSET · ${fmt(model.nullNonBackbone.reduce((s, r) => s + r.n, 0))} PUBLICATIONS`} />
              <div style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: MUT3, margin: "0 0 12px" }}>NO MOLECULAR TARGET, NOT BACKBONE</div>
              {model.nullNonBackbone.map((r, i) => <Row key={r.slug} r={r} rank={i + 1} />)}
              <p style={{ margin: "14px 0 0", font: `300 12.5px/1.6 ${SERIF}`, color: "#a09a90" }}>A deployment asset with <span style={{ font: `400 11px/1 ${MONO}`, color: GOLD }}>target = null</span> and <span style={{ font: `400 11px/1 ${MONO}`, color: GOLD }}>is_backbone = false</span>. It gets its own section, named for what is true of it, rather than being filed under chemotherapy or hidden — a real state in the taxonomy, not a catch-all.</p>
            </div>
          </div>
        </div>

        {/* BRIEFING RAIL (desktop) */}
        {!isMobile ? (
          <div style={{ position: "sticky", top: 16, alignSelf: "start", border: `1px solid ${H2}`, background: PANEL, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderBottom: `1px solid ${H1}`, background: PANEL2 }}>
              <span style={{ width: 2, height: 10, background: GOLD, display: "block" }} />
              <span style={{ font: `600 9px/1 ${MONO}`, letterSpacing: ".22em", color: "#d8cdb6" }}>BRIEFING</span>
              <span style={{ flex: 1 }} />
              <span style={{ font: `400 8.5px/1 ${MONO}`, letterSpacing: ".1em", color: "#4e4a44" }}>{active ? (pinned ? "PINNED" : "PREVIEW") : "NO ASSET RAISED"}</span>
            </div>
            {active && assetMap.get(active) ? (
              <Brief rec={assetMap.get(active)!} model={model} setHov={setHov} setSel={setSel} openRecord={openRecord} />
            ) : (
              <div style={{ padding: "16px 14px 18px" }}>
                <p style={{ margin: "0 0 16px", font: `300 13px/1.6 ${SERIF}`, color: MUT2 }}>Every row in this index is a linked asset record. Raise one here to read its position before you open it — rank inside its target group, share of that group's literature, and every other group it is carried by.</p>
                <div style={{ borderTop: `1px solid ${H1}`, paddingTop: 12 }}>
                  <div style={{ font: `500 8.5px/1 ${MONO}`, letterSpacing: ".18em", color: DIM, marginBottom: 9 }}>MULTI-TARGET ASSETS</div>
                  {multiTarget.map((a) => (
                    <div key={a.slug} onMouseEnter={() => setHov(a.name)} onMouseLeave={() => setHov(null)} onClick={() => setSel(a.name)} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "3px 0", cursor: "pointer" }}>
                      <span style={{ font: `400 12.5px/1.2 ${SERIF}`, color: INK3 }}>{a.name}</span>
                      <span style={{ font: `400 8px/1 ${MONO}`, letterSpacing: ".12em", color: GOLD_FAINT }}>{a.groups.filter((g) => g.kind === "target").map((g) => g.label).join(" · ")}</span>
                    </div>
                  ))}
                  <p style={{ margin: "11px 0 0", font: `400 9px/1.6 ${MONO}`, color: "#45413b" }}>{multiTarget.length} assets appear in every group they belong to — {model.counts.rows} rows for {model.counts.targetedAssets} assets.</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* multi-target note + footer */}
      <div style={{ margin: isMobile ? "26px 16px 0" : "26px 34px 0", borderTop: `1px solid ${H1}`, padding: "12px 0 0" }}>
        <p style={{ margin: 0, maxWidth: 1180, font: `400 9.5px/1.7 ${MONO}`, color: "#4e4a44" }}>{model.counts.targetGroups} target groups from the controlled vocabulary, holding the {model.counts.targetedAssets} deployment assets that carry a target; the rest have none. Multi-target assets appear in every group they belong to, marked <span style={{ color: GOLD_FAINT }}>ALSO IN</span> — so the groups hold {model.counts.rows} rows for {model.counts.targetedAssets} assets, and group publication totals do not sum to {fmt(model.header.deploymentPubs)}.</p>
      </div>
      <div style={{ margin: "16px 0 0", borderTop: `1px solid ${H1}`, padding: isMobile ? "12px 16px 26px" : "12px 34px 26px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <span style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".06em", color: DIM2 }}>FieldMark NSCLC corpus, {fmt(model.header.corpus)} records, indexed {formatIndexDate(model.header.indexDate)}.</span>
        <span style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".06em", color: DIM2 }}>{view === "flat" ? `FLAT VIEW · ${DEPLOYMENT_ASSETS.length} ROWS` : `${model.counts.rows} TARGET ROWS · ${model.backbone.rows.length} BACKBONE · ${model.nullNonBackbone.length} UNTARGETED`}</span>
      </div>
    </div>
  );
}

function ReachRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${H4}`, padding: "5px 0" }}>
      <span style={{ font: `400 10px/1 ${MONO}`, letterSpacing: ".06em", color: "#7d776d" }}>{label}</span>
      <span style={{ font: `500 12px/1 ${MONO}`, fontVariantNumeric: "tabular-nums", color: INK }}>{value}</span>
    </div>
  );
}

function SectionHead({ ord, accent, title, meta }: { ord: string; accent: string; title: string; meta: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: `1px solid ${H2}`, borderBottom: `1px solid ${H2}`, padding: "7px 0", margin: "0 0 16px" }}>
      <span style={{ width: 2, height: 11, background: accent, display: "block" }} />
      <span style={{ font: `600 9.5px/1 ${MONO}`, letterSpacing: ".2em", color: "#d8cdb6" }}>SECTION {ord}</span>
      {title ? <span style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: MUT3 }}>{title}</span> : null}
      <span style={{ flex: 1, height: 1, background: "#1a1917" }} />
      <span style={{ font: `400 9px/1 ${MONO}`, letterSpacing: ".08em", color: DIM }}>{meta}</span>
    </div>
  );
}

function Brief({ rec, model, setHov, setSel, openRecord }: {
  rec: AssetRec; model: AssetIndexModel; setHov: (s: string | null) => void; setSel: (s: string | null) => void; openRecord: (slug: string) => void;
}) {
  const primary = rec.groups[0];
  const targets = rec.groups.filter((g) => g.kind === "target");
  const isChemo = rec.kind === "chemo", isNone = rec.kind === "none";
  const scope = isChemo ? model.header.backbonePubs : model.header.deploymentPubs;
  const scopeLabel = isChemo ? `of the ${fmt(model.header.backbonePubs)} backbone reach` : `of the ${fmt(model.header.deploymentPubs)} targeted reach`;

  let kind = "TARGETED ASSET", position = "", line = "";
  if (isChemo) {
    kind = "BACKBONE CHEMOTHERAPY";
    position = `Rank ${primary.rank} of ${primary.of} · no molecular target`;
    line = "No molecular target — that is the definition of backbone chemotherapy, not a gap in the record. Counted outside the deployment assets, and outside the target structure rather than inside a null group.";
  } else if (isNone) {
    kind = "DEPLOYMENT ASSET · NO TARGET";
    position = "target = null · is_backbone = false";
    line = "A deployment asset that carries no target and is not backbone, so it holds a section named for what is true of it — a real state in the taxonomy, not a catch-all.";
  } else if (targets.length > 1) {
    kind = "MULTI-TARGET ASSET";
    position = `Carried by ${targets.length} target groups`;
    line = `Appears as a row in ${targets.length} chapters — ${targets.map((g) => g.label).join(", ")}. The same ${fmt(rec.count)} publications are counted in each group, and the asset is counted once in the deployment total. Group totals therefore do not sum.`;
  } else {
    const share = Math.round((rec.count / primary.pubs) * 100);
    position = `Rank ${primary.rank} of ${primary.of} in ${primary.label}`;
    line = `Holds ${share}% of the ${primary.label} chapter's ${fmt(primary.pubs)} publications, at rank ${primary.rank} of ${primary.of}.`;
  }

  const stats = [
    { k: "distinct publications", v: fmt(rec.count) },
    { k: `share of ${isNone ? "its section" : primary.label.toLowerCase()}`, v: `${Math.round((rec.count / primary.pubs) * 100)}%` },
    { k: scopeLabel, v: `${((rec.count / scope) * 100).toFixed(1)}%` },
    { k: "density · 7 completed years", v: `${DENSITY_LABEL[rec.tier]} ${rec.yearsCleared}/7` },
  ];

  // peers = the primary group's members, by volume
  const peerGroup = isChemo ? model.backbone.rows : isNone ? model.nullNonBackbone : (model.targetGroups.find((g) => g.target === primary.label)?.rows ?? []);
  const peerTitle = isChemo ? "BACKBONE, BY VOLUME" : isNone ? "SECTION 03" : `${primary.label} CHAPTER`;

  return (
    <div style={{ padding: "15px 14px 16px", animation: "fmIn .16s ease both" }}>
      <div style={{ font: `500 8.5px/1 ${MONO}`, letterSpacing: ".18em", color: GOLD_DIM, marginBottom: 7 }}>{kind}</div>
      <div style={{ font: `400 21px/1.15 ${SERIF}`, color: INK, marginBottom: 4 }}>{rec.name}</div>
      <div style={{ font: `400 9.5px/1 ${MONO}`, letterSpacing: ".1em", color: MUT2, marginBottom: 13 }}>{position}</div>
      <p style={{ margin: "0 0 14px", font: `300 13px/1.6 ${SERIF}`, color: MUT }}>{line}</p>

      <div style={{ borderTop: `1px solid ${H1}`, padding: "9px 0 0" }}>
        {stats.map((s) => (
          <div key={s.k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "3px 0" }}>
            <span style={{ font: `400 9.5px/1.3 ${MONO}`, letterSpacing: ".04em", color: MUT3 }}>{s.k}</span>
            <span style={{ font: `500 11px/1.3 ${MONO}`, fontVariantNumeric: "tabular-nums", color: INK2, textAlign: "right" }}>{s.v}</span>
          </div>
        ))}
      </div>

      {rec.groups.length > 1 ? (
        <div style={{ borderTop: `1px solid ${H1}`, marginTop: 11, paddingTop: 10 }}>
          <div style={{ font: `500 8.5px/1 ${MONO}`, letterSpacing: ".18em", color: DIM, marginBottom: 8 }}>CARRIED BY</div>
          {rec.groups.map((g) => (
            <div key={g.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "3px 0" }}>
              <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: ".16em", color: GOLD }}>{g.label}</span>
              <span style={{ font: `400 9px/1 ${MONO}`, letterSpacing: ".06em", color: MUT3 }}>rank {g.rank} of {g.of} · {Math.round((rec.count / g.pubs) * 100)}% of {fmt(g.pubs)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ borderTop: `1px solid ${H1}`, marginTop: 11, paddingTop: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ font: `500 8.5px/1 ${MONO}`, letterSpacing: ".18em", color: DIM }}>{peerTitle}</span>
          <span style={{ font: `400 8.5px/1 ${MONO}`, letterSpacing: ".06em", color: "#45413b" }}>{peerGroup.length} assets</span>
        </div>
        {peerGroup.map((p, i) => {
          const self = p.generic === rec.name;
          return (
            <div key={p.slug} onMouseEnter={() => setHov(p.generic)} onMouseLeave={() => setHov(null)} onClick={() => setSel(p.generic)} style={{ display: "grid", gridTemplateColumns: "16px minmax(0,1fr) auto", alignItems: "baseline", columnGap: 8, padding: "3px 0 4px", borderBottom: `1px solid #171614`, cursor: "pointer" }}>
              <span style={{ font: `500 8px/1.2 ${MONO}`, textAlign: "right", color: self ? GOLD : "#3a3630" }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ font: `400 12px/1.2 ${SERIF}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: self ? "#f4efe4" : "#726d65" }}>{p.generic}</span>
              <span style={{ font: `400 10px/1.2 ${MONO}`, fontVariantNumeric: "tabular-nums", color: self ? "#f4efe4" : "#726d65" }}>{fmt(p.n)}</span>
            </div>
          );
        })}
      </div>

      <div onClick={() => openRecord(rec.slug)} style={{ marginTop: 13, border: `1px solid #2b2925`, borderRadius: 2, padding: "8px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: PANEL2 }}>
        <span style={{ font: `500 9.5px/1 ${MONO}`, letterSpacing: ".14em", color: GOLD }}>OPEN ASSET RECORD</span>
        <span style={{ font: `400 9.5px/1 ${MONO}`, color: DIM }}>↵</span>
      </div>
    </div>
  );
}
