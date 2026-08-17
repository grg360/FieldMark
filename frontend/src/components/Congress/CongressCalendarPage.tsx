import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../AppLayout";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { GROUND, LINE, INK, GOLD, DEPTH, FACE, T, SEQ } from "../../lib/canonicalTokens";
import { supabase } from "../../lib/supabase";
import PageHero from "../PageHero";
import { taLabelForSlug } from "../../lib/taLabels";
import {
  CONGRESSES,
  congressState,
  countdownDays,
  groupCongresses,
  liveDay,
  relevanceFor,
  type Congress,
  type CongressState,
  type Relevance,
} from "../../lib/congresses";
import {
  getCongressSocial,
  meetsThreshold,
  SOCIAL_THRESHOLD,
  type CongressSocial,
} from "../../lib/congressSocial";

// Tiny volume sparkline (observed days only). Muted by default; amber for the featured card.
function VolumeSparks({ daily, color, width = 110, height = 22 }: {
  daily: { d: string; n: number }[]; color: string; width?: number; height?: number;
}) {
  const max = Math.max(1, ...daily.map((p) => p.n));
  const gap = 1.5;
  // `width` is a cap, not a fixed size: bars flex so the row fits any narrower
  // container (the featured card's 300px row overflowed its ~250px mobile column).
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height, width: `min(${width}px, 100%)` }}>
      {daily.map((p) => (
        <div key={p.d} title={`${p.d}: ${p.n}`} style={{ flex: "1 1 0", minWidth: 0, background: color, height: Math.max(1, (p.n / max) * height), borderRadius: 1 }} />
      ))}
    </div>
  );
}

const INT = new Intl.NumberFormat("en-US");

// Congress Calendar — the year an MSL plans around. Renders the time rail, the
// state-grouped congress list, and the featured slot: the live congress while a
// meeting is on (LIVE outranks everything), otherwise the most recently ended
// congress we hold data for. All figures are real (RPC + presenter counts) —
// a congress with nothing captured shows the honest empty state, never an estimate.

const TA_SLUG = "nsclc";
const TA_LABEL = "Oncology";

// State → dot/line/label treatment. Amber is reserved for live + imminent (the
// sanctioned stretch); everything else is neutral ink.
// Names stay on normal ink at every state — de-emphasis of past rows is carried by
// row opacity (past = 62%, per the design's state ladder), never by dimming the ink,
// so the one congress we actually have data for isn't the hardest row to read.
const STATE_STYLE: Record<CongressState, { dot: string; nameFg: string }> = {
  live: { dot: GOLD.PRIME, nameFg: INK.PRIME },
  imminent: { dot: GOLD.MUTE, nameFg: INK.PRIME },
  upcoming: { dot: INK.MUTE, nameFg: INK.PRIME },
  // recently_past steps below upcoming — INK.GHOST is the ramp's non-text step.
  recently_past: { dot: INK.GHOST, nameFg: INK.PRIME },
  // past is a marker glyph, not text, so it may sit below the text floor.
  past: { dot: LINE.EDGE, nameFg: INK.PRIME },
};

// Row opacity by state — the only de-emphasis for past rows (no accent, no dark ink).
const ROW_OPACITY: Record<CongressState, number> = {
  live: 1, imminent: 1, upcoming: 1, recently_past: 0.82, past: 0.62,
};

const REL_COLOR = { high: GOLD.PRIME, moderate: INK.LABEL, low: INK.MUTE } as const;

// Rail label brightness/weight is THERAPEUTIC-AREA RELEVANCE — three tiers,
// progressively muted. Never state, never lane (lanes only resolve collisions).
const RAIL_LABEL: Record<Relevance, { color: string; weight: number }> = {
  high: { color: INK.PRIME, weight: 600 },
  moderate: { color: INK.LABEL, weight: 500 },
  low: { color: INK.MUTE, weight: 400 },
};

// `color: string` is deliberate. canonicalTokens is `as const`, so an
// unannotated default narrows this parameter to the literal "#949CA5" and
// every call passing any other token is a type error (54 of them at HEAD).
const mono = (size: number, color: string = INK.LABEL): React.CSSProperties => ({
  fontFamily: FACE.data, fontSize: size, color, letterSpacing: "0.04em",
});

