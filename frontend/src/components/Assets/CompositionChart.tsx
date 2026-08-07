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
import { COLOR, FONT, GROUND, LINE, COOL, WARM } from "../../lib/designTokens";
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
  color: COOL.label,
};
const note = {
  fontFamily: FONT.mono,
  fontSize: 10,
  lineHeight: 1.7,
  color: COOL.label,
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
    border: `1px solid ${active ? COLOR.amber : LINE.l1}`,
    color: active ? COLOR.amber : COOL.chrome,
  };
}

interface Focus {
  key: string | null;
  readout: string | null;
}

export default function CompositionChart({
  composition,
  assetName,
  full = false,
  mobile = false,
}: {
  composition: Composition;
  assetName?: string;
  full?: boolean;
  mobile?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("share");
  const [held, setHeld] = useState<string | null>(null);
  const [hover, setHover] = useState<Focus>({ key: null, readout: null });

  const focusKey = held ?? hover.key;

  if (mobile) {
    return <MobileComposition composition={composition} />;
  }
  if (composition.gated) {
    return <GatedComposition composition={composition} />;
  }

  const maxCorpus = Math.max(1, ...composition.columns.map((c) => c.corpus));
  const colHeight = full ? 360 : 190;
  const firstCol = composition.columns[0];
  const lastFull = [...composition.columns].reverse().find((c) => !c.isPartial) ?? firstCol;
  const modeNote =
    mode === "share"
      ? "Columns normalized to 100%. Reads the mix; hides how volume changed."
      : "Column height is publications that year. Reads growth; small shares get hard to see.";

  const readout =
    hover.readout ??
    (held
      ? bandReadout(composition.bands.find((b) => b.key === held))
      : "Hover a band for its year, share and count. Click to hold one theme across the whole window.");

  const toggle = (
    <div style={{ display: "flex", gap: 1 }}>
      <button type="button" style={modeBtn(mode === "share")} onClick={() => setMode("share")}>
        Share %
      </button>
      <button type="button" style={modeBtn(mode === "volume")} onClick={() => setMode("volume")}>
        Volume
      </button>
    </div>
  );

  return (
    <div>
      {full ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 40,
            paddingBottom: 22,
            marginBottom: 4,
            borderBottom: `1px solid ${LINE.l1}`,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ ...eyebrow, marginBottom: 12 }}>
              {assetName ? `${assetName} · ` : ""}theme composition
            </div>
            <h2 style={{ margin: "0 0 12px", fontFamily: FONT.sans, fontSize: 27, fontWeight: 500, letterSpacing: "-0.01em", color: WARM.prose }}>
              What this literature is about, and how that changed
            </h2>
            <div style={{ fontFamily: FONT.serif, fontSize: 16, lineHeight: 1.55, color: WARM.body, maxWidth: 700 }}>
              Each column is one publication year, divided by canonical theme. Volume moved from{" "}
              {firstCol.corpus} papers in {firstCol.year} to {lastFull.corpus} in {lastFull.year}.
              Both are observations about publishing, not statements about the therapy.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
            {toggle}
            <div style={{ ...note, textAlign: "right", maxWidth: 230 }}>{modeNote}</div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <div style={eyebrow}>
            Theme composition · {composition.window[0]} → {composition.window[composition.window.length - 1]}
          </div>
          {toggle}
        </div>
      )}

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
              borderTop: full ? `1px solid ${LINE.l1}` : "none",
            }}
          >
            {composition.columns.map((col) => (
              <div key={col.year} style={{ flex: 1, textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: full ? 13 : 11,
                    color: col.isPartial ? COOL.label : WARM.body,
                  }}
                >
                  {col.year}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 10, color: WARM.muted, marginTop: 5 }}>
                  {col.corpus}
                </div>
                {full ? (
                  <div style={{ fontFamily: FONT.mono, fontSize: 9, color: WARM.muted, marginTop: 4 }}>
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
              borderTop: full ? "none" : `1px solid ${LINE.l0}`,
              border: full ? `1px solid ${LINE.l1}` : "none",
              background: full ? GROUND.g1 : "transparent",
              fontFamily: FONT.mono,
              fontSize: full ? 13 : 11,
              lineHeight: 1.5,
              color: WARM.body,
              minHeight: 17,
            }}
          >
            {readout}
          </div>
        </div>

        {/* Theme table */}
        <div style={{ borderLeft: `1px solid ${LINE.l1}`, paddingLeft: 22, minWidth: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 44px 44px 44px",
              fontFamily: FONT.mono,
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: COOL.label,
              paddingBottom: 9,
              borderBottom: `1px solid ${LINE.l0}`,
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
                style={{ padding: "10px 0", borderBottom: `1px solid ${LINE.l0}`, cursor: "pointer", opacity: dim ? 0.42 : 1 }}
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
                      color: WARM.prose,
                    }}
                  >
                    <span style={{ width: 9, height: 9, flex: "none", background: isFocus ? HIGHLIGHT : band.color }} />
                    {band.label}
                  </span>
                  <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 11, color: WARM.muted }}>
                    {pct(band.openingShare)}
                  </span>
                  <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 11, color: WARM.prose }}>
                    {pct(band.closingShare)}
                  </span>
                  <span style={{ textAlign: "right", fontFamily: FONT.mono, fontSize: 11, color: WARM.muted }}>
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

