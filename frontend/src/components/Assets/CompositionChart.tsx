// Theme composition — Design frames 1a (embedded) and 1c (full).
//
// One column per publication year, banded by canonical theme, ordered by opening
// share. Two modes on one axis: normalised share (reads the mix) or true volume
// (column height carries n, reads growth). Hover or click promotes one band to
// amber across every column; the ramp itself never uses amber. The denominator is
// stated under the chart, always the themed subset. Below the 40-per-year gate the
// movement view is withheld and the pooled view shown in its place, printing the
// failing counts — never "insufficient data" alone.

import { useState } from "react";
import { COLOR, FONT } from "../../lib/designTokens";
import {
  HIGHLIGHT,
  THEMED_PERIOD_GATE,
  type Composition,
  type ThemeBand,
} from "../../lib/assetLogic";

type Mode = "share" | "volume";

const eyebrow = {
  fontFamily: FONT.mono,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: COLOR.ink3,
};
const note = {
  fontFamily: FONT.mono,
  fontSize: 10,
  lineHeight: 1.7,
  color: COLOR.ink4,
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function signedPp(pp: number): string {
  const r = Math.round(pp);
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return "0";
}

function modeBtn(active: boolean): React.CSSProperties {
  return {
    fontFamily: FONT.mono,
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "8px 12px",
    cursor: "pointer",
    background: active ? COLOR.amberSoft : "transparent",
    border: `1px solid ${active ? COLOR.amber : COLOR.hairStrong}`,
    color: active ? COLOR.amber : COLOR.ink3,
  };
}

interface Focus {
  key: string | null;
  readout: string | null;
}

export default function CompositionChart({
  composition,
  full = false,
}: {
  composition: Composition;
  full?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("share");
  const [held, setHeld] = useState<string | null>(null);
  const [hover, setHover] = useState<Focus>({ key: null, readout: null });

  const focusKey = held ?? hover.key;

  if (composition.gated) {
    return <GatedComposition composition={composition} />;
  }

  const maxCorpus = Math.max(1, ...composition.columns.map((c) => c.corpus));
  const colHeight = full ? 360 : 190;

  const readout =
    hover.readout ??
    (held
      ? bandReadout(composition.bands.find((b) => b.key === held))
      : "Hover a band for its year, share and count. Click to hold one theme across the whole window.");

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          marginBottom: full ? 20 : 6,
          flexWrap: "wrap",
        }}
      >
        <div style={eyebrow}>
          Theme composition · {composition.window[0]} → {composition.window[composition.window.length - 1]}
        </div>
        <div style={{ display: "flex", gap: 1 }}>
          <button type="button" style={modeBtn(mode === "share")} onClick={() => setMode("share")}>
            Share %
          </button>
          <button type="button" style={modeBtn(mode === "volume")} onClick={() => setMode("volume")}>
            Volume
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: full ? "minmax(0,1fr) 380px" : "minmax(0,1fr) 320px",
          gap: full ? 40 : 32,
          marginTop: 16,
        }}
      >
        {/* Columns */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: full ? 16 : 12, height: colHeight }}>
            {composition.columns.map((col) => {
              const h = mode === "volume" ? `${((col.corpus / maxCorpus) * 100).toFixed(1)}%` : "100%";
              return (
                <div
                  key={col.year}
                  style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: full ? 2 : 1, height: h }}>
                    {col.segments.map((seg) => {
                      const band = composition.bands.find((b) => b.key === seg.key)!;
                      const isFocus = focusKey === seg.key;
                      const dim = focusKey != null && !isFocus;
                      return (
                        <div
                          key={seg.key}
                          onMouseEnter={() =>
                            setHover({
                              key: seg.key,
                              readout: `${band.label} · ${col.year} · ${pct(seg.share)} of themed papers (${seg.n} of ${col.themed})`,
                            })
                          }
                          onMouseLeave={() => setHover({ key: null, readout: null })}
                          onClick={() => setHeld((k) => (k === seg.key ? null : seg.key))}
                          style={{
                            minHeight: 1,
                            height: `${(seg.share * 100).toFixed(2)}%`,
                            background: isFocus ? HIGHLIGHT : band.color,
                            opacity: dim ? 0.2 : 1,
                            cursor: "pointer",
                            transition: "opacity 0.12s ease",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Year axis */}
          <div
            style={{
              display: "flex",
              gap: full ? 16 : 12,
              marginTop: 10,
              paddingTop: full ? 11 : 0,
              borderTop: full ? `1px solid ${COLOR.hairStrong}` : "none",
            }}
          >
            {composition.columns.map((col) => (
              <div key={col.year} style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: full ? 13 : 11,
                    color: col.isPartial ? COLOR.ink4 : COLOR.ink2,
                  }}
                >
                  {col.year}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 10, color: COLOR.ink5, marginTop: 5 }}>
                  {col.corpus}
                </div>
                {full ? (
                  <div style={{ fontFamily: FONT.mono, fontSize: 9, color: COLOR.ink5, marginTop: 4 }}>
                    {col.themed} themed
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Readout */}
          <div
            style={{
              marginTop: 16,
              padding: full ? "14px 16px" : "12px 0 0",
              borderTop: full ? "none" : `1px solid ${COLOR.hair}`,
              border: full ? `1px solid ${COLOR.hairStrong}` : "none",
              background: full ? COLOR.surfaceWell : "transparent",
              fontFamily: FONT.mono,
              fontSize: full ? 13 : 11,
              lineHeight: 1.5,
              color: COLOR.ink2,
              minHeight: 17,
            }}
          >
            {readout}
          </div>
        </div>

        {/* Theme table */}
        <div style={{ borderLeft: `1px solid ${COLOR.hairStrong}`, paddingLeft: 22, minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 44px 44px 44px",
              fontFamily: FONT.mono,
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: COLOR.ink4,
              paddingBottom: 9,
              borderBottom: `1px solid ${COLOR.hair}`,
            }}
          >
            <span>Theme</span>
            <span style={{ textAlign: "right" }}>{composition.window[0]}</span>
            <span style={{ textAlign: "right" }}>{composition.window[composition.window.length - 1]}</span>
            <span style={{ textAlign: "right" }}>Δ pp</span>
          </div>
          {composition.bands.map((band) => {
            const isFocus = focusKey === band.key;
            const dim = focusKey != null && !isFocus;
            return (
              <div
                key={band.key}
                onMouseEnter={() => setHover({ key: band.key, readout: bandReadout(band) })}
                onMouseLeave={() => setHover({ key: null, readout: null })}
                onClick={() => setHeld((k) => (k === band.key ? null : band.key))}
                style={{ padding: "10px 0", borderBottom: `1px solid ${COLOR.hair}`, cursor: "pointer", opacity: dim ? 0.42 : 1 }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 44px 44px", alignItems: "center" }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      fontFamily: FONT.sans,
                      fontSize: 12,
                      lineHeight: 1.3,
                      color: COLOR.ink1,
                    }}
                  >
                    <span style={{ width: 9, height: 9, flex: "none", background: isFocus ? HIGHLIGHT : band.color }} />
                    {band.label}
                  </span>
                  <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink3 }}>
                    {pct(band.openingShare)}
                  </span>
                  <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink1 }}>
                    {pct(band.closingShare)}
                  </span>
                  <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink3 }}>
                    {signedPp(band.deltaPp)}
                  </span>
                </div>
                {full ? (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 16, marginTop: 10, marginLeft: 20 }}>
                    {band.spark.map((s, i) => {
                      const maxSpark = Math.max(0.0001, ...composition.bands.flatMap((b) => b.spark));
                      return (
                        <div
                          key={i}
                          style={{
                            width: 9,
                            minHeight: 1,
                            height: `${((s / maxSpark) * 100).toFixed(1)}%`,
                            background: isFocus ? HIGHLIGHT : "oklch(0.40 0.05 285)",
                          }}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div style={{ ...note, marginTop: 12 }}>
            Shares computed on themed papers only ({pct(composition.themedPct)}).{" "}
            {composition.window.includes(2026)
              ? "2026 is a part year and is shown as such — not annualised."
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function bandReadout(band: ThemeBand | undefined): string | null {
  if (!band) return null;
  return `${band.label} · ${pct(band.closingShare)} of themed papers in ${band.pooledN ? "the closing year" : "the window"} · ${band.pooledN} papers across the window`;
}

// ── Gated / pooled view (frame 1b) ───────────────────────────────────────────
function GatedComposition({ composition }: { composition: Composition }) {
  const g = composition.gateYears;
  const counts = g.map((y) => y.themed);
  const years = g.map((y) => y.year);
  const yearRange = years.length ? `${years[0]}–${years[years.length - 1]}` : "recent years";
  const countList =
    counts.length >= 2
      ? `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}`
      : counts.join(", ");

  return (
    <div>
      <div style={{ ...eyebrow, marginBottom: 14 }}>Theme composition</div>

      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          padding: "16px 18px",
          border: `1px solid ${COLOR.amber}`,
          background: COLOR.amberSoft,
          maxWidth: 900,
        }}
      >
        <span style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.5, color: COLOR.amber, flex: "none" }}>
          GATED
        </span>
        <div>
          <div style={{ fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.55, color: COLOR.ink1 }}>
            Year-over-year composition is not shown for this asset. The shifting mix needs at least{" "}
            {THEMED_PERIOD_GATE} themed papers per year to be read as movement rather than noise;{" "}
            {yearRange} carry {countList}.
          </div>
          <div style={{ ...note, marginTop: 9, fontSize: 11, color: COLOR.ink3 }}>
            Pooled mix across all {composition.themedTotal} themed papers is shown instead. It answers
            what this literature is about — not how it is moving.
          </div>
        </div>
      </div>

      {/* Pooled single bar */}
      <div style={{ marginTop: 24, maxWidth: 900 }}>
        <div style={{ display: "flex", gap: 1, height: 34 }}>
          {composition.bands.map((band) => (
            <div key={band.key} style={{ width: `${(band.pooledShare * 100).toFixed(2)}%`, background: band.color }} />
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "10px 26px",
            marginTop: 16,
          }}
        >
          {composition.bands.map((band) => (
            <div
              key={band.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                paddingBottom: 8,
                borderBottom: `1px solid ${COLOR.hair}`,
              }}
            >
              <span style={{ width: 9, height: 9, flex: "none", background: band.color }} />
              <span style={{ flex: 1, fontFamily: FONT.sans, fontSize: 12, color: COLOR.ink1 }}>{band.label}</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, color: COLOR.ink1 }}>{pct(band.pooledShare)}</span>
              <span style={{ width: 34, textAlign: "right", fontFamily: FONT.mono, fontSize: 10, color: COLOR.ink4 }}>
                {band.pooledN}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