// ── Rail geometry ────────────────────────────────────────────────────────────
// These were six literals inline in the marker JSX (60 / 88 / 38 / 31 / -3.5 / 34).
// Nothing threw when the type scale moved underneath them; the labels just
// collided or floated. Four of the six are genuinely DERIVED from the strip and
// the type scale and now recompute themselves. Two are not — they are TUNED, and
// are labelled as such below so a later reader doesn't mistake a judgement call
// for arithmetic.
//
// Everything is anchored to the container's BOTTOM edge, which is why a label
// size change cannot move the dot or the connector: labels are positioned by
// their bottom, so their height only affects clearance between the two lanes.
const RAIL_H = 150; // container height
const STRIP_BOTTOM = 34; // calendar strip floor — the rail's baseline
const RULE_H = 1; // the baseline rule's own thickness
const DOT = 7; // marker dot diameter

// DERIVED — dot centre lands exactly on the baseline rule's centre (both 34.5).
const DOT_BOTTOM = STRIP_BOTTOM + RULE_H / 2 - DOT / 2;
// DERIVED — centres the dot horizontally on the marker's `left: %` anchor.
const DOT_LEFT = -DOT / 2;
// DERIVED — the connector starts where the dot ends.
const CONNECTOR_BOTTOM = DOT_BOTTOM + DOT;
// DERIVED — IBM Plex Mono renders `normal` line-height at exactly 1.5x its
// font-size (measured across 8.5–24px). This is the ONE place the type scale
// enters the geometry: change T.MICRO and the lanes re-space themselves.
const LABEL_H = T.MICRO * 1.5;

// TUNED, NOT DERIVED — chosen to preserve the shipped layout, not computed from
// anything. CONNECTOR_MIN is the shortest connector that still reads as a stem
// rather than a smudge; LANE_GAP is the clear space that keeps two stacked
// labels legible. Both are judgement calls and either can be re-tuned on sight
// without invalidating the four derivations above.
const CONNECTOR_MIN = 22;
const LANE_GAP = 14;

const LANE_0_BOTTOM = CONNECTOR_BOTTOM + CONNECTOR_MIN; // 60 — unchanged from the literal
// 87.5, not the old hardcoded 88: LABEL_H flowing through is the entire point of
// the block, so the half-pixel stays rather than being rounded back to the
// number that happened to be tuned for the old 14.24px label.
const LANE_1_BOTTOM = LANE_0_BOTTOM + LABEL_H + LANE_GAP;

function fmtDates(c: Congress): string {
  const s = new Date(`${c.start_date}T00:00:00Z`);
  const e = new Date(`${c.end_date}T00:00:00Z`);
  const mon = (d: Date) => d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const yr = e.getUTCFullYear();
  if (mon(s) === mon(e)) return `${s.getUTCDate()}–${e.getUTCDate()} ${mon(e)} ${yr}`;
  return `${s.getUTCDate()} ${mon(s)} – ${e.getUTCDate()} ${mon(e)} ${yr}`;
}

function countdownLabel(c: Congress, now: Date): string {
  const st = congressState(c, now);
  if (st === "live") { const d = liveDay(c, now); return d ? `DAY ${d.day}/${d.of}` : "LIVE"; }
  if (st === "recently_past" || st === "past") return "—";
  const d = countdownDays(c, now);
  return d === 0 ? "TODAY" : `${d}d`;
}

