import { useState } from "react";

interface TASelectionScreenProps {
  onContinue: (ta: string) => void;
  onSkip: () => void;
}

const taOptions = [
  {
    name: "Rare Disease",
    descriptor: "Ultra-orphan and orphan conditions",
    count: "2,034 rising stars",
    darkHorses: "40 dark horses",
  },
  {
    name: "Oncology",
    descriptor: "Solid tumors, hematologic malignancies, immunotherapy",
    count: "6,549 rising stars",
    darkHorses: "40 dark horses",
  },
  {
    name: "Immunology",
    descriptor: "Autoimmune, inflammatory, and allergic conditions",
    count: "Pipeline launching Q3 2026",
    darkHorses: "",
  },
  {
    name: "Hepatology",
    descriptor: "Liver disease, cholestatic and metabolic conditions",
    count: "2,753 rising stars",
    darkHorses: "40 dark horses",
  },
];

function TASelectionScreen({ onContinue, onSkip }: TASelectionScreenProps) {
  const [selected, setSelected] = useState<string | null>(null);

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
        <div style={{ fontSize: 18, fontWeight: 500, color: "#E8E6DF" }}>Your therapeutic area</div>
        <div
          style={{
            fontSize: 13,
            color: "#6B6A65",
            lineHeight: 1.5,
            marginTop: 8,
          }}
        >
          We'll surface rising stars here by default. Change anytime.
        </div>

        {/* TA option cards */}
        <div
          className="fm-ta-cards-grid"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 32,
          }}
        >
          {taOptions.map((ta) => {
            const isSelected = selected === ta.name;
            const isImmunology = ta.name === "Immunology";
            return (
              <button
                key={ta.name}
                onClick={() => {
                  if (!isImmunology) setSelected(ta.name);
                }}
                className="fm-ta-card"
                style={{
                  width: "100%",
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
                    fontSize: 15,
                    fontWeight: 500,
                    color: isImmunology ? "#6B6A65" : isSelected ? "#E8A020" : "#E8E6DF",
                  }}
                >
                  {ta.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6B6A65",
                    marginTop: 4,
                  }}
                >
                  {ta.descriptor}
                </div>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {isImmunology ? (
                    <span style={{ fontSize: 11, color: "#3A3A3F" }}>{ta.count}</span>
                  ) : (
                    <>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 11,
                          fontFamily: "monospace",
                          backgroundColor: "#1A1200",
                          border: "1px solid #E8A020",
                          color: "#E8A020",
                          padding: "2px 8px",
                          borderRadius: 3,
                        }}
                      >
                        {ta.count}
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontFamily: "monospace",
                          backgroundColor: "#0D0A1A",
                          border: "1px solid #9B6DFF",
                          color: "#9B6DFF",
                          padding: "2px 8px",
                          borderRadius: 3,
                        }}
                      >
                        <span style={{ fontSize: 10 }}>♞</span>
                        {ta.darkHorses}
                      </span>
                    </>
                  )}
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
          {selected ? "Continue to FieldMark" : "Select a therapeutic area"}
        </button>
      </div>
    </div>
  );
}


export default TASelectionScreen