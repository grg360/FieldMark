import { Fragment, useState } from "react";
import type { CSSProperties } from "react";
import {
  PULSE_COLORS,
  countProportion,
  formatInt,
  formatShare,
  formatSignedPoints,
  isMovementGated,
  isThemeGated,
  movementCurrentTotal,
  movementDirection,
  movementPriorTotal,
  movementShareDelta,
  movementWindowLabels,
  qualitativeLabel,
  sparklineSeries,
  themesRankedByCurrent,
} from "../../lib/pulse";
import type { MovementLabel, PulseTheme } from "../../lib/pulse";
import { useMediaQuery } from "../../lib/useMediaQuery";
import Sparkline, { ThemeCurve } from "./Sparkline";

// Merged theme list, two-tier to cut vertical scroll:
//   TIER 1 — top 12 by cur_pubs, a two-column grid of cells that each keep the
//     full treatment (name, count, share, bar, movement, sparkline). Clicking a
//     cell opens a full-width drawer spanning BOTH columns beneath that grid row.
//   TIER 2 — the remaining 13 (mostly below the 20-count gate, so no honest
//     movement), as light single-line rows: name, count, share only. Expand in
//     place, already full width.

const TIER_1_COUNT = 12;

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

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: PULSE_COLORS.mutedDim,
};

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div style={tileStyle}>
      <div style={tileValueStyle}>{formatInt(value)}</div>
      <div style={tileLabelStyle}>{label}</div>
    </div>
  );
}

function Chevron({
  open,
  size = 10,
  color = PULSE_COLORS.mutedDim,
}: {
  open: boolean;
  size?: number;
  color?: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        color,
        fontSize: size,
        width: size,
        flexShrink: 0,
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 120ms ease",
      }}
    >
      {"▸"}
    </span>
  );
}