// ── Time rail: a rolling 12-month window from the start of the current month ──
function useRail(now: Date) {
  return useMemo(() => {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 12, 1);
    const span = end - start;
    const pct = (ms: number) => ((ms - start) / span) * 100;
    const months: { label: string; leftPct: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const m = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1);
      months.push({
        label: new Date(m).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
        leftPct: pct(m),
      });
    }
    const nowPct = pct(now.getTime());
    // Two label lanes to resolve collisions: labels within ~one label-width of the
    // last one placed in a lane drop to the other lane (Design's two-lane rail).
    const COLLIDE_PCT = 8;
    const lastLeft: [number, number] = [-Infinity, -Infinity];
    const markers = CONGRESSES
      .map((c) => ({ congress: c, leftPct: pct(new Date(`${c.start_date}T00:00:00Z`).getTime()) }))
      .filter((m) => m.leftPct >= 0 && m.leftPct < 100)
      .sort((a, b) => a.leftPct - b.leftPct)
      .map((m) => {
        let lane: 0 | 1;
        if (m.leftPct - lastLeft[0] > COLLIDE_PCT) lane = 0;
        else if (m.leftPct - lastLeft[1] > COLLIDE_PCT) lane = 1;
        else lane = lastLeft[0] <= lastLeft[1] ? 0 : 1;
        lastLeft[lane] = m.leftPct;
        return { ...m, lane };
      });
    return { months, nowPct, markers };
  }, [now]);
}

