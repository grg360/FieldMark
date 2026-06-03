const TA_CHIPS = ["Oncology", "Hepatology", "Immunology", "Rare Disease"];

interface TAFilterChipsProps {
  selected: string;
  onSelect: (ta: string) => void;
}

export default function TAFilterChips({ selected, onSelect }: TAFilterChipsProps) {
  function handleTAClick(chip: string) {
    if (chip === "Immunology") return;
    if (chip !== selected) {
      onSelect(chip);
    }
  }

  return (
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
