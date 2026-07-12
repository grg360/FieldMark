import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  buildFeedPath,
  resolveFeedRoute,
  resolveIndicationForTaSwitch,
  taLabelToSlug,
  trackToDashboardSlug,
} from "../lib/routeSlugs";

// Hepatology and Rare Disease parent tiles retired (2026-07-11): their cohort feeds
// read hcp_*_ranks_v3, which has no hepatology/rare-disease rows, so the tiles
// advertised counts (from the v2 scores tables) against empty feeds. Presentation-
// layer suppression only — no data deleted. See docs/VERSION_CONSISTENCY_AUDIT.md.
const TA_CHIPS = ["Oncology", "Immunology"];

interface TAFilterChipsProps {
  selected: string;
  onSelect?: (ta: string) => void;
}

export default function TAFilterChips({ selected, onSelect }: TAFilterChipsProps) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const route = resolveFeedRoute({
    ta: params.ta,
    dashboard: params.dashboard,
    indication: params.indication,
    isHomePath: location.pathname === "/",
  });

  function handleTAClick(chip: string) {
    if (chip === selected) return;
    onSelect?.(chip);
    const newTaSlug = taLabelToSlug(chip);
    const { slug: indicationSlug } = resolveIndicationForTaSwitch(
      chip,
      route.indicationLabel,
    );
    const dashboardSlug =
      route.dashboardSlug === "field-intelligence"
        ? trackToDashboardSlug("established")
        : route.dashboardSlug;
    navigate(buildFeedPath(newTaSlug, dashboardSlug, indicationSlug));
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "12px 16px 12px",
      }}
    >
      {TA_CHIPS.map((chip) => {
        const isSelected = chip === selected;
        return (
          <button
            key={chip}
            onClick={() => handleTAClick(chip)}
            className="fm-ta-chip"
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 4,
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: isSelected ? "#1A1A1E" : "transparent",
              border: isSelected ? "1px solid #E8A020" : "1px solid #16161A",
              color: isSelected ? "#E8A020" : "#3A3A3F",
              transition: "all 0.15s ease",
              opacity: 1,
            }}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
