import { useLocation, useNavigate, useParams } from "react-router-dom";
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
  { value: "telescope", label: "Telescope" },
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
    if (nextTrack === track) return;
    setTrack(nextTrack);
    const dashboardSlug = trackToDashboardSlug(nextTrack);
    if (nextTrack === "field-intelligence") {
      navigate(`/${route.taSlug}/field-intelligence`);
      return;
    }
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
      {DASHBOARDS.map((t) => {
        const active = t.value === track;
        const isSocial = t.value === "social";
        const isFieldIntel = t.value === "field-intelligence";
        const isTelescope = t.value === "telescope";

        // Idle → warm ghost chip; active states set below.
        let activeBg = "transparent";
        let activeFg = "#8f8b83";
        let activeBorder = "1px solid rgba(255,255,255,0.08)";

        if (active) {
          if (isSocial || isTelescope) {
            activeBg = "#1A2530";
            activeFg = "#6BA3D8";
            activeBorder = "1px solid #2A3848";
          } else if (isFieldIntel) {
            activeBg = "rgba(120, 200, 255, 0.2)";
            activeFg = "rgba(120, 200, 255, 1)";
            activeBorder = "1px solid rgba(120, 200, 255, 0.35)";
          } else {
            // Active cohort → indigo (§5), not amber. Social/telescope/field-intel keep their
            // own semantic blues above.
            activeBg = "rgba(85,102,232,0.12)";
            activeFg = "#AEB4F5";
            activeBorder = "1px solid rgba(85,102,232,0.50)";
          }
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