// ── Mobile (frame 1d) ────────────────────────────────────────────────────────
// Keeps the composition but compact: share columns and the top four bands with
// their closing share and Δ. The full movement view lives on desktop. A gated
// asset shows the same pooled bar it shows on desktop.
function MobileComposition({ composition }: { composition: Composition }) {
  const bands = composition.bands;
  const topBands = bands.slice(0, 4);
  if (composition.gated) {
    return (
      <div>
        <div style={{ ...eyebrow, marginBottom: 12 }}>Theme composition</div>
        <div style={{ ...note, fontSize: 11, color: COLOR.amber, marginBottom: 10 }}>
          GATED · pooled across {composition.themedTotal} themed papers — under {THEMED_PERIOD_GATE}/year
          for a year-over-year view.
        </div>
        <div style={{ display: "flex", gap: 1, height: 30 }}>
          {bands.map((b) => (
            <div key={b.key} style={{ width: `${(b.pooledShare * 100).toFixed(2)}%`, background: b.color }} />
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          {topBands.map((b) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 0", borderBottom: `1px solid ${LINE.l0}`, minHeight: 44, boxSizing: "border-box" }}>
              <span style={{ width: 9, height: 9, flex: "none", background: b.color }} />
              <span style={{ flex: 1, fontFamily: FONT.sans, fontSize: 13, color: WARM.prose }}>{b.label}</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 12, color: WARM.prose }}>{pct(b.pooledShare)}</span>
            </div>
          ))}
        </div>
        <div style={{ ...note, marginTop: 12 }}>Top four of {bands.length} bands.</div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ ...eyebrow, marginBottom: 12 }}>Theme composition</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 112 }}>
        {composition.columns.map((col) => (
          <div key={col.year} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, height: "100%" }}>
            {col.segments.map((seg) => {
              const band = bands.find((b) => b.key === seg.key)!;
              return (
                <div key={seg.key} style={{ minHeight: 1, height: `${(seg.share * 100).toFixed(2)}%`, background: band.color }} />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
        {composition.columns.map((col) => (
          <div key={col.year} style={{ flex: 1, textAlign: "center", fontFamily: FONT.mono, fontSize: 9, color: WARM.muted }}>
            {`'${String(col.year).slice(2)}`}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        {topBands.map((b) => (
          <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 0", borderBottom: `1px solid ${LINE.l0}`, minHeight: 44, boxSizing: "border-box" }}>
            <span style={{ width: 9, height: 9, flex: "none", background: b.color }} />
            <span style={{ flex: 1, fontFamily: FONT.sans, fontSize: 13, color: WARM.prose }}>{b.label}</span>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: WARM.prose }}>{pct(b.closingShare)}</span>
            <span style={{ width: 44, textAlign: "right", fontFamily: FONT.mono, fontSize: 11, color: WARM.muted }}>
              {signedPp(b.deltaPp)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ ...note, marginTop: 12 }}>
        Top four of {bands.length} bands. Full composition view on desktop.
      </div>
    </div>
  );
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
          <div style={{ fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.55, color: WARM.prose }}>
            Year-over-year composition is not shown for this asset. The shifting mix needs at least{" "}
            {THEMED_PERIOD_GATE} themed papers per year to be read as movement rather than noise;{" "}
            {yearRange} carry {countList}.
          </div>
          <div style={{ ...note, marginTop: 9, fontSize: 11, color: WARM.muted }}>
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
                borderBottom: `1px solid ${LINE.l0}`,
              }}
            >
              <span style={{ width: 9, height: 9, flex: "none", background: band.color }} />
              <span style={{ flex: 1, fontFamily: FONT.sans, fontSize: 12, color: WARM.prose }}>{band.label}</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 11, color: WARM.prose }}>{pct(band.pooledShare)}</span>
              <span style={{ width: 34, textAlign: "right", fontFamily: FONT.mono, fontSize: 10, color: COOL.label }}>
                {band.pooledN}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
