import { useState, useEffect, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getCurrentUser } from "../lib/authHelpers";

const US_REGIONS = [
  { value: "northeast", label: "Northeast", states: ["CT", "MA", "ME", "NH", "NY", "RI", "VT", "NJ", "PA"] },
  { value: "southeast", label: "Southeast", states: ["AL", "FL", "GA", "KY", "MS", "NC", "SC", "TN", "VA", "WV"] },
  { value: "midwest", label: "Midwest", states: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"] },
  { value: "southwest", label: "Southwest", states: ["AZ", "NM", "OK", "TX"] },
  { value: "west", label: "West", states: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"] },
  { value: "national", label: "National", states: [] },
];

export default function WelcomeWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [region, setRegion] = useState("");
  const [statesCovered, setStatesCovered] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate("/landing");
      }
    })();
  }, [navigate]);

  function handleNext() {
    setError(null);
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError("First and last name required.");
        return;
      }
    }
    if (step === 2) {
      if (!company.trim()) {
        setError("Company required.");
        return;
      }
    }
    setStep(step + 1);
  }

  function handleBack() {
    setError(null);
    if (step > 1) setStep(step - 1);
  }

  function handleRegionChange(value: string) {
    setRegion(value);
    const r = US_REGIONS.find((x) => x.value === value);
    if (r) {
      setStatesCovered(r.states);
    }
  }

  async function handleComplete() {
    setError(null);
    if (!region) {
      setError("Region required.");
      return;
    }

    setLoading(true);
    const user = await getCurrentUser();
    if (!user) {
      navigate("/landing");
      return;
    }

    const { error: insertErr } = await supabase
      .from("msl_profiles")
      .insert({
        user_id: user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        company: company.trim(),
        region,
        states_covered: statesCovered,
        onboarded_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });

    if (insertErr) {
      setError(insertErr.message);
      setLoading(false);
      return;
    }

    navigate("/");
  }

  return (
    <div
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        padding: "0 24px",
      }}
    >
      <div style={{ marginTop: 64, textAlign: "center" }}>
        <div
          style={{
            fontSize: 48,
            fontFamily: "monospace",
            fontWeight: 700,
            color: "#E8A020",
            lineHeight: 1,
          }}
        >
          FM
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#6B6A65",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          Quick Setup
        </div>
      </div>

      <div
        style={{
          marginTop: 32,
          display: "flex",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            style={{
              width: 24,
              height: 4,
              borderRadius: 2,
              backgroundColor: step >= s ? "#E8A020" : "#1E1E22",
            }}
          />
        ))}
      </div>

      <div style={{ marginTop: 32, flex: 1 }}>
        {step === 1 && (
          <>
            <div style={{ fontSize: 18, color: "#E8E6DF", marginBottom: 8 }}>
              What's your name?
            </div>
            <div style={{ fontSize: 12, color: "#6B6A65", marginBottom: 20 }}>
              We'll personalize FieldMark to you.
            </div>
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoFocus
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={inputStyle}
            />
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 18, color: "#E8E6DF", marginBottom: 8 }}>
              Who do you work for?
            </div>
            <div style={{ fontSize: 12, color: "#6B6A65", marginBottom: 20 }}>
              Your company. We don't share this.
            </div>
            <input
              type="text"
              placeholder="Company (e.g., Genentech, Pfizer)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoFocus
              style={inputStyle}
            />
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontSize: 18, color: "#E8E6DF", marginBottom: 8 }}>
              What's your territory?
            </div>
            <div style={{ fontSize: 12, color: "#6B6A65", marginBottom: 20 }}>
              We'll surface the right HCPs for your region.
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {US_REGIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handleRegionChange(r.value)}
                  style={{
                    ...regionButtonStyle,
                    borderColor: region === r.value ? "#E8A020" : "#1E1E22",
                    backgroundColor: region === r.value ? "rgba(232,160,32,0.1)" : "#0F0F12",
                    color: region === r.value ? "#E8A020" : "#E8E6DF",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {region && statesCovered.length > 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "#6B6A65",
                  padding: "10px 12px",
                  backgroundColor: "#0F0F12",
                  borderRadius: 4,
                  border: "1px solid #1E1E22",
                }}
              >
                States covered: {statesCovered.join(", ")}
              </div>
            ) : null}
          </>
        )}
      </div>

      {error ? (
        <div
          style={{
            fontSize: 12,
            color: "#E8704E",
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginBottom: 32, display: "flex", gap: 8 }}>
        {step > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 4,
              backgroundColor: "transparent",
              border: "1px solid #1E1E22",
              color: "#9B9892",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Back
          </button>
        ) : null}
        {step < 3 ? (
          <button type="button" onClick={handleNext} style={primaryBtnStyle}>
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleComplete()}
            disabled={loading}
            style={primaryBtnStyle}
          >
            {loading ? "Setting up..." : "Get started"}
          </button>
        )}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 4,
  backgroundColor: "#0F0F12",
  border: "1px solid #1E1E22",
  color: "#E8E6DF",
  fontSize: 14,
  padding: "0 12px",
  fontFamily: "system-ui, sans-serif",
  outline: "none",
  marginBottom: 8,
};

const regionButtonStyle: CSSProperties = {
  height: 44,
  borderRadius: 4,
  border: "1px solid",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
  fontWeight: 500,
};

const primaryBtnStyle: CSSProperties = {
  flex: 1,
  height: 44,
  borderRadius: 4,
  backgroundColor: "#E8A020",
  border: "none",
  color: "#0A0A0B",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
