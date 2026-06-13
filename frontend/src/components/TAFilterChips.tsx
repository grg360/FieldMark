import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  buildFeedPath,
  resolveFeedRoute,
  resolveIndicationForTaSwitch,
  taLabelToSlug,
  trackToDashboardSlug,
} from "../lib/routeSlugs";

const TA_CHIPS = ["Oncology", "Hepatology", "Immunology", "Rare Disease"];

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
    if (chip === "Immunology") return;
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
        const isImmunology = chip === "Immunology";
        return (
          <button
            key={chip}
            onClick={isImmunology ? undefined : () => handleTAClick(chip)}
            className="fm-ta-chip"
            disabled={isImmunology}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 4,
              fontSize: 14,
              fontFamily: "system-ui, sans-serif",
              cursor: isImmunology ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              background: isImmunology ? "#0A0A0B" : isSelected ? "#1A1A1E" : "transparent",
              border: isImmunology ? "1px solid #1E1E22" : isSelected ? "1px solid #E8A020" : "1px solid #16161A",
              color: isImmunology ? "#6B6A65" : isSelected ? "#E8A020" : "#3A3A3F",
              transition: "all 0.15s ease",
              opacity: isImmunology ? 0.5 : 1,
            }}
          >
            {chip}
          </button>
        );
      })}
    </div>
  );
}