function Movement({
  theme,
  currentTotal,
  priorTotal,
}: {
  theme: PulseTheme;
  currentTotal: number;
  priorTotal: number;
}) {
  // Below the movement gate: qualitative label ONLY, no number, no arrow. Gated
  // on the two-month movement window, so more themes fall here than under the
  // headline gate — correct at this volume (Rule 1 & 2).
  if (isMovementGated(theme)) {
    const label = qualitativeLabel(theme, currentTotal, priorTotal);
    return (
      <span style={{ fontSize: 12, color: LABEL_COLOR[label], whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  }
  // At or above the gate: directional arrow + signed change in SHARE (pp),
  // computed on the clean movement windows (Apr–May vs Feb–Mar).
  const delta = movementShareDelta(theme, currentTotal, priorTotal);
  const dir = movementDirection(delta ?? 0);
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
      {delta == null ? "—" : formatSignedPoints(delta)}
    </span>
  );
}

// Shared drill-down body — identical for tier 1 (spanning both grid columns)
// and tier 2 (full-width in place). Full labelled 6-month curve + counts.
function DrillDown({ theme }: { theme: PulseTheme }) {
  return (
    <div style={{ padding: "2px 0 16px 18px" }}>
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

      {/* Five clean months (Jan–May). June is the backfill-recovery month —
          every theme spikes in it — so it is dropped from BOTH the inline
          sparkline and this curve. Counts/share/movement below stay on the
          full 3-vs-3 windows (June included); this is the chart series only. */}
      <div style={drillHeaderStyle}>Monthly publication volume</div>
      <div style={{ marginBottom: 16 }}>
        <ThemeCurve series={sparklineSeries(theme)} />
      </div>

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
  );
}

// TIER 1 grid cell — the full treatment in a compact card.
function Tier1Cell({
  theme,
  barMax,
  currentTotal,
  priorTotal,
  open,
  onToggle,
}: {
  theme: PulseTheme;
  barMax: number;
  currentTotal: number;
  priorTotal: number;
  open: boolean;
  onToggle: () => void;
}) {
  const gated = isThemeGated(theme);
  // Bar is scaled to the TOP theme's count, not the corpus total: with 25 themes
  // splitting the window no theme can exceed ~18% of the total, so a total-scaled
  // bar reads as nearly empty. Scaled to the leader, the top theme fills the
  // track and the rest are proportional to it — a comparison, which is what a
  // ranked list wants. The absolute share % is still the number beside the bar.
  const widthPct = `${(countProportion(theme, barMax) * 100).toFixed(2)}%`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 9,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        backgroundColor: PULSE_COLORS.cardAlt,
        border: `1px solid ${open ? PULSE_COLORS.indigo : PULSE_COLORS.line}`,
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      {/* Line 1: name (clamped to two lines so half-width cells don't over-truncate).
          No chevron — the whole card is the toggle, and the open state shows as an
          indigo border. */}
      <span
        style={{
          fontSize: 14,
          color: PULSE_COLORS.text,
          lineHeight: 1.3,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {theme.name}
      </span>

      {/* Line 2: count + share ............ movement */}
      <span style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%" }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: PULSE_COLORS.text,
            fontFeatureSettings: '"tnum"',
          }}
        >
          {formatInt(theme.cur_pubs)}
        </span>
        <span style={{ fontSize: 12.5, color: PULSE_COLORS.muted, fontFeatureSettings: '"tnum"' }}>
          {gated ? "—" : formatShare(theme.cur_share)}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <Movement theme={theme} currentTotal={currentTotal} priorTotal={priorTotal} />
        </span>
      </span>

      {/* Line 3: proportional bar ........ sparkline. Bar width is COUNT-based
          (honest below the gate) and scaled to the top theme. Indigo, not amber. */}
      <span style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
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
        <Sparkline series={sparklineSeries(theme)} ariaLabel={`${theme.name} — 5-month trend`} />
      </span>
    </button>
  );
}

// TIER 2 row — light single line: name, count, share. No bar/sparkline/movement.
function Tier2Row({
  theme,
  currentTotal,
  priorTotal,
}: {
  theme: PulseTheme;
  currentTotal: number;
  priorTotal: number;
}) {
  const [open, setOpen] = useState(false);
  const gated = isThemeGated(theme);

  return (
    <div style={{ borderBottom: `1px solid ${PULSE_COLORS.line}` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "9px 0",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "baseline",
          gap: 12,
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Chevron open={open} size={9} color={PULSE_COLORS.indigo} />
          <span
            style={{
              fontSize: 13,
              color: PULSE_COLORS.muted,
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
            gridTemplateColumns: "40px 52px 84px",
            gap: 10,
            justifyItems: "end",
            alignItems: "baseline",
          }}
        >
          <span style={{ fontSize: 13, color: PULSE_COLORS.text, fontFeatureSettings: '"tnum"' }}>
            {formatInt(theme.cur_pubs)}
          </span>
          <span style={{ fontSize: 12, color: PULSE_COLORS.mutedDim, fontFeatureSettings: '"tnum"' }}>
            {gated ? "—" : formatShare(theme.cur_share)}
          </span>
          {/* Movement renders for any theme above the HEADLINE gate regardless of
              tier: these are here only because they fell outside the top 12 by
              rank, not for want of data. Movement itself still applies the (finer)
              two-month movement gate, so a thin clean window shows a qualitative
              label. Headline-gated rows leave it blank (share carries the em dash). */}
          <span>
            {gated ? null : (
              <Movement theme={theme} currentTotal={currentTotal} priorTotal={priorTotal} />
            )}
          </span>
        </span>
      </button>
      {open && <DrillDown theme={theme} />}
    </div>
  );
}

export default function ThemeList({ themes }: ThemeListProps) {
  const [openTier1, setOpenTier1] = useState<Set<string>>(new Set());
  const isNarrow = useMediaQuery("(max-width: 600px)");

  const ranked = themesRankedByCurrent(themes);
  // Bars are scaled to the leading theme's count so the top bar fills the track.
  const barMax = Math.max(1, ...ranked.map((t) => t.cur_pubs));
  const tier1 = ranked.slice(0, TIER_1_COUNT);
  const tier2 = ranked.slice(TIER_1_COUNT);

  // Movement denominators — the clean-window totals every theme's share delta is
  // measured against (computed once, not per row).
  const movementCurrentDenominator = movementCurrentTotal(themes);
  const movementPriorDenominator = movementPriorTotal(themes);
  // Month labels for the caption, derived from the series (never hard-coded).
  const windows = themes.length > 0 ? movementWindowLabels(themes[0].monthly) : null;

  const toggleTier1 = (name: string) =>
    setOpenTier1((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Chunk tier 1 into grid rows so an expanded cell's drawer can be inserted
  // AFTER the pair it belongs to, spanning both columns (grid auto-flow forces
  // a full-width `1 / -1` item onto its own row). In single-column mode the pair
  // stacks and the drawer still lands directly beneath it.
  const pairs: PulseTheme[][] = [];
  for (let i = 0; i < tier1.length; i += 2) pairs.push(tier1.slice(i, i + 2));

  return (
    <section
      style={{
        backgroundColor: PULSE_COLORS.card,
        borderRadius: 6,
        padding: "16px 16px 8px",
      }}
    >
      <div style={sectionHeaderStyle}>Themes</div>
      {/* Counts and shares are the full current window; movement is measured
          separately, on the clean months only. Name both windows and say why the
          two months are excluded — this must match what actually renders. */}
      <div style={{ fontSize: 11.5, color: PULSE_COLORS.mutedDim, marginBottom: 14, lineHeight: 1.5 }}>
        Research themes ranked by share of the current window&rsquo;s publication activity; the
        counts and shares shown use that window. Movement is measured separately — the change in
        each theme&rsquo;s share of attention, in percentage points,{" "}
        {windows ? (
          <>
            comparing {windows.current} against {windows.prior}. {windows.excludedTail} (a
            backfill-recovery spike, and not theme-neutral) and {windows.excludedHead} (the
            deflated tail of an ingest gap) are excluded from the movement math.
          </>
        ) : (
          <>comparing the two most recent clean months against the prior two.</>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
          gap: 10,
        }}
      >
        {pairs.map((pair, i) => (
          <Fragment key={i}>
            {pair.map((theme) => (
              <Tier1Cell
                key={theme.name}
                theme={theme}
                barMax={barMax}
                currentTotal={movementCurrentDenominator}
                priorTotal={movementPriorDenominator}
                open={openTier1.has(theme.name)}
                onToggle={() => toggleTier1(theme.name)}
              />
            ))}
            {pair
              .filter((theme) => openTier1.has(theme.name))
              .map((theme) => (
                <div key={`${theme.name}-drawer`} style={{ gridColumn: "1 / -1" }}>
                  <DrillDown theme={theme} />
                </div>
              ))}
          </Fragment>
        ))}
      </div>

      {tier2.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ ...eyebrowStyle, marginBottom: 8 }}>
            Lower volume{" "}
            <span style={{ letterSpacing: "normal", textTransform: "none", color: PULSE_COLORS.mutedDim }}>
              (below the top {TIER_1_COUNT})
            </span>
          </div>
          <div>
            {tier2.map((theme) => (
              <Tier2Row
                key={theme.name}
                theme={theme}
                currentTotal={movementCurrentDenominator}
                priorTotal={movementPriorDenominator}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
