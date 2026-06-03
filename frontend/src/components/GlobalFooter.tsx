import { useEffect, useState, type CSSProperties } from "react";
import { FiToast } from "./FieldIntelligenceShared";

const UTILITY_LINKS = ["About", "Methodology", "Privacy"] as const;
const COMING_SOON_TOAST = "Coming soon";

const LINE_HEIGHT = 1.5;
const ROW_GAP = 8;

const mutedTextStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  fontSize: 11,
  lineHeight: LINE_HEIGHT,
  color: "rgba(232, 230, 223, 0.5)",
  fontFamily: "system-ui, sans-serif",
};

interface GlobalFooterProps {
  onToast?: (message: string) => void;
}

export default function GlobalFooter({ onToast }: GlobalFooterProps) {
  const [narrow, setNarrow] = useState(false);
  const [localToast, setLocalToast] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function showToast(message: string) {
    if (onToast) {
      onToast(message);
      return;
    }
    setLocalToast(message);
    window.setTimeout(() => setLocalToast(null), 3000);
  }

  return (
    <>
      <footer
        style={{
          width: "100%",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          paddingTop: 24,
          paddingBottom: 16,
          paddingLeft: 16,
          paddingRight: 16,
          background: "transparent",
          marginTop: 8,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: narrow ? "1fr" : "1fr auto",
            gridTemplateRows: narrow ? "repeat(4, auto)" : "auto auto",
            rowGap: ROW_GAP,
            columnGap: 16,
            alignItems: "baseline",
            justifyContent: narrow ? "start" : "space-between",
          }}
        >
          <p
            style={{
              ...mutedTextStyle,
              gridColumn: narrow ? 1 : 1,
              gridRow: narrow ? 3 : 2,
            }}
          >
            For verified MSL use only. Content not affiliated with mentioned researchers.
          </p>

          <p
            style={{
              ...mutedTextStyle,
              gridColumn: narrow ? 1 : 2,
              gridRow: narrow ? 4 : 2,
              justifySelf: narrow ? "start" : "end",
            }}
          >
            © 2026 Bessel Analytics, Inc.
          </p>

          <div
            style={{
              margin: 0,
              padding: 0,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: narrow ? "flex-start" : "flex-end",
              gap: 4,
              fontSize: 11,
              lineHeight: LINE_HEIGHT,
              fontFamily: "system-ui, sans-serif",
              gridColumn: narrow ? 1 : 2,
              gridRow: narrow ? 2 : 1,
              justifySelf: narrow ? "start" : "end",
            }}
          >
            {UTILITY_LINKS.map((label, index) => (
              <span key={label} style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                {index > 0 ? (
                  <span style={{ color: "rgba(232, 230, 223, 0.35)" }} aria-hidden>
                    ·
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => showToast(COMING_SOON_TOAST)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    color: "rgba(232, 230, 223, 0.5)",
                    fontSize: 11,
                    lineHeight: LINE_HEIGHT,
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "rgba(232, 230, 223, 0.75)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "rgba(232, 230, 223, 0.5)";
                  }}
                >
                  {label}
                </button>
              </span>
            ))}
          </div>

          <span
            style={{
              margin: 0,
              padding: 0,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: LINE_HEIGHT,
              color: "#E8A020",
              letterSpacing: "0.09em",
              fontFamily: "system-ui, sans-serif",
              gridColumn: narrow ? 1 : 1,
              gridRow: narrow ? 1 : 1,
            }}
          >
            FIELDMARK
          </span>
        </div>
      </footer>
      {!onToast ? <FiToast message={localToast} /> : null}
    </>
  );
}
