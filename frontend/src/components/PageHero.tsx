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
// Every slot except title is optional; a surface passes what it has and
// nothing renders for what it doesn't.
//
// CONVERGENCE 2026-08-15 — eight surfaces onto one contract. Four widenings
// (above / scope / stats.variant / optional eyebrow) and a hard narrowing of
// what was drifting. What the widenings buy:
//   above   — Intelligence's permanent disclosure band, which must sit INSIDE
//             the panel and above the eyebrow. Nothing else could express it.
//   scope   — Trials' amber qualifying line under the title. One mono line, by
//             construction, so it cannot grow into a second dek.
//   table   — Drugs and Trials both carry label/value pairs a tile cannot hold:
//             a tile renders "43" over "DEPLOYMENT ASSETS", never
//             "43 deployment assets reach ......... 17,667". Both forms are
//             legitimate; the cluster is not the general case.
//   eyebrow? — added for Social, which removed its eyebrow in 2026-08-07 (it
//             took it back at the convergence). Intelligence is the consumer
//             now, from 2026-08-16. The rule still spans in both cases,
//             because the rule is structure, not text.
//
// THE TITLE RULE (2026-08-15): the title names the SURFACE, always. The TA is a
// filter state, not an identity — it changes on a tab switch and the surface
// does not — so it lives in the eyebrow. This retires three join conventions
// that had grown up independently: " / " (Institutions, Social), " · " (Drugs),
// and TA-as-title (Congresses, Pulse).
//
// EYEBROW FORMAT (2026-08-16): TA · AREA — "LUNG CANCER · ONCOLOGY". The TA
// segment is always derived through taLabelForSlug, never typed.
//
// THE SCOPE SEGMENT IS RETIRED. It was the first of three (EST · LUNG CANCER ·
// ONCOLOGY) and on seven of the eight surfaces it restated the title one size
// down — INST sitting 40px above "Institutions", CONG above "Congresses". Two
// costs, both real: the eyebrow spent its widest segment saying nothing new,
// and the abbreviations read as truncation artifacts rather than labels.
// Intelligence made it plain — it could only ever hold the scope segment, so
// with the segment gone it holds nothing and passes no eyebrow at all.
//
// THE TEST IS NOT "DROP THE FIRST SEGMENT", it is "drop what is already said".
// The two ledgers keep a cohort segment (ESTABLISHED · LUNG CANCER · ONCOLOGY,
// RISING STARS · …) because "Cohort Ledger" and "Rising Ledger" do not name
// WHICH board, and which board is the whole difference between three views of
// one surface. Spelling the cohort out put those two over the 310px narrow
// budget — 333 / 342 / 314 for EST / RS / COM against 203 for the other six.
//
// SO THE SAME TEST RUNS AGAIN ONE LEVEL DOWN, and only where a cohort segment
// is present: on narrow the ledgers drop ONCOLOGY, because the area is
// derivable from LUNG CANCER and is therefore what is already said. That is
// the lever, and it is the whole of it — nothing is truncated anywhere in this
// component. A clipped eyebrow is the failure the abbreviations were, one step
// later; dropping a segment by rule is not. The six TA-only surfaces do not
// pull it: they fit at every width, and losing ONCOLOGY would strand LUNG
// CANCER alone for no gain.
//
// NOT PARAMETERIZED, ON PURPOSE — these are the convergence, not defaults:
//   · title serif 600/-0.01em at TWO sizes: 52 index, 30 detail. Not five.
//   · eyebrow mono 10.5/.28em GOLD uppercase. Drugs' grey and Trials' muted
//     tone retire; an eyebrow is gold or it is absent.
//   · the hairline spans the container, always (Hero Rule 1, below).
//   · meta is ONE line, right of the rule. Trials' two-line stamp collapses.
//   · rhythm 28 -> eyebrow, 20 -> title, 12 -> dek.
// Pulse keeps its local masthead until its own migration (frozen reference,
// "0 changes" in the Two Ramps applied table); PageHero was extracted from it.
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

/** The right field. Two legitimate forms, one slot.
 *  cluster — tiles: a big value over a tracked caption, vertical dividers.
 *  table   — label left, value right, a rule under every row, optional foot.
 *            Drugs' reach rows and Trials' count rows are this shape; forcing
 *            them into tiles is what kept both surfaces off the component. */
export interface HeroStats {
  variant: "cluster" | "table";
  items: HeroStat[];
  /** Table only: a note under the last row (Drugs' overlap disclosure). */
  foot?: string;
}

