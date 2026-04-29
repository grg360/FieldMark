import { useEffect, useState } from "react";

interface ActionTrayProps {
  open: boolean;
  onClose: () => void;
  hcpName: string;
  onAddNote?: () => void;
}

const BookmarkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 2h10a1 1 0 0 1 1 1v11l-6-3-6 3V3a1 1 0 0 1 1-1z"
      stroke="#6B6A65"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M11 2.5l2.5 2.5-8 8H3v-2.5l8-8z"
      stroke="#6B6A65"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="12" cy="3" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <circle cx="12" cy="13" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <circle cx="4" cy="8" r="1.5" stroke="#6B6A65" strokeWidth="1.4" />
    <line x1="5.3" y1="7.2" x2="10.7" y2="4.3" stroke="#6B6A65" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="5.3" y1="8.8" x2="10.7" y2="11.7" stroke="#6B6A65" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5 3l4 4-4 4" stroke="#1E1E22" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const getActions = (onAddNote?: () => void) => [
  { icon: <BookmarkIcon />, label: "Save to list", action: undefined },
  { icon: <PencilIcon />, label: "Add note", action: onAddNote },
  { icon: <ShareIcon />, label: "Share", action: undefined },
];

export default function ActionTray({ open, onClose, hcpName, onAddNote }: ActionTrayProps) {
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimate(true));
      });
    } else {
      setAnimate(false);
      const t = setTimeout(() => setVisible(false), 280);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.7)",
          opacity: animate ? 1 : 0,
          transition: "opacity 0.28s ease",
        }}
      />

      {/* Tray */}
      <div
        style={{
          position: "relative",
          backgroundColor: "#111113",
          borderTop: "1px solid #1E1E22",
          borderRadius: "8px 8px 0 0",
          transform: animate ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 8 }}>
          <div
            style={{
              width: 32,
              height: 3,
              backgroundColor: "#1E1E22",
              borderRadius: 2,
            }}
          />
        </div>

        {/* HCP name label */}
        <div
          style={{
            padding: "4px 16px 12px",
            fontSize: 11,
            color: "#6B6A65",
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.03em",
          }}
        >
          {hcpName.toUpperCase()}
        </div>

        {/* Action options */}
        {getActions(onAddNote).map((action, i) => (
          <button
            key={action.label}
            onClick={() => {
              if (action.action) {
                action.action();
              }
              onClose();
            }}
            style={{
              width: "100%",
              height: 52,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 16px",
              background: "none",
              border: "none",
              borderBottom: i < getActions(onAddNote).length - 1 ? "1px solid #1E1E22" : "none",
              cursor: "pointer",
            }}
          >
            {action.icon}
            <span
              style={{
                flex: 1,
                fontSize: 14,
                color: "#E8E6DF",
                fontFamily: "system-ui, sans-serif",
                textAlign: "left",
              }}
            >
              {action.label}
            </span>
            <ChevronRight />
          </button>
        ))}

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#1E1E22", margin: "0 0 0 0" }} />

        {/* Cancel */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            color: "#6B6A65",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
