import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  buildFeedPath,
  resolveFeedRoute,
  resolveIndicationForTaSwitch,
  taLabelToSlug,
  trackToDashboardSlug,
} from "../lib/routeSlugs";
import { useTA } from "../lib/TAContext";

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
  const { setTA } = useTA();
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
    // Phase 1a: track the user's selection in TAContext alongside routing (routing
    // stays authoritative; no consumer reads the context yet).
    setTA(newTaSlug, indicationSlug);
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
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 14,
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              cursor: "pointer",
              whiteSpace: "nowrap",
              // Selection → indigo (§5: amber stays scarce for the score numeral / brand); idle → warm ghost.
              background: isSelected ? "rgba(85,102,232,0.12)" : "transparent",
              border: isSelected ? "1px solid rgba(85,102,232,0.50)" : "1px solid rgba(255,255,255,0.08)",
              color: isSelected ? "#AEB4F5" : "#8f8b83",
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
