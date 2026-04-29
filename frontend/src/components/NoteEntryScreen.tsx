import { useState } from "react";
import { HCP } from "../data/hcpData";

interface NoteEntryScreenProps {
  hcp: HCP;
  onBack: () => void;
}

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const INTERACTION_TYPES = [
  "Abstract — late breaking",
  "Abstract — poster",
  "Invited speaker — major congress",
  "Invited speaker — regional",
  "Publication discussion — proactive",
  "Publication discussion — HCP initiated",
  "Trial — principal investigator",
  "Trial — site investigator",
  "Peer nomination",
  "Advisory board",
];

const INDICATIONS_BY_TA: Record<string, string[]> = {
  Oncology: ["NSCLC", "CAR-T", "DLBCL", "Melanoma", "CLL", "AML", "Other"],
  "Rare Disease": ["Fabry disease", "Huntington's", "Sickle cell", "Gaucher", "PKU", "Pompe", "Other"],
  Immunology: ["Lupus", "Crohn's", "Myasthenia gravis", "Sjögren's", "CIDP", "Other"],
  Hepatology: ["PBC", "NASH", "PSC", "AIH", "HCC", "Other"],
};

export default function NoteEntryScreen({ hcp, onBack }: NoteEntryScreenProps) {
  const [interactionType, setInteractionType] = useState<string | null>(null);
  const [evidenceQuality, setEvidenceQuality] = useState<string | null>(null);
  const [indication, setIndication] = useState<string | null>(null);

  const canSubmit = !!(interactionType && evidenceQuality && indication);
  const taIndications = INDICATIONS_BY_TA[hcp.specialty] ?? [];

  return (
    <div className="fm-screen" style={{ backgroundColor: "#0A0A0B", minHeight: "100dvh", maxWidth: 480, margin: "0 auto" }}>
      {/* Nav bar */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            padding: 4,
          }}
        >
          <BackArrow />
          <span style={{ fontSize: 13, color: "#6B6A65" }}>{hcp.name}</span>
        </button>
      </div>

      <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* Form header */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1E1E22" }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginBottom: 4 }}>Add field note</div>
          <div style={{ fontSize: 12, color: "#6B6A65" }}>Anonymous · verified contributor</div>
        </div>

        <div style={{ padding: "16px 16px 32px" }}>
          {/* Field 1: Interaction type */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Interaction type
            </div>
            <div className="fm-note-interaction-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {INTERACTION_TYPES.map((option) => {
                const isSelected = interactionType === option;
                return (
                  <button
                    key={option}
                    onClick={() => setInteractionType(option)}
                    style={{
                      backgroundColor: isSelected ? "#0D0D0A" : "#0D0D10",
                      border: isSelected ? "1px solid #E8A020" : "1px solid #1E1E22",
                      color: isSelected ? "#E8A020" : "#9B9892",
                      fontSize: 12,
                      padding: "12px",
                      borderRadius: 4,
                      cursor: "pointer",
                      textAlign: "center",
                      lineHeight: 1.4,
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 2: Evidence quality */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Evidence quality
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Strong signal", "Moderate", "Early indicator"] as const).map((option) => {
                const isSelected = evidenceQuality === option;
                let bgColor = "#0D0D10";
                let borderColor = "#1E1E22";
                let textColor = "#6B6A65";
                if (isSelected) {
                  if (option === "Strong signal") { bgColor = "#0A1F16"; borderColor = "#1D9E75"; textColor = "#1D9E75"; }
                  else if (option === "Moderate") { bgColor = "#1A1200"; borderColor = "#E8A020"; textColor = "#E8A020"; }
                  else { bgColor = "#1A0A0A"; borderColor = "#7B2020"; textColor = "#E05555"; }
                }
                return (
                  <button
                    key={option}
                    onClick={() => setEvidenceQuality(option)}
                    style={{
                      flex: 1,
                      backgroundColor: bgColor,
                      border: `1px solid ${borderColor}`,
                      color: textColor,
                      fontSize: 12,
                      padding: "8px 0",
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 3: Therapeutic focus */}
          <div style={{ marginBottom: 20 }}>
            {/* Element A: TA display */}
            <div style={{ fontSize: 11, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Therapeutic area
            </div>
            <div
              style={{
                display: "inline-block",
                backgroundColor: "#1A1200",
                border: "1px solid #E8A020",
                borderRadius: 3,
                padding: "6px 12px",
                fontSize: 12,
                color: "#E8A020",
              }}
            >
              {hcp.specialty}
            </div>

            {/* Element B: Indication selector */}
            <div style={{ fontSize: 11, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 12, marginBottom: 8 }}>
              Indication
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                paddingBottom: 2,
              }}
            >
              {taIndications.map((chip) => {
                const isSelected = indication === chip;
                return (
                  <button
                    key={chip}
                    onClick={() => setIndication(chip)}
                    style={{
                      flexShrink: 0,
                      backgroundColor: isSelected ? "#0D0D0A" : "#0D0D10",
                      border: isSelected ? "1px solid #E8A020" : "1px solid #1E1E22",
                      color: isSelected ? "#E8A020" : "#6B6A65",
                      borderRadius: 3,
                      padding: "6px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Field 4: Date observed */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: "#6B6A65", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Date observed
            </div>
            <div
              style={{
                backgroundColor: "#0D0D10",
                border: "1px solid #1E1E22",
                borderRadius: 4,
                padding: "8px 12px",
                fontSize: 13,
                color: "#E8E6DF",
                fontFamily: "monospace",
              }}
            >
              {today}
            </div>
          </div>

          {/* Submit button */}
          <button
            onClick={() => {}}
            disabled={!canSubmit}
            className="fm-note-submit-btn"
            style={{
              width: "100%",
              height: 44,
              backgroundColor: "#0A1F16",
              border: "1px solid #1D9E75",
              color: "#1D9E75",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 4,
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.4,
            }}
          >
            Submit note
          </button>

          <div style={{ fontSize: 11, color: "#3A3A3F", textAlign: "center", marginTop: 8 }}>
            Contribution logged anonymously. Your MSL identity is verified but never exposed.
          </div>
        </div>
      </div>
    </div>
  );
}
