import { useState } from "react";
import type { CSSProperties } from "react";
import {
  PULSE_COLORS,
  countProportion,
  formatInt,
  formatShare,
  formatSignedPct,
  isThemeGated,
  movementDirection,
  pctChange,
  primaryThemeTotal,
  qualitativeLabel,
  sparklineSeries,
  themesRankedByCurrent,
} from "../../lib/pulse";
import type { MovementLabel, PulseTheme } from "../../lib/pulse";
import Sparkline, { ThemeCurve } from "./Sparkline";

// Merged theme list — the single ranked view that replaces the old
// Consensus Snapshot + Themes pair (they showed the same 24 themes twice, one
// with bars, one with movement). Each row now carries name, count, share, a
// proportional bar, a movement label/percentage, and a clean-months sparkline;
// expanding a row reveals the full labelled curve, composition, and lifetime.

interface ThemeListProps {
  themes: PulseTheme[];
}

const sectionHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  marginBottom: 4,
};

// Restrained, desaturated sentiment tints — legible on the dark UI without the
// garishness of pure red/green. Direction only; the audience reads magnitude
// from the number (above the gate) or nothing (below it).
const DIR_COLOR = {
  up: "#6FA67F",
  down: "#B5836A",
  flat: PULSE_COLORS.muted,
} as const;

const DIR_GLYPH = { up: "↑", down: "↓", flat: "→" } as const;

const LABEL_COLOR: Record<MovementLabel, string> = {
  Emerging: PULSE_COLORS.amber, // the frontier signal — the one worth emphasis
  "Increasing attention": "#6FA67F",
  "Decreasing attention": "#B5836A",
  Steady: PULSE_COLORS.muted,
};

const tileStyle: CSSProperties = {
  backgroundColor: PULSE_COLORS.cardAlt,
  border: `1px solid ${PULSE_COLORS.line}`,
  borderRadius: 4,
  padding: "8px 6px",
  textAlign: "center",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 46,
};

const tileValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: PULSE_COLORS.text,
  lineHeight: 1.2,
  fontFeatureSettings: '"tnum"',
};

const tileLabelStyle: CSSProperties = {
  fontSize: 10,
  color: PULSE_COLORS.mutedDim,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  marginTop: 2,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const drillHeaderStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
  marginBottom: 7,
};

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div style={tileStyle}>
      <div style={tileValueStyle}>{formatInt(value)}</div>
      <div style={tileLabelStyle}>{label}</div>
    </div>
  );
}

