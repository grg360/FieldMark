import { useState, type CSSProperties } from "react";
import { FiChip, FiModal } from "./FieldIntelligenceShared";

const WORTH_TRACKING = [
  "Influential in regional/community network",
  "Sub-specialty depth not reflected in publications",
  "Rising trainee or junior faculty",
  "Active in clinical trials but low-visibility",
  "Emerging speaker or educator",
] as const;

const TA_OPTIONS = ["NSCLC", "Rare Disease", "Hepatology", "Immunology", "Other"] as const;

const MOCK_INSTITUTIONS = [
  "Memorial Sloan Kettering Cancer Center",
  "Dana-Farber Cancer Institute",
  "MD Anderson Cancer Center",
  "Mayo Clinic",
  "UCSF Medical Center",
];

interface SurfaceHCPFormProps {
  onClose: () => void;
  onSubmit: () => void;
}

export default function SurfaceHCPForm({ onClose, onSubmit }: SurfaceHCPFormProps) {
  const [worthTracking, setWorthTracking] = useState<string | null>(null);
  const [institution, setInstitution] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = MOCK_INSTITUTIONS.filter((i) =>
    institution.trim() ? i.toLowerCase().includes(institution.toLowerCase()) : true
  );

  return (
    <FiModal title="Surface a new HCP" onClose={onClose}>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "rgba(232, 230, 223, 0.7)", lineHeight: 1.5 }}>
        Help FieldMark discover an HCP whose importance isn&apos;t yet reflected in our data.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={labelStyle}>
          First name
          <input type="text" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Last name
          <input type="text" style={inputStyle} />
        </label>
        <label style={{ ...labelStyle, position: "relative" }}>
          Institution
          <input
            type="text"
            value={institution}
            onChange={(e) => {
              setInstitution(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            style={inputStyle}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "100%",
                marginTop: 4,
                background: "rgba(13, 13, 16, 1)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 4,
                zIndex: 10,
              }}
            >
              {suggestions.map((inst) => (
                <button
                  key={inst}
                  type="button"
                  onClick={() => {
                    setInstitution(inst);
                    setShowSuggestions(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    background: "transparent",
                    border: "none",
                    color: "rgba(232, 230, 223, 0.85)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {inst}
                </button>
              ))}
            </div>
          )}
        </label>
        <label style={labelStyle}>
          Therapeutic area
          <select style={inputStyle} defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {TA_OPTIONS.map((ta) => (
              <option key={ta} value={ta}>
                {ta}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Specialty
          <input type="text" style={inputStyle} />
        </label>
        <div>
          <div style={{ fontSize: 12, color: "rgba(232, 230, 223, 0.5)", marginBottom: 8 }}>
            What makes this person worth tracking? (choose one)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {WORTH_TRACKING.map((opt) => (
              <FiChip
                key={opt}
                label={opt}
                selected={worthTracking === opt}
                onClick={() => setWorthTracking(worthTracking === opt ? null : opt)}
              />
            ))}
          </div>
        </div>
      </div>

      <p style={{ margin: "20px 0 16px", fontSize: 11, color: "rgba(232, 230, 223, 0.45)", lineHeight: 1.5 }}>
        Submissions are reviewed before publishing. Multiple independent submissions strengthen the signal — when
        3+ MSLs surface the same HCP, the record is added to the public database.
      </p>

      <button type="button" onClick={onSubmit} style={primaryBtnStyle}>
        Submit for review
      </button>
    </FiModal>
  );
}

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12,
  color: "rgba(232, 230, 223, 0.5)",
};

const inputStyle: CSSProperties = {
  padding: "10px 12px",
  background: "rgba(255, 255, 255, 0.04)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: 4,
  color: "rgba(232, 230, 223, 1)",
  fontSize: 14,
  fontFamily: "system-ui, sans-serif",
};

const primaryBtnStyle: CSSProperties = {
  width: "100%",
  padding: 12,
  background: "rgba(120, 200, 255, 0.12)",
  border: "1px solid rgba(120, 200, 255, 0.35)",
  borderRadius: 4,
  color: "rgba(120, 200, 255, 1)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
};
