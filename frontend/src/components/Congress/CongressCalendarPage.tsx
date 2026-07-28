import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "../AppLayout";
import { COLOR, FONT } from "../../lib/designTokens";
import { supabase } from "../../lib/supabase";
import {
  CONGRESSES,
  congressState,
  countdownDays,
  groupCongresses,
  liveDay,
  relevanceFor,
  type Congress,
  type CongressState,
} from "../../lib/congresses";

// Congress Calendar — the year an MSL plans around. This increment renders the
// time rail + the grouped congress list from config, with real calendar states
// and (for congresses we hold abstracts for) real confirmed-presenter counts.
// The live social card and per-congress social sparklines are the next increment;
// until then the social column shows the honest empty state, never an estimate.

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

  const nowLabel = now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    <AppLayout maxWidth={1200}>
      <div style={{ fontFamily: FONT.sans, color: COLOR.ink1, paddingTop: 20, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* header */}
        <div>
          <div style={{ ...mono(11, COLOR.amber), letterSpacing: "0.22em", fontWeight: 600 }}>FIELDMARK · CONGRESS CALENDAR</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 10 }}>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>{TA_LABEL}</div>
            <div style={mono(11, COLOR.ink4)}>{nowLabel}</div>
          </div>
        </div>

        {/* ── time rail ── */}
        <div style={{ background: COLOR.surfaceWell, border: `1px solid ${COLOR.hairStrong}`, borderRadius: 6, padding: "16px 18px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={{ ...mono(10, COLOR.ink3), letterSpacing: "0.16em", fontWeight: 600 }}>THE YEAR — PROPORTIONAL TIME</div>
            <div style={mono(10, COLOR.ink5)}>Position and spacing are true to the calendar. Marker weight is therapeutic-area relevance, not size of meeting.</div>
          </div>
          <div style={{ position: "relative", height: 150 }}>
            {/* month columns */}
            {rail.months.map((m) => (
              <div key={m.label + m.leftPct} style={{ position: "absolute", bottom: 6, left: `${m.leftPct}%`, ...mono(9, COLOR.ink5), letterSpacing: "0.1em" }}>{m.label}</div>
            ))}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 34, height: 1, background: COLOR.hairStrong }} />
            {/* now line */}
            <div style={{ position: "absolute", top: 0, bottom: 22, width: 1, background: COLOR.amber, left: `${rail.nowPct}%` }} />
            <div style={{ position: "absolute", top: -2, transform: "translateX(-50%)", ...mono(9, COLOR.amber), letterSpacing: "0.14em", fontWeight: 600, background: COLOR.surfaceWell, padding: "0 5px", left: `${rail.nowPct}%` }}>NOW</div>
            {/* markers — lane sets vertical position (collision), relevance sets weight/brightness */}
            {rail.markers.map(({ congress, leftPct, lane }) => {
              const st = congressState(congress, now);
              const rel = relevanceFor(congress, TA_SLUG);
              const bright = rel === "high";
              const labelBottom = lane === 0 ? 60 : 88;   // two lanes
              const lineHeight = labelBottom - 38;         // connect dot up to the label
              return (
                <div key={congress.slug} style={{ position: "absolute", bottom: 0, left: `${leftPct}%` }}>
                  <div style={{ position: "absolute", bottom: 38, left: 0, width: 1, background: STATE_STYLE[st].dot, height: lineHeight }} />
                  <div style={{ position: "absolute", bottom: 31, left: -3.5, width: 7, height: 7, borderRadius: "50%", background: STATE_STYLE[st].dot }} />
                  <div style={{ position: "absolute", left: 0, transform: "translateX(-50%)", whiteSpace: "nowrap", bottom: labelBottom, ...mono(9.5, bright ? COLOR.ink1 : COLOR.ink4), letterSpacing: "0.08em", fontWeight: bright ? 600 : 400 }}>{congress.short_name}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── list ── */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "220px 150px 190px 90px 130px 1fr 96px", gap: 14, padding: "0 12px 8px", ...mono(9, COLOR.ink5), letterSpacing: "0.13em", fontWeight: 500, borderBottom: `1px solid ${COLOR.hairStrong}` }}>
            <div>CONGRESS</div><div>DATES</div><div>LOCATION</div><div>COUNTDOWN</div><div>TA RELEVANCE</div><div>SOCIAL SIGNAL</div><div style={{ textAlign: "right" }}>EXPERTS</div>
          </div>
          {groups.map((g) => (
            <div key={g.key}>
              <div style={{ padding: "18px 12px 8px", ...mono(10, g.key === "live" || g.key === "imminent" ? COLOR.amber : COLOR.ink4), letterSpacing: "0.16em", fontWeight: 600 }}>{g.title}</div>
              {g.congresses.map((c) => {
                const st = congressState(c, now);
                const rel = relevanceFor(c, TA_SLUG);
                const confirmed = confirmedBySlug[c.slug];
                const hasAbstracts = !!c.abstract_source;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => navigate(`/congress/${c.slug}`)}
                    style={{
                      display: "grid", gridTemplateColumns: "220px 150px 190px 90px 130px 1fr 96px", gap: 14,
                      alignItems: "center", padding: "13px 12px", width: "100%", textAlign: "left",
                      background: "none", border: "none", borderBottom: `1px solid ${COLOR.hair}`,
                      borderLeft: `2px solid ${STATE_STYLE[st].dot}`, cursor: "pointer",
                      opacity: ROW_OPACITY[st],
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
                    {/* Social signal — honest empty state until the social increment wires it.
                        Congresses with no captured posts show nothing rather than an estimate. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 110, height: 1, background: COLOR.hairStrong }} />
                      <div style={mono(10, COLOR.ink5)}>no captured posts</div>
                    </div>
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

        {/* footer — Design copy, verbatim */}
        <div style={{ padding: "12px 14px", border: `1px solid ${COLOR.hair}`, borderRadius: 6, background: COLOR.surfaceWell, fontFamily: FONT.serif, fontSize: 13.5, lineHeight: 1.6, color: COLOR.ink3 }}>
          Countdowns are to the first day of the meeting. Expert counts are tracked experts showing public activity under the congress hashtag — <span style={{ color: COLOR.ink2 }}>a signal of engagement with the conversation, not a record of attendance.</span> Congresses with no captured posts show nothing rather than an estimate.
        </div>
      </div>
    </AppLayout>
  );
}
