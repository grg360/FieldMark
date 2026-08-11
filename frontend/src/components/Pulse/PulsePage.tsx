import type { CSSProperties, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { PULSE_BY_TA, PULSE_SYNTHESIS_BY_TA } from "../../lib/pulseFixture";
import { PUBLICATION_GATE, formatWindowDate } from "../../lib/pulse";
import { buildPulseLedger } from "../../lib/pulseLedger";
import type { LedgerRow, PulseLedger } from "../../lib/pulseLedger";
import type { PulsePayload } from "../../lib/pulse";
import { FONT, GROUND, LINE, GOLD, COOL, TRACK } from "../../lib/designTokens";
import { useMediaQuery } from "../../lib/useMediaQuery";
import AppLayout from "../AppLayout";

// Scientific Pulse — the redesign, built from docs/design/Scientific Pulse.dc.html
// (layout authority). Every figure is COMPUTED from the payload via
// buildPulseLedger; the frame's illustrative numbers never render. Desktop is a
// dense terminal ledger; below MOBILE_BP it stacks into the phone layout. Global
// chrome (NavBar, footer) comes from AppLayout — the frame's own nav/footer are
// not duplicated.

// ── Frame palette — Pulse is the FROZEN VISUAL REFERENCE (Two Ramps applied
// table: "0 changes"), so this map re-points only the entries whose values
// survived the 2026-08-05 ramp consolidation byte-identical. Entries whose
// token retired (warm INK trio, gold states, four of the six greys) revert to
// surface-local literals rather than moving to a nearest-token value — the
// reference keeps its exact pixels until Design re-judges it against the
// consolidated set. The chart-plumbing literals were never tokens.
const C = {
  panel: GROUND.g2,
  panelDark: GROUND.g1,
  border: LINE.l1,
  borderSoft: LINE.l0,
  borderMed: LINE.l2,
  bracket: "#3d444d", // chart bracket — surface-local
  gold: GOLD.gold,
  goldDim: "#6b542f", // was GOLD.goldDeep — token retired, value frozen
  goldRank: "#7a6136", // was GOLD.goldMuted — token retired, value frozen
  goldCaveat: "#c9a55f", // was GOLD.goldSoft — token retired, value frozen
  // Cool ramp (2026-08-06): Pulse is a scanning feed — figures, deltas, movement —
  // so it is one cool temperature at the block level, like the rising profile's
  // remap. These three frozen warm-neutral inks were the last straggler in the
  // ink census; swapped to luminance-matched cool steps so serif and mono no
  // longer render one warm ink beside cool chrome.
  ink: COOL.ui, // was warm #e9e6df
  ink2: COOL.muted, // was warm #a9a396
  proseInk: COOL.prose, // was warm #c5bfb2
  head: COOL.chromeStrong,
  head2: "#8d939c", // was GREY.grey2 — no surviving step (COOL.chrome is interp #878e96), frozen
  muted: "#6d747d", // was GREY.grey4 — retired between label/faint, frozen
  muted2: "#5f6670", // was GREY.grey5 — retired (below text floor), frozen
  muted3: "#7b8189", // was GREY.grey3 — near COOL.label but not equal, frozen
  faint: COOL.floor,
  faint2: "#4a4436", // warm-tinted faint — not a scale member
  seriesFill: "#5f6670", // chart fill — same frozen value as muted2
  seriesEdge: "#383d44", // chart plumbing, surface-local from here down
  shareTrack: "#181c21",
  shareFill: "#6e6552",
  shareFillGated: "#4e4839",
  movementFill: "#b9b1a1",
  rankGated: "#544a35",
} as const;

const MONO = FONT.mono;
const SERIF = FONT.serif;
const MOBILE_BP = "(max-width: 900px)"; // platform norm is 767 — separate decision

const mono = (size: number, color: string, spacing: number | string = TRACK.t14): CSSProperties => ({
  fontFamily: MONO,
  fontSize: size,
  letterSpacing: typeof spacing === "number" ? `${spacing}em` : spacing,
  color,
});

// ── Small shared pieces ─────────────────────────────────────────────────────
function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panelDark, ...style }}>{children}</div>
  );
}

function PanelHeader({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 20px",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ width: 2, height: 11, background: C.gold }} />
      <div style={mono(10, C.head, 0.22)}>{label}</div>
      {right != null && (
        <>
          <div style={{ flex: 1 }} />
          <div style={mono(9.5, C.muted2, 0.13)}>{right}</div>
        </>
      )}
    </div>
  );
}

