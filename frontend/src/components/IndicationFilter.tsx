import { useLocation, useNavigate, useParams } from "react-router-dom";
import { buildFeedPath, resolveFeedRoute } from "../lib/routeSlugs";
import { useTA } from "../lib/TAContext";

// DECOUPLED 2026-08-15. `label` used to be the identity AND the display string,
// so renaming NSCLC -> Lung Cancer silently broke every label-keyed lookup: the
// reverse map's key moved, callers kept passing the old string, and the misses
// fell through to "all". `slug` is the identity now - stable, matches the URL
// segment and routeSlugs' slug->label maps. Same shape as AdministeredVolumeBlock's
// AgentBadge + BADGE_LABEL: the value never moves, the label is free to.
export interface IndicationOption {
  /** Stable identity. Every lookup, comparison and route build keys on THIS. */
  slug: string;
  /** Display only. Nothing dispatches on it - rename freely. */
  label: string;
  active: boolean;
  count?: number;
  taId?: string;
}

export const INDICATIONS_BY_TA: Record<string, IndicationOption[]> = {
  Oncology: [
    { slug: "all", label: "All", active: true, count: 6549 },
    { slug: "nsclc", label: "Lung Cancer", active: true, count: 287 },
    { slug: "car-t", label: "CAR-T", active: false },
    { slug: "dlbcl", label: "DLBCL", active: false },
    { slug: "melanoma", label: "Melanoma", active: false },
    { slug: "cll", label: "CLL", active: false },
    { slug: "aml", label: "AML", active: false },
    { slug: "breast", label: "Breast", active: false },
    { slug: "prostate", label: "Prostate", active: false },
    // taId is REQUIRED here, not decoration. getEstablished/getCommunity/getRisingStars
    // do `filters.taId ?? TA_ID_MAP[taSlug]`, and taSlug for Oncology is hardcoded
    // "nsclc" (taLabelToApiSlug) - so an active option with no taId serves LUNG rows
    // under a colorectal chip. Same shape as atopic-dermatitis below.
    { slug: "colorectal-cancer", label: "Colorectal Cancer", active: true, taId: "a2b28e54-0e0e-48a7-98e1-504f48e45d81" },
    { slug: "bladder", label: "Bladder", active: false },
    { slug: "ovarian", label: "Ovarian", active: false },
    { slug: "kidney", label: "Kidney", active: false },
    { slug: "pancreatic", label: "Pancreatic", active: false },
    { slug: "liver-hcc", label: "Liver/HCC", active: false },
  ],
  Hepatology: [
    { slug: "all", label: "All", active: true, count: 2753 },
    { slug: "mash", label: "MASH", active: true, count: 247 },
    { slug: "pbc", label: "PBC", active: true, count: 134 },
    { slug: "hcc", label: "HCC", active: false },
    { slug: "autoimmune-hepatitis", label: "Autoimmune Hepatitis", active: false },
    { slug: "nafld", label: "NAFLD", active: false },
  ],
  "Rare Disease": [
    { slug: "all", label: "All", active: true, count: 2034 },
    { slug: "fabry-disease", label: "Fabry Disease", active: false },
    { slug: "pompe-disease", label: "Pompe Disease", active: false },
    { slug: "gaucher-disease", label: "Gaucher Disease", active: false },
    { slug: "als", label: "ALS", active: false },
    { slug: "sma", label: "Spinal Muscular Atrophy", active: false },
    { slug: "cystic-fibrosis", label: "Cystic Fibrosis", active: false },
  ],
  Immunology: [
    { slug: "all", label: "All", active: true, count: 7462, taId: "9e4139d2-e062-4a58-8728-cdabb2d7dca1" },
    { slug: "atopic-dermatitis", label: "Atopic Dermatitis", active: true, count: 7462, taId: "9e4139d2-e062-4a58-8728-cdabb2d7dca1" },
    { slug: "psoriasis", label: "Psoriasis", active: false },
    { slug: "rheumatoid-arthritis", label: "Rheumatoid Arthritis", active: false },
    { slug: "crohns", label: "Crohn's Disease", active: false },
    { slug: "ulcerative-colitis", label: "Ulcerative Colitis", active: false },
    { slug: "lupus", label: "Lupus", active: false },
    { slug: "multiple-sclerosis", label: "Multiple Sclerosis", active: false },
  ],
};

// Slugs, never labels. This is a SECOND gate on top of each option's `active`
// flag: a slug missing here renders as an inert, unexplained grey chip on
// /field-intelligence even when the option is active everywhere else. Keep it in
// step with the active entries above.
const ONCOLOGY_FI_ACTIVE = new Set(["all", "nsclc", "colorectal-cancer"]);

function indicationsForContext(therapeuticArea: string, isFieldIntelligence: boolean): IndicationOption[] {
  const base = INDICATIONS_BY_TA[therapeuticArea] ?? [{ label: "All", active: true }];
  if (!isFieldIntelligence || therapeuticArea !== "Oncology") {
    return base;
  }
  return base.map((option) => ({
    ...option,
    active: ONCOLOGY_FI_ACTIVE.has(option.slug),
  }));
}

interface IndicationFilterProps {
  therapeuticArea: string;
  /** The selected SLUG, not the label - identity comparisons key on slug. */
  selectedSlug: string;
  onSelect?: (slug: string, count: number | null) => void;
}

export default function IndicationFilter({
  therapeuticArea,
  selectedSlug,
  onSelect,
}: IndicationFilterProps) {
  const navigate = useNavigate();
  const { setTA } = useTA();
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

  function handleIndicationSelect(indicationSlug: string, count: number | null) {
    onSelect?.(indicationSlug, count);
    // Phase 1a: track the user's indication selection in TAContext alongside routing.
    setTA(route.taSlug, indicationSlug);
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
        const isSelected = info.slug === selectedSlug;
        if (!info.active) {
          if (isFieldIntelligence) {
            return (
              <span
                key={info.slug}
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
              key={info.slug}
              type="button"
              onClick={() => handleIndicationSelect(info.slug, null)}
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
            key={info.slug}
            type="button"
            onClick={() => handleIndicationSelect(info.slug, info.count ?? null)}
            className="fm-indication-chip"
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              cursor: "pointer",
              whiteSpace: "nowrap",
              // Active indication selection → indigo (§5); idle → warm ghost.
              background: isSelected ? "rgba(85,102,232,0.12)" : "transparent",
              border: isSelected
                ? "1px solid rgba(85,102,232,0.50)"
                : "1px solid rgba(255,255,255,0.08)",
              color: isSelected ? "#AEB4F5" : "#8f8b83",
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