function Movement({ theme }: { theme: PulseTheme }) {
  // Below the gate: qualitative label ONLY, no number, no arrow (Rule 1 & 2).
  if (isThemeGated(theme)) {
    const label = qualitativeLabel(theme);
    return (
      <span style={{ fontSize: 12, color: LABEL_COLOR[label], whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  }
  // At or above the gate: directional arrow + signed percentage change.
  const dir = movementDirection(theme.cur_pubs, theme.prior_pubs);
  const pct = pctChange(theme.cur_pubs, theme.prior_pubs);
  return (
    <span
      style={{
        fontSize: 12.5,
        color: DIR_COLOR[dir],
        fontFeatureSettings: '"tnum"',
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ marginRight: 3 }}>
        {DIR_GLYPH[dir]}
      </span>
      {pct == null ? "new" : formatSignedPct(pct)}
    </span>
  );
}

function ThemeRow({ theme, total }: { theme: PulseTheme; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const gated = isThemeGated(theme);
  const proportion = countProportion(theme, total);
  const widthPct = `${(proportion * 100).toFixed(2)}%`;

  return (
    <div style={{ borderBottom: `1px solid ${PULSE_COLORS.line}` }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "13px 0",
          display: "flex",
          flexDirection: "column",
          gap: 7,
          textAlign: "left",
        }}
      >
        {/* Line 1: chevron + name ............. count · share · movement */}
        <span
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "baseline",
            gap: 12,
            width: "100%",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span
              aria-hidden
              style={{
                color: PULSE_COLORS.mutedDim,
                fontSize: 10,
                width: 10,
                flexShrink: 0,
                transform: expanded ? "rotate(90deg)" : "none",
                transition: "transform 120ms ease",
              }}
            >
              {"▸"}
            </span>
            <span
              style={{
                fontSize: 14,
                color: PULSE_COLORS.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {theme.name}
            </span>
          </span>

          <span
            style={{
              display: "grid",
              gridTemplateColumns: "44px 56px 116px",
              alignItems: "baseline",
              gap: 10,
              justifyItems: "end",
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: PULSE_COLORS.text,
                fontWeight: 600,
                fontFeatureSettings: '"tnum"',
              }}
            >
              {formatInt(theme.cur_pubs)}
            </span>
            {/* share — em dash when gated (Rule 1) or null (Rule 4) */}
            <span
              style={{ fontSize: 12.5, color: PULSE_COLORS.muted, fontFeatureSettings: '"tnum"' }}
            >
              {gated ? "—" : formatShare(theme.cur_share)}
            </span>
            <Movement theme={theme} />
          </span>
        </span>

        {/* Line 2: proportional bar .................... sparkline.
            Bar width is COUNT-based, so it is honest even below the gate where
            the share number is withheld. A min width keeps a small-but-real
            theme visible. Indigo, not amber. */}
        <span style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", paddingLeft: 18 }}>
          <span
            style={{
              flex: 1,
              height: 6,
              backgroundColor: PULSE_COLORS.line,
              borderRadius: 3,
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            <span
              style={{
                display: "block",
                height: "100%",
                width: widthPct,
                minWidth: theme.cur_pubs > 0 ? 3 : 0,
                backgroundColor: PULSE_COLORS.indigo,
                borderRadius: 3,
              }}
            />
          </span>
          <Sparkline
            series={sparklineSeries(theme)}
            ariaLabel={`${theme.name} — 5-month trend`}
          />
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "0 0 16px 18px" }}>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: PULSE_COLORS.muted,
              margin: "0 0 14px",
              maxWidth: 640,
            }}
          >
            {theme.description}
          </p>

          {/* Full 6-month curve, June included and explicitly labelled — the
              complete record. (Inline sparklines drop the backfill month; here,
              with month ticks + values, that month is transparent, not implied.) */}
          <div style={drillHeaderStyle}>Monthly publications</div>
          <div style={{ marginBottom: 16 }}>
            <ThemeCurve series={theme.monthly} />
          </div>

          {/* Rule 5: every number traceable — window counts + lifetime. */}
          <div style={drillHeaderStyle}>Publications</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
              marginBottom: 12,
              maxWidth: 340,
            }}
          >
            <Tile value={theme.cur_pubs} label="Current" />
            <Tile value={theme.prior_pubs} label="Prior" />
            <Tile value={theme.lifetime_pubs} label="Lifetime" />
          </div>

          <div style={drillHeaderStyle}>Composition (this window)</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              maxWidth: 460,
            }}
          >
            <Tile value={theme.reviews} label="Reviews" />
            <Tile value={theme.trials} label="Trials" />
            <Tile value={theme.commentary} label="Commentary" />
            <Tile value={theme.guidance} label="Guidance" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThemeList({ themes }: ThemeListProps) {
  const ranked = themesRankedByCurrent(themes);
  const total = primaryThemeTotal(themes);

  return (
    <section
      style={{
        backgroundColor: PULSE_COLORS.card,
        borderRadius: 6,
        padding: "16px 16px 4px",
      }}
    >
      <div style={sectionHeaderStyle}>Themes</div>
      {/* Denominator stated plainly: share is of PRIMARY-THEME publications in
          the window, not all publications. */}
      <div style={{ fontSize: 11.5, color: PULSE_COLORS.mutedDim, marginBottom: 10 }}>
        Ranked by share of {formatInt(total)} primary-theme publications this window ·
        sparkline shows the 5 clean months · expand any theme for its full curve and counts
      </div>
      <div>
        {ranked.map((theme) => (
          <ThemeRow key={theme.name} theme={theme} total={total} />
        ))}
      </div>
    </section>
  );
}