function SeriesBars({ row, height = 24 }: { row: LedgerRow; height?: number }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height }}>
      {row.series.map((b, i) => (
        <div
          key={i}
          title={`${b.pubs}`}
          style={{
            width: 9,
            height: b.heightPx,
            background: b.excluded ? "transparent" : C.seriesFill,
            border: b.excluded ? `1px solid ${C.seriesEdge}` : "0",
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

// Centred-zero movement bar. Left of centre for a share loss, right for a gain.
function MovementBar({ row }: { row: LedgerRow }) {
  return (
    <div style={{ position: "relative", width: "100%", height: 24 }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.faint2 }} />
      <div
        style={{
          position: "absolute",
          top: 8,
          height: 8,
          background: C.movementFill,
          left: `${row.barLeftPct}%`,
          width: `${row.barWidthPct}%`,
        }}
      />
    </div>
  );
}

// ── Masthead ────────────────────────────────────────────────────────────────
function Stat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div>
      <div style={{ ...mono(26, gold ? C.gold : C.ink, -0.01), lineHeight: 1 }}>{value}</div>
      <div style={{ ...mono(9.5, C.muted2, 0.16), marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Masthead({
  payload,
  ledger,
  narrow,
}: {
  payload: PulsePayload;
  ledger: PulseLedger;
  narrow: boolean;
}) {
  const updated = formatWindowDate(payload.window.current_end).toUpperCase();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <div style={mono(10.5, C.gold, 0.28)}>SCIENTIFIC PULSE</div>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <div style={mono(10, C.muted2, 0.16)}>UPDATED THROUGH {updated}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: narrow ? "stretch" : "flex-end",
          flexDirection: narrow ? "column" : "row",
          justifyContent: "space-between",
          marginTop: 20,
          gap: narrow ? 22 : 60,
        }}
      >
        <div>
          <div style={{ fontFamily: SERIF, fontSize: narrow ? 38 : 52, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1, color: C.ink }}>
            {payload.therapeutic_area}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: narrow ? 15 : 17, color: C.ink2, marginTop: 12, maxWidth: 620, lineHeight: 1.4 }}>
            Where scientific attention is moving in this therapeutic area, measured across published literature.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 0,
            borderLeft: narrow ? "none" : `1px solid ${C.border}`,
            borderTop: narrow ? `1px solid ${C.border}` : "none",
            borderBottom: narrow ? `1px solid ${C.border}` : "none",
          }}
        >
          <div style={{ padding: narrow ? "12px 20px 12px 0" : "0 26px", borderRight: `1px solid ${C.border}`, flex: narrow ? 1 : "none" }}>
            <Stat value={ledger.totals.publications.toLocaleString()} label="PUBLICATIONS" />
          </div>
          <div style={{ padding: "0 26px", borderRight: `1px solid ${C.border}`, flex: narrow ? 1 : "none" }}>
            <Stat value={String(ledger.totals.themes)} label="THEMES" />
          </div>
          <div style={{ padding: "0 26px", borderRight: narrow ? "none" : `1px solid ${C.border}`, flex: narrow ? 1 : "none" }}>
            <Stat value={String(ledger.measuredCount)} label={narrow ? "MEASURED" : "MOVEMENT MEASURED"} />
          </div>
          {!narrow && (
            <div style={{ padding: "0 0 0 26px" }}>
              <Stat value="1" label="SOURCE · PUBMED" gold />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Two windows: the real monthly series as a bar strip ─────────────────────
function TwoWindows({ ledger, narrow }: { ledger: PulseLedger; narrow: boolean }) {
  const stateLabel = (state: string) =>
    state === "excluded-head"
      ? { text: ["EXCLUDED", "INGEST-HOLE TAIL"], color: C.goldDim, opacity: 0.55 }
      : state === "headline-tail"
        ? { text: ["IN HEADLINE ONLY", "BACKFILL RECOVERY"], color: C.goldDim, opacity: 1 }
        : { text: ["CLEAN", " "], color: C.faint, opacity: 1 };

  // Narrow: Design's 1A "Months stack, windows become rails" (Pulse Mobile
  // Forms, 2026-08-10). Time runs DOWN; PRIOR/RECENT/HEADLINE become vertical
  // rails in the gutter spanning the months they cover, so every month stays
  // on screen and the window relationships survive — the fix for the reverted
  // horizontal-scroll attempt, where brackets pointed at months scrolled
  // off-screen. Rail rows mirror the same fixed window indices as windowSums
  // (PRIOR Feb–Mar, RECENT Apr–May, HEADLINE Apr–Jun).
  if (narrow) {
    const monthTone = (i: number) =>
      i === 0
        ? { label: C.muted, count: C.head2, fill: C.seriesEdge, opacity: 0.7 }
        : i < 3
          ? { label: C.head2, count: C.ink2, fill: C.seriesFill, opacity: 1 }
          : { label: C.proseInk, count: C.ink, fill: C.movementFill, opacity: 1 };
    const rail = (label: string, border: string, color: string, column: number, row: string) => (
      <div style={{ gridColumn: column, gridRow: row, writingMode: "vertical-rl" as const, ...mono(8, color, 0.14), borderLeft: `2px solid ${border}`, paddingLeft: 3, display: "flex", alignItems: "center" }}>
        {label}
      </div>
    );
    return (
      <Panel style={{ marginTop: 40 }}>
        <PanelHeader label="THE TWO WINDOWS ON THIS PAGE" right="MONTHLY PUBLICATION TOTALS · PUBMED INGEST" />
        <div style={{ padding: "20px 18px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "16px 16px 1fr", columnGap: 8, rowGap: 12, alignItems: "stretch" }}>
            {rail("PRIOR", C.bracket, C.head2, 1, "2 / span 2")}
            {rail("RECENT", C.movementFill, C.ink2, 1, "4 / span 2")}
            {rail("HEADLINE", C.goldDim, C.gold, 2, "4 / span 3")}
            {ledger.corpusMonthly.map((m, i) => {
              const tone = monthTone(i);
              return (
                <div key={m.label} style={{ gridColumn: 3, gridRow: i + 1, display: "flex", alignItems: "center", gap: 10, opacity: tone.opacity }}>
                  <div style={{ ...mono(10, tone.label, 0.12), width: 30 }}>{m.label}</div>
                  <div style={{ fontFamily: SERIF, fontSize: 19, color: tone.count, width: 52, textAlign: "right" }}>{m.pubs.toLocaleString()}</div>
                  <div style={{ flex: 1, height: 7, background: C.shareTrack }}>
                    <div style={{ width: `${Math.max(2, m.heightPct)}%`, height: "100%", background: tone.fill }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ height: 1, background: C.border, margin: "22px 0 16px" }} />

          <div style={{ ...mono(9.5, C.gold, 0.16), marginBottom: 12 }}>MOVEMENT WINDOW · CHANGE IN SHARE, PERCENTAGE POINTS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, borderLeft: `2px solid ${C.bracket}`, paddingLeft: 9 }}>
              <div style={mono(9, C.muted, 0.14)}>PRIOR · FEB–MAR</div>
              <div style={{ fontFamily: SERIF, fontSize: 26, color: C.head2, lineHeight: 1 }}>{ledger.windowSums.prior.toLocaleString()}</div>
              <div style={mono(9, C.muted2, 0.1)}>PUB</div>
            </div>
            <div style={{ fontSize: 13, color: C.gold, textAlign: "center" }}>→</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, borderLeft: `2px solid ${C.movementFill}`, paddingLeft: 9 }}>
              <div style={mono(9, C.ink2, 0.14)}>RECENT · APR–MAY</div>
              <div style={{ fontFamily: SERIF, fontSize: 26, color: C.ink, lineHeight: 1 }}>{ledger.windowSums.recent.toLocaleString()}</div>
              <div style={mono(9, C.muted2, 0.1)}>PUB</div>
            </div>
          </div>
          <div style={{ marginTop: 14, ...mono(10, C.muted, 0.03), lineHeight: 1.7, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
            Theme +/− below are this window pair: each theme's share of RECENT minus its share of PRIOR, in percentage points. Headline counts and shares are APR–JUN 2026 · {ledger.windowSums.headline.toLocaleString()} pub.
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel style={{ marginTop: 40 }}>
      <PanelHeader label="THE TWO WINDOWS ON THIS PAGE" right="MONTHLY PUBLICATION TOTALS · PUBMED INGEST" />
      <div style={{ padding: "22px 20px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 2 }}>
          {ledger.corpusMonthly.map((m) => {
            const s = stateLabel(m.state);
            const excluded = m.state !== "clean";
            return (
              <div
                key={m.label}
                style={{
                  border: `1px solid ${excluded ? "#1a1e24" : C.borderMed}`,
                  background: excluded ? C.panel : "#101317",
                  padding: "12px 14px 11px",
                  opacity: m.state === "excluded-head" ? 0.6 : 1,
                }}
              >
                <div style={mono(narrow ? 8 : 10, C.head2, 0.2)}>{m.label}</div>
                <div style={{ ...mono(narrow ? 15 : 22, C.ink, 0), marginTop: 8 }}>{m.pubs.toLocaleString()}</div>
                {/* Real series as a bar, scaled to the peak month so June spikes. */}
                <div style={{ height: 34, display: "flex", alignItems: "flex-end", marginTop: 9 }}>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(3, m.heightPct)}%`,
                      background: m.state === "clean" ? C.seriesFill : C.goldDim,
                      opacity: m.state === "excluded-head" ? 0.6 : 1,
                    }}
                  />
                </div>
                {!narrow && (
                  <div style={{ ...mono(8.5, s.color, 0.11), marginTop: 8, lineHeight: 1.5 }}>
                    {s.text[0]}
                    <br />
                    {s.text[1]}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Headline bracket (Apr–Jun) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 2, marginTop: 14 }}>
          <div style={{ gridColumn: "4 / 7" }}>
            <div style={{ height: 8, borderTop: `1px solid ${C.goldDim}`, borderLeft: `1px solid ${C.goldDim}`, borderRight: `1px solid ${C.goldDim}` }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <div style={mono(10, C.gold, 0.18)}>HEADLINE WINDOW</div>
              <div style={mono(9.5, C.muted, 0.1)}>
                APR–JUN 2026 · {ledger.windowSums.headline.toLocaleString()} PUB · COUNTS AND SHARES
              </div>
            </div>
          </div>
        </div>

        {/* Movement brackets: prior (Feb–Mar) and recent (Apr–May) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 2, marginTop: 16, alignItems: "start" }}>
          <div style={{ gridColumn: "2 / 4" }}>
            <div style={{ height: 8, borderTop: `1px solid ${C.bracket}`, borderLeft: `1px solid ${C.bracket}`, borderRight: `1px solid ${C.bracket}` }} />
            <div style={{ ...mono(9.5, C.head2, 0.14), marginTop: 8 }}>
              PRIOR · FEB–MAR · {ledger.windowSums.prior.toLocaleString()} PUB
            </div>
          </div>
          <div style={{ gridColumn: "4 / 6" }}>
            <div style={{ height: 8, borderTop: `1px solid ${C.bracket}`, borderLeft: `1px solid ${C.bracket}`, borderRight: `1px solid ${C.bracket}` }} />
            <div style={{ ...mono(9.5, C.head2, 0.14), marginTop: 8 }}>
              RECENT · APR–MAY · {ledger.windowSums.recent.toLocaleString()} PUB
            </div>
          </div>
          <div style={{ gridColumn: "6 / 7", paddingTop: 14 }}>
            <div style={mono(10, C.head, 0.18)}>MOVEMENT WINDOW</div>
            <div style={{ ...mono(9, C.muted, 0.1), marginTop: 5, lineHeight: 1.6 }}>
              CHANGE IN SHARE
              <br />
              PERCENTAGE POINTS
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── Synthesis (editorial — provenance relabelled, correction 4) ─────────────
function Synthesis({ payload }: { payload: PulsePayload }) {
  const slug = payload.therapeutic_area.toLowerCase();
  const frozen = PULSE_SYNTHESIS_BY_TA[slug];
  const body =
    frozen &&
    frozen.window_start === payload.window.current_start &&
    frozen.window_end === payload.window.current_end
      ? frozen.body
      : null;
  if (!body) return null;

  return (
    <Panel style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <div style={{ width: 2, height: 11, background: C.gold }} />
        <div style={mono(10, C.head, 0.22)}>SYNTHESIS</div>
        {/* Not model-generated in this build — the Edge Function could not be run,
            so the label states what the text actually is (correction 4). */}
        <div style={mono(9.5, C.muted, 0.13)}>EDITORIAL SUMMARY · CURRENT WINDOW ONLY</div>
        <div style={{ flex: 1 }} />
        <div style={mono(9.5, C.muted2, 0.13)}>APR–JUN 2026</div>
      </div>
      <div style={{ padding: "26px 20px 0" }}>
        <div style={{ fontFamily: SERIF, fontSize: 17.5, lineHeight: 1.72, color: C.proseInk, maxWidth: 1080 }}>{body}</div>
      </div>
      <div style={{ margin: "26px 20px 0", borderTop: `1px solid ${C.borderSoft}`, padding: "12px 0 14px", ...mono(9.5, C.muted2, 0.12), lineHeight: 1.7 }}>
        EDITORIAL SUMMARY OF THE HEADLINE WINDOW · NOT MODEL-GENERATED · MAKES NO CLAIM ABOUT MOVEMENT OR TREND · REVIEW BEFORE USE · NO CLINICAL CLAIM
      </div>
    </Panel>
  );
}

// ── Themes ledger — desktop grid ────────────────────────────────────────────
const GRID = "54px minmax(300px,1fr) 96px 132px 96px 236px 100px";

function LedgerColumnsHeader({ ledger }: { ledger: PulseLedger }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: GRID, borderTop: `1px solid ${C.borderMed}`, borderBottom: `1px solid ${C.border}`, background: C.panelDark }}>
        <div style={{ gridColumn: "1 / 3", padding: "10px 0 9px", ...mono(9.5, C.muted2, 0.18) }}>THEME</div>
        <div style={{ gridColumn: "3 / 5", padding: "10px 14px 9px", borderLeft: `1px solid ${C.border}` }}>
          <div style={mono(9.5, C.gold, 0.18)}>HEADLINE · APR–JUN 2026</div>
          <div style={{ ...mono(9, C.muted2, 0.1), marginTop: 5 }}>3 COMPLETE MONTHS</div>
        </div>
        <div style={{ gridColumn: "5 / 7", padding: "10px 14px 9px", borderLeft: `1px solid ${C.border}` }}>
          <div style={mono(9.5, C.head, 0.18)}>MOVEMENT · APR–MAY 2026 vs FEB–MAR 2026</div>
          <div style={{ ...mono(9, C.muted2, 0.1), marginTop: 5 }}>CHANGE IN SHARE, PERCENTAGE POINTS · JUN AND JAN EXCLUDED</div>
          <div style={{ marginLeft: 82, width: 222, marginTop: 9 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", ...mono(8.5, C.muted2, 0.08) }}>
              <div style={{ textAlign: "left" }}>{ledger.axisNegText}</div>
              <div style={{ textAlign: "center" }}>0</div>
              <div style={{ textAlign: "right" }}>{ledger.axisPosText} pp</div>
            </div>
          </div>
        </div>
        <div style={{ gridColumn: "7 / 8", padding: "10px 0 9px 14px", borderLeft: `1px solid ${C.border}` }}>
          <div style={mono(9.5, C.muted2, 0.16)}>SERIES</div>
          <div style={{ ...mono(9, C.faint, 0.1), marginTop: 5 }}>JAN–JUN</div>
        </div>
      </div>
      {/* Movement caveat under the column head (KEEP EXACTLY) */}
      <div style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: `1px solid ${C.border}`, background: C.panelDark }}>
        <div style={{ gridColumn: "5 / 7", padding: "9px 14px 10px", borderLeft: `1px solid ${C.border}`, display: "flex", gap: 9, alignItems: "flex-start" }}>
          <div style={{ width: 2, alignSelf: "stretch", background: C.gold, flex: "none" }} />
          <div style={{ ...mono(9.5, C.goldCaveat, 0.1), lineHeight: 1.65 }}>
            NOT LOAD-BEARING. MOVEMENT FIGURES REMAIN UNRELIABLE UNTIL THREE CLEAN INGEST CYCLES HAVE RUN — THAT CONDITION IS NOT YET MET. DO NOT CARRY A FIGURE IN THIS COLUMN INTO A CONVERSATION AS AN ESTABLISHED TREND.
          </div>
        </div>
        <div style={{ gridColumn: "7 / 8", padding: "9px 0 10px 14px", borderLeft: `1px solid ${C.border}`, ...mono(8.5, C.faint, 0.08), lineHeight: 1.6 }}>
          HOLLOW =<br />EXCLUDED FROM<br />MOVEMENT
        </div>
      </div>
    </>
  );
}

function SectionBand({ left, right }: { left: string; right: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, borderTop: `1px solid ${C.borderMed}`, borderBottom: `1px solid ${C.border}`, background: C.panelDark }}>
      <div style={{ gridColumn: "1 / 5", padding: "9px 0", ...mono(9.5, C.head2, 0.2) }}>{left}</div>
      <div style={{ gridColumn: "5 / 8", padding: "9px 0", textAlign: "right", ...mono(9, C.muted2, 0.1) }}>{right}</div>
    </div>
  );
}

function MeasuredRow({ row }: { row: LedgerRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: `1px solid ${C.borderSoft}`, alignItems: "center", minHeight: 58 }}>
      <div style={{ fontFamily: SERIF, fontSize: 21, color: C.goldRank, paddingRight: 14 }}>{row.rank}</div>
      <div style={{ paddingRight: 26 }}>
        <div style={{ fontFamily: SERIF, fontSize: 16.5, color: C.ink, lineHeight: 1.3 }}>{row.name}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 6, ...mono(9, C.muted2, 0.11) }}>
          <div>{row.facets}</div>
          {row.guideline && <div style={{ color: C.gold }}>1 GUIDELINE</div>}
        </div>
      </div>
      <div style={{ borderLeft: `1px solid ${C.border}`, padding: "0 14px", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={mono(15, C.ink, 0)}>{row.nText}</div>
      </div>
      <div style={{ paddingRight: 14 }}>
        <div style={{ textAlign: "right", ...mono(13, C.ink2, 0) }}>{row.shareText}</div>
        <div style={{ height: 2, background: C.shareTrack, marginTop: 7, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: C.shareFill, width: `${row.shareBarPct}%` }} />
        </div>
      </div>
      <div style={{ borderLeft: `1px solid ${C.border}`, padding: "0 14px", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={mono(15, row.deltaIsZero ? C.head2 : C.ink, 0)}>{row.deltaText}</div>
      </div>
      <div style={{ padding: "0 14px 0 0", alignSelf: "stretch", display: "flex", alignItems: "center" }}>
        <MovementBar row={row} />
      </div>
      <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 14, alignSelf: "stretch", display: "flex", alignItems: "center" }}>
        <SeriesBars row={row} />
      </div>
    </div>
  );
}

function GatedRow({ row }: { row: LedgerRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: `1px solid ${C.borderSoft}`, alignItems: "center", minHeight: 52 }}>
      <div style={{ fontFamily: SERIF, fontSize: 19, color: C.rankGated, paddingRight: 14 }}>{row.rank}</div>
      <div style={{ paddingRight: 26 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15.5, color: row.zero ? C.muted3 : "#d6d1c6", lineHeight: 1.3 }}>{row.name}</div>
        <div style={{ marginTop: 5, ...mono(9, C.faint, 0.11) }}>{row.facets}</div>
      </div>
      <div style={{ borderLeft: `1px solid ${C.border}`, padding: "0 14px", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={mono(14, row.zero ? C.muted2 : C.ink, 0)}>{row.nText}</div>
      </div>
      <div style={{ paddingRight: 14 }}>
        <div style={{ textAlign: "right", ...mono(12.5, C.muted3, 0) }}>{row.shareText}</div>
        <div style={{ height: 2, background: C.shareTrack, marginTop: 7, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, background: C.shareFillGated, width: `${row.shareBarPct}%` }} />
        </div>
      </div>
      <div style={{ gridColumn: "5 / 7", borderLeft: `1px solid ${C.border}`, padding: "0 14px", alignSelf: "stretch", display: "flex", alignItems: "center" }}>
        <div style={{ position: "relative", width: "100%", height: 24, display: "flex", alignItems: "center" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#2c2f34" }} />
          <div style={{ position: "relative", ...mono(9.5, C.muted3, 0.11), background: C.panel, padding: "2px 8px 2px 0" }}>
            TOO FEW PUBLICATIONS TO MEASURE MOVEMENT<span style={{ color: C.muted2 }}> · {row.gateNote}</span>
          </div>
        </div>
      </div>
      <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 14, alignSelf: "stretch", display: "flex", alignItems: "center" }}>
        <SeriesBars row={row} />
      </div>
    </div>
  );
}

function DesktopLedger({ ledger }: { ledger: PulseLedger }) {
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingBottom: 14 }}>
        <div style={mono(11, C.ink, 0.26)}>THEMES</div>
        <div style={mono(10, C.muted, 0.12)}>25 CANONICAL THEMES · RANKED BY SHARE OF THE HEADLINE WINDOW · MOVEMENT COMPARES TWO-MONTH WINDOWS</div>
      </div>
      <LedgerColumnsHeader ledger={ledger} />
      <SectionBand
        left={`MEASURED · ${ledger.measuredRangeText}`}
        right={`RECENT TWO-MONTH WINDOW (APR–MAY) AT OR ABOVE THE GATE OF ${PUBLICATION_GATE} PUBLICATIONS · AXIS ±${ledger.axis}pp`}
      />
      {ledger.measured.map((r) => (
        <MeasuredRow key={r.rank} row={r} />
      ))}
      <SectionBand
        left={`BELOW THE GATE · ${ledger.gatedRangeText}`}
        right={`FEWER THAN ${PUBLICATION_GATE} PUBLICATIONS IN THE RECENT TWO-MONTH WINDOW (APR–MAY) · HEADLINE FIGURES STILL HOLD`}
      />
      {ledger.gated.map((r) => (
        <GatedRow key={r.rank} row={r} />
      ))}
    </div>
  );
}

// ── Themes ledger — mobile (stacked) ────────────────────────────────────────
// Design's 1D "Where it was, where it is" (Pulse Mobile Forms, 2026-08-10).
// The bar is the theme's share of the RECENT movement window; the tick marks
// its share of the PRIOR window; the gap between tick and bar-end IS the pp
// change — movement shown, not asserted. Shares are the true window shares
// (nRecent/recentTotal, nPrior/priorTotal), so the stated pair always
// reconciles with the pp figure. axisMax is the shared scale ceiling computed
// once across the measured set.
function MobileMeasuredRow({ row, now, prior, axisMax }: { row: LedgerRow; now: number; prior: number; axisMax: number }) {
  const d = row.delta ?? 0;
  const strongGain = d >= 1;
  const ppColor = row.deltaIsZero ? C.head2 : d > 0 ? (strongGain ? C.gold : C.goldRank) : C.head2;
  const tickColor = strongGain ? C.gold : C.goldDim;
  return (
    <div style={{ padding: "15px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, color: C.goldRank, width: 20, flex: "none" }}>{row.rank}</div>
        <div style={{ flex: 1, fontFamily: SERIF, fontSize: 15, color: C.ink, lineHeight: 1.3 }}>{row.name}</div>
      </div>
      <div style={{ position: "relative", height: 16, margin: "11px 0 7px 32px", background: C.shareTrack }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, (now / axisMax) * 100)}%`, background: C.movementFill }} />
        <div style={{ position: "absolute", left: `${Math.min(100, (prior / axisMax) * 100)}%`, top: -4, bottom: -4, width: 2, background: tickColor }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: 32, ...mono(10, C.muted, 0.08) }}>
        <div>
          {prior.toFixed(1)}% <span style={{ color: C.muted2 }}>→</span> <span style={{ color: C.proseInk }}>{now.toFixed(1)}%</span> SHARE
        </div>
        <div style={{ color: ppColor, fontWeight: 500 }}>{row.deltaText} pp</div>
      </div>
    </div>
  );
}

function MobileGatedRow({ row }: { row: LedgerRow }) {
  return (
    <div style={{ padding: "12px 0 13px", borderBottom: `1px solid ${C.borderSoft}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        <div style={{ fontFamily: SERIF, fontSize: 14, color: C.rankGated, width: 20, flex: "none" }}>{row.rank}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SERIF, fontSize: 14.5, color: row.zero ? C.muted3 : "#d6d1c6", lineHeight: 1.3 }}>{row.name}</div>
          <div style={{ ...mono(8.5, C.muted2, 0.1), marginTop: 5 }}>
            {row.nText} PUB · {row.shareText}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 9, marginLeft: 32, paddingTop: 6, borderTop: `1px solid ${C.borderSoft}`, ...mono(8.5, C.muted3, 0.1), lineHeight: 1.6 }}>
        TOO FEW PUBLICATIONS TO MEASURE MOVEMENT<span style={{ color: C.muted2 }}> · {row.gateNote}</span>
      </div>
    </div>
  );
}

function MobileLedger({ ledger }: { ledger: PulseLedger }) {
  // True movement-window shares for the 1D meters; one shared scale so bars
  // are comparable down the list. Ceiling snaps to the next 5% step.
  const shareNow = (r: LedgerRow) => (ledger.windowSums.recent > 0 ? (r.nRecent / ledger.windowSums.recent) * 100 : 0);
  const sharePrior = (r: LedgerRow) => (ledger.windowSums.prior > 0 ? (r.nPrior / ledger.windowSums.prior) * 100 : 0);
  const axisMax = Math.max(5, Math.ceil(Math.max(1, ...ledger.measured.map((r) => Math.max(shareNow(r), sharePrior(r)))) / 5) * 5);
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 12 }}>
        <div style={mono(10.5, C.ink, 0.24)}>THEMES</div>
        <div style={mono(8.5, C.muted, 0.1)}>25 · RANKED BY SHARE</div>
      </div>
      <div style={{ background: C.panelDark, borderTop: `1px solid ${C.borderMed}`, borderBottom: `1px solid ${C.border}`, padding: "10px 0 11px" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={mono(8.5, C.gold, 0.14)}>HEADLINE</div>
            <div style={{ ...mono(8, C.muted2, 0.08), marginTop: 4 }}>APR–JUN 2026</div>
          </div>
          <div style={{ flex: 1.2 }}>
            <div style={mono(8.5, C.head, 0.14)}>MOVEMENT</div>
            <div style={{ ...mono(8, C.muted2, 0.08), marginTop: 4 }}>APR–MAY vs FEB–MAR · pp</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.borderSoft}` }}>
          <div style={{ width: 2, alignSelf: "stretch", background: C.gold, flex: "none" }} />
          <div style={{ ...mono(8.5, C.goldCaveat, 0.08), lineHeight: 1.65 }}>
            NOT LOAD-BEARING. UNRELIABLE UNTIL THREE CLEAN INGEST CYCLES HAVE RUN. DO NOT CARRY INTO A CONVERSATION AS TREND.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.borderSoft}`, ...mono(9, C.muted, 0.12) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 14, height: 9, background: C.movementFill }} />
            SHARE NOW
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 2, height: 13, background: C.gold }} />
            PRIOR WINDOW
          </div>
        </div>
      </div>
      {ledger.measured.map((r) => (
        <MobileMeasuredRow key={r.rank} row={r} now={shareNow(r)} prior={sharePrior(r)} axisMax={axisMax} />
      ))}
      <div style={{ background: C.panelDark, borderTop: `1px solid ${C.borderMed}`, borderBottom: `1px solid ${C.border}`, padding: "10px 0 11px", marginTop: 8 }}>
        <div style={mono(9, C.head2, 0.18)}>BELOW THE GATE · {ledger.gatedRangeText}</div>
        <div style={{ ...mono(8.5, C.muted2, 0.08), marginTop: 6, lineHeight: 1.65 }}>
          FEWER THAN {PUBLICATION_GATE} PUBLICATIONS IN THE RECENT TWO-MONTH WINDOW (APR–MAY) · HEADLINE FIGURES STILL HOLD
        </div>
      </div>
      {ledger.gated.map((r) => (
        <MobileGatedRow key={r.rank} row={r} />
      ))}
    </div>
  );
}

// ── Events + Evidence ───────────────────────────────────────────────────────
function Events({ payload }: { payload: PulsePayload }) {
  const events = payload.events;
  return (
    <Panel>
      <PanelHeader label="EVENTS" right={`${events.length} IN HEADLINE WINDOW`} />
      <div style={{ padding: "18px 20px 20px" }}>
        <div style={{ ...mono(9, C.muted, 0.13), paddingBottom: 14, borderBottom: `1px solid ${C.borderSoft}` }}>
          GUIDELINES, CONSENSUS STATEMENTS AND RETRACTIONS · APR–JUN 2026
        </div>
        {events.length === 0 ? (
          <div style={{ ...mono(11, C.muted3, 0.1), paddingTop: 16 }}>NONE IN THIS WINDOW.</div>
        ) : (
          events.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 16, paddingTop: 16 }}>
              <div style={{ ...mono(8.5, C.gold, 0.16), border: `1px solid ${C.goldDim}`, padding: "4px 7px", height: "fit-content", flex: "none" }}>
                {e.type.toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 16, color: C.ink, lineHeight: 1.45 }}>{e.title}</div>
                <div style={{ ...mono(9.5, C.muted, 0.1), marginTop: 9, lineHeight: 1.8 }}>
                  {e.theme.toUpperCase()}
                  <br />
                  {e.journal.toUpperCase()} · {formatWindowDate(e.date).toUpperCase()} · IN WINDOW
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function Evidence({ ledger }: { ledger: PulseLedger }) {
  const narrow = useMediaQuery(MOBILE_BP);
  // Narrow: fixed number/status columns shrink and the name column gets
  // minmax(0,·) so the table's min-content can't push the panel past its track
  // (the desktop cols set a ~367px floor that overflowed the phone column).
  const cols = narrow ? "minmax(0,1fr) 56px 110px" : "1fr 88px 132px";
  const facet = (name: string, count: number) => (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "baseline", padding: "4px 0" }}>
      <div style={{ fontFamily: SERIF, fontSize: 14, color: C.ink2 }}>{name}</div>
      <div style={{ textAlign: "right", ...mono(13, C.ink2, 0) }}>{count.toLocaleString()}</div>
      <div style={{ textAlign: "right", ...mono(9, C.faint, 0.12) }}>FACET</div>
    </div>
  );
  const emptyStream = (name: string) => (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", padding: "11px 0", borderTop: `1px solid ${C.borderSoft}`, opacity: 0.45 }}>
      <div style={{ fontFamily: SERIF, fontSize: 15.5, color: C.ink2 }}>{name}</div>
      <div style={{ textAlign: "right", ...mono(14, C.muted3, 0) }}>—</div>
      <div style={{ textAlign: "right", ...mono(9.5, C.muted3, 0.14) }}>NO SOURCE CONNECTED</div>
    </div>
  );
  return (
    <Panel>
      <PanelHeader label="EVIDENCE" right="1 SOURCE INGESTED" />
      <div style={{ padding: "16px 20px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, ...mono(9, C.muted2, 0.14), paddingBottom: 9, borderBottom: `1px solid ${C.border}` }}>
          <div>SOURCE</div>
          <div style={{ textAlign: "right" }}>RECORDS</div>
          <div style={{ textAlign: "right" }}>STATUS</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", padding: "12px 0 11px", borderBottom: `1px solid ${C.borderSoft}` }}>
          <div style={{ fontFamily: SERIF, fontSize: 15.5, color: C.ink }}>
            Publications <span style={mono(9.5, C.muted, 0.12)}>PUBMED</span>
          </div>
          <div style={{ textAlign: "right", ...mono(14, C.ink, 0) }}>{ledger.totals.publications.toLocaleString()}</div>
          <div style={{ textAlign: "right", ...mono(9.5, C.gold, 0.14) }}>INGESTED</div>
        </div>
        {/* Type facets — subordinate to the single source, not peer streams */}
        <div style={{ padding: "10px 0 12px 18px", borderLeft: `1px solid ${C.border}`, marginLeft: 2, borderBottom: `1px solid ${C.borderSoft}` }}>
          <div style={{ ...mono(8.5, C.muted2, 0.16), paddingBottom: 9 }}>PUBLICATION-TYPE FACETS · NOT INDEPENDENT STREAMS</div>
          {facet("Clinical trial publications", ledger.evidence.trials)}
          {facet("Guideline and consensus documents", ledger.evidence.guidance)}
          {facet("Reviews", ledger.evidence.reviews)}
        </div>
        {emptyStream("Congress")}
        {emptyStream("Community")}
      </div>
    </Panel>
  );
}

// ── Methodology (KEEP EXACTLY, save two provenance reconciliations) ─────────
const METHODOLOGY: { n: string; head: string; body: string; gold?: boolean }[] = [
  {
    n: "01",
    head: "MOVEMENT IS NOT YET LOAD-BEARING",
    gold: true,
    body:
      "Share change requires three clean ingest cycles before it can be read as a trend. That condition is not yet met. Treat every figure in the movement column as provisional and do not take one into a physician conversation as established.",
  },
  {
    n: "02",
    head: "WHY JANUARY AND JUNE ARE EXCLUDED",
    body:
      "January is the tail of an ingest hole and under-counts. June is a backfill recovery month and over-counts. Both would register as attention movement when they are ingest artifacts. June remains in the headline window, where a total is still meaningful.",
  },
  {
    n: "03",
    head: "THE GATE",
    body:
      "A theme with fewer than 20 publications in the two-month movement window renders no movement figure. On a corpus that small a single publication moves share by more than a point. The absence of a number is the honest reading, not a missing one.",
  },
  {
    n: "04",
    head: "SHARE IS SHARE OF THIS CORPUS",
    body:
      "Every publication is assigned one primary theme. Share is a theme's percentage of primary-theme publications in the window, not of the literature at large. Shares total 100% by construction, so one theme rising necessarily moves others down.",
  },
  {
    n: "05",
    head: "WHAT THIS PAGE DOES NOT HOLD",
    body:
      "Publication counts, shares, a monthly series and publication types. No forecast, no confidence score, no author or HCP attribution on a theme. If a claim needs one of those, it does not come from this page.",
  },
  {
    n: "06",
    head: "THE SYNTHESIS",
    body:
      "An editorial summary over the headline window only, written from the payload — not model-generated in this build. It makes no statement of change, trend or direction while the movement caveat stands. Review before use. It carries no clinical claim.",
  },
];

function Methodology({ narrow }: { narrow: boolean }) {
  return (
    <Panel style={{ marginTop: 28 }}>
      <PanelHeader label="WHAT THESE FIGURES CAN AND CANNOT CARRY" right="METHODOLOGY v1.3" />
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: "0 40px", padding: "6px 20px 20px" }}>
        {METHODOLOGY.map((m) => (
          <div key={m.n} style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
            <div style={{ ...mono(10, m.gold ? C.goldDim : "#3f454d", 0), paddingTop: 3, flex: "none" }}>{m.n}</div>
            <div>
              <div style={mono(9.5, m.gold ? C.goldCaveat : C.head2, 0.16)}>{m.head}</div>
              <div style={{ fontFamily: SERIF, fontSize: 14.5, color: C.ink2, lineHeight: 1.6, marginTop: 7 }}>{m.body}</div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function PulsePage() {
  const params = useParams();
  const narrow = useMediaQuery(MOBILE_BP);
  const taSlug = (params.ta ?? "nsclc").toLowerCase();
  const payload = PULSE_BY_TA[taSlug];

  if (!payload) {
    return (
      <AppLayout width="wide">
        <div style={{ padding: "64px 24px", textAlign: "center", fontFamily: SERIF, color: C.ink }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>No Scientific Pulse for this therapeutic area yet.</div>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, maxWidth: 440, margin: "12px auto 0" }}>
            Pulse is built per therapeutic area from its publication corpus. This TA hasn&rsquo;t had a Pulse cycle run
            yet — it will appear here when the first cycle completes.
          </p>
        </div>
      </AppLayout>
    );
  }

  const ledger = buildPulseLedger(payload);

  return (
    <AppLayout width="wide">
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          color: C.ink,
          padding: narrow ? "20px 16px 32px" : "0 0 8px",
        }}
      >
        <div style={{ padding: narrow ? 0 : "44px 64px 0" }}>
          <Masthead payload={payload} ledger={ledger} narrow={narrow} />
          <TwoWindows ledger={ledger} narrow={narrow} />
          <Synthesis payload={payload} />
          {narrow ? <MobileLedger ledger={ledger} /> : <DesktopLedger ledger={ledger} />}
          <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "1fr 1fr", gap: 28, alignItems: "start" }}>
            <Events payload={payload} />
            <Evidence ledger={ledger} />
          </div>
          <Methodology narrow={narrow} />
        </div>
      </div>
    </AppLayout>
  );
}
