// PageHero — the canonical H1 masthead, extracted 2026-08-05 from Pulse's
// Masthead (components/Pulse/PulsePage.tsx — the visual reference; structure
// and values verbatim, inks re-based onto the consolidated register).
//
// Full variant:    mono eyebrow (10.5/.28em gold) over a hairline rule with a
//                  right meta slot · serif display title (52/38 narrow, 600,
//                  -0.01em) · serif dek (17/15) · stats cluster RIGHT of the
//                  title, bottom-aligned, hairline dividers, mono 26 values
//                  over mono 9.5/.16em captions.
// Reduced variant: same eyebrow and serif title at 28 (24 narrow), optional
//                  dek at 14, NO stats cluster — for functional views reached
//                  from a link, not destinations.
//
// Every slot except eyebrow+title is optional; a surface passes what it has
// and nothing renders for what it doesn't. Pulse itself keeps its local
// masthead (frozen reference, "0 changes" in the Two Ramps applied table).
//
// THE HERO RULE (Design, 2026-08-05 — closes the width audit):
//   1. The hairline spans the container, ALWAYS. It is structure, not text.
//   2. The dek stays at its 620px measure and is NEVER stretched to meet it.
//   3. The right field takes a structural counterweight: a date/coverage
//      stamp on the eyebrow row (meta) and a stat cluster opposite the dek.
//   4. A surface with genuinely nothing to put there leaves it empty — the
//      rule still spans. An empty right field is a content decision, not a
//      defect in this component.

import type { ReactNode } from "react";
import { FONT, GOLD, COOL, LINE } from "../lib/designTokens";

export interface HeroStat {
  value: string;
  label: string;
  // Second caption line under the label (Home's "n OF m" coverage foot).
  foot?: string;
  // Centre value + captions in the cell (ledger single-stat cluster, where a
  // short value over a longer label reads off-axis left-aligned). Default left.
  center?: boolean;
  gold?: boolean;
  // Escape hatch for semantic value colors (e.g. overdue red). Wins over gold.
  valueColor?: string;
  onClick?: () => void;
}

export default function PageHero({
  eyebrow,
  meta,
  title,
  dek,
  stats,
  reduced = false,
  narrow = false,
  maxTitleCh,
}: {
  eyebrow: string;
  meta?: string;
  title: ReactNode;
  dek?: ReactNode;
  stats?: HeroStat[];
  reduced?: boolean;
  narrow?: boolean;
  maxTitleCh?: number;
}) {
  const titleSize = reduced ? (narrow ? 24 : 28) : narrow ? 38 : 52;
  const cluster = !reduced && stats && stats.length > 0 ? stats : null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: "0.28em", color: GOLD.gold, textTransform: "uppercase" }}>
          {eyebrow}
        </div>
        <div style={{ flex: 1, height: 1, background: LINE.l1 }} />
        {meta ? (
          <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.16em", color: COOL.label, textTransform: "uppercase", textAlign: "right" }}>
            {meta}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: narrow ? "stretch" : "flex-end",
          flexDirection: narrow ? "column" : "row",
          // Wrap, never clip: title length is content-dependent (greetings,
          // headlines), so when the row is tight the cluster drops below the
          // title instead of overflowing the column edge.
          flexWrap: "wrap",
          justifyContent: "space-between",
          marginTop: reduced ? 14 : 20,
          gap: narrow ? 22 : "24px 60px",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: titleSize,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: reduced ? 1.1 : 1,
              color: COOL.ui,
              maxWidth: maxTitleCh ? `${maxTitleCh}ch` : undefined,
            }}
          >
            {title}
          </div>
          {dek ? (
            <div style={{ fontFamily: FONT.serif, fontSize: reduced ? 14 : narrow ? 15 : 17, color: COOL.prose, marginTop: 12, maxWidth: 620, lineHeight: 1.4 }}>
              {dek}
            </div>
          ) : null}
        </div>
        {cluster ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap", // 2026-08-10 mobile audit: the cluster overflowed 393px heroes
              gap: 0,
              borderLeft: narrow ? "none" : `1px solid ${LINE.l1}`,
              borderTop: narrow ? `1px solid ${LINE.l1}` : "none",
              borderBottom: narrow ? `1px solid ${LINE.l1}` : "none",
            }}
          >
            {cluster.map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                onClick={s.onClick}
                style={{
                  padding: narrow ? (i === 0 ? "12px 20px 12px 0" : "12px 20px") : i === cluster.length - 1 ? "0 0 0 26px" : "0 26px",
                  borderRight: i < cluster.length - 1 ? `1px solid ${LINE.l1}` : "none",
                  flex: narrow ? 1 : "none",
                  cursor: s.onClick ? "pointer" : undefined,
                  textAlign: s.center ? "center" : undefined,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 26,
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                    color: s.valueColor ?? (s.gold ? GOLD.gold : COOL.ui),
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: "0.16em", color: COOL.label, marginTop: 6, textTransform: "uppercase" }}>
                  {s.label}
                </div>
                {s.foot ? (
                  <div style={{ fontFamily: FONT.mono, fontSize: 8, letterSpacing: "0.12em", color: COOL.floor, marginTop: 4, textTransform: "uppercase" }}>
                    {s.foot}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
