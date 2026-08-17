// Single asset page — Design frames 1a (established/dense) and 1b (sparse/gated).
//
// One page, honestly sized to the asset: the dense case (osimertinib) and the
// sparse case (trastuzumab deruxtecan) are the same layout, and the sparse page is
// shorter because the data is thinner, not padded to look like the dense one. The
// header is the one element that does not vary with volume. Every count names its
// denominator, and the page prints what it counted before anyone asks.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "../AppLayout";
import CompositionChart from "./CompositionChart";
import LandingNow from "./LandingNow";
import { AuthorsPanel, CongressPanel, ForumPanel } from "./RightRail";
import { CONTENT_WIDTH } from "../../lib/designTokens";
import { CANON, FACE } from "../../lib/canonicalTokens";
import { assetBySlug, identityLine, matchTerms, type AssetConfig } from "../../lib/assetConfig";
import { ASSETS_TA_SLUG } from "../../lib/assetConfig";
import { taLabelForSlug } from "../../lib/taLabels";
// NSCLC_CORPUS_TOTAL is deliberately NOT imported here any more. It is the
// documented FALLBACK for when asset_index_meta() is unavailable, and this
// page was printing it as fact — quoting 85,302 while the Drugs Index, on the
// same data, showed the live 85,944. The fallback now lives in one place
// (loadAssetPage), where the index keeps it too.
import { formatIndexDate } from "../../lib/assets";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { buildComposition, themeColorMap } from "../../lib/assetLogic";
import { loadAssetPage, type AssetPageData, type AssetOverview, type AssetIndexMeta } from "../../lib/assetPage";

const eyebrow = {
  fontFamily: FACE.data,
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: CANON.INK.MUTE,
} as const;
const metaMono = { fontFamily: FACE.data, fontSize: 11, color: CANON.INK.MUTE } as const;

// NavBar is mounted INSIDE each content column (below), not here, so the bar aligns
// to the column width on this surface like every other.
// NavBar mounts here, above the callers' width wrappers — it is self-centering
// (2026-07-31) and must not sit inside a narrower content container.
function shell(children: React.ReactNode) {
  return (
    <AppLayout width="wide">
      <div style={{ fontFamily: FACE.ui }}>{children}</div>
    </AppLayout>
  );
}

