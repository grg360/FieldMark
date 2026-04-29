import { useState } from "react";

interface ProfileScreenProps {
  initialTA: string;
  onBack: () => void;
  onSave: (ta: string) => void;
}

const BackArrow = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M12 3l-6 6 6 6" stroke="#6B6A65" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4l4 4-4 4" stroke="#3A3A3F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <rect width="12" height="12" rx="2" fill="#0A66C2" />
    <text x="2" y="10" fontSize="9" fontWeight="700" fill="white" fontFamily="system-ui">in</text>
  </svg>
);

const INDICATIONS: Record<string, string[]> = {
  "Rare Disease": ["All", "Fabry disease", "Huntington's", "Sickle cell", "Gaucher", "PKU", "Pompe"],
  Oncology: ["All", "NSCLC", "CAR-T", "DLBCL", "Melanoma", "CLL", "AML"],
  Immunology: ["All", "Lupus", "Crohn's", "Myasthenia gravis", "Sjögren's", "CIDP"],
  Hepatology: ["All", "PBC", "NASH", "PSC", "AIH", "HCC"],
};

const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West", "National"];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        backgroundColor: on ? "#0A1F16" : "#1E1E22",
        border: on ? "1px solid #1D9E75" : "1px solid #1E1E22",
        position: "relative",
        cursor: "pointer",
        transition: "background-color 150ms, border-color 150ms",
        flexShrink: 0,
        padding: 0,
      }}
      aria-pressed={on}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: on ? "#1D9E75" : "#6B6A65",
          position: "absolute",
          top: 1,
          left: on ? 17 : 1,
          transition: "left 150ms, background-color 150ms",
        }}
      />
    </button>
  );
}

