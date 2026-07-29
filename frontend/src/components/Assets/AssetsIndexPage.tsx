// Assets index — Design frame 1e.
//
// Leads with the 43 deployment assets ordered by publication volume; the 8
// platinum-doublet backbone agents sit in a clearly separated section below
// (their differentiated presentation is still with Design — kept simple here).
// Bars are volume ONLY. The index computes no cross-asset ranking beyond volume
// and no composite score — the one rule that cuts across the whole surface.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AssetNav from "./AssetNav";
import { COLOR, FONT } from "../../lib/designTokens";
import {
  getAssetIndex,
  formatIndexDate,
  NSCLC_CORPUS_TOTAL,
  type AssetIndex,
  type AssetIndexRow,
} from "../../lib/assets";

const eyebrow = {
  fontFamily: FONT.mono,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: COLOR.ink3,
};

const metaMono = {
  fontFamily: FONT.mono,
  fontSize: 10,
  color: COLOR.ink4,
  letterSpacing: "0.04em",
};

function AssetRow({ row, max, lead }: { row: AssetIndexRow; max: number; lead: boolean }) {
  const [hover, setHover] = useState(false);
  const width = max > 0 ? `${((row.publicationCount / max) * 100).toFixed(1)}%` : "0%";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 120px 62px",
        alignItems: "center",
        gap: 16,
        padding: "11px 0",
        borderBottom: `1px solid ${COLOR.hair}`,
      }}
    >
      <Link
        to={`/assets/${row.slug}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          fontFamily: FONT.sans,
          fontSize: 13,
          color: hover ? COLOR.amber : COLOR.ink1,
          textDecoration: "none",
          transition: "color 0.15s ease",
        }}
      >
        {row.generic}
      </Link>
      <div style={{ height: 4, background: COLOR.hairStrong, borderRadius: 2 }}>
        <div
          style={{
            height: 4,
            width,
            borderRadius: 2,
            background: lead ? COLOR.amber : COLOR.indigo,
          }}
        />
      </div>
      <span
        style={{
          textAlign: "right",
          fontFamily: FONT.mono,
          fontSize: 12,
          color: COLOR.ink2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {row.publicationCount.toLocaleString()}
      </span>
    </div>
  );
}

export default function AssetsIndexPage() {
  const [index, setIndex] = useState<AssetIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getAssetIndex()
      .then((idx) => {
        if (!alive) return;
        setIndex(idx);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const deployMax = index ? Math.max(1, ...index.deployment.map((r) => r.publicationCount)) : 1;
  const backboneMax = index ? Math.max(1, ...index.backbone.map((r) => r.publicationCount)) : 1;

  return (
    <div style={{ backgroundColor: COLOR.ground, minHeight: "100vh", fontFamily: FONT.sans }}>
      <AssetNav active="assets" />
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "36px 24px 96px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {loading ? (
          <div style={{ ...metaMono, padding: "40px 0" }}>Loading assets…</div>
        ) : failed || !index ? (
          <div style={{ ...metaMono, padding: "40px 0", color: COLOR.ink3 }}>
            The asset index could not be loaded.
          </div>
        ) : (
          <>
            {/* Deployment assets */}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 14,
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <span style={eyebrow}>Assets index — NSCLC corpus</span>
              <span style={metaMono}>
                {index.deployment.length} DEPLOYMENT ASSETS ·{" "}
                {index.totalRecords.toLocaleString()} OF{" "}
                {NSCLC_CORPUS_TOTAL.toLocaleString()} RECORDS
              </span>
            </div>

            <div>
              {index.deployment.map((row, i) => (
                <AssetRow key={row.slug} row={row} max={deployMax} lead={i === 0} />
              ))}
            </div>
            <p
              style={{
                marginTop: 12,
                fontFamily: FONT.mono,
                fontSize: 10,
                lineHeight: 1.7,
                color: COLOR.ink4,
                maxWidth: 640,
              }}
            >
              Ordered by publication count. Bars are volume only — the index does not rank assets
              against one another on anything else, and offers no composite.
            </p>

            {/* Backbone — separated, deliberately simple (presentation pending Design) */}
            <div style={{ marginTop: 48 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 14,
                  gap: 16,
                  flexWrap: "wrap",
                  paddingTop: 24,
                  borderTop: `1px solid ${COLOR.hairStrong}`,
                }}
              >
                <span style={eyebrow}>Backbone · platinum-doublet agents</span>
                <span style={metaMono}>{index.backbone.length} AGENTS</span>
              </div>
              <p
                style={{
                  marginTop: -4,
                  marginBottom: 12,
                  fontFamily: FONT.serif,
                  fontSize: 13,
                  fontStyle: "italic",
                  lineHeight: 1.5,
                  color: COLOR.ink3,
                  maxWidth: 640,
                }}
              >
                Chemotherapy backbone shared across regimens. Counted separately because their
                literature is not a single asset's story.
              </p>
              <div>
                {index.backbone.map((row) => (
                  <AssetRow key={row.slug} row={row} max={backboneMax} lead={false} />
                ))}
              </div>
            </div>

            <p style={{ ...metaMono, marginTop: 40, color: COLOR.ink5 }}>
              FieldMark NSCLC corpus, {NSCLC_CORPUS_TOTAL.toLocaleString()} records, indexed{" "}
              {formatIndexDate()}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
