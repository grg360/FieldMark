import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../AppLayout";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { COLOR, FONT } from "../../lib/designTokens";
import { supabase } from "../../lib/supabase";
import PageHero from "../PageHero";
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
  const bw = daily.length ? (width - gap * (daily.length - 1)) / daily.length : width;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height, width }}>
      {daily.map((p) => (
        <div key={p.d} title={`${p.d}: ${p.n}`} style={{ width: bw, background: color, height: Math.max(1, (p.n / max) * height), borderRadius: 1 }} />
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
  live: { dot: COLOR.amber, nameFg: COLOR.ink1 },
  imminent: { dot: "rgba(232,160,32,0.55)", nameFg: COLOR.ink1 },
  upcoming: { dot: COLOR.ink4, nameFg: COLOR.ink1 },
  recently_past: { dot: COLOR.ink5, nameFg: COLOR.ink1 },
  past: { dot: "#3A352F", nameFg: COLOR.ink1 },
};

// Row opacity by state — the only de-emphasis for past rows (no accent, no dark ink).
const ROW_OPACITY: Record<CongressState, number> = {
  live: 1, imminent: 1, upcoming: 1, recently_past: 0.82, past: 0.62,
};

const REL_COLOR = { high: COLOR.amber, moderate: COLOR.ink3, low: COLOR.ink5 } as const;

// Rail label brightness/weight is THERAPEUTIC-AREA RELEVANCE — three tiers,
// progressively muted. Never state, never lane (lanes only resolve collisions).
const RAIL_LABEL: Record<Relevance, { color: string; weight: number }> = {
  high: { color: COLOR.ink1, weight: 600 },
  moderate: { color: COLOR.ink3, weight: 500 },
  low: { color: COLOR.ink5, weight: 400 },
};

const mono = (size: number, color = COLOR.ink3): React.CSSProperties => ({
  fontFamily: FONT.mono, fontSize: size, color, letterSpacing: "0.04em",
});

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
  const isMobile = useMediaQuery("(max-width: 640px)");
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

  return (
    <AppLayout>
      <div style={{ fontFamily: FONT.sans, color: COLOR.ink1, paddingTop: 20, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* header */}
        <div>
          {/* Full H1 (PageHero, Commit B follow-up 2026-08-05): serif title +
              cluster from figures the surface already computes. */}
          <PageHero
            eyebrow="Fieldmark · Congress calendar"
            meta={nowLabel}
            title={TA_LABEL}
            stats={(() => {
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
            })()}
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
            { k: "POSTS", v: s ? INT.format(s.total_posts) : "—", c: COLOR.ink1 },
            { k: "VOICES", v: s ? INT.format(s.voices) : "—", c: COLOR.ink1 },
            // WoW renders only when the RPC's observation + volume gate passes —
            // on null the tile is omitted entirely (no zero, no dash).
            ...(isLive && s && s.wow_pct != null ? [{ k: "WoW", v: `${s.wow_pct > 0 ? "+" : ""}${s.wow_pct}%`, c: COLOR.amber }] : []),
            { k: "CONFIRMED", v: confirmed != null ? String(confirmed) : "—", c: COLOR.ink1 },
          ];
          return (
            <div>
              <div style={{ ...mono(10, COLOR.amber), letterSpacing: "0.16em", fontWeight: 600, marginBottom: 8 }}>{isLive ? "LIVE NOW" : "MOST RECENT"}</div>
              <div style={{ border: `1px solid ${COLOR.amber}`, borderRadius: 6, background: "linear-gradient(180deg, rgba(232,160,32,0.055), rgba(232,160,32,0.015))", display: "flex", flexDirection: isMobile ? "column" : "row" }}>
                <div style={{ flex: 1, padding: "20px 22px", display: "flex", flexDirection: "column", alignItems: "flex-start", [isMobile ? "borderBottom" : "borderRight"]: `1px solid rgba(232,160,32,0.22)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: COLOR.amber }} />
                    <div style={{ ...mono(10, COLOR.amber), letterSpacing: "0.16em", fontWeight: 600 }}>
                      {isLive ? `LIVE${d ? ` · DAY ${d.day} OF ${d.of}` : ""}` : "MOST RECENT"}
                    </div>
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: 6 }}>{c.short_name}</div>
                  <div style={{ fontFamily: FONT.serif, fontSize: 15, color: COLOR.ink3, marginBottom: 16 }}>{c.society_full}</div>
                  <div style={{ display: "flex", gap: 24, ...mono(11, COLOR.ink3), flexWrap: "wrap" }}>
                    <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.1em", marginBottom: 4 }}>DATES</div>{fmtDates(c)}</div>
                    <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.1em", marginBottom: 4 }}>LOCATION</div>{c.venue ? `${c.venue} · ` : ""}{c.city}{c.state ? `, ${c.state}` : ""}</div>
                    <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.1em", marginBottom: 4 }}>CAPTURED VIA</div><span style={{ color: COLOR.amber }}>{c.hashtags[0]}</span></div>
                    <div><div style={{ ...mono(9, COLOR.ink5), letterSpacing: "0.1em", marginBottom: 4 }}>RELEVANCE</div><span style={{ color: COLOR.ink1 }}>{rel ? rel.toUpperCase() : "—"}</span> · {TA_LABEL}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/congress/${c.slug}`)}
                    style={{ marginTop: 18, background: "none", border: "1px solid rgba(232,160,32,0.4)", borderRadius: 4, padding: "7px 14px", cursor: "pointer", ...mono(10, COLOR.amber), letterSpacing: "0.14em", fontWeight: 600 }}
                  >
                    OPEN CONGRESS →
                  </button>
                </div>
                <div style={{ width: isMobile ? "100%" : 452, boxSizing: "border-box", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length},1fr)`, gap: 1, background: "rgba(232,160,32,0.18)", border: "1px solid rgba(232,160,32,0.18)", borderRadius: 2 }}>
                    {tiles.map((st) => (
                      <div key={st.k} style={{ background: COLOR.surfaceWell, padding: "10px 11px" }}>
                        <div style={{ ...mono(8.5, "#8A6524"), letterSpacing: "0.1em", marginBottom: 7 }}>{st.k}</div>
                        <div style={{ ...mono(17, st.c), fontWeight: 600 }}>{st.v}</div>
                      </div>
                    ))}
                  </div>
                  {s && meetsThreshold(s) ? (
                    <div>
                      <div style={{ ...mono(8.5, "#8A6524"), letterSpacing: "0.11em", marginBottom: 9 }}>DAILY POST VOLUME · OBSERVED DAYS</div>
                      <VolumeSparks daily={s.daily} color={COLOR.amber} width={isMobile ? 300 : 408} height={44} />
                    </div>
                  ) : null}
                  <div style={{ ...mono(9.5, COLOR.ink4), marginTop: "auto" }}>
                    Social volume under {c.hashtags[0]}. Not attendance. Confirmed presenters come from the abstract list — the conversation and the podium are different populations.
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── time rail (desktop only — mobile relies on the stacked list) ── */}
        {!isMobile && (
        <div style={{ background: COLOR.surfaceWell, border: `1px solid ${COLOR.hairStrong}`, borderRadius: 6, padding: "16px 18px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={{ ...mono(10, COLOR.ink3), letterSpacing: "0.16em", fontWeight: 600 }}>THE YEAR — PROPORTIONAL TIME</div>
            <div style={mono(10, COLOR.ink5)}>Position and spacing are true to the calendar. Marker weight is therapeutic-area relevance, not size of meeting.</div>
          </div>
          <div style={{ position: "relative", height: 150 }}>
            {/* calendar strip — uniform column tint down to the baseline, so the
                rail reads as a calendar surface rather than a bare axis */}
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 34, background: COLOR.surfaceCard, borderRadius: 2 }} />
            {/* hairline dividers at every month boundary (incl. both strip edges) */}
            {[...rail.months.map((m) => m.leftPct), 100].map((pct, i) => (
              <div key={`boundary-${i}`} style={{ position: "absolute", top: 0, bottom: 34, left: `${pct}%`, width: 1, background: COLOR.hair }} />
            ))}
            {/* month columns */}
            {rail.months.map((m) => (
              <div key={m.label + m.leftPct} style={{ position: "absolute", bottom: 6, left: `${m.leftPct}%`, ...mono(9, COLOR.ink5), letterSpacing: "0.1em" }}>{m.label}</div>
            ))}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, height: 1, background: COLOR.hairStrong }} />
            {/* now line */}
            <div style={{ position: "absolute", top: 0, bottom: 22, width: 1, background: COLOR.amber, left: `${rail.nowPct}%` }} />
            <div style={{ position: "absolute", top: -2, transform: "translateX(-50%)", ...mono(9, COLOR.amber), letterSpacing: "0.14em", fontWeight: 600, background: COLOR.surfaceCard, padding: "0 5px", left: `${rail.nowPct}%` }}>NOW</div>
            {/* markers — lane sets vertical position only (collision); label
                brightness/weight is TA relevance (RAIL_LABEL), never lane or state */}
            {rail.markers.map(({ congress, leftPct, lane }) => {
              const st = congressState(congress, now);
              const rel = relevanceFor(congress, TA_SLUG);
              const lbl = rel ? RAIL_LABEL[rel] : RAIL_LABEL.low;
              const labelBottom = lane === 0 ? 60 : 88;   // two lanes
              const lineHeight = labelBottom - 38;         // connect dot up to the label
              return (
                <div key={congress.slug} style={{ position: "absolute", bottom: 0, left: `${leftPct}%` }}>
                  <div style={{ position: "absolute", bottom: 38, left: 0, width: 1, background: STATE_STYLE[st].dot, height: lineHeight }} />
                  <div style={{ position: "absolute", bottom: 31, left: -3.5, width: 7, height: 7, borderRadius: "50%", background: STATE_STYLE[st].dot }} />
                  <div style={{ position: "absolute", left: 0, transform: "translateX(-50%)", whiteSpace: "nowrap", bottom: labelBottom, ...mono(9.5, lbl.color), letterSpacing: "0.08em", fontWeight: lbl.weight }}>{congress.short_name}</div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* ── list ── */}
        <div>
          {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "220px 150px 190px 90px 130px 1fr 96px", gap: 14, padding: "0 12px 8px", ...mono(9, COLOR.ink5), letterSpacing: "0.13em", fontWeight: 500, borderBottom: `1px solid ${COLOR.hairStrong}` }}>
            <div>CONGRESS</div><div>DATES</div><div>LOCATION</div><div>COUNTDOWN</div><div>TA RELEVANCE</div><div>SOCIAL SIGNAL</div><div style={{ textAlign: "right" }}>EXPERTS</div>
          </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ padding: "18px 12px 8px", ...mono(10, g.key === "live" || g.key === "imminent" ? COLOR.amber : COLOR.ink4), letterSpacing: "0.16em", fontWeight: 600 }}>{g.title}</div>
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
                  background: "none", border: "none", borderBottom: `1px solid ${COLOR.hair}`,
                  borderLeft: `2px solid ${STATE_STYLE[st].dot}`, cursor: "pointer", opacity: ROW_OPACITY[st],
                };
                const relBars = (h: number) => (
                  <div style={{ display: "flex", gap: 2 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ width: 12, height: h, borderRadius: 1, background: rel && (i < { high: 3, moderate: 2, low: 1 }[rel]) ? REL_COLOR[rel] : COLOR.hairStrong }} />
                    ))}
                  </div>
                );
                if (isMobile) {
                  return (
                    <button key={c.slug} type="button" onClick={() => navigate(`/congress/${c.slug}`)}
                      style={{ ...rowStyleBase, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: STATE_STYLE[st].nameFg }}>{c.short_name}</div>
                        <div style={{ ...mono(13, st === "live" ? COLOR.amber : COLOR.ink2), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{countdownLabel(c, now)}</div>
                      </div>
                      <div style={mono(10.5, COLOR.ink4)}>{fmtDates(c)} · {c.city}{c.state ? `, ${c.state}` : `, ${c.country}`}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {relBars(3)}
                        <div style={{ ...mono(9, rel ? REL_COLOR[rel] : COLOR.ink5), letterSpacing: "0.08em", fontWeight: 500 }}>{rel ? rel.toUpperCase() : "—"}</div>
                        <div style={{ width: 1, height: 10, background: COLOR.hairStrong }} />
                        <div style={mono(9.5, COLOR.ink5)}>{mobileSignal}</div>
                        {hasAbstracts && confirmed != null && (
                          <>
                            <div style={{ width: 1, height: 10, background: COLOR.hairStrong }} />
                            <div style={mono(9.5, COLOR.ink3)}>{confirmed} confirmed</div>
                          </>
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
                      display: "grid", gridTemplateColumns: "220px 150px 190px 90px 130px 1fr 96px", gap: 14,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: STATE_STYLE[st].nameFg }}>{c.short_name}</div>
                      <div style={{ ...mono(10, COLOR.ink5), marginTop: 3 }}>{c.society_short}</div>
                    </div>
                    <div style={mono(11, COLOR.ink2)}>{fmtDates(c)}</div>
                    <div style={mono(11, COLOR.ink3)}>{c.city}{c.state ? `, ${c.state}` : `, ${c.country}`}</div>
                    <div style={{ ...mono(13, st === "live" ? COLOR.amber : COLOR.ink2), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{countdownLabel(c, now)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", gap: 2 }}>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ width: 12, height: 4, borderRadius: 1, background: rel && (i < { high: 3, moderate: 2, low: 1 }[rel]) ? REL_COLOR[rel] : COLOR.hairStrong }} />
                        ))}
                      </div>
                      <div style={{ ...mono(9.5, rel ? REL_COLOR[rel] : COLOR.ink5), letterSpacing: "0.08em", fontWeight: 500 }}>{rel ? rel.toUpperCase() : "—"}</div>
                    </div>
                    {/* Social signal — sparkline once past the 250/40 threshold; below it,
                        the honest state (counts toward threshold); no posts → nothing. */}
                    {(() => {
                      const s = socialBySlug[c.slug];
                      if (s && meetsThreshold(s)) {
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <VolumeSparks daily={s.daily} color={COLOR.ink4} width={110} height={22} />
                            <div style={mono(10, COLOR.ink3)}>{INT.format(s.total_posts)} posts</div>
                          </div>
                        );
                      }
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 110, height: 1, background: COLOR.hairStrong }} />
                          <div style={mono(10, COLOR.ink5)}>
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
                          <div style={{ ...mono(13, COLOR.ink1), fontWeight: 600 }}>{confirmed}</div>
                          <div style={{ ...mono(9, COLOR.ink5), marginTop: 4 }}>confirmed</div>
                        </>
                      ) : (
                        <div style={{ ...mono(13, COLOR.ink5) }}>—</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* footer — distinguishes the confirmed vs inferred populations (the point of the page) */}
        <div style={{ padding: "12px 14px", border: `1px solid ${COLOR.hair}`, borderRadius: 6, background: COLOR.surfaceWell, fontFamily: FONT.serif, fontSize: 13.5, lineHeight: 1.6, color: COLOR.ink3 }}>
          Confirmed presenters come from the meeting&rsquo;s published abstract list. Expert counts for congresses without abstract data are tracked experts showing public activity under the congress hashtag — <span style={{ color: COLOR.ink2 }}>a signal of engagement with the conversation, not a record of attendance.</span> Congresses with no captured posts show nothing rather than an estimate.
        </div>
      </div>
    </AppLayout>
  );
}