export default function CongressCalendarPage() {
  const navigate = useNavigate();
  // TWO gates, because two things on this surface fail at different widths.
  // isMobile — the ledger breakpoint (was 640; standardized 2026-08-10). Drives
  // the featured card and the time rail, both of which are fine well below it.
  const isMobile = useMediaQuery("(max-width: 767px)");
  // listStacked — the 7-column list only. Its fixed columns (806px) + gaps (84px)
  // + row padding (24px) + the 1fr track's ~108px min-content give the grid a
  // 1022px floor, so it needs a 1120px viewport (board = viewport - 96). Below
  // that the grid overflowed its panel and put the EXPERTS column in the page
  // gutter — measured 96px over at 1024, 320px over at 800. The stacked card is
  // a correct rendering at those widths; the grid is not.
  const listStacked = useMediaQuery("(max-width: 1119px)");
  const [params] = useSearchParams();
  // Dev-only reference-date override so the LIVE / IMMINENT treatments can be
  // exercised before a congress is actually live (e.g. /congress?now=2026-05-31).
  // Ignored entirely in production.
  const now = useMemo(() => {
    const override = import.meta.env.DEV ? params.get("now") : null;
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return new Date(`${override}T12:00:00Z`);
    return new Date();
  }, [params]);
  const groups = useMemo(() => groupCongresses(now), [now]);
  const rail = useRail(now);
  const [confirmedBySlug, setConfirmedBySlug] = useState<Record<string, number>>({});
  const [socialBySlug, setSocialBySlug] = useState<Record<string, CongressSocial | null>>({});

  const liveCongress = useMemo(
    () => CONGRESSES.find((c) => congressState(c, now) === "live") ?? null,
    [now],
  );

  // Most recently ended congress we actually hold data for (captured social or
  // abstracts) — fills the featured slot between meetings. A congress with no
  // data would render an all-dash card, so it never features. LIVE outranks this:
  // while a meeting is on, the most-recent card drops entirely (one featured
  // card keeps amber scarce; the congress remains reachable from its list row).
  const mostRecentCongress = useMemo(() => {
    return CONGRESSES
      .filter((c) => {
        const st = congressState(c, now);
        return (st === "recently_past" || st === "past") && (c.social_capture_start || c.abstract_source);
      })
      .sort((a, b) => b.end_date.localeCompare(a.end_date))[0] ?? null;
  }, [now]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("congress_confirmed_presenters")
      .select("congress_slug")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const counts: Record<string, number> = {};
        for (const r of data as { congress_slug: string }[]) {
          counts[r.congress_slug] = (counts[r.congress_slug] ?? 0) + 1;
        }
        setConfirmedBySlug(counts);
      });
    return () => { cancelled = true; };
  }, []);

  // Social: only fetch for congresses whose capture has started (others have no
  // posts and correctly render the empty state without a query).
  useEffect(() => {
    let cancelled = false;
    const targets = CONGRESSES.filter((c) => c.social_capture_start);
    Promise.all(targets.map((c) => getCongressSocial(c).then((s) => [c.slug, s] as const))).then((pairs) => {
      if (cancelled) return;
      setSocialBySlug(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
  }, []);

  const nowLabel = now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  // width="wide" (1440), not the AppLayout default "standard" (1120): the desktop
  // list commits 876px of fixed columns + 84px of gaps = 960 of the 1000 available
  // at standard, leaving 40px for a 1fr track whose min-content is ~174px. `1fr`
  // is minmax(auto, 1fr) and cannot go below min-content, so the grid overflowed
  // its panel by 119px and pushed the EXPERTS column into the page gutter.
  // Paired with the compressible column 6 below — width alone leaves the same
  // failure waiting at a narrower viewport.
  return (
    <AppLayout width="wide">
      {/* Board surface. Was the legacy g2 flat fill; now the canonical editorial
          container — DEPTH.PANEL derives its gradient from GROUND.RAISE by
          L-shift, so it follows any future re-temperature of the ramp.
          SPREAD ORDER MATTERS: DEPTH.PANEL carries a `borderTop` rim, and the
          `border` shorthand would silently overwrite it if it came afterwards.
          Border first, depth last. */}
      <div style={{ fontFamily: FACE.ui, color: INK.PRIME, margin: "8px 0 24px", padding: "28px 32px 36px", border: `1px solid ${LINE.HAIR}`, ...DEPTH.PANEL, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* header */}
        <div>
          {/* Full H1 (PageHero, Commit B follow-up 2026-08-05): serif title +
              cluster from figures the surface already computes. */}
          <PageHero
            // narrow was never passed — the surface computes isMobile at :190 for
            // its featured card but the hero never saw it. Same defect found on
            // RisingQuadrant; both predate the convergence.
            narrow={isMobile}
            // HERO CONTRACT 2026-08-15. The title was the TA ("Oncology" at 52)
            // and the surface name sat in the eyebrow — exactly inverted from
            // the rule. "Fieldmark" is gone from the eyebrow: the platform name
            // is in the nav on every page.
            //
            // THE SCOPE SEGMENT IS GONE (2026-08-16), with the other seven. The
            // form is TA · AREA. What survives from the old note is the reason
            // the FIRST segment is the INDICATION and not the area: this surface
            // is area-scoped in its NAME — "Congresses", an oncology calendar —
            // but its data scope is TA_SLUG, and relevanceFor(c, TA_SLUG) filters
            // every row on nsclc. An eyebrow reading "ONCOLOGY" alone would name
            // a broader scope than the surface actually shows. So Congresses
            // takes the same two segments as the rest: 203px, well inside the
            // 310px narrow budget and 65px down from the three-segment form.
            eyebrow={`${taLabelForSlug(TA_SLUG)} · ${TA_LABEL}`}
            meta={nowLabel}
            title="Congresses"
            stats={{ variant: "cluster", items: (() => {
              const upcoming = CONGRESSES.filter((c) => ["upcoming", "imminent", "live"].includes(congressState(c, now))).length;
              const featured = liveCongress ?? mostRecentCongress;
              const posts = featured ? socialBySlug[featured.slug]?.total_posts ?? null : null;
              return [
                { value: String(CONGRESSES.length), label: "CONGRESSES" },
                { value: String(upcoming), label: "UPCOMING" },
                ...(featured && posts != null
                  ? [{ value: INT.format(posts), label: `POSTS · ${featured.short_name.toUpperCase()}`, gold: true }]
                  : []),
              ];
            })() }}
          />
        </div>

        {/* ── featured congress — LIVE while a meeting is on (always outranks);
               otherwise the MOST RECENT congress we hold data for. Same card
               treatment for both; the recent variant drops the day-counter and
               closes line (live-only constructs) but keeps the amber treatment. */}
        {(liveCongress || mostRecentCongress) && (() => {
          const isLive = liveCongress != null;
          const c = (liveCongress ?? mostRecentCongress)!;
          const d = isLive ? liveDay(c, now) : null;
          const s = socialBySlug[c.slug];
          const confirmed = confirmedBySlug[c.slug];
          const rel = relevanceFor(c, TA_SLUG);
          // Real figures only — RPC social totals + counted presenters. WoW is a
          // live-week construct; the recent variant shows the three closing stats.
          const tiles = [
            { k: "POSTS", v: s ? INT.format(s.total_posts) : "—", c: INK.PRIME },
            { k: "VOICES", v: s ? INT.format(s.voices) : "—", c: INK.PRIME },
            // WoW renders only when the RPC's observation + volume gate passes —
            // on null the tile is omitted entirely (no zero, no dash).
            ...(isLive && s && s.wow_pct != null ? [{ k: "WoW", v: `${s.wow_pct > 0 ? "+" : ""}${s.wow_pct}%`, c: GOLD.PRIME }] : []),
            { k: "CONFIRMED", v: confirmed != null ? String(confirmed) : "—", c: INK.PRIME },
          ];
          return (
            <div>
              <div style={{ ...mono(T.LABEL, GOLD.PRIME), letterSpacing: "0.16em", fontWeight: 600, marginBottom: 8 }}>{isLive ? "LIVE NOW" : "MOST RECENT"}</div>
              <div style={{ border: `1px solid ${GOLD.PRIME}`, borderRadius: 6, background: GOLD.WASH, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
                <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", alignItems: "flex-start", [isMobile ? "borderBottom" : "borderRight"]: `1px solid ${GOLD.EDGE}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD.PRIME }} />
                    <div style={{ ...mono(T.LABEL, GOLD.PRIME), letterSpacing: "0.16em", fontWeight: 600 }}>
                      {isLive ? `LIVE${d ? ` · DAY ${d.day} OF ${d.of}` : ""}` : "MOST RECENT"}
                    </div>
                  </div>
                  <div style={{ fontSize: T.FIGURE, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: 6 }}>{c.short_name}</div>
                  <div style={{ fontFamily: FACE.value, fontSize: T.BODY, color: INK.LABEL, marginBottom: 16 }}>{c.society_full}</div>
                  <div style={{ display: "flex", gap: 24, ...mono(T.LABEL, INK.LABEL), flexWrap: "wrap" }}>
                    <div><div style={{ ...mono(T.MICRO, INK.MUTE), letterSpacing: "0.1em", marginBottom: 4 }}>DATES</div>{fmtDates(c)}</div>
                    <div><div style={{ ...mono(T.MICRO, INK.MUTE), letterSpacing: "0.1em", marginBottom: 4 }}>LOCATION</div>{c.venue ? `${c.venue} · ` : ""}{c.city}{c.state ? `, ${c.state}` : ""}</div>
                    <div><div style={{ ...mono(T.MICRO, INK.MUTE), letterSpacing: "0.1em", marginBottom: 4 }}>CAPTURED VIA</div><span style={{ color: GOLD.PRIME }}>{c.hashtags[0]}</span></div>
                    <div><div style={{ ...mono(T.MICRO, INK.MUTE), letterSpacing: "0.1em", marginBottom: 4 }}>RELEVANCE</div><span style={{ color: INK.PRIME }}>{rel ? rel.toUpperCase() : "—"}</span> · {TA_LABEL}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/congress/${c.slug}`)}
                    style={{ marginTop: 18, background: "none", border: `1px solid ${GOLD.EDGE}`, borderRadius: 4, padding: "7px 14px", cursor: "pointer", ...mono(T.LABEL, GOLD.PRIME), letterSpacing: "0.14em", fontWeight: 600 }}
                  >
                    OPEN CONGRESS →
                  </button>
                </div>
                <div style={{ width: isMobile ? "100%" : 452, boxSizing: "border-box", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length},1fr)`, gap: 1, background: GOLD.EDGE, border: `1px solid ${GOLD.EDGE}`, borderRadius: 2 }}>
                    {tiles.map((st) => (
                      <div key={st.k} style={{ background: GROUND.INSET, padding: "10px 11px" }}>
                        <div style={{ ...mono(T.MICRO, INK.LABEL), letterSpacing: "0.1em", marginBottom: 7 }}>{st.k}</div>
                        <div style={{ ...mono(T.LEAD, st.c), fontWeight: 600 }}>{st.v}</div>
                      </div>
                    ))}
                  </div>
                  {s && meetsThreshold(s) ? (
                    <div>
                      <div style={{ ...mono(T.MICRO, INK.LABEL), letterSpacing: "0.11em", marginBottom: 9 }}>DAILY POST VOLUME · OBSERVED DAYS</div>
                      <VolumeSparks daily={s.daily} color={GOLD.PRIME} width={isMobile ? 300 : 408} height={44} />
                    </div>
                  ) : null}
                  <div style={{ ...mono(T.MICRO, INK.MUTE), marginTop: "auto" }}>
                    Social volume under {c.hashtags[0]}. Not attendance. Confirmed presenters come from the abstract list — the conversation and the podium are different populations.
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── time rail (desktop only — mobile relies on the stacked list) ── */}
        {!isMobile && (
        <div style={{ background: GROUND.INSET, border: `1px solid ${LINE.EDGE}`, borderRadius: 6, padding: "16px 18px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={{ ...mono(T.LABEL, INK.LABEL), letterSpacing: "0.16em", fontWeight: 600 }}>THE YEAR — PROPORTIONAL TIME</div>
            <div style={mono(T.LABEL, INK.MUTE)}>Position and spacing are true to the calendar. Marker weight is therapeutic-area relevance, not size of meeting.</div>
          </div>
          <div style={{ position: "relative", height: RAIL_H }}>
            {/* calendar strip — uniform column tint down to the baseline, so the
                rail reads as a calendar surface rather than a bare axis */}
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: STRIP_BOTTOM, background: GROUND.RAISE, borderRadius: 2 }} />
            {/* hairline dividers at every month boundary (incl. both strip edges) */}
            {[...rail.months.map((m) => m.leftPct), 100].map((pct, i) => (
              <div key={`boundary-${i}`} style={{ position: "absolute", top: 0, bottom: STRIP_BOTTOM, left: `${pct}%`, width: 1, background: LINE.HAIR }} />
            ))}
            {/* month columns */}
            {rail.months.map((m) => (
              <div key={m.label + m.leftPct} style={{ position: "absolute", bottom: 6, left: `${m.leftPct}%`, ...mono(T.MICRO, INK.MUTE), letterSpacing: "0.1em" }}>{m.label}</div>
            ))}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: STRIP_BOTTOM, height: RULE_H, background: LINE.EDGE }} />
            {/* now line */}
            <div style={{ position: "absolute", top: 0, bottom: 22, width: 1, background: GOLD.PRIME, left: `${rail.nowPct}%` }} />
            <div style={{ position: "absolute", top: -2, transform: "translateX(-50%)", ...mono(T.MICRO, GOLD.PRIME), letterSpacing: "0.14em", fontWeight: 600, background: GROUND.RAISE, padding: "0 5px", left: `${rail.nowPct}%` }}>NOW</div>
            {/* markers — lane sets vertical position only (collision); label
                brightness/weight is TA relevance (RAIL_LABEL), never lane or state */}
            {rail.markers.map(({ congress, leftPct, lane }) => {
              const st = congressState(congress, now);
              const rel = relevanceFor(congress, TA_SLUG);
              const lbl = rel ? RAIL_LABEL[rel] : RAIL_LABEL.low;
              const labelBottom = lane === 0 ? LANE_0_BOTTOM : LANE_1_BOTTOM;
              const lineHeight = labelBottom - CONNECTOR_BOTTOM; // stem: dot top -> label bottom
              return (
                <div key={congress.slug} style={{ position: "absolute", bottom: 0, left: `${leftPct}%` }}>
                  <div style={{ position: "absolute", bottom: CONNECTOR_BOTTOM, left: 0, width: 1, background: STATE_STYLE[st].dot, height: lineHeight }} />
                  <div style={{ position: "absolute", bottom: DOT_BOTTOM, left: DOT_LEFT, width: DOT, height: DOT, borderRadius: "50%", background: STATE_STYLE[st].dot }} />
                  <div style={{ position: "absolute", left: 0, transform: "translateX(-50%)", whiteSpace: "nowrap", bottom: labelBottom, ...mono(T.MICRO, lbl.color), letterSpacing: "0.08em", fontWeight: lbl.weight }}>{congress.short_name}</div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* ── list ── */}
        <div>
          {!listStacked && (
          <div style={{ display: "grid", gridTemplateColumns: "190px 150px 150px 90px 130px 1fr 96px", gap: 14, padding: "0 12px 8px", ...mono(T.MICRO, INK.MUTE), letterSpacing: "0.13em", fontWeight: 500, borderBottom: `1px solid ${LINE.EDGE}` }}>
            <div>CONGRESS</div><div>DATES</div><div>LOCATION</div><div>COUNTDOWN</div><div>TA RELEVANCE</div><div>SOCIAL SIGNAL</div><div style={{ textAlign: "right" }}>EXPERTS</div>
          </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ padding: "18px 12px 8px", ...mono(T.LABEL, g.key === "live" || g.key === "imminent" ? GOLD.PRIME : INK.MUTE), letterSpacing: "0.16em", fontWeight: 600 }}>{g.title}</div>
              {g.congresses.map((c) => {
                const st = congressState(c, now);
                const rel = relevanceFor(c, TA_SLUG);
                const confirmed = confirmedBySlug[c.slug];
                const hasAbstracts = !!c.abstract_source;
                const s = socialBySlug[c.slug];
                const mobileSignal = s && meetsThreshold(s)
                  ? `${INT.format(s.total_posts)} posts`
                  : s ? `${INT.format(s.total_posts)}/${SOCIAL_THRESHOLD.posts} posts` : "no captured posts";
                const rowStyleBase = {
                  padding: "13px 12px", width: "100%", textAlign: "left" as const,
                  background: "none", border: "none", borderBottom: `1px solid ${LINE.HAIR}`,
                  borderLeft: `2px solid ${STATE_STYLE[st].dot}`, cursor: "pointer", opacity: ROW_OPACITY[st],
                };
                const relBars = (h: number) => (
                  <div style={{ display: "flex", gap: 2 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ width: 12, height: h, borderRadius: 1, background: rel && (i < { high: 3, moderate: 2, low: 1 }[rel]) ? REL_COLOR[rel] : LINE.EDGE }} />
                    ))}
                  </div>
                );
                if (listStacked) {
                  return (
                    <button key={c.slug} type="button" onClick={() => navigate(`/congress/${c.slug}`)}
                      style={{ ...rowStyleBase, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                        <div style={{ fontSize: T.BODY, fontWeight: 600, color: STATE_STYLE[st].nameFg }}>{c.short_name}</div>
                        <div style={{ ...mono(T.META, st === "live" ? GOLD.PRIME : INK.BODY), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{countdownLabel(c, now)}</div>
                      </div>
                      <div style={mono(T.LABEL, INK.MUTE)}>{fmtDates(c)} · {c.city}{c.state ? `, ${c.state}` : `, ${c.country}`}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {relBars(3)}
                        <div style={{ ...mono(T.MICRO, rel ? REL_COLOR[rel] : INK.MUTE), letterSpacing: "0.08em", fontWeight: 500 }}>{rel ? rel.toUpperCase() : "—"}</div>
                        <div style={{ width: 1, height: 10, background: LINE.EDGE }} />
                        <div style={mono(T.LABEL, INK.MUTE)}>{mobileSignal}</div>
                        {/* The datum always renders. Omitting it on the 14 rows with
                            no abstract list was worse than the desktop em-dash: the
                            field simply vanished, so absence was indistinguishable
                            from "not a thing we track". */}
                        <div style={{ width: 1, height: 10, background: LINE.EDGE }} />
                        {hasAbstracts && confirmed != null ? (
                          <div style={mono(T.MICRO, INK.LABEL)}>{confirmed} confirmed</div>
                        ) : (
                          <div style={mono(T.MICRO, INK.MUTE)}>abstract list pending</div>
                        )}
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => navigate(`/congress/${c.slug}`)}
                    style={{
                      ...rowStyleBase,
                      display: "grid", gridTemplateColumns: "190px 150px 150px 90px 130px 1fr 96px", gap: 14,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: T.BODY, fontWeight: 600, color: STATE_STYLE[st].nameFg }}>{c.short_name}</div>
                      <div style={{ ...mono(T.LABEL, INK.MUTE), marginTop: 3 }}>{c.society_short}</div>
                    </div>
                    <div style={mono(T.LABEL, INK.BODY)}>{fmtDates(c)}</div>
                    <div style={mono(T.LABEL, INK.LABEL)}>{c.city}{c.state ? `, ${c.state}` : `, ${c.country}`}</div>
                    <div style={{ ...mono(T.META, st === "live" ? GOLD.PRIME : INK.BODY), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{countdownLabel(c, now)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", gap: 2 }}>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ width: 12, height: 4, borderRadius: 1, background: rel && (i < { high: 3, moderate: 2, low: 1 }[rel]) ? REL_COLOR[rel] : LINE.EDGE }} />
                        ))}
                      </div>
                      <div style={{ ...mono(T.MICRO, rel ? REL_COLOR[rel] : INK.MUTE), letterSpacing: "0.08em", fontWeight: 500 }}>{rel ? rel.toUpperCase() : "—"}</div>
                    </div>
                    {/* Social signal — sparkline once past the 250/40 threshold; below it,
                        the honest state (counts toward threshold); no posts → nothing. */}
                    {(() => {
                      const s = socialBySlug[c.slug];
                      if (s && meetsThreshold(s)) {
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            {/* Ambient magnitude in a neutral list -> the SEQ ramp.
                                SEQ[3] is the quietest LEGAL step: SEQ[2] measures
                                2.69:1 on the panel, under the 3:1 floor for a
                                graphical mark (legacy ink4 was 3.77:1, SEQ[3] is
                                4.87:1). The FEATURED card's sparkline stays
                                GOLD.PRIME on purpose — it belongs to the live /
                                most-recent card and inherits that card's colour
                                identity, where these are ambient magnitude in a
                                neutral list. The asymmetry is deliberate. */}
                            <div style={{ minWidth: 0, flex: "0 1 auto" }}>
                              <VolumeSparks daily={s.daily} color={SEQ[3]} width={110} height={22} />
                            </div>
                            <div style={{ ...mono(T.LABEL, INK.LABEL), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{INT.format(s.total_posts)} posts</div>
                          </div>
                        );
                      }
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div style={{ width: 110, minWidth: 0, flex: "0 1 auto", height: 1, background: LINE.EDGE }} />
                          <div style={{ ...mono(T.LABEL, INK.MUTE), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s ? `${INT.format(s.total_posts)}/${SOCIAL_THRESHOLD.posts} posts` : "no captured posts"}
                          </div>
                        </div>
                      );
                    })()}
                    {/* Experts — confirmed presenters (fact) for congresses we hold abstracts
                        for; otherwise no inference is shown here yet. */}
                    <div style={{ textAlign: "right" }}>
                      {hasAbstracts && confirmed != null ? (
                        <>
                          <div style={{ ...mono(T.META, INK.PRIME), fontWeight: 600 }}>{confirmed}</div>
                          <div style={{ ...mono(T.MICRO, INK.MUTE), marginTop: 4 }}>confirmed</div>
                        </>
                      ) : (
                        // Absence is not zero: 14 of 15 congresses have
                        // abstract_source = null, so this is the common case. The
                        // bare em-dash read as "no experts"; this names the missing
                        // SOURCE instead. The footer already explains that confirmed
                        // presenters come from the published abstract list.
                        <div style={{ ...mono(T.MICRO, INK.MUTE) }}>abstract list pending</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* footer — distinguishes the confirmed vs inferred populations (the point of the page) */}
        <div style={{ padding: "12px 14px", border: `1px solid ${LINE.HAIR}`, borderRadius: 6, background: GROUND.INSET, fontFamily: FACE.value, fontSize: T.META, lineHeight: 1.6, color: INK.LABEL }}>
          Confirmed presenters come from the meeting&rsquo;s published abstract list. Expert counts for congresses without abstract data are tracked experts showing public activity under the congress hashtag — <span style={{ color: INK.BODY }}>a signal of engagement with the conversation, not a record of attendance.</span> Congresses with no captured posts show nothing rather than an estimate.
        </div>
      </div>
    </AppLayout>
  );
}
