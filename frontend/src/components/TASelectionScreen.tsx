import { useEffect, useState } from "react";
import { getAllTACounts } from "../lib/api";
import type { TACounts } from "../lib/types";

interface TASelectionScreenProps {
  onContinue: (ta: string) => void;
  onSkip: () => void;
}

const taOptions = [
  {
    name: "Rare Disease",
    descriptor: "Ultra-orphan and orphan conditions",
  },
  {
    name: "Oncology",
    descriptor: "Solid tumors, hematologic malignancies, immunotherapy",
  },
  {
    name: "Hepatology",
    descriptor: "Liver disease, cholestatic and metabolic conditions",
  },
  {
    name: "Immunology",
    descriptor: "Autoimmune, inflammatory, and allergic conditions",
  },
];

function getSlugForTAName(name: string): string {
  if (name === "Rare Disease") return "rare-disease";
  if (name === "Oncology") return "nsclc";
  if (name === "Hepatology") return "hepatology";
  if (name === "Immunology") return "immunology";
  return "rare-disease";
}

function CohortChip({
  icon,
  label,
  borderColor,
  backgroundColor,
  color,
}: {
  icon: string;
  label: string;
  borderColor: string;
  backgroundColor: string;
  color: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        boxSizing: "border-box",
        fontSize: 11,
        fontFamily: "monospace",
        backgroundColor,
        border: `1px solid ${borderColor}`,
        color,
        padding: "2px 8px",
        borderRadius: 3,
      }}
    >
      <span style={{ fontSize: 10, color }}>{icon}</span>
      {label}
    </span>
  );
}

function TASelectionScreen({ onContinue, onSkip }: TASelectionScreenProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, TACounts>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      const { data } = await getAllTACounts();
      if (cancelled) return;
      setCounts(data ?? {});
    }

    loadCounts();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Nav bar */}
      <div
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 16px",
        }}
      >
        <button
          onClick={onSkip}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "#3A3A3F",
          }}
        >
          Skip
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 24px 32px" }}>
        {/* Header */}
        <div style={{ fontSize: 18, fontWeight: 500, color: "#E8E6DF" }}>Select Your Therapeutic Area:</div>

        {/* TA option cards */}
        <div
          className="fm-ta-cards-grid"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 20,
          }}
        >
          {taOptions.map((ta) => {
            const isSelected = selected === ta.name;
            const isImmunology = ta.name === "Immunology";
            const taCounts = counts[getSlugForTAName(ta.name)];
            const fmt = (n: number | undefined) =>
              taCounts != null && n != null ? n.toLocaleString() : "—";
            return (
              <button
                key={ta.name}
                onClick={() => {
                  if (!isImmunology) setSelected(ta.name);
                }}
                className="fm-ta-card"
                style={{
                  width: "100%",
                  height: "100%",
                  alignSelf: "stretch",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 4,
                  padding: 16,
                  border: isImmunology ? "1px solid #1E1E22" : isSelected ? "1px solid #E8A020" : "1px solid #1E1E22",
                  backgroundColor: isSelected && !isImmunology ? "#0D0D0A" : "#111113",
                  cursor: isImmunology ? "not-allowed" : "pointer",
                  textAlign: "left",
                  color: "inherit",
                  pointerEvents: isImmunology ? "none" : "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: isImmunology ? "#E8E6DF" : isSelected ? "#E8A020" : "#E8E6DF",
                    }}
                  >
                    {ta.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6B6A65",
                      marginTop: 4,
                      minHeight: 32,
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {ta.descriptor}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      alignItems: "stretch",
                      width: "100%",
                      flex: isImmunology ? 1 : undefined,
                      minHeight: isImmunology ? 0 : undefined,
                    }}
                  >
                    {isImmunology ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          flex: 1,
                          minHeight: 0,
                          width: "100%",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: 11,
                            fontFamily: "monospace",
                            textTransform: "uppercase",
                            backgroundColor: "#1F0D0D",
                            border: "1px solid #D44A4A",
                            color: "#D44A4A",
                            padding: "2px 8px",
                            borderRadius: 3,
                          }}
                        >
                          COMING SOON
                        </span>
                        <span
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            fontFamily: "monospace",
                            color: "#6B6A65",
                          }}
                        >
                          Fall 2026
                        </span>
                        <div aria-hidden style={{ flex: 1, minHeight: 1, width: "100%" }} />
                      </div>
                    ) : (
                      <>
                        <CohortChip
                          icon="★"
                          label={`${fmt(taCounts?.rising_stars)} rising stars`}
                          borderColor="#FFB84D"
                          backgroundColor="#1A1200"
                          color="#FFB84D"
                        />
                        <CohortChip
                          icon="▲"
                          label={`${fmt(taCounts?.established)} established`}
                          borderColor="#FFD700"
                          backgroundColor="#1A1800"
                          color="#FFD700"
                        />
                        <CohortChip
                          icon="◆"
                          label={`${fmt(taCounts?.community_pool)} community`}
                          borderColor="#7B9EBD"
                          backgroundColor="#0A121A"
                          color="#7B9EBD"
                        />
                        <CohortChip
                          icon="✓"
                          label={`${fmt(taCounts?.verified_dols)} verified DOLs`}
                          borderColor="#4ECDC4"
                          backgroundColor="#0A1A18"
                          color="#4ECDC4"
                        />
                        <CohortChip
                          icon="#"
                          label={`${fmt(taCounts?.total_hcps)} total HCPs`}
                          borderColor="#6B6A65"
                          backgroundColor="#141413"
                          color="#6B6A65"
                        />
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Continue button */}
        <button
          onClick={selected ? () => onContinue(selected) : undefined}
          disabled={!selected}
          className="fm-ta-continue-btn"
          style={{
            width: "100%",
            height: 48,
            borderRadius: 4,
            marginTop: 32,
            backgroundColor: selected ? "#0A1F16" : "#0D0D10",
            border: selected ? "1px solid #1D9E75" : "1px solid #1E1E22",
            color: selected ? "#1D9E75" : "#3A3A3F",
            fontSize: 14,
            fontWeight: selected ? 500 : 400,
            cursor: selected ? "pointer" : "not-allowed",
          }}
        >
          {selected ? "Continue to FieldMark" : "Select a Therapeutic Area"}
        </button>
      </div>
    </div>
  );
}


export default TASelectionScreen