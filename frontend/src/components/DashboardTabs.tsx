import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTrack, type Track } from "../lib/TrackContext";
import {
  buildFeedPath,
  resolveFeedRoute,
  trackToDashboardSlug,
} from "../lib/routeSlugs";

const DASHBOARDS: { value: Track; label: string }[] = [
  { value: "established", label: "Established" },
  { value: "community", label: "Community" },
  { value: "rising-stars", label: "Rising Stars" },
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
        gap: 0,
        margin: "8px 16px 8px",
        padding: 2,
        backgroundColor: "#0D0D10",
        border: "1px solid #1E1E22",
        borderRadius: 4,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {DASHBOARDS.map((t) => {
        const active = t.value === track;
        const isSocial = t.value === "social";
        const isFieldIntel = t.value === "field-intelligence";
        const isTelescope = t.value === "telescope";

        let activeBg = "transparent";
        let activeFg = "#6B6A65";
        let activeBorder = "none";

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
            activeBg = "#E8A020";
            activeFg = "#0A0A0B";
          }
        }

        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => handleDashboardClick(t.value)}
            style={{
              flex: "1 0 auto",
              minWidth: 0,
              padding: "8px 6px",
              minHeight: 36,
              backgroundColor: activeBg,
              border: activeBorder,
              borderRadius: 3,
              color: activeFg,
              fontWeight: active ? 600 : 400,
              fontSize: 12,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              transition: "background-color 120ms, color 120ms",
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
