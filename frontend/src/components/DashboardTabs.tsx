import { useLocation, useNavigate, useParams } from "react-router-dom";
import { COLOR } from "../lib/designTokens";
import { PULSE_BY_TA } from "../lib/pulseFixture";
import { useTrack, type Track } from "../lib/TrackContext";
import {
  buildFeedPath,
  resolveFeedRoute,
  trackToDashboardSlug,
} from "../lib/routeSlugs";

const DASHBOARDS: { value: Track; label: string }[] = [
  { value: "established", label: "Established" },
  { value: "rising-stars", label: "Rising Stars" },
  { value: "community", label: "Community" },
  { value: "social", label: "Social" },
  { value: "skyview", label: "SkyView" },
  { value: "field-intelligence", label: "Field Intelligence" },
];

export default function DashboardTabs() {
  const { track, setTrack } = useTrack();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const route = resolveFeedRoute({
    ta: params.ta,
    dashboard: params.dashboard,
    indication: params.indication,
    isHomePath: location.pathname === "/",
  });

  function handleDashboardClick(nextTrack: Track) {
    // Field Intelligence is now the anchored-discussion Forum (a real, DB-backed
    // surface), not the old mock in-feed track. Treat the chip as a nav link to
    // the forum index — no setTrack, so returning to the feed never re-opens the
    // superseded mock surface. The forum is oncology-wide, so it is not TA-scoped.
    if (nextTrack === "field-intelligence") {
      navigate("/field-intelligence");
      return;
    }
    if (nextTrack === track) return;
    setTrack(nextTrack);
    const dashboardSlug = trackToDashboardSlug(nextTrack);
    navigate(
      buildFeedPath(route.taSlug, dashboardSlug, route.indicationSlug),
    );
  }

  return (
    <div
      className="fm-track-switch"
      role="tablist"
      aria-label="Select dashboard"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflowX: "auto",
        padding: "8px 16px 12px",
        gap: 8,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {/* Pulse & Congress — navigation links, NOT cohorts. They deliberately read
          different from the cohort chips: amber accent + glyph + a divider before
          the chips, and they never take the indigo active state (clicking
          navigates away rather than filtering this feed).
          Pulse is per-TA: it only renders when the current indication has a
          payload in PULSE_BY_TA, so TAs without a Pulse (e.g. AD) never get a
          dead-end link. Congress is NOT TA-scoped — the calendar shows all
          congresses with TA relevance as a column — so it always renders and
          routes to /congress with no :ta param. */}
      {PULSE_BY_TA[route.indicationSlug] ? (
      <button
        role="tab"
        aria-selected={false}
        onClick={() => navigate(`/pulse/${route.indicationSlug}`)}
        style={{
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          minHeight: 36,
          backgroundColor: "transparent",
          border: "1px solid rgba(232,160,32,0.35)",
          borderRadius: 6,
          color: COLOR.amber,
          fontWeight: 400,
          fontSize: 12,
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background-color 120ms, color 120ms, border-color 120ms",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <polyline
            points="0.5,6 3,6 4.5,2 7,10 8.5,6 11.5,6"
            stroke={COLOR.amber}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Pulse
      </button>
      ) : null}
      <button
        role="tab"
        aria-selected={false}
        onClick={() => navigate("/congress")}
        style={{
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          minHeight: 36,
          backgroundColor: "transparent",
          border: "1px solid rgba(232,160,32,0.35)",
          borderRadius: 6,
          color: COLOR.amber,
          fontWeight: 400,
          fontSize: 12,
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "background-color 120ms, color 120ms, border-color 120ms",
        }}
      >
        {/* calendar glyph */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <rect x="1" y="2.5" width="10" height="8.5" rx="1" stroke={COLOR.amber} strokeWidth="1.2" />
          <line x1="1" y1="5.2" x2="11" y2="5.2" stroke={COLOR.amber} strokeWidth="1.2" />
          <line x1="3.5" y1="1" x2="3.5" y2="3" stroke={COLOR.amber} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="8.5" y1="1" x2="8.5" y2="3" stroke={COLOR.amber} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Congress
      </button>
      <span
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 1,
          height: 20,
          backgroundColor: COLOR.hairStrong,
        }}
      />
      {DASHBOARDS.map((t) => {
        const active = t.value === track;

        // Idle → warm ghost chip; active → indigo selection (§5) for every tab.
        let activeBg = "transparent";
        let activeFg = "#8f8b83";
        let activeBorder = "1px solid rgba(255,255,255,0.08)";

        if (active) {
          activeBg = "rgba(85,102,232,0.12)";
          activeFg = "#AEB4F5";
          activeBorder = "1px solid rgba(85,102,232,0.50)";
        }

        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => handleDashboardClick(t.value)}
            style={{
              flex: "0 0 auto",
              padding: "8px 14px",
              minHeight: 36,
              backgroundColor: activeBg,
              border: activeBorder,
              borderRadius: 6,
              color: activeFg,
              fontWeight: active ? 600 : 400,
              fontSize: 12,
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              cursor: "pointer",
              transition: "background-color 120ms, color 120ms, border-color 120ms",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
