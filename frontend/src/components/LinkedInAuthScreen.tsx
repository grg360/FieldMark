import { useState, useEffect, useRef } from "react";

interface LinkedInAuthScreenProps {
  onAuth: () => void;
}

const LinkedInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect width="20" height="20" rx="3" fill="white" fillOpacity="0.2" />
    <text
      x="50%"
      y="50%"
      dominantBaseline="central"
      textAnchor="middle"
      fill="white"
      fontSize="11"
      fontWeight="700"
      fontFamily="system-ui, sans-serif"
    >
      in
    </text>
  </svg>
);

const Spinner = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    style={{ animation: "spin 0.8s linear infinite" }}
  >
    <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
    <path d="M10 2a8 8 0 0 1 8 8" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default function LinkedInAuthScreen({ onAuth }: LinkedInAuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const deferredPrompt = useRef<Event & { prompt: () => void } | null>(null);

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as Event & { prompt: () => void };
      setShowInstall(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  function handleLinkedIn() {
    if (loading) return;
    setLoading(true);
    setTimeout(() => {
      onAuth();
    }, 1500);
  }

  function handleInstall() {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    setShowInstall(false);
  }

  return (
    <div
      className="fm-auth-screen"
      style={{
        backgroundColor: "#0A0A0B",
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        padding: "0 24px",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Top section — logotype */}
      <div style={{ marginTop: 96, textAlign: "center" }}>
        <div
          className="fm-auth-logo"
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
            marginTop: 6,
          }}
        >
          FieldMark
        </div>
      </div>

      {/* Middle section */}
      <div style={{ marginTop: 64, textAlign: "center" }}>
        <div
          className="fm-auth-headline"
          style={{
            fontSize: 20,
            fontWeight: 500,
            color: "#E8E6DF",
            lineHeight: 1.4,
          }}
        >
          We see the nebula. Not just the star.
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#6B6A65",
            lineHeight: 1.6,
            marginTop: 12,
          }}
        >
          Rising star intelligence for pharma field medical teams.
          <br />
          Find the experts before the field does.
        </div>
      </div>

      {/* Bottom section — LinkedIn button */}
      <div style={{ marginTop: 48 }}>
        <button
          onClick={handleLinkedIn}
          className="fm-auth-btn"
          style={{
            width: "100%",
            height: 48,
            borderRadius: 4,
            backgroundColor: "#0A66C2",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? <Spinner /> : <LinkedInIcon />}
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#FFFFFF",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {loading ? "Verifying role..." : "Continue with LinkedIn"}
          </span>
        </button>

        <div
          style={{
            fontSize: 11,
            color: "#3A3A3F",
            textAlign: "center",
            lineHeight: 1.5,
            marginTop: 16,
          }}
        >
          We verify your MSL role. Your identity is never shared with HCPs or other users.
        </div>

        {showInstall && (
          <button
            onClick={handleInstall}
            style={{
              marginTop: 16,
              width: "100%",
              height: 36,
              borderRadius: 4,
              backgroundColor: "transparent",
              border: "1px solid #1E1E22",
              color: "#6B6A65",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 13, color: "#9B6DFF", lineHeight: 1 }}>♞</span>
            Install app
          </button>
        )}
      </div>

      {/* Absolute bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 32,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 10,
          color: "#3A3A3F",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        HIPAA-aware · Compliance-first architecture
      </div>
    </div>
  );
}
