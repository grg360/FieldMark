import { useState } from "react";

const TA_CHIPS = ["Rare Disease", "Oncology", "Immunology", "Hepatology"];

interface IndicationInfo {
  label: string;
  count: number;
}

const INDICATIONS: Record<string, IndicationInfo[]> = {
  "Rare Disease": [
    { label: "All", count: 2034 },
    { label: "Fabry disease", count: 94 },
    { label: "Huntington's", count: 67 },
    { label: "Sickle cell", count: 143 },
    { label: "Gaucher", count: 58 },
    { label: "PKU", count: 41 },
    { label: "Pompe", count: 49 },
  ],
  Oncology: [
    { label: "All", count: 6549 },
    { label: "NSCLC", count: 287 },
    { label: "CAR-T", count: 198 },
    { label: "DLBCL", count: 124 },
    { label: "Melanoma", count: 201 },
    { label: "CLL", count: 156 },
    { label: "AML", count: 178 },
  ],
  Immunology: [
    { label: "All", count: 1204 },
    { label: "Lupus", count: 234 },
    { label: "Crohn's", count: 289 },
    { label: "Myasthenia gravis", count: 78 },
    { label: "Sjögren's", count: 97 },
    { label: "CIDP", count: 61 },
  ],
  Hepatology: [
    { label: "All", count: 2753 },
    { label: "PBC", count: 134 },
    { label: "NASH", count: 247 },
    { label: "PSC", count: 71 },
    { label: "AIH", count: 98 },
    { label: "HCC", count: 187 },
  ],
};

interface TAFilterChipsProps {
  selected: string;
  onSelect: (ta: string) => void;
  onIndicationChange: (indication: string, count: number) => void;
}

export default function TAFilterChips({ selected, onSelect, onIndicationChange }: TAFilterChipsProps) {
  const [indicationOpen, setIndicationOpen] = useState(false);
  const [selectedIndication, setSelectedIndication] = useState("All");

  function handleTAClick(chip: string) {
    if (chip === "Immunology") return;
    if (chip === selected) {
      setIndicationOpen((prev) => !prev);
    } else {
      onSelect(chip);
      setSelectedIndication("All");
      setIndicationOpen(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIndicationOpen(true));
      });
      const all = INDICATIONS[chip]?.[0];
      if (all) onIndicationChange("All", all.count);
    }
  }

  function handleIndicationClick(info: IndicationInfo) {
    setSelectedIndication(info.label);
    onIndicationChange(info.label, info.count);
  }

  const indications = INDICATIONS[selected] ?? [];

  return (
    <div>
      {/* TA chip row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          padding: "12px 16px 12px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {TA_CHIPS.map((chip) => {
          const isSelected = chip === selected;
          const isImmunology = chip === "Immunology";
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
                cursor: isImmunology ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                background: isSelected && !isImmunology ? "#1A1A1E" : "transparent",
                border: isImmunology ? "1px solid #1E1E22" : isSelected ? "1px solid #E8A020" : "1px solid #16161A",
                color: isImmunology ? "#3A3A3F" : isSelected ? "#E8A020" : "#3A3A3F",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: 4,
                pointerEvents: isImmunology ? "none" : "auto",
              }}
            >
              {chip}
              {isSelected && !isImmunology && (
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="none"
                  style={{
                    transition: "transform 0.15s ease",
                    transform: indicationOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <path d="M1 2l3 3 3-3" stroke="#E8A020" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {/* Indication row */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: indicationOpen ? 60 : 0,
          transition: "max-height 0.15s ease-out",
        }}
      >
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
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#3A3A3F",
              flexShrink: 0,
              alignSelf: "center",
              marginRight: 2,
            }}
          >
            indication
          </span>
          {indications.map((info) => {
            const isSelected = info.label === selectedIndication;
            return (
              <button
                key={info.label}
                onClick={() => handleIndicationClick(info)}
                className="fm-indication-chip"
                style={{
                  flexShrink: 0,
                  padding: "4px 12px",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "system-ui, sans-serif",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  background: isSelected ? "#0D0D0A" : "transparent",
                  border: isSelected ? "1px solid #E8A020" : "1px solid #1E1E22",
                  color: isSelected ? "#E8A020" : "#6B6A65",
                  transition: "all 0.15s ease",
                }}
              >
                {info.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