export default function ProfileScreen({ initialTA, onBack, onSave }: ProfileScreenProps) {
  const [selectedTA, setSelectedTA] = useState(initialTA);
  const [selectedIndication, setSelectedIndication] = useState("All");
  const [selectedRegion, setSelectedRegion] = useState("Northeast");
  const [notifications, setNotifications] = useState({ newStars: true, scoreChanges: true, fieldNotes: false });
  const [saved, setSaved] = useState(false);

  function handleTAChange(ta: string) {
    setSelectedTA(ta);
    setSelectedIndication("All");
  }

  function handleSave() {
    setSaved(true);
    setTimeout(() => {
      onSave(selectedTA);
    }, 1000);
  }

  return (
    <div className="fm-screen" style={{ backgroundColor: "#0A0A0B", minHeight: "100dvh", maxWidth: 480, margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Nav bar */}
      <div
        className="fm-nav"
        style={{
          height: 48,
          borderBottom: "1px solid #1E1E22",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
      >
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: 4 }}
        >
          <BackArrow />
          <span style={{ fontSize: 13, color: "#6B6A65" }}>Feed</span>
        </button>
        <button
          onClick={handleSave}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 13, color: saved ? "#1D9E75" : "#1D9E75", fontWeight: 500 }}
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* Profile header */}
        <div style={{ padding: "24px 16px 16px", borderBottom: "1px solid #1E1E22", display: "flex", flexDirection: "column", alignItems: "center", gridColumn: "1 / -1" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "#1A1A1E",
              border: "1px solid #E8A020",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 500, color: "#E8A020" }}>PN</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#E8E6DF", marginTop: 12, textAlign: "center" }}>Priya Nair</div>
          <div style={{ fontSize: 12, color: "#6B6A65", marginTop: 4, textAlign: "center" }}>Medical Science Liaison · Rare Disease</div>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#0D0D10",
              border: "1px solid #1E1E22",
              borderRadius: 3,
              padding: "4px 12px",
            }}
          >
            <LinkedInIcon />
            <span style={{ fontSize: 11, color: "#6B6A65" }}>Verified via LinkedIn</span>
          </div>
        </div>

        <div className="fm-profile-body">
          <div className="fm-profile-col-left" style={{ borderBottom: "1px solid #1E1E22" }}>
            <div style={{ padding: "20px 16px 16px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 16 }}>
                Default view
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 8 }}>
                Therapeutic area
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {["Rare Disease", "Oncology", "Immunology", "Hepatology"].map((ta) => {
                  const isSelected = selectedTA === ta;
                  return (
                    <button
                      key={ta}
                      onClick={() => handleTAChange(ta)}
                      style={{
                        backgroundColor: isSelected ? "#0D0D0A" : "#111113",
                        border: `1px solid ${isSelected ? "#E8A020" : "#1E1E22"}`,
                        color: isSelected ? "#E8A020" : "#E8E6DF",
                        borderRadius: 4,
                        padding: "10px 12px",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {ta}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginTop: 16, marginBottom: 8 }}>
                Default indication
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
                {(INDICATIONS[selectedTA] ?? []).map((chip) => {
                  const isSelected = selectedIndication === chip;
                  return (
                    <button
                      key={chip}
                      onClick={() => setSelectedIndication(chip)}
                      style={{
                        flexShrink: 0,
                        backgroundColor: isSelected ? "#0D0D0A" : "#0D0D10",
                        border: `1px solid ${isSelected ? "#E8A020" : "#1E1E22"}`,
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
              <div style={{ fontSize: 11, color: "#3A3A3F", marginTop: 8 }}>Your feed opens here by default.</div>
            </div>
          </div>

          <div className="fm-profile-col-right">
            <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1E1E22" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 16 }}>
                Territory
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 8 }}>
                Region
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {REGIONS.map((region) => {
                  const isSelected = selectedRegion === region;
                  return (
                    <button
                      key={region}
                      onClick={() => setSelectedRegion(region)}
                      style={{
                        backgroundColor: isSelected ? "#0D0D0A" : "#0D0D10",
                        border: `1px solid ${isSelected ? "#E8A020" : "#1E1E22"}`,
                        color: isSelected ? "#E8A020" : "#6B6A65",
                        borderRadius: 3,
                        padding: "6px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {region}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginTop: 16, marginBottom: 8 }}>
                States covered
              </div>
              <div
                style={{
                  backgroundColor: "#0D0D10",
                  border: "1px solid #1E1E22",
                  borderRadius: 4,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontFamily: "monospace",
                  color: "#E8E6DF",
                }}
              >
                CT, MA, ME, NH, NY, RI, VT
              </div>
              <div style={{ fontSize: 11, color: "#3A3A3F", marginTop: 8 }}>Set by your MSL manager. Contact your admin to update territory boundaries.</div>
            </div>

            <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1E1E22" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 16 }}>
                Notifications
              </div>
              {[
                { key: "newStars" as const, label: "New rising stars", desc: "Weekly digest of new HCPs in your TA" },
                { key: "scoreChanges" as const, label: "Score changes", desc: "When a saved HCP's score moves significantly" },
                { key: "fieldNotes" as const, label: "Field notes", desc: "When new anonymous notes are added to saved HCPs" },
              ].map(({ key, label, desc }, i, arr) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 44,
                    borderBottom: i < arr.length - 1 ? "1px solid #1E1E22" : "none",
                    paddingTop: i === 0 ? 0 : 12,
                    paddingBottom: i < arr.length - 1 ? 12 : 0,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: "#E8E6DF" }}>{label}</div>
                    <div style={{ fontSize: 11, color: "#6B6A65", marginTop: 2 }}>{desc}</div>
                  </div>
                  <Toggle
                    on={notifications[key]}
                    onToggle={() => setNotifications({ ...notifications, [key]: !notifications[key] })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Account section — full width */}
        <div className="fm-profile-account" style={{ padding: "20px 16px 32px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B6A65", marginBottom: 16 }}>
            Account
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 44,
              borderBottom: "1px solid #1E1E22",
              cursor: "default",
            }}
          >
            <span style={{ fontSize: 13, color: "#E8E6DF" }}>Data & privacy</span>
            <ChevronRight />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 44,
              cursor: "default",
            }}
          >
            <span style={{ fontSize: 13, color: "#E05555" }}>Sign out</span>
          </div>
        </div>
      </div>
    </div>
  );
}
