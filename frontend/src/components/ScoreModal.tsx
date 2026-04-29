interface ScoreModalProps {
  hcpName: string;
  ta: string;
  score: number;
  onClose: () => void;
}

const COMPONENTS = [
  { label: "Publication velocity", weight: "35% of score", score: 94, percent: 94 },
  { label: "Citation trajectory",  weight: "30% of score", score: 88, percent: 88 },
  { label: "Trial activity",       weight: "25% of score", score: 81, percent: 81 },
  { label: "Career age multiplier",weight: "10% of score", score: 76, percent: 76 },
];

const SOURCES = [
  { name: "PubMed", desc: "publication and authorship data, updated weekly" },
  { name: "ClinicalTrials.gov", desc: "investigator and trial status data, updated weekly" },
  { name: "OpenAlex", desc: "citation counts and trajectory analysis, updated weekly" },
];

export default function ScoreModal({ hcpName, ta, score, onClose }: ScoreModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#111113",
          borderTop: "1px solid #1E1E22",
          borderRadius: "8px 8px 0 0",
          padding: "0 16px 32px",
          maxHeight: "90dvh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, marginBottom: 16 }}>
          <div style={{ width: 32, height: 3, backgroundColor: "#1E1E22", borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div style={{ borderBottom: "1px solid #1E1E22", paddingBottom: 16 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65" }}>
            Rising star score
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, marginTop: 4 }}>
            <span style={{ fontSize: 32, fontFamily: "monospace", fontWeight: 500, color: "#E8A020", lineHeight: 1 }}>
              {score.toFixed(1)}
            </span>
            <span style={{ fontSize: 16, color: "#3A3A3F", lineHeight: 1, marginBottom: 2 }}>/100</span>
          </div>
          <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 8 }}>
            {hcpName} · {ta}
          </div>
        </div>

        {/* Methodology */}
        <div style={{ paddingTop: 16 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 12 }}>
            How this score is calculated
          </div>
          {COMPONENTS.map(({ label, weight, score: cs, percent }) => (
            <div key={label} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#E8E6DF" }}>{label}</span>
                  <span style={{ fontSize: 11, color: "#3A3A3F" }}>{weight}</span>
                </div>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: "#E8A020" }}>{cs}</span>
              </div>
              <div style={{ height: 3, backgroundColor: "#1E1E22" }}>
                <div style={{ height: "100%", backgroundColor: "#E8A020", width: `${percent}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Data sources */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #1E1E22" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 8 }}>
            Data sources
          </div>
          {SOURCES.map(({ name, desc }) => (
            <div key={name} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#1D9E75", flexShrink: 0, marginTop: 5 }} />
              <span style={{ fontSize: 12, color: "#9B9892", lineHeight: 1.5 }}>
                <strong style={{ color: "#9B9892" }}>{name}</strong> — {desc}
              </span>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div style={{ marginTop: 16, fontSize: 11, color: "#3A3A3F", lineHeight: 1.5, textAlign: "center" }}>
          Scores reflect publicly available scientific activity only. FieldMark does not incorporate commercial, prescribing, or proprietary data.
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            height: 44,
            marginTop: 16,
            backgroundColor: "#0D0D10",
            border: "1px solid #1E1E22",
            borderRadius: 4,
            color: "#6B6A65",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
