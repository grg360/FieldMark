import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  buildFeedPath,
  indicationLabelToSlug,
  resolveFeedRoute,
} from "../lib/routeSlugs";

export interface IndicationOption {
  label: string;
  active: boolean;
  count?: number;
  taId?: string;
}

export const INDICATIONS_BY_TA: Record<string, IndicationOption[]> = {
  Oncology: [
    { label: "All", active: true, count: 6549 },
    { label: "NSCLC", active: true, count: 287 },
    { label: "CAR-T", active: false },
    { label: "DLBCL", active: false },
    { label: "Melanoma", active: false },
    { label: "CLL", active: false },
    { label: "AML", active: false },
    { label: "Breast", active: false },
    { label: "Prostate", active: false },
    { label: "Colorectal", active: false },
    { label: "Bladder", active: false },
    { label: "Ovarian", active: false },
    { label: "Kidney", active: false },
    { label: "Pancreatic", active: false },
    { label: "Liver/HCC", active: false },
  ],
  Hepatology: [
    { label: "All", active: true, count: 2753 },
    { label: "MASH", active: true, count: 247 },
    { label: "PBC", active: true, count: 134 },
    { label: "HCC", active: false },
    { label: "Autoimmune Hepatitis", active: false },
    { label: "NAFLD", active: false },
  ],
  "Rare Disease": [
    { label: "All", active: true, count: 2034 },
    { label: "Fabry Disease", active: false },
    { label: "Pompe Disease", active: false },
    { label: "Gaucher Disease", active: false },
    { label: "ALS", active: false },
    { label: "Spinal Muscular Atrophy", active: false },
    { label: "Cystic Fibrosis", active: false },
  ],
  Immunology: [
    { label: "All", active: true, count: 7462, taId: "9e4139d2-e062-4a58-8728-cdabb2d7dca1" },
    { label: "Atopic Dermatitis", active: true, count: 7462, taId: "9e4139d2-e062-4a58-8728-cdabb2d7dca1" },
    { label: "Psoriasis", active: false },
    { label: "Rheumatoid Arthritis", active: false },
    { label: "Crohn's Disease", active: false },
    { label: "Ulcerative Colitis", active: false },
    { label: "Lupus", active: false },
    { label: "Multiple Sclerosis", active: false },
  ],
};

const ONCOLOGY_FI_ACTIVE = new Set(["All", "NSCLC"]);

function indicationsForContext(therapeuticArea: string, isFieldIntelligence: boolean): IndicationOption[] {
  const base = INDICATIONS_BY_TA[therapeuticArea] ?? [{ label: "All", active: true }];
  if (!isFieldIntelligence || therapeuticArea !== "Oncology") {
    return base;
  }
  return base.map((option) => ({
    ...option,
    active: ONCOLOGY_FI_ACTIVE.has(option.label),
  }));
}

interface IndicationFilterProps {
  therapeuticArea: string;
  selected: string;
  onSelect?: (label: string, count: number | null) => void;
}

export default function IndicationFilter({
  therapeuticArea,
  selected,
  onSelect,
}: IndicationFilterProps) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const isFieldIntelligence = location.pathname.includes("/field-intelligence");
  const route = resolveFeedRoute({
    ta: params.ta,
    dashboard: isFieldIntelligence ? "field-intelligence" : params.dashboard,
    indication: isFieldIntelligence ? (params.indication ?? "all") : params.indication,
    isHomePath: location.pathname === "/",
  });
  const indications = indicationsForContext(therapeuticArea, isFieldIntelligence);

  function handleIndicationSelect(label: string, count: number | null) {
    onSelect?.(label, count);
    const indicationSlug = indicationLabelToSlug(therapeuticArea, label);
    if (isFieldIntelligence) {
      if (indicationSlug === "all") {
        navigate(`/${route.taSlug}/field-intelligence`);
      } else {
        navigate(`/${route.taSlug}/field-intelligence/${indicationSlug}`);
      }
      return;
    }
    navigate(buildFeedPath(route.taSlug, route.dashboardSlug, indicationSlug));
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        overflowX: "auto",
        padding: "0 16px 12px",
        gap: 8,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {indications.map((info) => {
        const isSelected = info.label === selected;
        if (!info.active) {
          if (isFieldIntelligence) {
            return (
              <span
                key={info.label}
                className="fm-indication-chip"
                style={{
                  flexShrink: 0,
                  padding: "6px 12px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: "system-ui, sans-serif",
                  whiteSpace: "nowrap",
                  background: "transparent",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  color: "rgba(232, 230, 223, 0.3)",
                  cursor: "not-allowed",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {info.label}
              </span>
            );
          }

          return (
            <button
              key={info.label}
              type="button"
              onClick={() => handleIndicationSelect(info.label, null)}
              className="fm-indication-chip"
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "system-ui, sans-serif",
                whiteSpace: "nowrap",
                background: isSelected ? "rgba(255, 255, 255, 0.04)" : "transparent",
                border: isSelected
                  ? "1px solid rgba(255, 255, 255, 0.12)"
                  : "1px solid rgba(255, 255, 255, 0.06)",
                color: isSelected ? "rgba(232, 230, 223, 0.45)" : "rgba(232, 230, 223, 0.3)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              {info.label}
            </button>
          );
        }

        return (
          <button
            key={info.label}
            type="button"
            onClick={() => handleIndicationSelect(info.label, info.count ?? null)}
            className="fm-indication-chip"
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 4,
              fontSize: 12,
              fontFamily: "system-ui, sans-serif",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: isSelected ? "rgba(120, 200, 255, 0.12)" : "transparent",
              border: isSelected
                ? "1px solid rgba(120, 200, 255, 0.4)"
                : "1px solid #1E1E22",
              color: isSelected ? "rgba(120, 200, 255, 1)" : "#6B6A65",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
            }}
          >
            {info.label}
          </button>
        );
      })}
    </div>
  );
}