function pctOf(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

// ── Header ───────────────────────────────────────────────────────────────────
// The one element that does not vary with volume — same on the dense, sparse and
// mobile pages, only resized.
function Header({ asset, mobile }: { asset: AssetConfig; mobile: boolean }) {
  return (
    <div style={{ padding: mobile ? "20px 16px 16px" : "26px 32px 22px", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...eyebrow, marginBottom: 12 }}>Drugs</div>
          <h1 style={{ margin: "0 0 10px", fontFamily: FACE.value, fontSize: mobile ? 27 : 40, fontWeight: 300, letterSpacing: "-0.012em", lineHeight: 1.1, color: CANON.INK.BODY }}>
            {asset.generic}
          </h1>
          <div style={{ fontFamily: FACE.data, fontSize: mobile ? 11 : 12, lineHeight: 1.5, color: CANON.INK.LABEL }}>
            {identityLine(asset)}
          </div>
        </div>
        {mobile ? null : (
          <span style={{ padding: "7px 10px", border: `1px solid ${CANON.LINE.HAIR}`, fontFamily: FACE.data, fontSize: 11, color: CANON.INK.LABEL }}>
            {asset.is_backbone ? "Backbone agent" : "Deployment asset"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Stat tiles ───────────────────────────────────────────────────────────────
function Tile({ label, value, sub, amber }: { label: string; value: string; sub: string; amber?: boolean }) {
  return (
    <div style={{ padding: "18px 24px", borderRight: `1px solid ${CANON.LINE.HAIR}`, minWidth: 0 }}>
      <div style={{ ...eyebrow, fontSize: 9, marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: FACE.data, fontSize: 30, fontWeight: 500, lineHeight: 1, color: amber ? CANON.GOLD.PRIME : CANON.INK.BODY, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontFamily: FACE.data, fontSize: 11, lineHeight: 1.4, color: CANON.INK.MUTE, marginTop: 7 }}>{sub}</div>
    </div>
  );
}

function StatTiles({ o, meta, mobile }: { o: AssetOverview; meta: AssetIndexMeta; mobile: boolean }) {
  if (mobile) {
    // Two hero tiles; the remaining ratios ride a compact mono line (they also
    // appear in full in "What this page counted").
    return (
      <div style={{ borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
          <div style={{ padding: "14px 16px", borderRight: `1px solid ${CANON.LINE.HAIR}` }}>
            <div style={{ ...eyebrow, fontSize: 9, marginBottom: 8 }}>Publications</div>
            <div style={{ fontFamily: FACE.data, fontSize: 25, fontWeight: 500, lineHeight: 1, color: CANON.GOLD.PRIME }}>
              {o.total_pubs.toLocaleString()}
            </div>
          </div>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ ...eyebrow, fontSize: 9, marginBottom: 8 }}>2026 to date</div>
            <div style={{ fontFamily: FACE.data, fontSize: 25, fontWeight: 500, lineHeight: 1, color: CANON.GOLD.PRIME }}>
              {o.ytd_2026.toLocaleString()}
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 16px", fontFamily: FACE.data, fontSize: 11, color: CANON.INK.MUTE }}>
          {o.authors_resolved.toLocaleString()} authors · {pctOf(o.open_access, o.total_pubs)} open access ·{" "}
          {pctOf(o.themed, o.total_pubs)} themed
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
      <Tile label="Publications" amber value={o.total_pubs.toLocaleString()} sub={`of ${meta.corpus.toLocaleString()} ${taLabelForSlug(ASSETS_TA_SLUG).toLowerCase()} corpus`} />
      <Tile label="2026 to date" amber value={o.ytd_2026.toLocaleString()} sub={`through ${formatIndexDate(meta.indexDate)} · part year`} />
      <Tile label="Authors resolved" value={o.authors_resolved.toLocaleString()} sub={`of ${o.author_strings.toLocaleString()} author strings`} />
      <Tile label="Open access" value={pctOf(o.open_access, o.total_pubs)} sub={`${o.open_access.toLocaleString()} full texts linked`} />
      <Tile label="Themed" value={pctOf(o.themed, o.total_pubs)} sub={`${o.themed.toLocaleString()} with canonical theme`} />
    </div>
  );
}

// A collapsible section for the mobile right rail — a row with its count that
// expands to the full panel (frame 1d collapses authorship/congress/forum to
// rows; the count is the answer most of the time, provenance stays reachable).
function MobileSection({ label, count, children }: { label: string; count: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          minHeight: 52,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: CANON.INK.BODY,
        }}
      >
        <span style={{ fontFamily: FACE.ui, fontSize: 15 }}>{label}</span>
        <span style={{ fontFamily: FACE.data, fontSize: 11, color: CANON.INK.MUTE }}>
          {count} {open ? "↑" : "→"}
        </span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
}

// ── What this page counted ───────────────────────────────────────────────────
function WhatCounted({ asset, o, meta, themedPct, mobile }: { asset: AssetConfig; o: AssetOverview; meta: AssetIndexMeta; themedPct: number; mobile: boolean }) {
  const terms = matchTerms(asset);
  return (
    <div style={{ padding: mobile ? "20px 16px 28px" : "20px 32px 24px", borderTop: `1px solid ${CANON.LINE.HAIR}`, background: CANON.GROUND.RAISE }}>
      <div style={{ ...eyebrow, marginBottom: 10 }}>What this page counted</div>
      <div style={{ fontFamily: FACE.data, fontSize: 13, lineHeight: 1.7, color: CANON.INK.LABEL, maxWidth: 1000 }}>
        {o.total_pubs.toLocaleString()} records with{" "}
        {terms.map((t, i) => (
          <span key={t}>
            <span style={{ color: CANON.INK.PRIME }}>{t}</span>
            {i < terms.length - 1 ? (i === terms.length - 2 ? " or " : ", ") : ""}
          </span>
        ))}{" "}
        in title or abstract · FieldMark {taLabelForSlug(ASSETS_TA_SLUG).toLowerCase()} corpus, {meta.corpus.toLocaleString()} records,
        indexed {formatIndexDate(meta.indexDate)}. Composition on the {o.themed.toLocaleString()} records carrying a
        canonical theme ({Math.round(themedPct * 100)}%). Trajectory on{" "}
        {o.trajectory_resolved.toLocaleString()} records with year-resolved citations (
        {pctOf(o.trajectory_resolved, o.total_pubs)}). Authorship resolved to the HCP graph for{" "}
        {o.authors_resolved.toLocaleString()} of {o.author_strings.toLocaleString()} author strings;
        unresolved authors are excluded from the ranking, not redistributed. This page describes
        published literature for one asset. It computes no comparison to other assets and no composite
        score.
        {asset.match_note ? (
          <>
            {" "}
            <span style={{ color: CANON.GOLD.PRIME }}>{asset.match_note}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AssetPage() {
  const { slug } = useParams<{ slug: string }>();
  const asset = slug ? assetBySlug(slug) : undefined;
  const [data, setData] = useState<AssetPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullComposition, setFullComposition] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    if (!asset) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    loadAssetPage(asset.generic)
      .then((d) => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [asset]);

  if (!asset) {
    return shell(
      <div style={{ maxWidth: CONTENT_WIDTH.standard, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ padding: "60px 24px", fontFamily: FACE.data, fontSize: 13, color: CANON.INK.LABEL }}>
          No drug matches “{slug}”. <Link to="/assets" style={{ color: CANON.ACTION.LINK }}>Back to the drug index →</Link>
        </div>
      </div>,
    );
  }

  const o = data?.overview;
  const composition = data ? buildComposition(data.composition) : null;
  // Theme chips on the landing rows take their band's VIZ slot (rule 2) — built
  // from the composition that is already on screen, so the two cannot diverge.
  const themeColors = composition ? themeColorMap(composition) : undefined;
  const themedPct = o && o.total_pubs > 0 ? o.themed / o.total_pubs : 0;

  return shell(
    <div style={{ maxWidth: CONTENT_WIDTH.wide, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <Header asset={asset} mobile={isMobile} />

      {loading || !data || !o || !composition ? (
        <div style={{ padding: isMobile ? "32px 16px" : "40px 32px", ...metaMono }}>
          {loading ? "Loading…" : "This asset page could not be loaded."}
        </div>
      ) : isMobile ? (
        <>
          <StatTiles o={o} meta={data.meta} mobile />
          <div style={{ padding: "20px 16px", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
            <CompositionChart composition={composition} mobile />
          </div>
          <div style={{ padding: "20px 16px", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
            <LandingNow landing={data.landing} themeColors={themeColors} mobile />
          </div>
          <MobileSection label="Who publishes" count={data.authors.resolved.toLocaleString()}>
            <AuthorsPanel authors={data.authors} />
          </MobileSection>
          <MobileSection label="Congress presence" count={`${data.congress.length} confirmed`}>
            <CongressPanel presenters={data.congress} />
          </MobileSection>
          <MobileSection label="Forum threads" count={String(data.forum.length)}>
            <ForumPanel threads={data.forum} />
          </MobileSection>
          <WhatCounted asset={asset} o={o} meta={data.meta} themedPct={themedPct} mobile />
        </>
      ) : (
        <>
          <StatTiles o={o} meta={data.meta} mobile={false} />

          <div style={{ padding: "28px 32px 30px", borderBottom: `1px solid ${CANON.LINE.HAIR}` }}>
            <CompositionChart composition={composition} assetName={asset.generic} full={fullComposition} />
            {!composition.gated ? (
              <button
                type="button"
                onClick={() => setFullComposition((v) => !v)}
                style={{
                  marginTop: 18,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: FACE.data,
                  fontSize: 11,
                  color: CANON.ACTION.LINK,
                }}
              >
                {fullComposition ? "Collapse composition ↑" : "See the full composition view →"}
              </button>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px" }}>
            <div style={{ padding: "26px 32px 30px", borderRight: `1px solid ${CANON.LINE.HAIR}`, minWidth: 0 }}>
              <LandingNow landing={data.landing} themeColors={themeColors} />
            </div>
            <div style={{ minWidth: 0 }}>
              <AuthorsPanel authors={data.authors} />
              <CongressPanel presenters={data.congress} />
              <ForumPanel threads={data.forum} />
            </div>
          </div>

          <WhatCounted asset={asset} o={o} meta={data.meta} themedPct={themedPct} mobile={false} />
        </>
      )}
    </div>,
  );
}
