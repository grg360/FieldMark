// Single asset page — Design frames 1a (established/dense) and 1b (sparse/gated).
//
// One page, honestly sized to the asset: the dense case (osimertinib) and the
// sparse case (trastuzumab deruxtecan) are the same layout, and the sparse page is
// shorter because the data is thinner, not padded to look like the dense one. The
// header is the one element that does not vary with volume. Every count names its
// denominator, and the page prints what it counted before anyone asks.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AssetNav from "./AssetNav";
import CompositionChart from "./CompositionChart";
import LandingNow from "./LandingNow";
import { AuthorsPanel, CongressPanel, ForumPanel } from "./RightRail";
import { COLOR, FONT } from "../../lib/designTokens";
import { assetBySlug, identityLine, matchTerms, type AssetConfig } from "../../lib/assetConfig";
import { NSCLC_CORPUS_TOTAL, formatIndexDate } from "../../lib/assets";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { buildComposition } from "../../lib/assetLogic";
import { loadAssetPage, type AssetPageData, type AssetOverview } from "../../lib/assetPage";

const eyebrow = {
  fontFamily: FONT.mono,
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: COLOR.ink4,
} as const;
const metaMono = { fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink4 } as const;

function shell(children: React.ReactNode) {
  return (
    <div style={{ backgroundColor: COLOR.ground, minHeight: "100vh", fontFamily: FONT.sans }}>
      <AssetNav active="assets" />
      {children}
    </div>
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
    <div style={{ padding: mobile ? "20px 16px 16px" : "26px 32px 22px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...eyebrow, marginBottom: 12 }}>Assets</div>
          <h1 style={{ margin: "0 0 10px", fontFamily: FONT.sans, fontSize: mobile ? 27 : 40, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.1, color: COLOR.ink1 }}>
            {asset.generic}
          </h1>
          <div style={{ fontFamily: FONT.mono, fontSize: mobile ? 11 : 12, lineHeight: 1.5, color: COLOR.ink3 }}>
            {identityLine(asset)}
          </div>
        </div>
        {mobile ? null : (
          <span style={{ padding: "7px 10px", border: `1px solid ${COLOR.hairStrong}`, fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink3 }}>
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
    <div style={{ padding: "18px 24px", borderRight: `1px solid ${COLOR.hairStrong}`, minWidth: 0 }}>
      <div style={{ ...eyebrow, fontSize: 9, marginBottom: 10, color: COLOR.ink4 }}>{label}</div>
      <div style={{ fontFamily: FONT.mono, fontSize: 30, fontWeight: 500, lineHeight: 1, color: amber ? COLOR.amber : COLOR.ink1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.4, color: COLOR.ink5, marginTop: 7 }}>{sub}</div>
    </div>
  );
}

function StatTiles({ o, mobile }: { o: AssetOverview; mobile: boolean }) {
  if (mobile) {
    // Two hero tiles; the remaining ratios ride a compact mono line (they also
    // appear in full in "What this page counted").
    return (
      <div style={{ borderBottom: `1px solid ${COLOR.hairStrong}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
          <div style={{ padding: "14px 16px", borderRight: `1px solid ${COLOR.hairStrong}` }}>
            <div style={{ ...eyebrow, fontSize: 9, marginBottom: 8 }}>Publications</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 26, fontWeight: 500, lineHeight: 1, color: COLOR.amber }}>
              {o.total_pubs.toLocaleString()}
            </div>
          </div>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ ...eyebrow, fontSize: 9, marginBottom: 8 }}>2026 to date</div>
            <div style={{ fontFamily: FONT.mono, fontSize: 26, fontWeight: 500, lineHeight: 1, color: COLOR.amber }}>
              {o.ytd_2026.toLocaleString()}
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 16px", fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink4 }}>
          {o.authors_resolved.toLocaleString()} authors · {pctOf(o.open_access, o.total_pubs)} open access ·{" "}
          {pctOf(o.themed, o.total_pubs)} themed
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
      <Tile label="Publications" amber value={o.total_pubs.toLocaleString()} sub={`of ${NSCLC_CORPUS_TOTAL.toLocaleString()} NSCLC corpus`} />
      <Tile label="2026 to date" amber value={o.ytd_2026.toLocaleString()} sub={`through ${formatIndexDate()} · part year`} />
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
    <div style={{ borderBottom: `1px solid ${COLOR.hairStrong}` }}>
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
          color: COLOR.ink1,
        }}
      >
        <span style={{ fontFamily: FONT.sans, fontSize: 14 }}>{label}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink4 }}>
          {count} {open ? "↑" : "→"}
        </span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
}

// ── What this page counted ───────────────────────────────────────────────────
function WhatCounted({ asset, o, themedPct, mobile }: { asset: AssetConfig; o: AssetOverview; themedPct: number; mobile: boolean }) {
  const terms = matchTerms(asset);
  return (
    <div style={{ padding: mobile ? "20px 16px 28px" : "20px 32px 24px", borderTop: `1px solid ${COLOR.hairStrong}`, background: COLOR.surfaceWell }}>
      <div style={{ ...eyebrow, marginBottom: 10, color: COLOR.ink4 }}>What this page counted</div>
      <div style={{ fontFamily: FONT.mono, fontSize: 12, lineHeight: 1.7, color: COLOR.ink3, maxWidth: 1000 }}>
        {o.total_pubs.toLocaleString()} records with{" "}
        {terms.map((t, i) => (
          <span key={t}>
            <span style={{ color: COLOR.ink1 }}>{t}</span>
            {i < terms.length - 1 ? (i === terms.length - 2 ? " or " : ", ") : ""}
          </span>
        ))}{" "}
        in title or abstract · FieldMark NSCLC corpus, {NSCLC_CORPUS_TOTAL.toLocaleString()} records,
        indexed {formatIndexDate()}. Composition on the {o.themed.toLocaleString()} records carrying a
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
            <span style={{ color: COLOR.amber }}>{asset.match_note}</span>
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
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "60px 24px", fontFamily: FONT.mono, fontSize: 13, color: COLOR.ink3 }}>
        No asset matches “{slug}”. <Link to="/assets" style={{ color: COLOR.indigoLink }}>Back to the asset index →</Link>
      </div>,
    );
  }

  const o = data?.overview;
  const composition = data ? buildComposition(data.composition) : null;
  const themedPct = o && o.total_pubs > 0 ? o.themed / o.total_pubs : 0;

  return shell(
    <div style={{ maxWidth: 1440, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <Header asset={asset} mobile={isMobile} />

      {loading || !data || !o || !composition ? (
        <div style={{ padding: isMobile ? "32px 16px" : "40px 32px", ...metaMono }}>
          {loading ? "Loading…" : "This asset page could not be loaded."}
        </div>
      ) : isMobile ? (
        <>
          <StatTiles o={o} mobile />
          <div style={{ padding: "20px 16px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
            <CompositionChart composition={composition} mobile />
          </div>
          <div style={{ padding: "20px 16px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
            <LandingNow landing={data.landing} mobile />
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
          <WhatCounted asset={asset} o={o} themedPct={themedPct} mobile />
        </>
      ) : (
        <>
          <StatTiles o={o} mobile={false} />

          <div style={{ padding: "28px 32px 30px", borderBottom: `1px solid ${COLOR.hairStrong}` }}>
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
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  color: COLOR.indigoLink,
                }}
              >
                {fullComposition ? "Collapse composition ↑" : "See the full composition view →"}
              </button>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px" }}>
            <div style={{ padding: "26px 32px 30px", borderRight: `1px solid ${COLOR.hairStrong}`, minWidth: 0 }}>
              <LandingNow landing={data.landing} />
            </div>
            <div style={{ minWidth: 0 }}>
              <AuthorsPanel authors={data.authors} />
              <CongressPanel presenters={data.congress} />
              <ForumPanel threads={data.forum} />
            </div>
          </div>

          <WhatCounted asset={asset} o={o} themedPct={themedPct} mobile={false} />
        </>
      )}
    </div>,
  );
}