export default function PageHero({
  above,
  eyebrow,
  meta,
  title,
  scope,
  dek,
  stats,
  reduced = false,
  narrow = false,
  maxTitleCh,
}: {
  /** Full-bleed block inside the panel, ABOVE the eyebrow, with its own bottom
   *  hairline. Intelligence's disclosure band. A surface passing this must not
   *  add horizontal padding around PageHero, or the band cannot reach the panel
   *  edge — the padding belongs on the surface's own content blocks instead. */
  above?: ReactNode;
  /** Optional: Intelligence has none, having no TA scope to name. The rule
   *  spans regardless. */
  eyebrow?: string;
  meta?: string;
  title: ReactNode;
  /** One mono line between title and dek. Trials' qualifying scope line. */
  scope?: string;
  dek?: ReactNode;
  stats?: HeroStats;
  reduced?: boolean;
  narrow?: boolean;
  maxTitleCh?: number;
}) {
  // TWO NUMBERS, ONE SCALE: 52 is the large step, 30 the small one. An index
  // page takes the large step where there is room and steps DOWN where there is
  // not; a detail page always takes the small step. There is no third value and
  // no per-surface size.
  //
  // Why 30 and not 38 (measured 2026-08-15, Newsreader 600/-0.01em at 326px —
  // a 390px phone less the shell's 16px gutters and the hero's own 16px inset):
  // at 38 three titles wrapped, at 52 four did and "Field Intelligence Forum"
  // ran to three lines. At 30 every surface name in the set fits ONE line — and
  // 30 was already the small step, so this costs no new number.
  //
  // THE CEILING THAT COMES WITH IT: "The Public Conversation" fits at 30 with
  // ZERO margin — it is the longest name that fits, not a comfortable one. Read
  // ~30 characters as the practical ceiling for a surface name. A longer name
  // does not fail loudly; it silently takes a second line on every phone.
  const titleSize = reduced || narrow ? 30 : 52;
  const field = !reduced && stats && stats.items.length > 0 ? stats : null;
  const cluster = field && field.variant === "cluster" ? field.items : null;
  const table = field && field.variant === "table" ? field : null;
  return (
    <div>
      {above ? (
        // Full-bleed: the band spans PageHero's own box and carries the rule
        // that separates it from the hero proper. The 28px below it is the
        // standard rhythm — supplied HERE only when the band exists, so the
        // surfaces that do not use `above` keep their own container padding.
        <div style={{ borderBottom: `1px solid ${LINE.l1}`, marginBottom: 28 }}>{above}</div>
      ) : null}
      {/* NARROW: the meta takes its own line (2026-08-15). Measured at 386px the
          row offers 296px for eyebrow + meta, and the two together wanted 747px
          — both compressed to three lines each. Stacking them costs one line and
          fixes seven of eight surfaces outright, without touching the eyebrow's
          tracking or its segments. The hairline still spans the eyebrow row: it
          is structure, not text (Hero Rule 1), so it renders whether or not the
          eyebrow and meta share the row. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        {eyebrow ? (
          <div style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: "0.28em", color: GOLD.gold, textTransform: "uppercase" }}>
            {eyebrow}
          </div>
        ) : null}
        <div style={{ flex: 1, height: 1, background: LINE.l1 }} />
        {meta && !narrow ? (
          <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.16em", color: COOL.label, textTransform: "uppercase", textAlign: "right" }}>
            {meta}
          </div>
        ) : null}
      </div>
      {meta && narrow ? (
        <div style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: "0.16em", color: COOL.label, textTransform: "uppercase", lineHeight: 1.6, marginTop: 8 }}>
          {meta}
        </div>
      ) : null}
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
          {/* <h1>, not <div> (2026-08-15). Every surface that adopted this hero
              lost its level-1 heading, because the component rendered a styled
              div — Drugs was the only one of the eight that had a real h1 and it
              went when the header was swapped. The tag is unconditional: a hero
              IS the page heading, so there is no variant where it should not be
              one. margin:0 kills the UA default; every other value is unchanged,
              so this is a semantic fix with no visual delta. */}
          <h1
            style={{
              margin: 0,
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
          </h1>
          {scope ? (
            <div style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: "0.16em", color: GOLD.gold, textTransform: "uppercase", marginTop: 10 }}>
              {scope}
            </div>
          ) : null}
          {dek ? (
            <div style={{ fontFamily: FONT.serif, fontSize: reduced ? 14 : narrow ? 15 : 17, color: COOL.prose, marginTop: 12, maxWidth: 620, lineHeight: 1.4 }}>
              {dek}
            </div>
          ) : null}
        </div>
        {table ? (
          // alignSelf FLEX-START: the cluster bottom-aligns with the dek because
          // tiles sit ON that baseline, but a ruled table reads from its first
          // row down — bottom-aligning it hangs the rows off the dek instead of
          // starting them level with the title. Alignment is part of what the
          // variant is, not a prop.
          <div style={{ minWidth: 250, flex: "0 1 auto", alignSelf: "flex-start", display: "flex", flexDirection: "column" }}>
            {table.items.map((s, i) => (
              <div
                key={`${s.label}-${i}`}
                onClick={s.onClick}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 20,
                  padding: "5px 0",
                  borderBottom: `1px solid ${LINE.l1}`,
                  cursor: s.onClick ? "pointer" : undefined,
                }}
              >
                <span style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: "0.16em", color: COOL.label, textTransform: "uppercase" }}>
                  {s.label}
                </span>
                <span
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 13,
                    fontWeight: 600,
                    color: s.valueColor ?? (s.gold ? GOLD.gold : COOL.ui),
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {s.value}
                </span>
              </div>
            ))}
            {table.foot ? (
              <div style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: "0.12em", color: COOL.floor, lineHeight: 1.6, marginTop: 8, maxWidth: 420 }}>
                {table.foot}
              </div>
            ) : null}
          </div>
        ) : cluster ? (
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
